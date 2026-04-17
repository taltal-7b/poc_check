import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess, sendPaginated, parsePagination } from '../utils/response';
import { authenticate, optionalAuth } from '../middleware/auth';
import { z } from 'zod';

const router = Router({ mergeParams: true });

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const ISSUE_JOURNAL_KEYS = [
  'projectId',
  'trackerId',
  'statusId',
  'priority',
  'subject',
  'description',
  'assigneeId',
  'categoryId',
  'versionId',
  'parentId',
  'startDate',
  'dueDate',
  'estimatedHours',
  'doneRatio',
  'repository',
] as const;

function catchAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function serializeJournalValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function buildJournalDetailsFromDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  keys: readonly string[],
) {
  const details: Prisma.JournalDetailCreateWithoutJournalInput[] = [];
  for (const key of keys) {
    const ov = serializeJournalValue(before[key]);
    const nv = serializeJournalValue(after[key]);
    if (ov !== nv) {
      details.push({
        property: 'attr',
        propKey: key,
        oldValue: ov,
        newValue: nv,
      });
    }
  }
  return details;
}

function isUuidLike(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function createIssueCreationJournal(
  db: Tx,
  issue: {
    id: string;
    subject: string;
    trackerId: string;
    statusId: string;
    priority: number;
    projectId: string;
  },
  userId: string,
) {
  await db.journal.create({
    data: {
      issueId: issue.id,
      userId,
      notes: null,
      details: {
        create: [
          { property: 'attr', propKey: 'subject', oldValue: null, newValue: issue.subject },
          { property: 'attr', propKey: 'trackerId', oldValue: null, newValue: issue.trackerId },
          { property: 'attr', propKey: 'statusId', oldValue: null, newValue: issue.statusId },
          { property: 'attr', propKey: 'priority', oldValue: null, newValue: String(issue.priority) },
          { property: 'attr', propKey: 'projectId', oldValue: null, newValue: issue.projectId },
        ],
      },
    },
  });
}

async function createIssueActivity(
  db: Tx,
  issue: { id: string; projectId: string; subject: string; description: string | null },
  userId: string,
) {
  await db.activity.create({
    data: {
      projectId: issue.projectId,
      userId,
      actType: 'issue',
      actId: issue.id,
      title: issue.subject,
      description: issue.description ? issue.description.slice(0, 500) : null,
    },
  });
}

async function getUserGroupIds(userId: string): Promise<string[]> {
  const rows = await prisma.groupUser.findMany({
    where: { userId },
    select: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

function parseRolePermissions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

async function getUserProjectPermissions(
  userId: string,
  projectId: string,
): Promise<Set<string> | null> {
  const groupIds = await getUserGroupIds(userId);
  const members = await prisma.member.findMany({
    where: {
      projectId,
      OR: [{ userId }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
    },
    include: {
      memberRoles: {
        include: {
          role: { select: { permissions: true } },
        },
      },
    },
  });

  if (!members.length) return null;

  const perms = new Set<string>();
  for (const m of members) {
    for (const mr of m.memberRoles) {
      for (const p of parseRolePermissions(mr.role.permissions)) {
        perms.add(p);
      }
    }
  }
  return perms;
}

async function userCanAccessProject(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string; isPublic: boolean },
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return project.isPublic;
  const perms = await getUserProjectPermissions(userId, project.id);
  if (perms) return perms.has('view_issues');
  return project.isPublic;
}

async function userCanCreateIssue(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string },
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  const perms = await getUserProjectPermissions(userId, project.id);
  if (!perms) return false;
  return perms.has('add_issues') || perms.has('edit_issues');
}

async function userCanEditIssue(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string },
  issueAuthorId: string,
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  const perms = await getUserProjectPermissions(userId, project.id);
  if (!perms) return false;
  if (perms.has('edit_issues')) return true;
  return perms.has('edit_own_issues') && issueAuthorId === userId;
}

async function userCanDeleteIssue(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string },
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  const perms = await getUserProjectPermissions(userId, project.id);
  if (!perms) return false;
  return perms.has('delete_issues');
}

async function userCanAddIssueNotes(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string },
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  const perms = await getUserProjectPermissions(userId, project.id);
  if (!perms) return false;
  return (
    perms.has('view_issues') ||
    perms.has('add_issue_notes') ||
    perms.has('edit_issue_notes') ||
    perms.has('edit_own_issue_notes') ||
    perms.has('edit_issues')
  );
}

