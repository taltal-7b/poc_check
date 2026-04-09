import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate, requireAdmin } from '../middleware/auth';
import { z } from 'zod';

const router = Router({ mergeParams: true });

function pickParam(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v[0] !== undefined) return v[0];
  return undefined;
}

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join('; ');
}

const createBodySchema = z.object({
  name: z.string().min(1).max(255),
  defaultStatusId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
});

const updateBodySchema = createBodySchema.partial();

router.use(authenticate, requireAdmin);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const trackers = await prisma.tracker.findMany({
      orderBy: { position: 'asc' },
      include: { defaultStatus: true },
    });
    sendSuccess(res, trackers);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const tracker = await prisma.tracker.findUnique({
      where: { id },
      include: { defaultStatus: true },
    });
    if (!tracker) {
      return next(AppError.notFound('トラッカーが見つかりません'));
    }
    sendSuccess(res, tracker);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.badRequest(zodMessage(parsed.error)));
    }
    const { name, defaultStatusId, description } = parsed.data;

    if (defaultStatusId) {
      const status = await prisma.issueStatus.findUnique({ where: { id: defaultStatusId } });
      if (!status) {
        return next(AppError.badRequest('指定したデフォルトステータスが存在しません'));
      }
    }

    const maxPos = await prisma.tracker.aggregate({ _max: { position: true } });
    const position = (maxPos._max.position ?? -1) + 1;

    const tracker = await prisma.tracker.create({
      data: {
        name,
        position,
        defaultStatusId: defaultStatusId ?? null,
        description: description ?? null,
      },
      include: { defaultStatus: true },
    });
    sendSuccess(res, tracker, 201);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const parsed = updateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.badRequest(zodMessage(parsed.error)));
    }

    const existing = await prisma.tracker.findUnique({ where: { id } });
    if (!existing) {
      return next(AppError.notFound('トラッカーが見つかりません'));
    }

    if (parsed.data.defaultStatusId !== undefined && parsed.data.defaultStatusId !== null) {
      const status = await prisma.issueStatus.findUnique({
        where: { id: parsed.data.defaultStatusId },
      });
      if (!status) {
        return next(AppError.badRequest('指定したデフォルトステータスが存在しません'));
      }
    }

    const tracker = await prisma.tracker.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.defaultStatusId !== undefined
          ? { defaultStatusId: parsed.data.defaultStatusId }
          : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
      },
      include: { defaultStatus: true },
    });
    sendSuccess(res, tracker);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const existing = await prisma.tracker.findUnique({ where: { id } });
    if (!existing) {
      return next(AppError.notFound('トラッカーが見つかりません'));
    }

    const issueCount = await prisma.issue.count({ where: { trackerId: id } });
    if (issueCount > 0) {
      return next(
        AppError.conflict('このトラッカーを参照しているチケットがあるため削除できません', 'TRACKER_IN_USE'),
      );
    }

    await prisma.tracker.delete({ where: { id } });
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
