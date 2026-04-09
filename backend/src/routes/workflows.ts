import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate, requireAdmin } from '../middleware/auth';
import { z } from 'zod';

const router = Router({ mergeParams: true });

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join('; ');
}

const transitionItemSchema = z.object({
  oldStatusId: z.string().uuid(),
  newStatusId: z.string().uuid(),
  assignee: z.boolean().optional(),
  author: z.boolean().optional(),
});

const bulkBodySchema = z.object({
  trackerId: z.string().uuid(),
  roleId: z.string().uuid(),
  transitions: z.array(transitionItemSchema),
});

const deleteBodySchema = z.object({
  trackerId: z.string().uuid(),
  roleId: z.string().uuid(),
});

const copyBodySchema = z.object({
  sourceTrackerId: z.string().uuid(),
  sourceRoleId: z.string().uuid(),
  targetTrackerIds: z.array(z.string().uuid()).min(1),
  targetRoleIds: z.array(z.string().uuid()).min(1),
});

router.use(authenticate, requireAdmin);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const trackerId = typeof req.query.trackerId === 'string' ? req.query.trackerId : undefined;
    const roleId = typeof req.query.roleId === 'string' ? req.query.roleId : undefined;

    if (trackerId !== undefined && !z.string().uuid().safeParse(trackerId).success) {
      return next(AppError.badRequest('trackerId は有効な UUID である必要があります'));
    }
    if (roleId !== undefined && !z.string().uuid().safeParse(roleId).success) {
      return next(AppError.badRequest('roleId は有効な UUID である必要があります'));
    }

    const where: { trackerId?: string; roleId?: string } = {};
    if (trackerId) where.trackerId = trackerId;
    if (roleId) where.roleId = roleId;

    const transitions = await prisma.workflowTransition.findMany({
      where,
      orderBy: [{ trackerId: 'asc' }, { roleId: 'asc' }, { oldStatusId: 'asc' }, { newStatusId: 'asc' }],
      include: {
        tracker: { select: { id: true, name: true } },
        role: { select: { id: true, name: true } },
        oldStatus: true,
        newStatus: true,
      },
    });
    sendSuccess(res, transitions);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = bulkBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.badRequest(zodMessage(parsed.error)));
    }

    const { trackerId, roleId, transitions } = parsed.data;

    const [tracker, role] = await Promise.all([
      prisma.tracker.findUnique({ where: { id: trackerId } }),
      prisma.role.findUnique({ where: { id: roleId } }),
    ]);
    if (!tracker) return next(AppError.badRequest('トラッカーが存在しません'));
    if (!role) return next(AppError.badRequest('ロールが存在しません'));

    const statusIds = new Set<string>();
    for (const t of transitions) {
      statusIds.add(t.oldStatusId);
      statusIds.add(t.newStatusId);
    }
    if (statusIds.size > 0) {
      const count = await prisma.issueStatus.count({
        where: { id: { in: [...statusIds] } },
      });
      if (count !== statusIds.size) {
        return next(AppError.badRequest('存在しないステータス ID が含まれています'));
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.workflowTransition.deleteMany({ where: { trackerId, roleId } });

      if (transitions.length === 0) {
        return [] as Awaited<ReturnType<typeof prisma.workflowTransition.findMany>>;
      }

      await tx.workflowTransition.createMany({
        data: transitions.map((t) => ({
          trackerId,
          roleId,
          oldStatusId: t.oldStatusId,
          newStatusId: t.newStatusId,
          assignee: t.assignee ?? false,
          author: t.author ?? false,
        })),
      });

      return tx.workflowTransition.findMany({
        where: { trackerId, roleId },
        include: {
          tracker: { select: { id: true, name: true } },
          role: { select: { id: true, name: true } },
          oldStatus: true,
          newStatus: true,
        },
        orderBy: [{ oldStatusId: 'asc' }, { newStatusId: 'asc' }],
      });
    });

    sendSuccess(res, created, transitions.length === 0 ? 200 : 201);
  } catch (err) {
    next(err);
  }
});

router.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = deleteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.badRequest(zodMessage(parsed.error)));
    }

    const { trackerId, roleId } = parsed.data;
    const result = await prisma.workflowTransition.deleteMany({
      where: { trackerId, roleId },
    });
    sendSuccess(res, { deleted: result.count });
  } catch (err) {
    next(err);
  }
});

router.post('/copy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = copyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.badRequest(zodMessage(parsed.error)));
    }

    const { sourceTrackerId, sourceRoleId, targetTrackerIds, targetRoleIds } = parsed.data;

    const sourceTransitions = await prisma.workflowTransition.findMany({
      where: { trackerId: sourceTrackerId, roleId: sourceRoleId },
    });

    if (sourceTransitions.length === 0) {
      return next(AppError.badRequest('コピー元のワークフローに遷移が定義されていません'));
    }

    const allTrackerIds = [...new Set([...targetTrackerIds, sourceTrackerId])];
    const allRoleIds = [...new Set([...targetRoleIds, sourceRoleId])];
    const [trackerCount, roleCount] = await Promise.all([
      prisma.tracker.count({ where: { id: { in: allTrackerIds } } }),
      prisma.role.count({ where: { id: { in: allRoleIds } } }),
    ]);
    if (trackerCount !== allTrackerIds.length) {
      return next(AppError.badRequest('存在しないトラッカー ID が含まれています'));
    }
    if (roleCount !== allRoleIds.length) {
      return next(AppError.badRequest('存在しないロール ID が含まれています'));
    }

    let totalInserted = 0;
    await prisma.$transaction(async (tx) => {
      for (const tid of targetTrackerIds) {
        for (const rid of targetRoleIds) {
          if (tid === sourceTrackerId && rid === sourceRoleId) {
            continue;
          }
          await tx.workflowTransition.deleteMany({ where: { trackerId: tid, roleId: rid } });
          if (sourceTransitions.length > 0) {
            await tx.workflowTransition.createMany({
              data: sourceTransitions.map((st) => ({
                trackerId: tid,
                roleId: rid,
                oldStatusId: st.oldStatusId,
                newStatusId: st.newStatusId,
                assignee: st.assignee,
                author: st.author,
              })),
            });
            totalInserted += sourceTransitions.length;
          }
        }
      }
    });

    sendSuccess(res, { copied: true, transitionsPerTarget: sourceTransitions.length, targetsUpdated: totalInserted });
  } catch (err) {
    next(err);
  }
});

export default router;
