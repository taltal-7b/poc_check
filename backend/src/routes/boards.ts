import type { Prisma } from '@prisma/client';
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess, sendPaginated, parsePagination } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { hasAnyProjectPermission } from '../utils/project-permissions';
import { z } from 'zod';

const router = Router({ mergeParams: true });

function param(req: Request, key: string): string | undefined {
  const v = req.params[key];
  if (typeof v === 'string' && v.length > 0) return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

/** Redmine: manage_boards / add_messages などプロジェクトロールから判定 */
/** 掲示板の編集・削除: システム管理者 / 作成者 / manage_boards / manage_project */
async function userCanEditOrDeleteBoard(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  projectId: string,
  board: { createdByUserId: string | null },
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  if (board.createdByUserId && board.createdByUserId === userId) return true;
  return hasAnyProjectPermission(userId, isAdmin, projectId, ['manage_boards', 'manage_project']);
}

const messageTopicInclude = {
  author: { select: { id: true, login: true, firstname: true, lastname: true } },
  _count: { select: { replies: true } },
} satisfies Prisma.MessageInclude;

type MessageTopicRow = Prisma.MessageGetPayload<{ include: typeof messageTopicInclude }>;
type MessageWithAuthor = Prisma.MessageGetPayload<{
  include: { author: { select: { id: true; login: true; firstname: true; lastname: true } } };
}>;
type MessageTree = MessageWithAuthor & { replies: MessageTree[] };

async function loadMessageReplyTree(boardId: string, rootId: string): Promise<MessageTree | null> {
  const root = await prisma.message.findFirst({
    where: { id: rootId, boardId },
    include: {
      author: { select: { id: true, login: true, firstname: true, lastname: true } },
    },
  });
  if (!root) return null;

  const childrenByParent = new Map<string, MessageWithAuthor[]>();
  let parentIds = [root.id];

  while (parentIds.length) {
    const children = await prisma.message.findMany({
      where: { boardId, parentId: { in: parentIds } },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
      },
    });
    if (!children.length) break;

    const nextParentIds: string[] = [];
    for (const child of children) {
      if (!child.parentId) continue;
      const list = childrenByParent.get(child.parentId) ?? [];
      list.push(child);
      childrenByParent.set(child.parentId, list);
      nextParentIds.push(child.id);
    }
    parentIds = nextParentIds;
  }

  function attachReplies(message: MessageWithAuthor): MessageTree {
    const replies = (childrenByParent.get(message.id) ?? []).map(attachReplies);
    return { ...message, replies };
  }

  return attachReplies(root);
}

async function countDescendantRepliesByRootIds(
  boardId: string,
  rootIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!rootIds.length) return counts;

  const rootByParent = new Map<string, string>();
  for (const rootId of rootIds) {
    counts.set(rootId, 0);
    rootByParent.set(rootId, rootId);
  }

  let parentIds = [...rootIds];
  while (parentIds.length) {
    const rows = await prisma.message.findMany({
      where: { boardId, parentId: { in: parentIds } },
      select: { id: true, parentId: true },
    });
    if (!rows.length) break;

    const nextParentIds: string[] = [];
    for (const row of rows) {
      if (!row.parentId) continue;
      const rootId = rootByParent.get(row.parentId);
      if (!rootId) continue;
      counts.set(rootId, (counts.get(rootId) ?? 0) + 1);
      rootByParent.set(row.id, rootId);
      nextParentIds.push(row.id);
    }
    parentIds = nextParentIds;
  }

  return counts;
}

async function findRootTopicId(boardId: string, messageId: string): Promise<string | null> {
  let currentId: string | null = messageId;
  while (currentId) {
    const row: { id: string; parentId: string | null } | null = await prisma.message.findFirst({
      where: { id: currentId, boardId },
      select: { id: true, parentId: true },
    });
    if (!row) return null;
    if (!row.parentId) return row.id;
    currentId = row.parentId;
  }
  return null;
}

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

    const can = await hasAnyProjectPermission(req.user?.userId, req.user?.admin, projectId, [
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
        orderBy: [{ updatedAt: 'desc' }],
        include: messageTopicInclude,
      }),
    ]);
    const topicRows = rows as MessageTopicRow[];
    const replyCounts = await countDescendantRepliesByRootIds(
      boardId,
      topicRows.map((m) => m.id),
    );

    const items = topicRows.map(({ _count, ...m }) => ({
      ...m,
      replyCount: replyCounts.get(m.id) ?? _count.replies,
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

    const can = await hasAnyProjectPermission(req.user?.userId, req.user?.admin, projectId, [
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

    const message = await loadMessageReplyTree(boardId, messageId);
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

    const can = await hasAnyProjectPermission(req.user?.userId, req.user?.admin, projectId, [
      'view_messages',
      'add_messages',
      'manage_boards',
      'manage_project',
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
    const rootTopicId = await findRootTopicId(boardId, parentId);
    if (rootTopicId) {
      await prisma.message.update({
        where: { id: rootTopicId },
        data: { updatedAt: new Date() },
      });
    }
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

    const isComment = Boolean(existing.parentId);
    if (isComment) {
      if (existing.authorId !== req.user!.userId) {
        return next(AppError.forbidden('このコメントを編集する権限がありません'));
      }
    } else if (existing.authorId !== req.user!.userId && !req.user!.admin) {
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
    if (existing.parentId) {
      const rootTopicId = await findRootTopicId(boardId, existing.id);
      if (rootTopicId && rootTopicId !== existing.id) {
        await prisma.message.update({
          where: { id: rootTopicId },
          data: { updatedAt: new Date() },
        });
      }
    }
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

    const isComment = Boolean(existing.parentId);
    const rootTopicIdForTouch =
      isComment && existing.parentId ? await findRootTopicId(boardId, existing.id) : null;
    if (isComment) {
      if (existing.authorId !== req.user!.userId) {
        return next(AppError.forbidden('このコメントを削除する権限がありません'));
      }
    } else if (existing.authorId !== req.user!.userId && !req.user!.admin) {
      return next(AppError.forbidden('このメッセージを削除する権限がありません'));
    }

    await prisma.message.delete({ where: { id: messageId } });
    if (rootTopicIdForTouch && rootTopicIdForTouch !== existing.id) {
      await prisma.message.update({
        where: { id: rootTopicIdForTouch },
        data: { updatedAt: new Date() },
      });
    }
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
