import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess, sendPaginated, parsePagination } from '../utils/response';
import { authenticate, authenticateOrQueryApiKey, type AuthPayload } from '../middleware/auth';
import { notifyIssueEvent } from '../services/notification-service';
import { logger } from '../utils/logger';
import {
  getUserGroupIds,
  getUserProjectPermissionSet,
  hasAnyProjectPermission,
} from '../utils/project-permissions';
import { z } from 'zod';

const router = Router({ mergeParams: true });

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

function dispatchIssueNotification(
  issueId: string,
  actorId: string,
  action: 'created' | 'updated' | 'commented',
) {
  notifyIssueEvent(issueId, actorId, action).catch((error) => {
    logger.warn('チケット通知の送信準備に失敗しました', {
      issueId,
      action,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

const ISSUE_JOURNAL_KEYS = [
  'projectId',
  'trackerId',
  'statusId',
  'priority',
  'subject',
  'description',
  'assigneeId',
  'assigneeGroupId',
  'categoryId',
  'parentId',
  'startDate',
  'dueDate',
  'estimatedHours',
  'doneRatio',
  'repository',
] as const;

const ISSUE_ACTIVITY_FIELD_LABELS: Record<string, string> = {
  projectId: 'プロジェクト',
  trackerId: '作業分類',
  statusId: 'ステータス',
  priority: '優先度',
  subject: '題名',
  description: '説明',
  assigneeId: '担当者',
  assigneeGroupId: '担当者',
  categoryId: 'カテゴリ',
  parentId: '親チケット',
  startDate: '開始日',
  dueDate: '期日',
  estimatedHours: '予定工数',
  doneRatio: '進捗率',
  repository: 'リポジトリ',
};

function catchAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
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

function buildCustomFieldJournalDetailsFromDiff(
  fields: { id: string; name: string }[],
  before: Map<string, string | null>,
  after: Map<string, string | null>,
) {
  const details: Prisma.JournalDetailCreateWithoutJournalInput[] = [];
  for (const field of fields) {
    const oldValue = before.get(field.id) ?? null;
    const newValue = after.get(field.id) ?? null;
    if (oldValue !== newValue) {
      details.push({
        property: 'cf',
        propKey: field.id,
        oldValue,
        newValue,
      });
    }
  }
  return details;
}

function isUuidLike(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function buildIssueWhere(
  req: Request,
  user: AuthPayload | undefined,
): Promise<{ where: Prisma.IssueWhereInput; earlyEmpty: boolean }> {
  const paramPid = req.params.projectId as string | undefined;
  const queryPid = req.query.projectId as string | undefined;
  const resolvedFromParam = paramPid ? await resolveProjectId(paramPid) : undefined;
  const resolvedFromQuery = queryPid ? await resolveProjectId(queryPid) : undefined;

  let projectIdFilter: string | undefined;
  if (resolvedFromParam) projectIdFilter = resolvedFromParam;
  else if (resolvedFromQuery) projectIdFilter = resolvedFromQuery;

  const visible = await getVisibleProjectIds(user?.userId, user?.admin);
  const where: Prisma.IssueWhereInput = {};

  if (projectIdFilter) {
    if (visible !== null && !visible.includes(projectIdFilter)) {
      throw AppError.forbidden();
    }
    where.projectId = projectIdFilter;
  } else if (visible !== null) {
    if (!visible.length) return { where, earlyEmpty: true };
    where.projectId = { in: visible };
  }

  const statusId = req.query.status as string | undefined;
  if (statusId) where.statusId = statusId;

  const trackerId = req.query.tracker as string | undefined;
  if (trackerId) where.trackerId = trackerId;

  const assigneeId = req.query.assignee as string | undefined;
  if (assigneeId) {
    where.OR = [
      { assigneeId },
      { assigneeGroup: { groupUsers: { some: { userId: assigneeId } } } },
    ];
  }

  const assigneeGroupId = req.query.assignee_group as string | undefined;
  if (assigneeGroupId) where.assigneeGroupId = assigneeGroupId;

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

  const parentNumberRaw = req.query.parent as string | undefined;
  if (parentNumberRaw?.trim()) {
    const normalizedParentNumber = parentNumberRaw.trim().replace(/^#/, '');
    const parentNumber = Number(normalizedParentNumber);
    if (Number.isInteger(parentNumber) && parentNumber > 0) {
      where.parent = { number: parentNumber };
    }
  }

  const q = req.query.q as string | undefined;
  if (q?.trim()) {
    const search = q.trim();
    const issueNumber = Number(search.replace(/^#/, ''));
    if (Number.isInteger(issueNumber) && issueNumber > 0) {
      where.AND = [{
        OR: [
          { subject: { contains: search, mode: 'insensitive' } },
          { number: issueNumber },
        ],
      }];
    } else {
      where.subject = { contains: search, mode: 'insensitive' };
    }
  }

  return { where, earlyEmpty: false };
}

type IssueTreeSeed = {
  id: string;
  parentId: string | null;
  number: number;
};

function sortIssuesByHierarchy(rows: IssueTreeSeed[]): { orderedIds: string[]; depthById: Map<string, number> } {
  const byParent = new Map<string | null, IssueTreeSeed[]>();
  const rowIds = new Set(rows.map((row) => row.id));

  for (const row of rows) {
    const parentKey = row.parentId && rowIds.has(row.parentId) ? row.parentId : null;
    const siblings = byParent.get(parentKey) ?? [];
    siblings.push(row);
    byParent.set(parentKey, siblings);
  }

  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.number - b.number);
  }

  const ordered: string[] = [];
  const depthById = new Map<string, number>();
  const visited = new Set<string>();
  const visit = (row: IssueTreeSeed, depth: number) => {
    if (visited.has(row.id)) return;
    visited.add(row.id);
    ordered.push(row.id);
    depthById.set(row.id, depth);
    for (const child of byParent.get(row.id) ?? []) visit(child, depth + 1);
  };

  for (const root of byParent.get(null) ?? []) visit(root, 0);
  for (const row of rows) visit(row, 0);
  return { orderedIds: ordered, depthById };
}

function issueOrderBy(sort: string, order: Prisma.SortOrder): Prisma.IssueOrderByWithRelationInput[] {
  switch (sort) {
    case 'number':
      return [{ number: order }];
    case 'tracker':
      return [{ tracker: { name: order } }, { number: 'desc' }];
    case 'subject':
      return [{ subject: order }, { number: 'desc' }];
    case 'parentNumber':
      return [{ parent: { number: order } }, { number: 'desc' }];
    case 'status':
      return [{ status: { position: order } }, { number: 'desc' }];
    case 'assignee':
      return [
        { assignee: { lastname: order } },
        { assignee: { firstname: order } },
        { assigneeGroup: { name: order } },
        { number: 'desc' },
      ];
    case 'priority':
      return [{ priority: order }, { number: 'desc' }];
    case 'createdAt':
      return [{ createdAt: order }, { number: 'desc' }];
    case 'dueDate':
      return [{ dueDate: order }, { number: 'desc' }];
    case 'updatedAt':
    default:
      return [{ updatedAt: order }, { number: 'desc' }];
  }
}

async function assertValidIssueParent(issueId: string, projectId: string, parentId: string | null | undefined) {
  if (!parentId) return;
  if (parentId === issueId) {
    throw AppError.badRequest('親チケットに自分自身は指定できません');
  }

  const parent = await prisma.issue.findUnique({
    where: { id: parentId },
    select: { id: true, projectId: true, parentId: true },
  });
  if (!parent || parent.projectId !== projectId) {
    throw AppError.badRequest('親チケットが見つからないか、同じプロジェクトに属していません');
  }

  let current: typeof parent | null = parent;
  const seen = new Set<string>();
  while (current?.parentId) {
    if (current.parentId === issueId) {
      throw AppError.badRequest('親チケットに子孫チケットは指定できません');
    }
    if (seen.has(current.parentId)) {
      throw AppError.badRequest('親子関係が循環しています');
    }
    seen.add(current.parentId);
    current = await prisma.issue.findUnique({
      where: { id: current.parentId },
      select: { id: true, projectId: true, parentId: true },
    });
    if (current && current.projectId !== projectId) {
      throw AppError.badRequest('親チケットが同じプロジェクトに属していません');
    }
  }
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

function collectJournalDetailIds(
  details: Prisma.JournalDetailCreateWithoutJournalInput[],
  propKey: string,
) {
  return Array.from(new Set(details.flatMap((detail) => {
    if (detail.propKey !== propKey) return [];
    return [detail.oldValue, detail.newValue].filter(isUuidLike);
  })));
}

function collectCustomFieldDetailIds(details: Prisma.JournalDetailCreateWithoutJournalInput[]) {
  return Array.from(new Set(details.flatMap((detail) => (
    detail.property === 'cf' && isUuidLike(detail.propKey) ? [detail.propKey] : []
  ))));
}

function setLabel(labels: Map<string, string>, id: string, value: string | null | undefined) {
  if (value && value.trim()) labels.set(id, value.trim());
}

function formatIssueActivityValue(
  propKey: string,
  value: string | null | undefined,
  labels: Map<string, string>,
) {
  if (!value) return '-';
  if (labels.has(value)) return labels.get(value)!;
  if (propKey === 'startDate' || propKey === 'dueDate') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
    }
  }
  if (propKey === 'doneRatio') return `${value}%`;
  return value;
}

async function buildIssueJournalActivityDescription(
  db: Tx,
  details: Prisma.JournalDetailCreateWithoutJournalInput[],
  notes: string | undefined,
) {
  const labels = new Map<string, string>();
  const [
    projectIds,
    trackerIds,
    statusIds,
    assigneeIds,
    assigneeGroupIds,
    categoryIds,
    parentIds,
    customFieldIds,
  ] = [
    collectJournalDetailIds(details, 'projectId'),
    collectJournalDetailIds(details, 'trackerId'),
    collectJournalDetailIds(details, 'statusId'),
    collectJournalDetailIds(details, 'assigneeId'),
    collectJournalDetailIds(details, 'assigneeGroupId'),
    collectJournalDetailIds(details, 'categoryId'),
    collectJournalDetailIds(details, 'parentId'),
    collectCustomFieldDetailIds(details),
  ];

  await Promise.all([
    projectIds.length
      ? db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } })
        .then((rows) => rows.forEach((row) => setLabel(labels, row.id, row.name)))
      : Promise.resolve(),
    trackerIds.length
      ? db.tracker.findMany({ where: { id: { in: trackerIds } }, select: { id: true, name: true } })
        .then((rows) => rows.forEach((row) => setLabel(labels, row.id, row.name)))
      : Promise.resolve(),
    statusIds.length
      ? db.issueStatus.findMany({ where: { id: { in: statusIds } }, select: { id: true, name: true } })
        .then((rows) => rows.forEach((row) => setLabel(labels, row.id, row.name)))
      : Promise.resolve(),
    assigneeIds.length
      ? db.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, login: true, firstname: true, lastname: true } })
        .then((rows) => rows.forEach((row) => setLabel(labels, row.id, `${row.lastname} ${row.firstname}`.trim() || row.login)))
      : Promise.resolve(),
    assigneeGroupIds.length
      ? db.group.findMany({ where: { id: { in: assigneeGroupIds } }, select: { id: true, name: true } })
        .then((rows) => rows.forEach((row) => setLabel(labels, row.id, `[グループ] ${row.name}`)))
      : Promise.resolve(),
    categoryIds.length
      ? db.issueCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
        .then((rows) => rows.forEach((row) => setLabel(labels, row.id, row.name)))
      : Promise.resolve(),
    parentIds.length
      ? db.issue.findMany({ where: { id: { in: parentIds } }, select: { id: true, number: true, subject: true } })
        .then((rows) => rows.forEach((row) => setLabel(labels, row.id, `#${row.number} ${row.subject}`)))
      : Promise.resolve(),
    customFieldIds.length
      ? db.customField.findMany({ where: { id: { in: customFieldIds } }, select: { id: true, name: true } })
        .then((rows) => rows.forEach((row) => setLabel(labels, row.id, row.name)))
      : Promise.resolve(),
  ]);

  const changes = details.map((detail) => {
    const label = detail.property === 'cf'
      ? (labels.get(detail.propKey) ?? detail.propKey)
      : (ISSUE_ACTIVITY_FIELD_LABELS[detail.propKey] ?? detail.propKey);
    const oldValue = formatIssueActivityValue(detail.propKey, detail.oldValue, labels);
    const newValue = formatIssueActivityValue(detail.propKey, detail.newValue, labels);
    return `${label}: ${oldValue} -> ${newValue}`;
  });
  if (notes !== undefined && notes.length > 0) changes.push(`コメント: ${notes}`);
  return changes.length > 0 ? changes.join('\n') : null;
}

