import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess, sendPaginated, parsePagination } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { readableProjectIds, requireProjectView } from '../utils/project-access';
import { hasAnyProjectPermission } from '../utils/project-permissions';

const router = Router({ mergeParams: true });

const createBodySchema = z.object({
  projectId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  issueId: z.string().uuid().nullable().optional(),
  hours: z.number().positive(),
  activityId: z.string().min(1),
  comments: z.string().max(255, 'commentsは255文字以内で入力してください').nullable().optional(),
  spentOn: z.coerce.date(),
});

const updateBodySchema = z.object({
  issueId: z.string().uuid().nullable().optional(),
  hours: z.number().positive().optional(),
  activityId: z.string().min(1).optional(),
  comments: z.string().max(255, 'commentsは255文字以内で入力してください').nullable().optional(),
  spentOn: z.coerce.date().optional(),
});

const bulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  changes: updateBodySchema,
});

const groupBySchema = z.enum(['user', 'project', 'activity', 'issue', 'month', 'week']);

function zodToNext(err: unknown, next: NextFunction) {
  if (err instanceof z.ZodError) {
    const message = err.errors
      .map((e) => {
        const path = e.path.length ? `${e.path.join('.')}: ` : '';
        return `${path}${e.message}`;
      })
      .join('; ');
    return next(AppError.badRequest(message));
  }
  next(err);
}

function effectiveProjectId(req: Request): string | undefined {
  const fromParams = req.params.projectId;
  const q = req.query.project_id;
  if (typeof fromParams === 'string' && fromParams.length > 0) return fromParams;
  if (typeof q === 'string' && q.length > 0) return q;
  return undefined;
}

function parseDateQueryParam(value: unknown, name: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw AppError.badRequest(`${name} は文字列で指定してください`);
  const d = new Date(value);
  if (isNaN(d.getTime())) throw AppError.badRequest(`${name} の日付形式が不正です（例: 2026-01-31）`);
  return d;
}

function buildListWhere(req: Request): Prisma.TimeEntryWhereInput {
  const where: Prisma.TimeEntryWhereInput = {};
  const pid = effectiveProjectId(req);
  if (pid) where.projectId = pid;

  const userId = req.query.user_id;
  if (typeof userId === 'string' && userId.length > 0) {
    where.userId = userId;
  }

  const activityId = req.query.activity_id;
  if (typeof activityId === 'string' && activityId.length > 0) {
    where.activityId = activityId;
  }

  const fromDate = parseDateQueryParam(req.query.from, 'from');
  const toDate = parseDateQueryParam(req.query.to, 'to');
  if (fromDate) {
    where.spentOn = { ...(where.spentOn as object), gte: fromDate };
  }
  if (toDate) {
    const end = new Date(toDate);
    end.setHours(23, 59, 59, 999);
    where.spentOn = { ...(where.spentOn as Prisma.DateTimeFilter), lte: end };
  }

  return where;
}

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

async function userCanEditTimeEntry(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  entry: { userId: string; projectId: string },
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  if (entry.userId === userId) {
    return hasAnyProjectPermission(userId, isAdmin, entry.projectId, ['log_time', 'edit_time_entries']);
  }
  return hasAnyProjectPermission(userId, isAdmin, entry.projectId, ['edit_time_entries']);
}