async function resolveProjectId(ref: string | undefined): Promise<string | undefined> {
  if (!ref) return undefined;
  const p = await prisma.project.findFirst({
    where: { OR: [{ id: ref }, { identifier: ref }] },
    select: { id: true },
  });
  return p?.id;
}

async function getVisibleProjectIds(userId: string | undefined, isAdmin: boolean | undefined) {
  if (isAdmin) return null as string[] | null;
  if (!userId) {
    const pub = await prisma.project.findMany({
      where: { isPublic: true },
      select: { id: true },
    });
    return pub.map((p) => p.id);
  }
  const groupIds = await getUserGroupIds(userId);
  const rows = await prisma.project.findMany({
    where: {
      OR: [
        { isPublic: true },
        {
          members: {
            some: {
              OR: [{ userId }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
            },
          },
        },
      ],
    },
    select: { id: true, isPublic: true },
  });
  const visible: string[] = [];
  for (const p of rows) {
    const can = await userCanAccessProject(userId, isAdmin, p);
    if (can) visible.push(p.id);
  }
  return visible;
}

async function resolveIssueByParam(id: string) {
  return prisma.issue.findUnique({ where: { id } });
}

const createIssueSchema = z.object({
  projectId: z.string().min(1),
  trackerId: z.string().uuid(),
  statusId: z.string().uuid(),
  priority: z.number().int().min(1).max(5).optional(),
  subject: z.string().min(1),
  description: z.string().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  versionId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  repository: z.string().nullable().optional(),
});

const updateIssueSchema = z.object({
  projectId: z.string().uuid().optional(),
  trackerId: z.string().uuid().optional(),
  statusId: z.string().uuid().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  subject: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  versionId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  doneRatio: z.number().int().min(0).max(100).optional(),
  repository: z.string().nullable().optional(),
  notes: z.string().optional(),
});

const bulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  changes: updateIssueSchema.omit({ notes: true }).partial(),
});

const reactionBodySchema = z.object({
  emoji: z.string().min(1).max(32),
});

const relationBodySchema = z.object({
  issueToId: z.string().uuid(),
  relationType: z.string().min(1),
  delay: z.number().int().nullable().optional(),
});

const copyIssueSchema = z.object({
  projectId: z.string().uuid().optional(),
  subject: z.string().min(1).optional(),
});

router.get(
  '/',
  optionalAuth,
  catchAsync(async (req, res) => {
    const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);

    const paramPid = req.params.projectId as string | undefined;
    const queryPid = req.query.projectId as string | undefined;
    const resolvedFromParam = paramPid ? await resolveProjectId(paramPid) : undefined;
    const resolvedFromQuery = queryPid ? await resolveProjectId(queryPid) : undefined;

    let projectIdFilter: string | undefined;
    if (resolvedFromParam) projectIdFilter = resolvedFromParam;
    else if (resolvedFromQuery) projectIdFilter = resolvedFromQuery;

    const visible = await getVisibleProjectIds(req.user?.userId, req.user?.admin);

    const where: Prisma.IssueWhereInput = {};

    if (projectIdFilter) {
      if (visible !== null && !visible.includes(projectIdFilter)) {
        throw AppError.forbidden();
      }
      where.projectId = projectIdFilter;
    } else if (visible !== null) {
      if (!visible.length) {
        return sendPaginated(res, [], { total: 0, page, perPage, totalPages: 1 });
      }
      where.projectId = { in: visible };
    }

    const statusId = req.query.status as string | undefined;
    if (statusId) where.statusId = statusId;

    const trackerId = req.query.tracker as string | undefined;
    if (trackerId) where.trackerId = trackerId;

    const assigneeId = req.query.assignee as string | undefined;
    if (assigneeId) where.assigneeId = assigneeId;

    const authorId = req.query.author as string | undefined;
    if (authorId) where.authorId = authorId;

    const closedParam = req.query.closed as string | undefined;
    if (closedParam === 'true') {
      where.status = { isClosed: true };
    } else if (closedParam === 'false') {
      where.status = { isClosed: false };
    }

    const priorityRaw = req.query.priority;
    if (priorityRaw !== undefined && priorityRaw !== '') {
      const p = Number(priorityRaw);
      if (!Number.isNaN(p)) where.priority = p;
    }

    const q = req.query.q as string | undefined;
    if (q?.trim()) {
      where.subject = { contains: q.trim(), mode: 'insensitive' };
    }

    const [total, rows] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take: perPage,
        include: {
          project: { select: { id: true, name: true, identifier: true } },
          tracker: true,
          status: true,
          author: { select: { id: true, login: true, firstname: true, lastname: true } },
          assignee: { select: { id: true, login: true, firstname: true, lastname: true } },
        },
      }),
    ]);

    return sendPaginated(res, rows, {
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage) || 1,
    });
  }),
);