async function createIssueJournalActivity(
  db: Tx,
  issue: { id: string; projectId: string; number: number; subject: string },
  userId: string,
  details: Prisma.JournalDetailCreateWithoutJournalInput[],
  notes: string | undefined,
) {
  await db.activity.create({
    data: {
      projectId: issue.projectId,
      userId,
      actType: details.length > 0 ? 'issue_update' : 'issue_comment',
      actId: issue.id,
      title: `#${issue.number} ${issue.subject}`,
      description: await buildIssueJournalActivityDescription(db, details, notes),
    },
  });
}

async function assertAssignableToProject(
  assigneeId: string | null | undefined,
  assigneeGroupId: string | null | undefined,
  projectId: string,
) {
  if (assigneeId && assigneeGroupId) {
    throw AppError.badRequest('担当者はユーザーまたはグループのどちらか一方を指定してください');
  }

  if (assigneeId) {
    const member = await prisma.member.findFirst({
      where: { projectId, userId: assigneeId },
      select: { id: true },
    });
    if (!member) throw AppError.badRequest('担当者はプロジェクトのメンバーから選択してください');
  }

  if (assigneeGroupId) {
    const member = await prisma.member.findFirst({
      where: { projectId, groupId: assigneeGroupId },
      select: { id: true },
    });
    if (!member) throw AppError.badRequest('担当グループはプロジェクトのグループから選択してください');
  }
}

