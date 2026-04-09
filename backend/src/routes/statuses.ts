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
  isClosed: z.boolean().optional().default(false),
});

const updateBodySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isClosed: z.boolean().optional(),
});

router.use(authenticate, requireAdmin);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const statuses = await prisma.issueStatus.findMany({
      orderBy: { position: 'asc' },
    });
    sendSuccess(res, statuses);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const status = await prisma.issueStatus.findUnique({ where: { id } });
    if (!status) {
      return next(AppError.notFound('ステータスが見つかりません'));
    }
    sendSuccess(res, status);
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

    const maxPos = await prisma.issueStatus.aggregate({ _max: { position: true } });
    const position = (maxPos._max.position ?? -1) + 1;

    const status = await prisma.issueStatus.create({
      data: {
        name: parsed.data.name,
        isClosed: parsed.data.isClosed,
        position,
      },
    });
    sendSuccess(res, status, 201);
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

    const existing = await prisma.issueStatus.findUnique({ where: { id } });
    if (!existing) {
      return next(AppError.notFound('ステータスが見つかりません'));
    }

    const status = await prisma.issueStatus.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.isClosed !== undefined ? { isClosed: parsed.data.isClosed } : {}),
      },
    });
    sendSuccess(res, status);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const existing = await prisma.issueStatus.findUnique({ where: { id } });
    if (!existing) {
      return next(AppError.notFound('ステータスが見つかりません'));
    }

    const issueCount = await prisma.issue.count({ where: { statusId: id } });
    if (issueCount > 0) {
      return next(
        AppError.conflict('このステータスを使用しているチケットがあるため削除できません', 'STATUS_IN_USE'),
      );
    }

    const trackerDefaultCount = await prisma.tracker.count({ where: { defaultStatusId: id } });
    if (trackerDefaultCount > 0) {
      return next(
        AppError.conflict(
          'このステータスがトラッカーのデフォルトに設定されているため削除できません',
          'STATUS_DEFAULT_FOR_TRACKER',
        ),
      );
    }

    await prisma.issueStatus.delete({ where: { id } });
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