router.post(
  '/bulk_update',
  authenticate,
  catchAsync(async (req, res) => {
    const parsed = bulkUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }
    const { ids, changes } = parsed.data;
    if (Object.keys(changes).length === 0) {
      throw AppError.badRequest('changes が空です');
    }

    const updated: unknown[] = [];

    for (const id of ids) {
      const oldIssue = await prisma.issue.findUnique({ where: { id } });
      if (!oldIssue) continue;

      const project = await prisma.project.findUnique({ where: { id: oldIssue.projectId } });
      if (!project) continue;
      const can = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
      if (!can) throw AppError.forbidden();
      const canEdit = await userCanEditIssue(
        req.user?.userId,
        req.user?.admin,
        project,
        oldIssue.authorId,
      );
      if (!canEdit) throw AppError.forbidden('チケットを編集する権限がありません');

      const effectiveStatusId = changes.statusId ?? oldIssue.statusId;
      const st = await prisma.issueStatus.findUnique({ where: { id: effectiveStatusId } });

      const data: Prisma.IssueUpdateInput = {};
      if (changes.projectId !== undefined) data.project = { connect: { id: changes.projectId } };
      if (changes.trackerId !== undefined) data.tracker = { connect: { id: changes.trackerId } };
      if (changes.statusId !== undefined) data.status = { connect: { id: changes.statusId } };
      if (changes.priority !== undefined) data.priority = changes.priority;
      if (changes.subject !== undefined) data.subject = changes.subject;
      if (changes.description !== undefined) data.description = changes.description;
      if (changes.assigneeId !== undefined) {
        data.assignee = changes.assigneeId ? { connect: { id: changes.assigneeId } } : { disconnect: true };
      }
      if (changes.categoryId !== undefined) {
        data.category = changes.categoryId ? { connect: { id: changes.categoryId } } : { disconnect: true };
      }
      if (changes.versionId !== undefined) {
        data.version = changes.versionId ? { connect: { id: changes.versionId } } : { disconnect: true };
      }
      if (changes.parentId !== undefined) {
        data.parent = changes.parentId ? { connect: { id: changes.parentId } } : { disconnect: true };
      }
      if (changes.startDate !== undefined) data.startDate = changes.startDate;
      if (changes.dueDate !== undefined) data.dueDate = changes.dueDate;
      if (changes.estimatedHours !== undefined) data.estimatedHours = changes.estimatedHours;
      if (changes.doneRatio !== undefined) data.doneRatio = changes.doneRatio;
      if (changes.statusId !== undefined) {
        data.closedOn = st?.isClosed ? oldIssue.closedOn ?? new Date() : null;
      }

      const after = await prisma.$transaction(async (tx) => {
        const next = await tx.issue.update({
          where: { id },
          data,
        });

        const beforePlain: Record<string, unknown> = {
          projectId: oldIssue.projectId,
          trackerId: oldIssue.trackerId,
          statusId: oldIssue.statusId,
          priority: oldIssue.priority,
          subject: oldIssue.subject,
          description: oldIssue.description,
          assigneeId: oldIssue.assigneeId,
          categoryId: oldIssue.categoryId,
          versionId: oldIssue.versionId,
          parentId: oldIssue.parentId,
          startDate: oldIssue.startDate,
          dueDate: oldIssue.dueDate,
          estimatedHours: oldIssue.estimatedHours,
          doneRatio: oldIssue.doneRatio,
          repository: oldIssue.repository,
        };
        const afterPlain: Record<string, unknown> = {
          projectId: next.projectId,
          trackerId: next.trackerId,
          statusId: next.statusId,
          priority: next.priority,
          subject: next.subject,
          description: next.description,
          assigneeId: next.assigneeId,
          categoryId: next.categoryId,
          versionId: next.versionId,
          parentId: next.parentId,
          startDate: next.startDate,
          dueDate: next.dueDate,
          estimatedHours: next.estimatedHours,
          doneRatio: next.doneRatio,
          repository: next.repository,
        };

        const details = buildJournalDetailsFromDiff(beforePlain, afterPlain, ISSUE_JOURNAL_KEYS);
        if (details.length) {
          await tx.journal.create({
            data: {
              issueId: id,
              userId: req.user!.userId,
              notes: null,
              details: { create: details },
            },
          });
        }

        return next;
      });

      updated.push(after);
    }

    return sendSuccess(res, { updated: updated.length, issues: updated });
  }),
);

