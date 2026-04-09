import type { Prisma } from '@prisma/client';
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

const messageTopicInclude = {
  author: { select: { id: true, login: true, firstname: true, lastname: true } },
  _count: { select: { replies: true } },
} satisfies Prisma.MessageInclude;

type MessageTopicRow = Prisma.MessageGetPayload<{ include: typeof messageTopicInclude }>;

const createBoardSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  position: z.number().int().optional(),
});

const updateBoardSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  position: z.number().int().optional(),
});

const topicSchema = z.object({
  subject: z.string().min(1),
  content: z.string().optional(),
});

const replySchema = z.object({
  content: z.string().optional(),
  subject: z.string().optional(),
});

const updateMessageSchema = z.object({
  subject: z.string().min(1).optional(),
  content: z.string().nullable().optional(),
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));

    const boards = await prisma.board.findMany({
      where: { projectId },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return sendSuccess(res, boards);
  } catch (e) {
    next(e);
  }
});

router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));

    const parsed = createBoardSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const board = await prisma.board.create({
      data: {
        projectId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        position: parsed.data.position ?? 0,
      },
    });
    return sendSuccess(res, board, 201);
  } catch (e) {
    next(e);
  }
});

/** List topics (parentId null), pagination + reply count */
router.get('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const boardId = param(req, 'id');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!boardId) return next(AppError.badRequest('id が必要です'));

    const board = await prisma.board.findFirst({ where: { id: boardId, projectId } });
    if (!board) return next(AppError.notFound('掲示板が見つかりません'));

    const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);

    const where: Prisma.MessageWhereInput = { boardId, parentId: null };

    const [total, rows] = await Promise.all([
      prisma.message.count({ where }),
      prisma.message.findMany({
        where,
        skip,
        take: perPage,
        orderBy: [{ sticky: 'desc' }, { updatedAt: 'desc' }],
        include: messageTopicInclude,
      }),
    ]);
    const topicRows = rows as MessageTopicRow[];

    const items = topicRows.map(({ _count, ...m }) => ({
      ...m,
      replyCount: _count.replies,
    }));

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

router.post('/:id/messages', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const boardId = param(req, 'id');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!boardId) return next(AppError.badRequest('id が必要です'));

    const board = await prisma.board.findFirst({ where: { id: boardId, projectId } });
    if (!board) return next(AppError.notFound('掲示板が見つかりません'));

    const parsed = topicSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const message = await prisma.message.create({
      data: {
        boardId,
        parentId: null,
        authorId: req.user!.userId,
        subject: parsed.data.subject,
        content: parsed.data.content ?? null,
      },
      include: {
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
      },
    });
    return sendSuccess(res, message, 201);
  } catch (e) {
    next(e);
  }
});

router.get('/:boardId/messages/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const boardId = param(req, 'boardId');
    const messageId = param(req, 'id');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!boardId) return next(AppError.badRequest('boardId が必要です'));
    if (!messageId) return next(AppError.badRequest('id が必要です'));

    const board = await prisma.board.findFirst({ where: { id: boardId, projectId } });
    if (!board) return next(AppError.notFound('掲示板が見つかりません'));

    const message = await prisma.message.findFirst({
      where: { id: messageId, boardId },
      include: {
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, login: true, firstname: true, lastname: true } },
          },
        },
      },
    });
    if (!message) return next(AppError.notFound('メッセージが見つかりません'));
    return sendSuccess(res, message);
  } catch (e) {
    next(e);
  }
});

router.post('/:boardId/messages/:id/reply', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const boardId = param(req, 'boardId');
    const parentId = param(req, 'id');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!boardId) return next(AppError.badRequest('boardId が必要です'));
    if (!parentId) return next(AppError.badRequest('id が必要です'));

    const board = await prisma.board.findFirst({ where: { id: boardId, projectId } });
    if (!board) return next(AppError.notFound('掲示板が見つかりません'));

    const parent = await prisma.message.findFirst({
      where: { id: parentId, boardId },
    });
    if (!parent) return next(AppError.notFound('スレッドが見つかりません'));

    const parsed = replySchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const subject = parsed.data.subject?.trim() || `Re: ${parent.subject}`;

    const message = await prisma.message.create({
      data: {
        boardId,
        parentId,
        authorId: req.user!.userId,
        subject,
        content: parsed.data.content ?? null,
      },
      include: {
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
      },
    });
    return sendSuccess(res, message, 201);
  } catch (e) {
    next(e);
  }
});