async function userCanDeleteTimeEntry(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  entry: { userId: string; projectId: string },
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  if (entry.userId === userId) {
    return hasAnyProjectPermission(userId, isAdmin, entry.projectId, ['log_time', 'delete_time_entries']);
  }
  return hasAnyProjectPermission(userId, isAdmin, entry.projectId, ['delete_time_entries']);
}

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);
      const where = buildListWhere(req);
      const projectRef = effectiveProjectId(req);
      if (projectRef) {
        const project = await requireProjectView(req.user, projectRef, ['view_time_entries'], { allowPublic: false });
        where.projectId = project.id;
      } else {
        const ids = await readableProjectIds(req.user, ['view_time_entries'], { allowPublic: false });
        if (ids !== null) where.projectId = { in: ids };
      }

      const [total, rows] = await Promise.all([
        prisma.timeEntry.count({ where }),
        prisma.timeEntry.findMany({
          where,
          skip,
          take: perPage,
          orderBy: { spentOn: 'desc' },
          include: {
            project: { select: { id: true, name: true, identifier: true } },
            issue: { select: { id: true, number: true, subject: true } },
            user: { select: { id: true, login: true, firstname: true, lastname: true } },
            activity: { select: { id: true, name: true, type: true } },
          },
        }),
      ]);

      return sendPaginated(res, rows, {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage) || 1,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/report',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const raw = (req.query.groupBy ?? req.query.group_by) as string | undefined;
      const groupBy = groupBySchema.parse(raw ?? 'project');
      const where = buildListWhere(req);
      const projectRef = effectiveProjectId(req);
      if (projectRef) {
        const project = await requireProjectView(req.user, projectRef, ['view_time_entries'], { allowPublic: false });
        where.projectId = project.id;
      } else {
        const ids = await readableProjectIds(req.user, ['view_time_entries'], { allowPublic: false });
        if (ids !== null) where.projectId = { in: ids };
      }

      if (groupBy === 'user') {
        const grouped = await prisma.timeEntry.groupBy({
          by: ['userId'],
          where,
          _sum: { hours: true },
          _count: { _all: true },
        });
        const ids = grouped.map((g) => g.userId);
        const users = ids.length
          ? await prisma.user.findMany({
              where: { id: { in: ids } },
              select: { id: true, login: true, firstname: true, lastname: true },
            })
          : [];
        const labels = Object.fromEntries(users.map((u) => [u.id, `${u.login} (${u.firstname} ${u.lastname})`]));
        const rows = grouped.map((row) => ({
          key: row.userId,
          label: labels[row.userId] ?? row.userId,
          hours: row._sum.hours ?? 0,
          entries: row._count._all,
        }));
        return sendSuccess(res, { groupBy, rows });
      }

      if (groupBy === 'project') {
        const grouped = await prisma.timeEntry.groupBy({
          by: ['projectId'],
          where,
          _sum: { hours: true },
          _count: { _all: true },
        });
        const ids = grouped.map((g) => g.projectId);
        const projects = ids.length
          ? await prisma.project.findMany({
              where: { id: { in: ids } },
              select: { id: true, name: true, identifier: true },
            })
          : [];
        const labels = Object.fromEntries(projects.map((p) => [p.id, `${p.name} [${p.identifier}]`]));
        const rows = grouped.map((row) => ({
          key: row.projectId,
          label: labels[row.projectId] ?? row.projectId,
          hours: row._sum.hours ?? 0,
          entries: row._count._all,
        }));
        return sendSuccess(res, { groupBy, rows });
      }

      if (groupBy === 'activity') {
        const grouped = await prisma.timeEntry.groupBy({
          by: ['activityId'],
          where,
          _sum: { hours: true },
          _count: { _all: true },
        });
        const ids = grouped.map((g) => g.activityId);
        const acts = ids.length
          ? await prisma.enumeration.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
          : [];
        const labels = Object.fromEntries(acts.map((a) => [a.id, a.name]));
        const rows = grouped.map((row) => ({
          key: row.activityId,
          label: labels[row.activityId] ?? row.activityId,
          hours: row._sum.hours ?? 0,
          entries: row._count._all,
        }));
        return sendSuccess(res, { groupBy, rows });
      }

      if (groupBy === 'issue') {
        const issueWhere = { ...where, issueId: { not: null } } as Prisma.TimeEntryWhereInput;
        const grouped = await prisma.timeEntry.groupBy({
          by: ['issueId'],
          where: issueWhere,
          _sum: { hours: true },
          _count: { _all: true },
        });
        const ids = grouped.map((g) => g.issueId).filter((id): id is string => id != null);
        const issues = ids.length
          ? await prisma.issue.findMany({ where: { id: { in: ids } }, select: { id: true, subject: true } })
          : [];
        const labels = Object.fromEntries(issues.map((i) => [i.id, i.subject]));
        const rows = grouped.map((row) => ({
          key: row.issueId ?? 'none',
          label: row.issueId ? labels[row.issueId] ?? row.issueId : '—',
          hours: row._sum.hours ?? 0,
          entries: row._count._all,
        }));
        return sendSuccess(res, { groupBy, rows });
      }

      const entries = await prisma.timeEntry.findMany({
        where,
        select: { hours: true, spentOn: true },
      });

      const map = new Map<string, { hours: number; entries: number }>();
      for (const e of entries) {
        const k =
          groupBy === 'month'
            ? `${e.spentOn.getUTCFullYear()}-${String(e.spentOn.getUTCMonth() + 1).padStart(2, '0')}`
            : isoWeekKey(e.spentOn);
        const cur = map.get(k) ?? { hours: 0, entries: 0 };
        cur.hours += e.hours;
        cur.entries += 1;
        map.set(k, cur);
      }

      const rows = [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => ({
          key,
          label: key,
          hours: v.hours,
          entries: v.entries,
        }));

      return sendSuccess(res, { groupBy, rows });
    } catch (err) {
      zodToNext(err, next);
    }
  },
);

router.post(
  '/bulk_update',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = bulkUpdateSchema.parse(req.body);
      const data: Record<string, unknown> = {};
      if (body.changes.hours !== undefined) data.hours = body.changes.hours;
      if (body.changes.comments !== undefined) data.comments = body.changes.comments;
      if (body.changes.activityId !== undefined) data.activityId = body.changes.activityId;
      if (body.changes.spentOn !== undefined) data.spentOn = body.changes.spentOn;
      if (body.changes.issueId !== undefined) data.issueId = body.changes.issueId;

      if (Object.keys(data).length === 0) {
        throw AppError.badRequest('更新するフィールドがありません');
      }

      const entries = await prisma.timeEntry.findMany({
        where: { id: { in: body.ids } },
        select: { id: true, userId: true, projectId: true },
      });
      const allowedIds: string[] = [];
      for (const entry of entries) {
        if (await userCanEditTimeEntry(req.user?.userId, req.user?.admin, entry)) {
          allowedIds.push(entry.id);
        }
      }

      const result = await prisma.timeEntry.updateMany({
        where: { id: { in: allowedIds } },
        data: data as Prisma.TimeEntryUpdateManyMutationInput,
      });
      return sendSuccess(res, { updated: result.count });
    } catch (err) {
      zodToNext(err, next);
    }
  },
);