router.get(
  '/:id/relations',
  optionalAuth,
  catchAsync(async (req, res) => {
    const issue = await resolveIssueByParam(req.params.id);
    if (!issue) throw AppError.notFound('チケットが見つかりません');

    const project = await prisma.project.findUnique({ where: { id: issue.projectId } });
    if (!project) throw AppError.notFound();
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
    if (!can) throw AppError.forbidden();
    const canEdit = await userCanEditIssue(req.user?.userId, req.user?.admin, project, issue.authorId);
    if (!canEdit) throw AppError.forbidden('関連を編集する権限がありません');

    const relations = await prisma.issueRelation.findMany({
      where: {
        OR: [{ issueFromId: issue.id }, { issueToId: issue.id }],
      },
      include: {
        issueFrom: { select: { id: true, subject: true } },
        issueTo: { select: { id: true, subject: true } },
      },
    });

    return sendSuccess(res, relations);
  }),
);

router.post(
  '/:id/relations',
  authenticate,
  catchAsync(async (req, res) => {
    const parsed = relationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }

    const issue = await resolveIssueByParam(req.params.id);
    if (!issue) throw AppError.notFound('チケットが見つかりません');

    const project = await prisma.project.findUnique({ where: { id: issue.projectId } });
    if (!project) throw AppError.notFound();
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
    if (!can) throw AppError.forbidden();
    const canEdit = await userCanEditIssue(req.user?.userId, req.user?.admin, project, issue.authorId);
    if (!canEdit) throw AppError.forbidden('関連を編集する権限がありません');

    const { issueToId, relationType, delay } = parsed.data;
    if (issueToId === issue.id) throw AppError.badRequest('同一チケットには関連付けできません');

    const target = await prisma.issue.findUnique({ where: { id: issueToId } });
    if (!target) throw AppError.badRequest('対象チケットが存在しません');

    try {
      const rel = await prisma.issueRelation.create({
        data: {
          issueFromId: issue.id,
          issueToId,
          relationType,
          delay: delay ?? null,
        },
        include: {
          issueFrom: { select: { id: true, subject: true } },
          issueTo: { select: { id: true, subject: true } },
        },
      });
      return sendSuccess(res, rel, 201);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw AppError.conflict('同じ関連が既に存在します');
      }
      throw e;
    }
  }),
);

router.delete(
  '/:id/relations/:relationId',
  authenticate,
  catchAsync(async (req, res) => {
    const issue = await resolveIssueByParam(req.params.id);
    if (!issue) throw AppError.notFound('チケットが見つかりません');

    const project = await prisma.project.findUnique({ where: { id: issue.projectId } });
    if (!project) throw AppError.notFound();
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
    if (!can) throw AppError.forbidden();
    const canEdit = await userCanEditIssue(req.user?.userId, req.user?.admin, project, issue.authorId);
    if (!canEdit) throw AppError.forbidden('関連を編集する権限がありません');

    const rel = await prisma.issueRelation.findUnique({ where: { id: req.params.relationId } });
    if (!rel || (rel.issueFromId !== issue.id && rel.issueToId !== issue.id)) {
      throw AppError.notFound('関連が見つかりません');
    }

    await prisma.issueRelation.delete({ where: { id: rel.id } });
    return sendSuccess(res, { deleted: true });
  }),
);

