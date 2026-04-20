import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess, sendPaginated, parsePagination } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

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

  const from = req.query.from;
  const to = req.query.to;
  if (typeof from === 'string' && from.length > 0) {
    where.spentOn = { ...(where.spentOn as object), gte: new Date(from) };
  }
  if (typeof to === 'string' && to.length > 0) {
    const end = new Date(to);
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

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);
      const where = buildListWhere(req);

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

      const where: Prisma.TimeEntryWhereInput = { id: { in: body.ids } };
      if (!req.user!.admin) {
        where.userId = req.user!.userId;
      }

      const result = await prisma.timeEntry.updateMany({
        where,
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
      if (targetUserId !== req.user!.userId && !req.user!.admin) {
        throw AppError.forbidden('他ユーザーの工数は記録できません');
      }

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) throw AppError.notFound('プロジェクトが見つかりません');

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
      if (!req.user!.admin && existing.userId !== req.user!.userId) {
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
      if (!req.user!.admin && existing.userId !== req.user!.userId) {
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