async function userCanAccessProject(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string; isPublic: boolean },
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return project.isPublic;
  const can = await hasAnyProjectPermission(userId, isAdmin, project.id, ['view_issues']);
  if (can) return true;
  return project.isPublic;
}

async function userCanCreateIssue(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string },
): Promise<boolean> {
  if (isAdmin) return true;
  const permissions = await getUserProjectPermissionSet(userId, isAdmin, project.id);
  if (!permissions) return false;
  // 作成は add_issues 明示付与のみ許可（manage_project などでの暗黙許可は不可）
  return permissions.has('add_issues');
}

async function userCanEditIssue(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string },
  issueAuthorId: string,
): Promise<boolean> {
  if (await hasAnyProjectPermission(userId, isAdmin, project.id, ['edit_issues'])) return true;
  if (!userId) return false;
  const perms = await getUserProjectPermissionSet(userId, isAdmin, project.id);
  if (!perms) return false;
  return perms.has('edit_own_issues') && issueAuthorId === userId;
}

async function userCanDeleteIssue(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string },
  issueAuthorId: string,
): Promise<boolean> {
  return userCanEditIssue(userId, isAdmin, project, issueAuthorId);
}

async function userCanAddIssueNotes(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string },
): Promise<boolean> {
  return hasAnyProjectPermission(userId, isAdmin, project.id, [
    'view_issues',
    'add_issue_notes',
    'edit_issue_notes',
    'edit_own_issue_notes',
    'edit_issues',
  ]);
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

function ensureIssueDateOrder(
  startDate: Date | null | undefined,
  dueDate: Date | null | undefined,
) {
  if (!startDate || !dueDate) return;
  if (dueDate.getTime() < startDate.getTime()) {
    throw AppError.badRequest('期日は開始日以降を指定してください');
  }
}

const createIssueSchema = z.object({
  projectId: z.string().min(1),
  trackerId: z.string().uuid(),
  statusId: z.string().uuid(),
  priority: z.number().int().min(1).max(5).optional(),
  subject: z.string().min(1),
  description: z.string().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  assigneeGroupId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  doneRatio: z.number().int().min(0).max(100).refine((value) => value % 10 === 0).optional(),
  repository: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
});

const updateIssueSchema = z.object({
  projectId: z.string().uuid().optional(),
  trackerId: z.string().uuid().optional(),
  statusId: z.string().uuid().optional(),
  priority: z.number().int().min(1).max(5).optional(),
  subject: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  assigneeGroupId: z.string().uuid().nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  parentId: z.string().uuid().nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  estimatedHours: z.number().nullable().optional(),
  doneRatio: z.number().int().min(0).max(100).refine((value) => value % 10 === 0).optional(),
  repository: z.string().nullable().optional(),
  customFields: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
});

const bulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
  changes: updateIssueSchema.omit({ notes: true }).partial(),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
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

type IssueCustomFieldDefinition = Prisma.CustomFieldGetPayload<{
  include: {
    customFieldTrackers: true;
    projectCustomFields: true;
    enumerations: true;
  };
}>;

function possibleValuesOf(field: { possibleValues: Prisma.JsonValue | null; enumerations?: { name: string; active: boolean }[] }): string[] {
  const values = field.possibleValues;
  const fromJson = Array.isArray(values)
    ? values.map(String)
    : typeof values === 'string'
      ? values.split(/\r?\n|\|/).map((v) => v.trim()).filter(Boolean)
      : [];
  const fromEnumerations = (field.enumerations ?? [])
    .filter((e) => e.active)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => e.name);
  return fromJson.length ? fromJson : fromEnumerations;
}

function allowedCustomFieldValues(field: IssueCustomFieldDefinition): string[] {
  const values = possibleValuesOf(field);
  if (field.fieldFormat !== 'key_value') return values;
  return values.map((entry) => entry.match(/^([^=:\s]+)\s*[=:]\s*(.+)$/)?.[1] ?? entry);
}

function normalizeCustomFieldValue(field: IssueCustomFieldDefinition, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') {
    return field.defaultValue && field.defaultValue.trim() ? field.defaultValue.trim() : null;
  }

  const values = field.multiple
    ? (Array.isArray(raw) ? raw : [raw]).map((v) => String(v).trim()).filter(Boolean)
    : [String(raw).trim()];

  if (!values.length) return null;

  const allowed = allowedCustomFieldValues(field);
  if ((field.fieldFormat === 'list' || field.fieldFormat === 'key_value') && allowed.length) {
    for (const value of values) {
      if (!allowed.includes(value)) {
        throw AppError.badRequest(`${field.name} の値が候補に含まれていません`);
      }
    }
  }

  for (const value of values) {
    if (field.minLength !== null && field.minLength !== undefined && value.length < field.minLength) {
      throw AppError.badRequest(`${field.name} は ${field.minLength} 文字以上で入力してください`);
    }
    if (field.maxLength !== null && field.maxLength !== undefined && field.maxLength > 0 && value.length > field.maxLength) {
      throw AppError.badRequest(`${field.name} は ${field.maxLength} 文字以内で入力してください`);
    }
    if (field.regexp) {
      const re = new RegExp(field.regexp);
      if (!re.test(value)) throw AppError.badRequest(`${field.name} の形式が正しくありません`);
    }
    if (field.fieldFormat === 'int' && !/^-?\d+$/.test(value)) {
      throw AppError.badRequest(`${field.name} は整数で入力してください`);
    }
    if (field.fieldFormat === 'float' && !Number.isFinite(Number(value))) {
      throw AppError.badRequest(`${field.name} は数値で入力してください`);
    }
    if (field.fieldFormat === 'date' && Number.isNaN(Date.parse(value))) {
      throw AppError.badRequest(`${field.name} は日付で入力してください`);
    }
    if (field.fieldFormat === 'bool' && !['1', '0', 'true', 'false', 'yes', 'no', 'on', 'off'].includes(value.toLowerCase())) {
      throw AppError.badRequest(`${field.name} は真偽値で入力してください`);
    }
    if (['user', 'issue', 'attachment'].includes(field.fieldFormat) && !isUuidLike(value)) {
      throw AppError.badRequest(`${field.name} の参照先が正しくありません`);
    }
    if (
      field.fieldFormat === 'progress' &&
      (!/^\d+$/.test(value) || Number(value) < 0 || Number(value) > 100 || Number(value) % 10 !== 0)
    ) {
      throw AppError.badRequest(`${field.name} は 0 から 100 の10%区切りで入力してください`);
    }
    if (field.fieldFormat === 'link') {
      try {
        new URL(value);
      } catch {
        throw AppError.badRequest(`${field.name} はURLで入力してください`);
      }
    }
  }

  if (field.fieldFormat === 'bool') {
    const value = values[0].toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(value) ? '1' : '0';
  }

  return field.multiple ? JSON.stringify(values) : values[0];
}

