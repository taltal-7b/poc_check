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
  summary: z.string().optional(),
  description: z.string().optional(),
  projectId: z.string().uuid().optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

const commentSchema = z.object({
  content: z.string().min(1),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);

    const where = projectId ? { projectId } : {};

    const [total, items] = await Promise.all([
      prisma.news.count({ where }),
      prisma.news.findMany({
        where,
        skip,
        take: perPage,
        orderBy: { createdAt: 'desc' },
        include: {
          project: { select: { id: true, name: true, identifier: true } },
          author: { select: { id: true, login: true, firstname: true, lastname: true } },
          _count: { select: { comments: true } },
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
    if (!id) return next(AppError.badRequest('id が必要です'));

    const news = await prisma.news.findFirst({
      where: projectId ? { id, projectId } : { id },
      include: {
        project: { select: { id: true, name: true, identifier: true } },
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, login: true, firstname: true, lastname: true } },
          },
        },
      },
    });
    if (!news) return next(AppError.notFound('ニュースが見つかりません'));
    return sendSuccess(res, news);
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

    const news = await prisma.news.create({
      data: {
        projectId,
        authorId: req.user!.userId,
        title: parsed.data.title,
        summary: parsed.data.summary ?? null,
        description: parsed.data.description ?? null,
      },
      include: {
        project: { select: { id: true, name: true, identifier: true } },
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
        comments: true,
      },
    });
    return sendSuccess(res, news, 201);
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

    const existing = await prisma.news.findFirst({
      where: projectId ? { id, projectId } : { id },
    });
    if (!existing) return next(AppError.notFound('ニュースが見つかりません'));

    const news = await prisma.news.update({
      where: { id },
      data: {
        ...(parsed.data.title !== undefined && { title: parsed.data.title }),
        ...(parsed.data.summary !== undefined && { summary: parsed.data.summary }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
      },
      include: {
        project: { select: { id: true, name: true, identifier: true } },
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, login: true, firstname: true, lastname: true } },
          },
        },
      },
    });
    return sendSuccess(res, news);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const id = param(req, 'id');
    if (!id) return next(AppError.badRequest('id が必要です'));

    const existing = await prisma.news.findFirst({
      where: projectId ? { id, projectId } : { id },
    });
    if (!existing) return next(AppError.notFound('ニュースが見つかりません'));

    await prisma.news.delete({ where: { id } });
    return sendSuccess(res, { deleted: true, id });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/comments', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const id = param(req, 'id');
    if (!id) return next(AppError.badRequest('id が必要です'));

    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const news = await prisma.news.findFirst({
      where: projectId ? { id, projectId } : { id },
    });
    if (!news) return next(AppError.notFound('ニュースが見つかりません'));

    const comment = await prisma.comment.create({
      data: {
        newsId: id,
        authorId: req.user!.userId,
        content: parsed.data.content,
      },
      include: {
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
      },
    });
    return sendSuccess(res, comment, 201);
  } catch (e) {
    next(e);
  }
});

router.delete('/:id/comments/:commentId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const id = param(req, 'id');
    const commentId = param(req, 'commentId');
    if (!id) return next(AppError.badRequest('id が必要です'));
    if (!commentId) return next(AppError.badRequest('commentId が必要です'));

    const news = await prisma.news.findFirst({
      where: projectId ? { id, projectId } : { id },
    });
    if (!news) return next(AppError.notFound('ニュースが見つかりません'));

    const comment = await prisma.comment.findFirst({
      where: { id: commentId, newsId: id },
    });
    if (!comment) return next(AppError.notFound('コメントが見つかりません'));

    const isAuthor = comment.authorId === req.user!.userId;
    const isAdmin = req.user!.admin;
    if (!isAuthor && !isAdmin) return next(AppError.forbidden('このコメントを削除する権限がありません'));

    await prisma.comment.delete({ where: { id: commentId } });
    return sendSuccess(res, { deleted: true, id: commentId });
  } catch (e) {
    next(e);
  }
});

export default router;