router.put('/:boardId/messages/:messageId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const boardId = param(req, 'boardId');
    const messageId = param(req, 'messageId');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!boardId) return next(AppError.badRequest('boardId が必要です'));
    if (!messageId) return next(AppError.badRequest('messageId が必要です'));

    const board = await prisma.board.findFirst({ where: { id: boardId, projectId } });
    if (!board) return next(AppError.notFound('掲示板が見つかりません'));

    const parsed = updateMessageSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const existing = await prisma.message.findFirst({
      where: { id: messageId, boardId },
    });
    if (!existing) return next(AppError.notFound('メッセージが見つかりません'));

    if (existing.authorId !== req.user!.userId && !req.user!.admin) {
      return next(AppError.forbidden('このメッセージを編集する権限がありません'));
    }

    const message = await prisma.message.update({
      where: { id: messageId },
      data: {
        ...(parsed.data.subject !== undefined && { subject: parsed.data.subject }),
        ...(parsed.data.content !== undefined && { content: parsed.data.content }),
      },
      include: {
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
      },
    });
    return sendSuccess(res, message);
  } catch (e) {
    next(e);
  }
});

router.delete('/:boardId/messages/:messageId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const boardId = param(req, 'boardId');
    const messageId = param(req, 'messageId');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!boardId) return next(AppError.badRequest('boardId が必要です'));
    if (!messageId) return next(AppError.badRequest('messageId が必要です'));

    const board = await prisma.board.findFirst({ where: { id: boardId, projectId } });
    if (!board) return next(AppError.notFound('掲示板が見つかりません'));

    const existing = await prisma.message.findFirst({
      where: { id: messageId, boardId },
    });
    if (!existing) return next(AppError.notFound('メッセージが見つかりません'));

    if (existing.authorId !== req.user!.userId && !req.user!.admin) {
      return next(AppError.forbidden('このメッセージを削除する権限がありません'));
    }

    await prisma.message.delete({ where: { id: messageId } });
    return sendSuccess(res, { deleted: true, id: messageId });
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

    const board = await prisma.board.findFirst({ where: { id, projectId } });
    if (!board) return next(AppError.notFound('掲示板が見つかりません'));

    const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);

    const [msgTotal, messages] = await Promise.all([
      prisma.message.count({ where: { boardId: id } }),
      prisma.message.findMany({
        where: { boardId: id },
        skip,
        take: perPage,
        orderBy: { updatedAt: 'desc' },
        include: {
          author: { select: { id: true, login: true, firstname: true, lastname: true } },
        },
      }),
    ]);

    return sendSuccess(res, {
      board,
      messages,
      pagination: {
        total: msgTotal,
        page,
        perPage,
        totalPages: Math.ceil(msgTotal / perPage) || 1,
      },
    });
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

    const parsed = updateBoardSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const existing = await prisma.board.findFirst({ where: { id, projectId } });
    if (!existing) return next(AppError.notFound('掲示板が見つかりません'));

    const board = await prisma.board.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.description !== undefined && { description: parsed.data.description }),
        ...(parsed.data.position !== undefined && { position: parsed.data.position }),
      },
    });
    return sendSuccess(res, board);
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

    const existing = await prisma.board.findFirst({ where: { id, projectId } });
    if (!existing) return next(AppError.notFound('掲示板が見つかりません'));

    await prisma.board.delete({ where: { id } });
    return sendSuccess(res, { deleted: true, id });
  } catch (e) {
    next(e);
  }
});

export default router;