function parseStoredCustomFieldValue(field: { multiple: boolean }, value: string | null): string | string[] | null {
  if (!value) return field.multiple ? [] : null;
  if (!field.multiple) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  } catch {
    return value.split(/\r?\n/).filter(Boolean);
  }
}

async function getApplicableIssueCustomFields(projectId: string, trackerId: string): Promise<IssueCustomFieldDefinition[]> {
  const fields = await prisma.customField.findMany({
    where: {
      type: 'IssueCustomField',
      OR: [
        { isForAll: true },
        { projectCustomFields: { some: { projectId } } },
      ],
    },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: {
      customFieldTrackers: true,
      projectCustomFields: true,
      enumerations: { orderBy: { position: 'asc' } },
    },
  });

  return fields.filter((field) => (
    field.customFieldTrackers.length === 0 ||
    field.customFieldTrackers.some((row) => row.trackerId === trackerId)
  ));
}

interface ValidateIssueCustomFieldOptions {
  actorId: string;
  issueId?: string;
}

async function validateIssueCustomFields(
  projectId: string,
  trackerId: string,
  raw: Record<string, unknown> | undefined,
  options: ValidateIssueCustomFieldOptions,
) {
  const fields = await getApplicableIssueCustomFields(projectId, trackerId);
  const submitted = raw ?? {};
  const normalized = new Map<string, string | null>();

  for (const field of fields) {
    const value = normalizeCustomFieldValue(field, submitted[field.id]);
    if (field.isRequired && (value === null || value === '')) {
      throw AppError.badRequest(`${field.name} を入力してください`);
    }
    if (value !== null) normalized.set(field.id, value);
  }

  const idsFor = (fieldFormat: string) =>
    fields
      .filter((field) => field.fieldFormat === fieldFormat)
      .flatMap((field) => {
        const value = normalized.get(field.id);
        if (!value) return [];
        return field.multiple ? parseStoredCustomFieldValue(field, value) ?? [] : [value];
      })
      .map(String);

  const userIds = Array.from(new Set(idsFor('user')));
  if (userIds.length) {
    const count = await prisma.member.count({ where: { projectId, userId: { in: userIds } } });
    if (count !== userIds.length) throw AppError.badRequest('ユーザーの参照先が正しくありません');
  }

  const issueIds = Array.from(new Set(idsFor('issue')));
  if (issueIds.length) {
    const count = await prisma.issue.count({ where: { projectId, id: { in: issueIds } } });
    if (count !== issueIds.length) throw AppError.badRequest('チケットの参照先が正しくありません');
  }

  const attachmentIds = Array.from(new Set(idsFor('attachment')));
  if (attachmentIds.length) {
    const count = await prisma.attachment.count({
      where: {
        id: { in: attachmentIds },
        OR: [
          { authorId: options.actorId, issueId: null, containerId: null },
          ...(options.issueId ? [{ issueId: options.issueId }, { containerType: 'Issue', containerId: options.issueId }] : []),
        ],
      },
    });
    if (count !== attachmentIds.length) throw AppError.badRequest('ファイルの参照先が正しくありません');
  }

  return { fields, normalized };
}
async function replaceIssueCustomValues(
  db: Tx,
  issueId: string,
  normalized: Map<string, string | null>,
  fields: IssueCustomFieldDefinition[],
) {
  const fieldIds = fields.map((field) => field.id);
  const oldValues = await db.customValue.findMany({
    where: {
      customizedType: 'Issue',
      customizedId: issueId,
      customFieldId: { in: fieldIds },
    },
  });
  const oldValueMap = new Map(oldValues.map((value) => [value.customFieldId, value.value]));

  await db.customValue.deleteMany({
    where: {
      customizedType: 'Issue',
      customizedId: issueId,
      customFieldId: { in: fieldIds },
    },
  });

  const rows = Array.from(normalized.entries())
    .filter(([, value]) => value !== null && value !== '')
    .map(([customFieldId, value]) => ({
      customFieldId,
      customizedType: 'Issue',
      customizedId: issueId,
      value,
    }));
  if (rows.length) await db.customValue.createMany({ data: rows });

  const attachmentFieldValues = (source: Map<string, string | null | undefined>) => fields
    .filter((field) => field.fieldFormat === 'attachment')
    .flatMap((field) => {
      const value = source.get(field.id);
      if (!value) return [];
      return field.multiple ? parseStoredCustomFieldValue(field, value) ?? [] : [value];
    })
    .map(String);
  const attachmentIds = attachmentFieldValues(normalized);
  const removedAttachmentIds = attachmentFieldValues(oldValueMap).filter((id) => !attachmentIds.includes(id));

  if (attachmentIds.length) {
    await db.attachment.updateMany({
      where: { id: { in: attachmentIds } },
      data: { issueId, containerType: 'Issue', containerId: issueId },
    });
  }
  if (removedAttachmentIds.length) {
    await db.attachment.updateMany({
      where: {
        id: { in: removedAttachmentIds },
        issueId,
        description: { startsWith: 'custom-field:' },
      },
      data: { issueId: null, containerType: null, containerId: null },
    });
  }
}

async function attachIssueCustomFields<T extends { id: string; projectId: string; trackerId: string }>(issue: T) {
  const fields = await getApplicableIssueCustomFields(issue.projectId, issue.trackerId);
  const values = await prisma.customValue.findMany({
    where: {
      customizedType: 'Issue',
      customizedId: issue.id,
      customFieldId: { in: fields.map((field) => field.id) },
    },
  });
  const valueMap = new Map(values.map((value) => [value.customFieldId, value.value]));
  return {
    ...issue,
    customFields: fields.map((field) => ({
      id: field.id,
      name: field.name,
      fieldFormat: field.fieldFormat,
      isRequired: field.isRequired,
      isFilter: field.isFilter,
      searchable: field.searchable,
      multiple: field.multiple,
      defaultValue: field.defaultValue,
      possibleValues: possibleValuesOf(field),
      trackerIds: field.customFieldTrackers.map((row) => row.trackerId),
      projectIds: field.projectCustomFields.map((row) => row.projectId),
      value: parseStoredCustomFieldValue(field, valueMap.get(field.id) ?? null),
    })),
  };
}