router.post(
  '/:id/copy',
  authenticate,
  catchAsync(async (req, res) => {
    const parsed = copyIssueSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }

    const src = await prisma.issue.findUnique({ where: { id: req.params.id } });
    if (!src) throw AppError.notFound('チケットが見つかりません');

    const targetProjectId = parsed.data.projectId ?? src.projectId;
    const project = await prisma.project.findUnique({ where: { id: targetProjectId } });
    if (!project) throw AppError.badRequest('プロジェクトが存在しません');
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
    if (!can) throw AppError.forbidden();
    const canCreate = await userCanCreateIssue(req.user?.userId, req.user?.admin, project);
    if (!canCreate) throw AppError.forbidden('チケットを作成する権限がありません');

    const subject = parsed.data.subject ?? `Copy: ${src.subject}`;

    const st = await prisma.issueStatus.findUnique({ where: { id: src.statusId } });

    const created = await prisma.$transaction(async (tx) => {
      const last = await tx.issue.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
      const nextNumber = (last?.number ?? 0) + 1;

      const issue = await tx.issue.create({
        data: {
          number: nextNumber,
          projectId: targetProjectId,
          trackerId: src.trackerId,
          statusId: src.statusId,
          priority: src.priority,
          subject,
          description: src.description,
          authorId: req.user!.userId,
          assigneeId: src.assigneeId,
          categoryId: src.categoryId,
          versionId: src.versionId,
          parentId: null,
          startDate: src.startDate,
          dueDate: src.dueDate,
          estimatedHours: src.estimatedHours,
          doneRatio: 0,
          closedOn: st?.isClosed ? new Date() : null,
        },
      });

      await createIssueCreationJournal(tx, issue, req.user!.userId);
      await createIssueActivity(tx, issue, req.user!.userId);

      return tx.issue.findUniqueOrThrow({
        where: { id: issue.id },
        include: {
          project: true,
          tracker: true,
          status: true,
          author: { select: { id: true, login: true, firstname: true, lastname: true } },
          assignee: { select: { id: true, login: true, firstname: true, lastname: true } },
        },
      });
    });

    return sendSuccess(res, created, 201);
  }),
);

router.post(
  '/:id/watchers',
  authenticate,
  catchAsync(async (req, res) => {
    const schema = z.object({ userId: z.string().uuid() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }

    const issue = await resolveIssueByParam(req.params.id);
    if (!issue) throw AppError.notFound('チケットが見つかりません');

    const proj = await prisma.project.findUnique({ where: { id: issue.projectId } });
    if (!proj) throw AppError.notFound();
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, proj);
    if (!can) throw AppError.forbidden();

    const targetUser = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
    if (!targetUser) throw AppError.badRequest('ユーザーが存在しません');

    try {
      const w = await prisma.watcher.create({
        data: {
          watchableType: 'Issue',
          watchableId: issue.id,
          userId: parsed.data.userId,
          issueId: issue.id,
        },
        include: { user: { select: { id: true, login: true, firstname: true, lastname: true } } },
      });
      return sendSuccess(res, w, 201);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw AppError.conflict('既にウォッチャーに登録されています');
      }
      throw e;
    }
  }),
);

router.delete(
  '/:id/watchers/:userId',
  authenticate,
  catchAsync(async (req, res) => {
    const issue = await resolveIssueByParam(req.params.id);
    if (!issue) throw AppError.notFound('チケットが見つかりません');

    const proj = await prisma.project.findUnique({ where: { id: issue.projectId } });
    if (!proj) throw AppError.notFound();
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, proj);
    if (!can) throw AppError.forbidden();

    const del = await prisma.watcher.deleteMany({
      where: {
        watchableType: 'Issue',
        watchableId: issue.id,
        userId: req.params.userId,
      },
    });
    if (!del.count) throw AppError.notFound('ウォッチャーが見つかりません');

    return sendSuccess(res, { deleted: true });
  }),
);