router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const entry = await prisma.timeEntry.findUnique({
        where: { id: String(req.params.id) },
        include: {
          project: { select: { id: true, name: true, identifier: true } },
          issue: { select: { id: true, number: true, subject: true } },
          user: { select: { id: true, login: true, firstname: true, lastname: true } },
          activity: { select: { id: true, name: true, type: true } },
        },
      });
      if (!entry) throw AppError.notFound('工数エントリが見つかりません');
      if (entry.userId !== req.user!.userId) {
        await requireProjectView(req.user, entry.projectId, ['view_time_entries'], { allowPublic: false });
      }
      return sendSuccess(res, entry);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createBodySchema.parse(req.body);
      const projectId = body.projectId ?? effectiveProjectId(req);
      if (!projectId) {
        throw AppError.badRequest('projectId が必要です');
      }

      const targetUserId = body.userId ?? req.user!.userId;

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw AppError.notFound('プロジェクトが見つかりません');

      const isOwnEntry = targetUserId === req.user!.userId;
      const canCreateTimeEntry = await hasAnyProjectPermission(
        req.user?.userId,
        req.user?.admin,
        project.id,
        isOwnEntry ? ['log_time', 'edit_time_entries'] : ['edit_time_entries'],
      );
      if (!canCreateTimeEntry) {
        throw AppError.forbidden(
          isOwnEntry ? '工数を記録する権限がありません' : '他ユーザーの工数を記録する権限がありません',
        );
      }

      const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!targetUser) throw AppError.badRequest('ユーザーが存在しません');

      if (body.issueId) {
        const issue = await prisma.issue.findFirst({
          where: { id: body.issueId, projectId },
        });
        if (!issue) throw AppError.badRequest('チケットがプロジェクトに存在しません');
      }

      const activity = await prisma.enumeration.findFirst({
        where: { id: body.activityId, type: 'TimeEntryActivity', active: true },
      });
      if (!activity) throw AppError.badRequest('無効な作業分類です');

      const entry = await prisma.timeEntry.create({
        data: {
          projectId,
          issueId: body.issueId ?? null,
          userId: targetUserId,
          activityId: body.activityId,
          hours: body.hours,
          comments: body.comments ?? null,
          spentOn: body.spentOn,
        },
        include: {
          project: { select: { id: true, name: true, identifier: true } },
          issue: { select: { id: true, number: true, subject: true } },
          user: { select: { id: true, login: true, firstname: true, lastname: true } },
          activity: { select: { id: true, name: true, type: true } },
        },
      });

      return sendSuccess(res, entry, 201);
    } catch (err) {
      zodToNext(err, next);
    }
  },
);

router.put(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = updateBodySchema.parse(req.body);
      const id = String(req.params.id);
      const existing = await prisma.timeEntry.findUnique({ where: { id } });
      if (!existing) throw AppError.notFound('工数エントリが見つかりません');
      if (!(await userCanEditTimeEntry(req.user?.userId, req.user?.admin, existing))) {
        throw AppError.forbidden();
      }

      const data: Prisma.TimeEntryUpdateInput = {};
      if (body.hours !== undefined) data.hours = body.hours;
      if (body.comments !== undefined) data.comments = body.comments;
      if (body.activityId !== undefined) {
        data.activity = { connect: { id: body.activityId } };
      }
      if (body.spentOn !== undefined) data.spentOn = body.spentOn;
      if (body.issueId !== undefined) data.issue = body.issueId ? { connect: { id: body.issueId } } : { disconnect: true };

      if (body.activityId) {
        const activity = await prisma.enumeration.findFirst({
          where: { id: body.activityId, type: 'TimeEntryActivity', active: true },
        });
        if (!activity) throw AppError.badRequest('無効な作業分類です');
      }

      if (body.issueId) {
        const issue = await prisma.issue.findFirst({
          where: { id: body.issueId, projectId: existing.projectId },
        });
        if (!issue) throw AppError.badRequest('チケットがプロジェクトに存在しません');
      }

      const entry = await prisma.timeEntry.update({
        where: { id },
        data,
        include: {
          project: { select: { id: true, name: true, identifier: true } },
          issue: { select: { id: true, number: true, subject: true } },
          user: { select: { id: true, login: true, firstname: true, lastname: true } },
          activity: { select: { id: true, name: true, type: true } },
        },
      });

      return sendSuccess(res, entry);
    } catch (err) {
      zodToNext(err, next);
    }
  },
);

router.delete(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = String(req.params.id);
      const existing = await prisma.timeEntry.findUnique({ where: { id } });
      if (!existing) throw AppError.notFound('工数エントリが見つかりません');
      if (!(await userCanDeleteTimeEntry(req.user?.userId, req.user?.admin, existing))) {
        throw AppError.forbidden();
      }

      await prisma.timeEntry.delete({ where: { id } });
      return sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