router.get(
  '/',
  authenticate,
  catchAsync(async (req, res) => {
    const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);
    const { where, earlyEmpty } = await buildIssueWhere(req, req.user);
    if (earlyEmpty) {
      return sendPaginated(res, [], { total: 0, page, perPage, totalPages: 1 });
    }
    const sort = String(req.query.sort ?? '');
    const order = String(req.query.order ?? '') === 'asc' ? 'asc' : 'desc';

    if (sort === 'parent') {
      const [total, treeRows] = await Promise.all([
        prisma.issue.count({ where }),
        prisma.issue.findMany({
          where,
          orderBy: [{ number: 'asc' }],
          select: { id: true, parentId: true, number: true },
        }),
      ]);
      const { orderedIds, depthById } = sortIssuesByHierarchy(treeRows);
      const pageIds = orderedIds.slice(skip, skip + perPage);
      const rows = pageIds.length
        ? await prisma.issue.findMany({
            where: { id: { in: pageIds } },
            include: {
              project: { select: { id: true, name: true, identifier: true } },
              tracker: true,
              status: true,
              author: { select: { id: true, login: true, firstname: true, lastname: true } },
              assignee: { select: { id: true, login: true, firstname: true, lastname: true } },
              assigneeGroup: { select: { id: true, name: true } },
              parent: { select: { id: true, number: true, subject: true } },
            },
          })
        : [];
      const rowMap = new Map(rows.map((row) => [row.id, row]));

      return sendPaginated(res, pageIds.flatMap((id) => {
        const row = rowMap.get(id);
        return row ? [{ ...row, treeDepth: depthById.get(id) ?? 0 }] : [];
      }), {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage) || 1,
      });
    }

    const [total, rows] = await Promise.all([
      prisma.issue.count({ where }),
      prisma.issue.findMany({
        where,
        orderBy: issueOrderBy(sort, order),
        skip,
        take: perPage,
        include: {
          project: { select: { id: true, name: true, identifier: true } },
          tracker: true,
          status: true,
          author: { select: { id: true, login: true, firstname: true, lastname: true } },
          assignee: { select: { id: true, login: true, firstname: true, lastname: true } },
          assigneeGroup: { select: { id: true, name: true } },
          parent: { select: { id: true, number: true, subject: true } },
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

router.get(
  '/atom',
  authenticateOrQueryApiKey,
  catchAsync(async (req, res) => {
    const { where, earlyEmpty } = await buildIssueWhere(req, req.user);
    const limitRaw = Number(req.query.limit ?? 100);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.trunc(limitRaw))) : 100;

    const rows = earlyEmpty
      ? []
      : await prisma.issue.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }],
          take: limit,
          include: {
            project: { select: { id: true, name: true, identifier: true } },
            tracker: true,
            status: true,
          },
        });

    const host = `${req.protocol}://${req.get('host')}`;
    const issuesUrl = `${host}/issues`;
    const feedUrl = `${host}${req.originalUrl}`;
    const updatedAt = rows[0]?.updatedAt ?? new Date();
    const feedId = `${host}/issues`;

    const entries = rows
      .map((row) => {
        const issuePath = row.project?.identifier
          ? `/projects/${row.project.identifier}/issues/${row.id}`
          : `/issues/${row.id}`;
        const entryUrl = `${host}${issuePath}`;
        const title = `#${row.number} ${row.subject}`;
        const content = [
          row.project ? `プロジェクト: ${row.project.name}` : '',
          row.tracker ? `作業分類: ${row.tracker.name}` : '',
          row.status ? `ステータス: ${row.status.name}` : '',
          row.description ?? '',
        ]
          .filter(Boolean)
          .join('\n');
        return [
          '  <entry>',
          `    <id>${escapeXml(entryUrl)}</id>`,
          `    <title>${escapeXml(title)}</title>`,
          `    <link rel="alternate" href="${escapeXml(entryUrl)}" />`,
          `    <updated>${row.updatedAt.toISOString()}</updated>`,
          '    <content type="html">',
          `${escapeXml(content)}`,
          '    </content>',
          '  </entry>',
        ].join('\n');
      })
      .join('\n');

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<feed xmlns="http://www.w3.org/2005/Atom">',
      `  <id>${escapeXml(feedId)}</id>`,
      '  <title>TaskNova: 最近のチケット</title>',
      `  <updated>${updatedAt.toISOString()}</updated>`,
      `  <link rel="self" href="${escapeXml(feedUrl)}" />`,
      `  <link rel="alternate" href="${escapeXml(issuesUrl)}" />`,
      `  <icon>${escapeXml(`${host}/favicon.ico`)}</icon>`,
      '  <author>',
      '    <name>TaskNova</name>',
      '  </author>',
      '  <generator uri="https://www.redmine.org/">TaskNova</generator>',
      entries,
      '</feed>',
      '',
    ].join('\n');

    const accept = String(req.headers.accept ?? '').toLowerCase();
    const prefersHtml = accept.includes('text/html');
    if (prefersHtml) {
      const html = [
        '<!doctype html>',
        '<html lang="ja">',
        '<head>',
        '  <meta charset="utf-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
        '  <title>Issues Atom</title>',
        '  <style>',
        '    :root { color-scheme: dark; }',
        '    body { margin: 0; background: #000; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }',
        '    pre { margin: 0; padding: 12px 14px; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.45; }',
        '  </style>',
        '</head>',
        '<body>',
        `  <pre>${escapeXml(xml)}</pre>`,
        '</body>',
        '</html>',
      ].join('\n');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }

    res.setHeader('Content-Type', 'application/atom+xml; charset=utf-8');
    return res.status(200).send(xml);
  }),
);

router.get(
  '/custom_fields',
  authenticate,
  catchAsync(async (req, res) => {
    const projectRef = req.params.projectId as string | undefined;
    const trackerId = typeof req.query.trackerId === 'string' ? req.query.trackerId : undefined;
    if (!projectRef || !trackerId) throw AppError.badRequest('projectId and trackerId are required');

    const projectId = await resolveProjectId(projectRef);
    if (!projectId) throw AppError.notFound();
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw AppError.notFound();
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
    if (!can) throw AppError.forbidden();

    const fields = await getApplicableIssueCustomFields(projectId, trackerId);
    return sendSuccess(res, fields.map((field) => ({
      id: field.id,
      name: field.name,
      fieldFormat: field.fieldFormat,
      isRequired: field.isRequired,
      isFilter: field.isFilter,
      searchable: field.searchable,
      multiple: field.multiple,
      defaultValue: field.defaultValue,
      possibleValues: possibleValuesOf(field),
      trackerIds: field.customFieldTrackers.map((row) => row.trackerId),
      projectIds: field.projectCustomFields.map((row) => row.projectId),
      value: parseStoredCustomFieldValue(field, null),
    })));
  }),
);

