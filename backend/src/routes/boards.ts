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

function parseRolePermissions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

async function getUserGroupIds(userId: string): Promise<string[]> {
  const rows = await prisma.groupUser.findMany({
    where: { userId },
    select: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

/** Redmine: manage_boards / add_messages などプロジェクトロールから判定 */
async function userHasAnyProjectPermission(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  projectId: string,
  anyOf: string[],
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  const groupIds = await getUserGroupIds(userId);
  const members = await prisma.member.findMany({
    where: {
      projectId,
      OR: [{ userId }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
    },
    include: {
      memberRoles: {
        include: {
          role: { select: { permissions: true } },
        },
      },
    },
  });
  if (!members.length) return false;
  for (const m of members) {
    for (const mr of m.memberRoles ?? []) {
      const perms = parseRolePermissions(mr.role?.permissions);
      for (const key of anyOf) {
        if (perms.includes(key)) return true;
      }
    }
  }
  return false;
}

/** 掲示板の編集・削除: システム管理者 / 作成者 / manage_boards / manage_project（Redmine の掲示板管理者相当） */
async function userCanEditOrDeleteBoard(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  projectId: string,
  board: { createdByUserId: string | null },
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  if (board.createdByUserId && board.createdByUserId === userId) return true;
  return userHasAnyProjectPermission(userId, isAdmin, projectId, ['manage_boards', 'manage_project']);
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
    if (!boards.length) return sendSuccess(res, []);

    const ids = boards.map((b) => b.id);
    const topicCounts = await prisma.message.groupBy({
      by: ['boardId'],
      where: { boardId: { in: ids }, parentId: null },
      _count: { _all: true },
    });
    const countMap = new Map(topicCounts.map((r) => [r.boardId, r._count._all]));
    const withCounts = boards.map((b) => ({
      ...b,
      topicCount: countMap.get(b.id) ?? 0,
    }));
    return sendSuccess(res, withCounts);
  } catch (e) {
    next(e);
  }
});

router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));

    const can = await userHasAnyProjectPermission(req.user?.userId, req.user?.admin, projectId, [
      'manage_boards',
      'manage_project',
    ]);
    if (!can) return next(AppError.forbidden('掲示板を管理する権限がありません'));

    const parsed = createBoardSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const board = await prisma.board.create({
      data: {
        projectId,
        createdByUserId: req.user!.userId,
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

    const can = await userHasAnyProjectPermission(req.user?.userId, req.user?.admin, projectId, [
      'add_messages',
      'manage_boards',
    ]);
    if (!can) return next(AppError.forbidden('メッセージを追加する権限がありません'));

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

    const can = await userHasAnyProjectPermission(req.user?.userId, req.user?.admin, projectId, [
      'add_messages',
      'manage_boards',
    ]);
    if (!can) return next(AppError.forbidden('メッセージを追加する権限がありません'));

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

    const canEdit = await userCanEditOrDeleteBoard(req.user?.userId, req.user?.admin, projectId, {
      createdByUserId: existing.createdByUserId,
    });
    if (!canEdit) return next(AppError.forbidden('この掲示板を編集する権限がありません'));

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

    const canDelete = await userCanEditOrDeleteBoard(req.user?.userId, req.user?.admin, projectId, {
      createdByUserId: existing.createdByUserId,
    });
    if (!canDelete) return next(AppError.forbidden('この掲示板を削除する権限がありません'));

    await prisma.board.delete({ where: { id } });
    return sendSuccess(res, { deleted: true, id });
  } catch (e) {
    next(e);
  }
});

export default router;