router.post(
  '/:id/reactions',
  authenticate,
  catchAsync(async (req, res) => {
    const parsed = reactionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }

    const issue = await resolveIssueByParam(req.params.id);
    if (!issue) throw AppError.notFound('チケットが見つかりません');

    const proj = await prisma.project.findUnique({ where: { id: issue.projectId } });
    if (!proj) throw AppError.notFound();
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, proj);
    if (!can) throw AppError.forbidden();

    try {
      const r = await prisma.reaction.create({
        data: {
          reactableType: 'Issue',
          reactableId: issue.id,
          userId: req.user!.userId,
          emoji: parsed.data.emoji,
          issueId: issue.id,
        },
        include: { user: { select: { id: true, login: true, firstname: true, lastname: true } } },
      });
      return sendSuccess(res, r, 201);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw AppError.conflict('同じリアクションが既にあります');
      }
      throw e;
    }
  }),
);

router.delete(
  '/:id/reactions',
  authenticate,
  catchAsync(async (req, res) => {
    const parsed = reactionBodySchema.safeParse(
      typeof req.body === 'object' && req.body !== null ? req.body : {},
    );
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }

    const issue = await resolveIssueByParam(req.params.id);
    if (!issue) throw AppError.notFound('チケットが見つかりません');

    const proj = await prisma.project.findUnique({ where: { id: issue.projectId } });
    if (!proj) throw AppError.notFound();
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, proj);
    if (!can) throw AppError.forbidden();

    const del = await prisma.reaction.deleteMany({
      where: {
        reactableType: 'Issue',
        reactableId: issue.id,
        userId: req.user!.userId,
        emoji: parsed.data.emoji,
      },
    });
    if (!del.count) throw AppError.notFound('リアクションが見つかりません');

    return sendSuccess(res, { deleted: true });
  }),
);

router.get(
  '/:id',
  optionalAuth,
  catchAsync(async (req, res) => {
    const issue = await prisma.issue.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
        tracker: true,
        status: true,
        author: { select: { id: true, login: true, firstname: true, lastname: true, mail: true } },
        assignee: { select: { id: true, login: true, firstname: true, lastname: true, mail: true } },
        category: true,
        version: true,
        parent: { select: { id: true, subject: true } },
        children: { select: { id: true, number: true, subject: true } },
        journals: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: { id: true, login: true, firstname: true, lastname: true } },
            details: true,
            attachments: {
              select: { id: true, filename: true, diskFilename: true, filesize: true, contentType: true, createdAt: true },
            },
          },
        },
        watchers: {
          include: { user: { select: { id: true, login: true, firstname: true, lastname: true } } },
        },
        attachments: true,
        reactions: {
          include: { user: { select: { id: true, login: true, firstname: true, lastname: true } } },
        },
      },
    });
    if (!issue) throw AppError.notFound('チケットが見つかりません');

    const project = await prisma.project.findUnique({ where: { id: issue.projectId } });
    if (!project) throw AppError.notFound();
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
    if (!can) throw AppError.forbidden();

    const assigneeHistoryIds = new Set<string>();
    for (const journal of issue.journals ?? []) {
      for (const detail of journal.details ?? []) {
        if (detail.propKey !== 'assigneeId') continue;
        if (isUuidLike(detail.oldValue)) assigneeHistoryIds.add(detail.oldValue);
        if (isUuidLike(detail.newValue)) assigneeHistoryIds.add(detail.newValue);
      }
    }

    const assigneeLabelMap = new Map<string, string>();
    if (assigneeHistoryIds.size > 0) {
      const users = await prisma.user.findMany({
        where: { id: { in: Array.from(assigneeHistoryIds) } },
        select: { id: true, login: true, firstname: true, lastname: true },
      });
      for (const user of users) {
        const name = `${user.lastname} ${user.firstname}`.trim() || user.login;
        assigneeLabelMap.set(user.id, name);
      }
    }

    const enrichedIssue = {
      ...issue,
      journals: (issue.journals ?? []).map((journal) => ({
        ...journal,
        details: (journal.details ?? []).map((detail) => {
          if (detail.propKey !== 'assigneeId') return detail;
          return {
            ...detail,
            oldValue: isUuidLike(detail.oldValue) ? (assigneeLabelMap.get(detail.oldValue) ?? detail.oldValue) : detail.oldValue,
            newValue: isUuidLike(detail.newValue) ? (assigneeLabelMap.get(detail.newValue) ?? detail.newValue) : detail.newValue,
          };
        }),
      })),
    };

    return sendSuccess(res, enrichedIssue);
  }),
);