router.get(
  '/:id/atom',
  authenticateOrQueryApiKey,
  catchAsync(async (req, res) => {
    const issue = await resolveIssueByParam(req.params.id);
    if (!issue) throw AppError.notFound('チケットが見つかりません');

    const project = await prisma.project.findUnique({ where: { id: issue.projectId } });
    if (!project) throw AppError.notFound();
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
    if (!can) throw AppError.forbidden();

    const detail = await prisma.issue.findUnique({
      where: { id: issue.id },
      include: {
        project: { select: { id: true, name: true, identifier: true } },
        tracker: true,
        status: true,
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
        assignee: { select: { id: true, login: true, firstname: true, lastname: true } },
        assigneeGroup: { select: { id: true, name: true } },
      },
    });
    if (!detail) throw AppError.notFound('チケットが見つかりません');

    const host = `${req.protocol}://${req.get('host')}`;
    const issuePath = detail.project?.identifier
      ? `/projects/${detail.project.identifier}/issues/${detail.id}`
      : `/issues/${detail.id}`;
    const entryUrl = `${host}${issuePath}`;
    const feedUrl = `${host}${req.originalUrl}`;
    const title = `#${detail.number} ${detail.subject}`;
    const feedId = entryUrl;
    const authorName = detail.author
      ? `${detail.author.lastname} ${detail.author.firstname}`.trim() || detail.author.login
      : '-';
    const assigneeName = detail.assignee
      ? `${detail.assignee.lastname} ${detail.assignee.firstname}`.trim() || detail.assignee.login
      : '-';
    const content = [
      detail.project ? `プロジェクト: ${detail.project.name}` : '',
      detail.tracker ? `作業分類: ${detail.tracker.name}` : '',
      detail.status ? `ステータス: ${detail.status.name}` : '',
      `優先度: ${detail.priority}`,
      `作成者: ${authorName}`,
      `担当者: ${assigneeName}`,
      '',
      detail.description ?? '',
    ]
      .filter(Boolean)
      .join('\n');

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<feed xmlns="http://www.w3.org/2005/Atom">',
      `  <id>${escapeXml(feedId)}</id>`,
      `  <title>${escapeXml(title)}</title>`,
      `  <updated>${detail.updatedAt.toISOString()}</updated>`,
      `  <link rel="self" href="${escapeXml(feedUrl)}" />`,
      `  <link rel="alternate" href="${escapeXml(entryUrl)}" />`,
      `  <icon>${escapeXml(`${host}/favicon.ico`)}</icon>`,
      '  <author>',
      '    <name>TaskNova</name>',
      '  </author>',
      '  <generator uri="https://www.redmine.org/">TaskNova</generator>',
      '  <entry>',
      `    <id>${escapeXml(entryUrl)}</id>`,
      `    <title>${escapeXml(title)}</title>`,
      `    <link rel="alternate" href="${escapeXml(entryUrl)}" />`,
      `    <updated>${detail.updatedAt.toISOString()}</updated>`,
      '    <content type="html">',
      `${escapeXml(content)}`,
      '    </content>',
      '  </entry>',
      '</feed>',
      '',
    ].join('\n');

    const accept = String(req.headers.accept ?? '').toLowerCase();
    const prefersHtml = accept.includes('text/html');
    if (prefersHtml) {
      const html = [
        '<!doctype html>',
        '<html lang="ja">',
        '<head>',
        '  <meta charset="utf-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
        '  <title>Issue Atom</title>',
        '  <style>',
        '    :root { color-scheme: dark; }',
        '    body { margin: 0; background: #000; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }',
        '    pre { margin: 0; padding: 12px 14px; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.45; }',
        '  </style>',
        '</head>',
        '<body>',
        `  <pre>${escapeXml(xml)}</pre>`,
        '</body>',
        '</html>',
      ].join('\n');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }

    res.setHeader('Content-Type', 'application/atom+xml; charset=utf-8');
    return res.status(200).send(xml);
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

      const nextStartDate = changes.startDate !== undefined ? changes.startDate : oldIssue.startDate;
      const nextDueDate = changes.dueDate !== undefined ? changes.dueDate : oldIssue.dueDate;
      ensureIssueDateOrder(nextStartDate, nextDueDate);

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

      const effectiveProjectId = changes.projectId ?? oldIssue.projectId;
      if (changes.parentId !== undefined || changes.projectId !== undefined) {
        const effectiveParentId = changes.parentId !== undefined ? changes.parentId : oldIssue.parentId;
        await assertValidIssueParent(id, effectiveProjectId, effectiveParentId);
      }
      if (changes.assigneeId !== undefined || changes.assigneeGroupId !== undefined || changes.projectId !== undefined) {
        let nextAssigneeId = oldIssue.assigneeId;
        let nextAssigneeGroupId = oldIssue.assigneeGroupId;
        if (changes.assigneeId !== undefined) {
          nextAssigneeId = changes.assigneeId;
          if (changes.assigneeGroupId === undefined) nextAssigneeGroupId = null;
        }
        if (changes.assigneeGroupId !== undefined) {
          nextAssigneeGroupId = changes.assigneeGroupId;
          if (changes.assigneeId === undefined) nextAssigneeId = null;
        }
        await assertAssignableToProject(nextAssigneeId, nextAssigneeGroupId, effectiveProjectId);
      }

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
        if (changes.assigneeGroupId === undefined) data.assigneeGroup = { disconnect: true };
      }
      if (changes.assigneeGroupId !== undefined) {
        data.assigneeGroup = changes.assigneeGroupId ? { connect: { id: changes.assigneeGroupId } } : { disconnect: true };
        if (changes.assigneeId === undefined) data.assignee = { disconnect: true };
      }
      if (changes.assigneeId !== undefined && changes.assigneeId) data.assigneeGroup = { disconnect: true };
      if (changes.assigneeGroupId !== undefined && changes.assigneeGroupId) data.assignee = { disconnect: true };
      if (changes.categoryId !== undefined) {
        data.category = changes.categoryId ? { connect: { id: changes.categoryId } } : { disconnect: true };
      }
      if (changes.parentId !== undefined) {
        data.parent = changes.parentId ? { connect: { id: changes.parentId } } : { disconnect: true };
      }
      if (changes.startDate !== undefined) data.startDate = changes.startDate;
      if (changes.dueDate !== undefined) data.dueDate = changes.dueDate;
      if (changes.estimatedHours !== undefined) data.estimatedHours = changes.estimatedHours;
      if (changes.doneRatio !== undefined) data.doneRatio = changes.doneRatio;
      if (changes.repository !== undefined) data.repository = changes.repository;
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
          assigneeGroupId: oldIssue.assigneeGroupId,
          categoryId: oldIssue.categoryId,
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
          assigneeGroupId: next.assigneeGroupId,
          categoryId: next.categoryId,
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
          await createIssueJournalActivity(tx, next, req.user!.userId, details, undefined);
        }

        return next;
      });

      dispatchIssueNotification(after.id, req.user!.userId, 'updated');
      updated.push(after);
    }

    return sendSuccess(res, { updated: updated.length, issues: updated });
  }),
);

