import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';

const router = Router({ mergeParams: true });

function param(req: Request, key: string): string | undefined {
  const v = req.params[key];
  if (typeof v === 'string' && v.length > 0) return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['open', 'locked', 'closed']).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  sharing: z.enum(['none', 'descendants', 'hierarchy', 'tree', 'system']).optional(),
  wikiPageTitle: z.string().nullable().optional(),
  projectId: z.string().uuid().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['open', 'locked', 'closed']).optional(),
  dueDate: z.coerce.date().nullable().optional(),
  sharing: z.enum(['none', 'descendants', 'hierarchy', 'tree', 'system']).optional(),
  wikiPageTitle: z.string().nullable().optional(),
});

type IssueWithStatus = {
  statusId: string;
  status: { id: string; name: string; isClosed: boolean };
};

function aggregateByStatus(issues: IssueWithStatus[]) {
  const map = new Map<
    string,
    { statusId: string; statusName: string; isClosed: boolean; count: number }
  >();
  for (const i of issues) {
    const cur = map.get(i.statusId);
    if (cur) cur.count += 1;
    else
      map.set(i.statusId, {
        statusId: i.statusId,
        statusName: i.status.name,
        isClosed: i.status.isClosed,
        count: 1,
      });
  }
  return [...map.values()];
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const where = projectId ? { projectId } : {};

    const versions = await prisma.version.findMany({
      where,
      orderBy: [{ dueDate: 'asc' }, { name: 'asc' }],
      include: {
        project: { select: { id: true, name: true, identifier: true } },
        issues: {
          select: {
            statusId: true,
            status: { select: { id: true, name: true, isClosed: true } },
          },
        },
      },
    });

    const data = versions.map((v) => {
      const { issues, ...rest } = v;
      return {
        ...rest,
        issueCountsByStatus: aggregateByStatus(issues as IssueWithStatus[]),
        totalIssues: issues.length,
      };
    });

    return sendSuccess(res, data);
  } catch (e) {
    next(e);
  }
});

router.post('/close_completed', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));

    const versions = await prisma.version.findMany({
      where: { projectId, status: { not: 'closed' } },
      include: {
        issues: {
          include: { status: true },
        },
      },
    });

    const closedIds: string[] = [];
    for (const v of versions) {
      const allClosed = v.issues.length === 0 || v.issues.every((i) => i.status.isClosed);
      if (allClosed) {
        await prisma.version.update({
          where: { id: v.id },
          data: { status: 'closed' },
        });
        closedIds.push(v.id);
      }
    }

    return sendSuccess(res, { closedVersionIds: closedIds, count: closedIds.length });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const id = param(req, 'id');
    if (!id) return next(AppError.badRequest('id が必要です'));

    const version = await prisma.version.findFirst({
      where: projectId ? { id, projectId } : { id },
      include: {
        project: { select: { id: true, name: true, identifier: true } },
        issues: {
          select: {
            id: true,
            statusId: true,
            status: { select: { id: true, name: true, isClosed: true } },
          },
        },
      },
    });
    if (!version) return next(AppError.notFound('バージョンが見つかりません'));

    const { issues, ...rest } = version;
    const openCount = issues.filter((i: IssueWithStatus) => !i.status.isClosed).length;
    const closedCount = issues.filter((i: IssueWithStatus) => i.status.isClosed).length;

    return sendSuccess(res, {
      ...rest,
      statistics: {
        totalIssues: issues.length,
        openIssues: openCount,
        closedIssues: closedCount,
        byStatus: aggregateByStatus(issues as IssueWithStatus[]),
      },
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const projectId = param(req, 'projectId') ?? parsed.data.projectId;
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return next(AppError.notFound('プロジェクトが見つかりません'));

    const { projectId: _omit, ...fields } = parsed.data;

    const version = await prisma.version.create({
      data: {
        projectId,
        name: fields.name,
        description: fields.description ?? null,
        status: fields.status ?? 'open',
        dueDate: fields.dueDate ?? null,
        sharing: fields.sharing ?? 'none',
        wikiPageTitle: fields.wikiPageTitle ?? null,
      },
      include: {
        project: { select: { id: true, name: true, identifier: true } },
        issues: {
          select: {
            statusId: true,
            status: { select: { id: true, name: true, isClosed: true } },
          },
        },
      },
    });

    const { issues, ...rest } = version;
    return sendSuccess(
      res,
      {
        ...rest,
        issueCountsByStatus: aggregateByStatus(issues as IssueWithStatus[]),
        totalIssues: issues.length,
      },
      201,
    );
  } catch (e) {
    next(e);
  }
});

router.put('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const id = param(req, 'id');
    if (!id) return next(AppError.badRequest('id が必要です'));

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const existing = await prisma.version.findFirst({
      where: projectId ? { id, projectId } : { id },
    });
    if (!existing) return next(AppError.notFound('バージョンが見つかりません'));

    const version = await prisma.version.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.status !== undefined && { status: parsed.data.status }),
        ...(parsed.data.dueDate !== undefined && { dueDate: parsed.data.dueDate }),
        ...(parsed.data.sharing !== undefined && { sharing: parsed.data.sharing }),
        ...(parsed.data.wikiPageTitle !== undefined && { wikiPageTitle: parsed.data.wikiPageTitle }),
      },
      include: {
        project: { select: { id: true, name: true, identifier: true } },
        issues: {
          select: {
            statusId: true,
            status: { select: { id: true, name: true, isClosed: true } },
          },
        },
      },
    });

    const { issues, ...rest } = version;
    return sendSuccess(res, {
      ...rest,
      issueCountsByStatus: aggregateByStatus(issues as IssueWithStatus[]),
      totalIssues: issues.length,
    });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const id = param(req, 'id');
    if (!id) return next(AppError.badRequest('id が必要です'));

    const existing = await prisma.version.findFirst({
      where: projectId ? { id, projectId } : { id },
    });
    if (!existing) return next(AppError.notFound('バージョンが見つかりません'));

    await prisma.version.delete({ where: { id } });
    return sendSuccess(res, { deleted: true, id });
  } catch (e) {
    next(e);
  }
});

export default router;