router.put(
  '/:id',
  authenticate,
  catchAsync(async (req, res) => {
    const parsed = updateIssueSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }
    const body = parsed.data;

    const oldIssue = await prisma.issue.findUnique({ where: { id: req.params.id } });
    if (!oldIssue) throw AppError.notFound('チケットが見つかりません');

    const proj = await prisma.project.findUnique({ where: { id: oldIssue.projectId } });
    if (!proj) throw AppError.notFound();
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, proj);
    if (!can) throw AppError.forbidden();

    const onlyNotesUpdate = Object.keys(body).length === 1 && body.notes !== undefined;
    if (onlyNotesUpdate) {
      const canAddNotes = await userCanAddIssueNotes(req.user?.userId, req.user?.admin, proj);
      if (!canAddNotes) throw AppError.forbidden('コメントを追加する権限がありません');
    } else {
      const canEdit = await userCanEditIssue(req.user?.userId, req.user?.admin, proj, oldIssue.authorId);
      if (!canEdit) throw AppError.forbidden('チケットを編集する権限がありません');
    }

    const nextStatusId = body.statusId ?? oldIssue.statusId;
    const st = await prisma.issueStatus.findUnique({ where: { id: nextStatusId } });

    const data: Prisma.IssueUpdateInput = {};
    if (body.projectId !== undefined) data.project = { connect: { id: body.projectId } };
    if (body.trackerId !== undefined) data.tracker = { connect: { id: body.trackerId } };
    if (body.statusId !== undefined) data.status = { connect: { id: body.statusId } };
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.subject !== undefined) data.subject = body.subject;
    if (body.description !== undefined) data.description = body.description;
    if (body.assigneeId !== undefined) {
      data.assignee = body.assigneeId ? { connect: { id: body.assigneeId } } : { disconnect: true };
    }
    if (body.categoryId !== undefined) {
      data.category = body.categoryId ? { connect: { id: body.categoryId } } : { disconnect: true };
    }
    if (body.versionId !== undefined) {
      data.version = body.versionId ? { connect: { id: body.versionId } } : { disconnect: true };
    }
    if (body.parentId !== undefined) {
      data.parent = body.parentId ? { connect: { id: body.parentId } } : { disconnect: true };
    }
    if (body.startDate !== undefined) data.startDate = body.startDate;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate;
    if (body.estimatedHours !== undefined) data.estimatedHours = body.estimatedHours;
    if (body.doneRatio !== undefined) data.doneRatio = body.doneRatio;
    if (body.repository !== undefined) data.repository = body.repository;

    if (body.statusId !== undefined) {
      data.closedOn = st?.isClosed ? oldIssue.closedOn ?? new Date() : null;
    }

    const notes = body.notes;

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.issue.update({
        where: { id: oldIssue.id },
        data,
      });

      const beforePlain: Record<string, unknown> = {
        projectId: oldIssue.projectId,
        trackerId: oldIssue.trackerId,
        statusId: oldIssue.statusId,
        priority: oldIssue.priority,
        subject: oldIssue.subject,
        description: oldIssue.description,
        assigneeId: oldIssue.assigneeId,
        categoryId: oldIssue.categoryId,
        versionId: oldIssue.versionId,
        parentId: oldIssue.parentId,
        startDate: oldIssue.startDate,
        dueDate: oldIssue.dueDate,
        estimatedHours: oldIssue.estimatedHours,
        doneRatio: oldIssue.doneRatio,
        repository: oldIssue.repository,
      };
      const afterPlain: Record<string, unknown> = {
        projectId: next.projectId,
        trackerId: next.trackerId,
        statusId: next.statusId,
        priority: next.priority,
        subject: next.subject,
        description: next.description,
        assigneeId: next.assigneeId,
        categoryId: next.categoryId,
        versionId: next.versionId,
        parentId: next.parentId,
        startDate: next.startDate,
        dueDate: next.dueDate,
        estimatedHours: next.estimatedHours,
        doneRatio: next.doneRatio,
        repository: next.repository,
      };

      const details = buildJournalDetailsFromDiff(beforePlain, afterPlain, ISSUE_JOURNAL_KEYS);
      let newJournalId: string | null = null;
      if (details.length || (notes !== undefined && notes.length > 0)) {
        const journal = await tx.journal.create({
          data: {
            issueId: next.id,
            userId: req.user!.userId,
            notes: notes?.length ? notes : null,
            details: details.length ? { create: details } : undefined,
          },
        });
        newJournalId = journal.id;
      }

      const issueResult = await tx.issue.findUniqueOrThrow({
        where: { id: next.id },
        include: {
          project: true,
          tracker: true,
          status: true,
          author: { select: { id: true, login: true, firstname: true, lastname: true } },
          assignee: { select: { id: true, login: true, firstname: true, lastname: true } },
        },
      });

      return { ...issueResult, journalId: newJournalId };
    });

    return sendSuccess(res, updated);
  }),
);