router.post(
  '/bulk_delete',
  authenticate,
  catchAsync(async (req, res) => {
    const parsed = bulkDeleteSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }

    const deletedIds: string[] = [];
    for (const id of parsed.data.ids) {
      const issue = await prisma.issue.findUnique({ where: { id } });
      if (!issue) continue;

      const project = await prisma.project.findUnique({ where: { id: issue.projectId } });
      if (!project) continue;
      const can = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
      if (!can) throw AppError.forbidden();
      const canDelete = await userCanDeleteIssue(req.user?.userId, req.user?.admin, project, issue.authorId);
      if (!canDelete) throw AppError.forbidden('チケットを削除する権限がありません');

      await prisma.issue.delete({ where: { id } });
      deletedIds.push(id);
    }

    return sendSuccess(res, { deleted: deletedIds.length, ids: deletedIds });
  }),
);

router.get(
  '/:id/relations',
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
        throw AppError.conflict('既に存在します');
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

    await assertAssignableToProject(src.assigneeId, src.assigneeGroupId, targetProjectId);

    const subject = parsed.data.subject ?? `Copy: ${src.subject}`;

    const st = await prisma.issueStatus.findUnique({ where: { id: src.statusId } });

    const sourceCustomValues = await prisma.customValue.findMany({
      where: { customizedType: 'Issue', customizedId: src.id },
    });
    const customFieldInput = await validateIssueCustomFields(
      targetProjectId,
      src.trackerId,
      Object.fromEntries(sourceCustomValues.map((value) => [value.customFieldId, value.value])),
      { actorId: req.user!.userId },
    );

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
          assigneeGroupId: src.assigneeGroupId,
          categoryId: src.categoryId,
          parentId: null,
          startDate: src.startDate,
          dueDate: src.dueDate,
          estimatedHours: src.estimatedHours,
          doneRatio: 0,
          closedOn: st?.isClosed ? new Date() : null,
        },
      });

      await replaceIssueCustomValues(
        tx,
        issue.id,
        customFieldInput.normalized,
        customFieldInput.fields,
      );
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
          assigneeGroup: { select: { id: true, name: true } },
        },
      });
    });

    dispatchIssueNotification(created.id, req.user!.userId, 'created');
    return sendSuccess(res, await attachIssueCustomFields(created), 201);
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
        throw AppError.conflict('既に存在します');
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
        throw AppError.conflict('既に存在します');
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
  authenticate,
  catchAsync(async (req, res) => {
    const issue = await prisma.issue.findUnique({
      where: { id: req.params.id },
      include: {
        project: true,
        tracker: true,
        status: true,
        author: { select: { id: true, login: true, firstname: true, lastname: true, mail: true } },
        assignee: { select: { id: true, login: true, firstname: true, lastname: true, mail: true } },
        assigneeGroup: { select: { id: true, name: true } },
        category: true,
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
    const assigneeGroupHistoryIds = new Set<string>();
    const customFieldHistoryIds = new Set<string>();
    for (const journal of issue.journals ?? []) {
      for (const detail of journal.details ?? []) {
        if (detail.propKey === 'assigneeId') {
          if (isUuidLike(detail.oldValue)) assigneeHistoryIds.add(detail.oldValue);
          if (isUuidLike(detail.newValue)) assigneeHistoryIds.add(detail.newValue);
        }
        if (detail.propKey === 'assigneeGroupId') {
          if (isUuidLike(detail.oldValue)) assigneeGroupHistoryIds.add(detail.oldValue);
          if (isUuidLike(detail.newValue)) assigneeGroupHistoryIds.add(detail.newValue);
        }
        if (detail.property === 'cf' && isUuidLike(detail.propKey)) {
          customFieldHistoryIds.add(detail.propKey);
        }
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
    if (assigneeGroupHistoryIds.size > 0) {
      const groups = await prisma.group.findMany({
        where: { id: { in: Array.from(assigneeGroupHistoryIds) } },
        select: { id: true, name: true },
      });
      for (const group of groups) {
        assigneeLabelMap.set(group.id, group.name);
      }
    }
    const customFieldLabelMap = new Map<string, string>();
    if (customFieldHistoryIds.size > 0) {
      const customFields = await prisma.customField.findMany({
        where: { id: { in: Array.from(customFieldHistoryIds) } },
        select: { id: true, name: true },
      });
      for (const field of customFields) {
        customFieldLabelMap.set(field.id, field.name);
      }
    }

    const enrichedIssue = {
      ...issue,
      journals: (issue.journals ?? []).map((journal) => ({
        ...journal,
        details: (journal.details ?? []).map((detail) => {
          if (detail.property === 'cf') {
            return {
              ...detail,
              customFieldName: customFieldLabelMap.get(detail.propKey) ?? null,
            };
          }
          if (detail.propKey !== 'assigneeId' && detail.propKey !== 'assigneeGroupId') return detail;
          return {
            ...detail,
            oldValue: isUuidLike(detail.oldValue) ? (assigneeLabelMap.get(detail.oldValue) ?? detail.oldValue) : detail.oldValue,
            newValue: isUuidLike(detail.newValue) ? (assigneeLabelMap.get(detail.newValue) ?? detail.newValue) : detail.newValue,
          };
        }),
      })),
    };

    return sendSuccess(res, await attachIssueCustomFields(enrichedIssue));
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

    const nextStartDate = body.startDate !== undefined ? body.startDate : oldIssue.startDate;
    const nextDueDate = body.dueDate !== undefined ? body.dueDate : oldIssue.dueDate;
    ensureIssueDateOrder(nextStartDate, nextDueDate);

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
    const effectiveProjectId = body.projectId ?? oldIssue.projectId;
    const effectiveTrackerId = body.trackerId ?? oldIssue.trackerId;
    if (body.parentId !== undefined || body.projectId !== undefined) {
      const effectiveParentId = body.parentId !== undefined ? body.parentId : oldIssue.parentId;
      await assertValidIssueParent(oldIssue.id, effectiveProjectId, effectiveParentId);
    }
    if (body.assigneeId !== undefined || body.assigneeGroupId !== undefined || body.projectId !== undefined) {
      let nextAssigneeId = oldIssue.assigneeId;
      let nextAssigneeGroupId = oldIssue.assigneeGroupId;
      if (body.assigneeId !== undefined) {
        nextAssigneeId = body.assigneeId;
        if (body.assigneeGroupId === undefined) nextAssigneeGroupId = null;
      }
      if (body.assigneeGroupId !== undefined) {
        nextAssigneeGroupId = body.assigneeGroupId;
        if (body.assigneeId === undefined) nextAssigneeId = null;
      }
      await assertAssignableToProject(nextAssigneeId, nextAssigneeGroupId, effectiveProjectId);
    }

    let customFieldInput: Awaited<ReturnType<typeof validateIssueCustomFields>> | null = null;
    if (!onlyNotesUpdate) {
      let customFieldValues = body.customFields;
      if (customFieldValues === undefined) {
        const currentValues = await prisma.customValue.findMany({
          where: { customizedType: 'Issue', customizedId: oldIssue.id },
        });
        customFieldValues = Object.fromEntries(currentValues.map((value) => [value.customFieldId, value.value]));
      }
      customFieldInput = await validateIssueCustomFields(
        effectiveProjectId,
        effectiveTrackerId,
        customFieldValues,
        { actorId: req.user!.userId, issueId: oldIssue.id },
      );
    }
    const oldCustomValues = customFieldInput
      ? await prisma.customValue.findMany({
          where: {
            customizedType: 'Issue',
            customizedId: oldIssue.id,
            customFieldId: { in: customFieldInput.fields.map((field) => field.id) },
          },
        })
      : [];
    const oldCustomValueMap = new Map(oldCustomValues.map((value) => [value.customFieldId, value.value]));

    const data: Prisma.IssueUpdateInput = {};
    if (body.projectId !== undefined) data.project = { connect: { id: body.projectId } };
    if (body.trackerId !== undefined) data.tracker = { connect: { id: body.trackerId } };
    if (body.statusId !== undefined) data.status = { connect: { id: body.statusId } };
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.subject !== undefined) data.subject = body.subject;
    if (body.description !== undefined) data.description = body.description;
    if (body.assigneeId !== undefined) {
      data.assignee = body.assigneeId ? { connect: { id: body.assigneeId } } : { disconnect: true };
      if (body.assigneeGroupId === undefined) data.assigneeGroup = { disconnect: true };
    }
    if (body.assigneeGroupId !== undefined) {
      data.assigneeGroup = body.assigneeGroupId ? { connect: { id: body.assigneeGroupId } } : { disconnect: true };
      if (body.assigneeId === undefined) data.assignee = { disconnect: true };
    }
    if (body.assigneeId !== undefined && body.assigneeId) data.assigneeGroup = { disconnect: true };
    if (body.assigneeGroupId !== undefined && body.assigneeGroupId) data.assignee = { disconnect: true };
    if (body.categoryId !== undefined) {
      data.category = body.categoryId ? { connect: { id: body.categoryId } } : { disconnect: true };
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

      if (customFieldInput) {
        await replaceIssueCustomValues(
          tx,
          next.id,
          customFieldInput.normalized,
          customFieldInput.fields,
        );
      }

      const beforePlain: Record<string, unknown> = {
        projectId: oldIssue.projectId,
        trackerId: oldIssue.trackerId,
        statusId: oldIssue.statusId,
        priority: oldIssue.priority,
        subject: oldIssue.subject,
        description: oldIssue.description,
        assigneeId: oldIssue.assigneeId,
        assigneeGroupId: oldIssue.assigneeGroupId,
        categoryId: oldIssue.categoryId,
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
        assigneeGroupId: next.assigneeGroupId,
        categoryId: next.categoryId,
        parentId: next.parentId,
        startDate: next.startDate,
        dueDate: next.dueDate,
        estimatedHours: next.estimatedHours,
        doneRatio: next.doneRatio,
        repository: next.repository,
      };

      const details = [
        ...buildJournalDetailsFromDiff(beforePlain, afterPlain, ISSUE_JOURNAL_KEYS),
        ...(customFieldInput
          ? buildCustomFieldJournalDetailsFromDiff(
              customFieldInput.fields,
              oldCustomValueMap,
              customFieldInput.normalized,
            )
          : []),
      ];
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
        await createIssueJournalActivity(tx, next, req.user!.userId, details, notes);
      }

      const issueResult = await tx.issue.findUniqueOrThrow({
        where: { id: next.id },
        include: {
          project: true,
          tracker: true,
          status: true,
          author: { select: { id: true, login: true, firstname: true, lastname: true } },
          assignee: { select: { id: true, login: true, firstname: true, lastname: true } },
          assigneeGroup: { select: { id: true, name: true } },
        },
      });

      return { ...issueResult, journalId: newJournalId };
    });

    if (updated.journalId) {
      dispatchIssueNotification(updated.id, req.user!.userId, onlyNotesUpdate ? 'commented' : 'updated');
    }
    return sendSuccess(res, await attachIssueCustomFields(updated));
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
    const canDelete = await userCanDeleteIssue(req.user?.userId, req.user?.admin, proj, issue.authorId);
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
    ensureIssueDateOrder(body.startDate, body.dueDate);

    const projectId = await resolveProjectId(body.projectId);
    if (!projectId) throw AppError.badRequest('プロジェクトが存在しません');

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw AppError.badRequest('プロジェクトが存在しません');
    const can = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
    if (!can) throw AppError.forbidden();
    const canCreate = await userCanCreateIssue(req.user?.userId, req.user?.admin, project);
    if (!canCreate) throw AppError.forbidden('チケットを作成する権限がありません');

    await assertAssignableToProject(body.assigneeId, body.assigneeGroupId, projectId);
    if (body.parentId) {
      const parent = await prisma.issue.findUnique({
        where: { id: body.parentId },
        select: { projectId: true },
      });
      if (!parent || parent.projectId !== projectId) {
        throw AppError.badRequest('親チケットが見つからないか、同じプロジェクトに属していません');
      }
    }

    const st = await prisma.issueStatus.findUnique({ where: { id: body.statusId } });
    if (!st) throw AppError.badRequest('ステータスが存在しません');

    const customFieldInput = await validateIssueCustomFields(
      projectId,
      body.trackerId,
      body.customFields,
      { actorId: req.user!.userId },
    );

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
          assigneeGroupId: body.assigneeGroupId ?? null,
          categoryId: body.categoryId ?? null,
          parentId: body.parentId ?? null,
          startDate: body.startDate ?? null,
          dueDate: body.dueDate ?? null,
          estimatedHours: body.estimatedHours ?? null,
          doneRatio: body.doneRatio ?? 0,
          repository: body.repository ?? null,
          closedOn: st.isClosed ? new Date() : null,
        },
      });

      await replaceIssueCustomValues(
        tx,
        issue.id,
        customFieldInput.normalized,
        customFieldInput.fields,
      );
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
          assigneeGroup: { select: { id: true, name: true } },
        },
      });
    });

    dispatchIssueNotification(created.id, req.user!.userId, 'created');
    return sendSuccess(res, await attachIssueCustomFields(created), 201);
  }),
);

export default router;
