import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess, sendPaginated, parsePagination } from '../utils/response';
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
  title: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().uuid(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  categoryId: z.string().uuid().optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));

    const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);

    const where = { projectId };

    const [total, items] = await Promise.all([
      prisma.document.count({ where }),
      prisma.document.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { updatedAt: 'desc' },
        include: {
          category: { select: { id: true, name: true, type: true } },
          author: { select: { id: true, login: true, firstname: true, lastname: true } },
        },
      }),
    ]);

    return sendPaginated(res, items, {
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage) || 1,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const id = param(req, 'id');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!id) return next(AppError.badRequest('id が必要です'));

    const doc = await prisma.document.findFirst({
      where: { id, projectId },
      include: {
        category: { select: { id: true, name: true, type: true } },
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
        attachments: true,
      },
    });
    if (!doc) return next(AppError.notFound('文書が見つかりません'));
    return sendSuccess(res, doc);
  } catch (e) {
    next(e);
  }
});

router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const category = await prisma.enumeration.findFirst({
      where: { id: parsed.data.categoryId, type: 'DocumentCategory' },
    });
    if (!category) return next(AppError.badRequest('無効なカテゴリです'));

    const doc = await prisma.document.create({
      data: {
        projectId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        categoryId: parsed.data.categoryId,
        authorId: req.user!.userId,
      },
      include: {
        category: { select: { id: true, name: true, type: true } },
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
        attachments: true,
      },
    });
    return sendSuccess(res, doc, 201);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const id = param(req, 'id');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!id) return next(AppError.badRequest('id が必要です'));

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const existing = await prisma.document.findFirst({ where: { id, projectId } });
    if (!existing) return next(AppError.notFound('文書が見つかりません'));

    if (parsed.data.categoryId) {
      const category = await prisma.enumeration.findFirst({
        where: { id: parsed.data.categoryId, type: 'DocumentCategory' },
      });
      if (!category) return next(AppError.badRequest('無効なカテゴリです'));
    }

    const doc = await prisma.document.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.categoryId !== undefined && { categoryId: parsed.data.categoryId }),
      },
      include: {
        category: { select: { id: true, name: true, type: true } },
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
        attachments: true,
      },
    });
    return sendSuccess(res, doc);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const id = param(req, 'id');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!id) return next(AppError.badRequest('id が必要です'));

    const existing = await prisma.document.findFirst({ where: { id, projectId } });
    if (!existing) return next(AppError.notFound('文書が見つかりません'));

    await prisma.document.delete({ where: { id } });
    return sendSuccess(res, { deleted: true, id });
  } catch (e) {
    next(e);
  }
});

export default router;