router.delete(
  '/:id',
  authenticate,
  catchAsync(async (req, res) => {
    const issue = await prisma.issue.findUnique({ where: { id: req.params.id } });
    if (!issue) throw AppError.notFound('チケットが見つかりません');

    const proj = await prisma.project.findUnique({ where: { id: issue.projectId } });
    if (!proj) throw AppError.notFound();
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, proj);
    if (!can) throw AppError.forbidden();
    const canDelete = await userCanDeleteIssue(req.user?.userId, req.user?.admin, proj);
    if (!canDelete) throw AppError.forbidden('チケットを削除する権限がありません');

    await prisma.issue.delete({ where: { id: issue.id } });
    return sendSuccess(res, { deleted: true });
  }),
);

router.post(
  '/',
  authenticate,
  catchAsync(async (req, res) => {
    const parsed = createIssueSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }
    const body = parsed.data;

    const projectId = await resolveProjectId(body.projectId);
    if (!projectId) throw AppError.badRequest('プロジェクトが存在しません');

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw AppError.badRequest('プロジェクトが存在しません');
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
    if (!can) throw AppError.forbidden();
    const canCreate = await userCanCreateIssue(req.user?.userId, req.user?.admin, project);
    if (!canCreate) throw AppError.forbidden('チケットを作成する権限がありません');

    const st = await prisma.issueStatus.findUnique({ where: { id: body.statusId } });
    if (!st) throw AppError.badRequest('ステータスが存在しません');

    const created = await prisma.$transaction(async (tx) => {
      const last = await tx.issue.findFirst({ orderBy: { number: 'desc' }, select: { number: true } });
      const nextNumber = (last?.number ?? 0) + 1;

      const issue = await tx.issue.create({
        data: {
          number: nextNumber,
          projectId,
          trackerId: body.trackerId,
          statusId: body.statusId,
          priority: body.priority ?? 2,
          subject: body.subject,
          description: body.description ?? null,
          authorId: req.user!.userId,
          assigneeId: body.assigneeId ?? null,
          categoryId: body.categoryId ?? null,
          versionId: body.versionId ?? null,
          parentId: body.parentId ?? null,
          startDate: body.startDate ?? null,
          dueDate: body.dueDate ?? null,
          estimatedHours: body.estimatedHours ?? null,
          repository: body.repository ?? null,
          closedOn: st.isClosed ? new Date() : null,
        },
      });

      await createIssueCreationJournal(tx, issue, req.user!.userId);
      await createIssueActivity(tx, issue, req.user!.userId);

      return tx.issue.findUniqueOrThrow({
        where: { id: issue.id },
        include: {
          project: true,
          tracker: true,
          status: true,
          author: { select: { id: true, login: true, firstname: true, lastname: true } },
          assignee: { select: { id: true, login: true, firstname: true, lastname: true } },
        },
      });
    });

    return sendSuccess(res, created, 201);
  }),
);

export default router;
