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

async function userCanManageNews(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  projectId: string,
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
      if (perms.includes('manage_news')) return true;
    }
  }
  return false;
}

const createSchema = z.object({
  title: z.string().min(1),
  summary: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  projectId: z.string().uuid().optional(),
  attachmentIds: z.array(z.string().uuid()).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

const commentSchema = z.object({
  content: z.string().min(1),
  parentId: z.string().uuid().optional().nullable(),
});

const commentAuthorSelect = {
  id: true,
  login: true,
  firstname: true,
  lastname: true,
} as const;

type CommentWithAuthor = {
  id: string;
  newsId: string;
  parentId: string | null;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    login: string;
    firstname: string;
    lastname: string;
  };
};

type CommentTreeNode = CommentWithAuthor & { replies: CommentTreeNode[] };

function buildCommentTree(rows: CommentWithAuthor[]): CommentTreeNode[] {
  const nodes = new Map<string, CommentTreeNode>();
  for (const r of rows) {
    nodes.set(r.id, { ...r, replies: [] });
  }
  const roots: CommentTreeNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    if (r.parentId && nodes.has(r.parentId)) {
      nodes.get(r.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  }
  const byTime = (a: CommentTreeNode, b: CommentTreeNode) => a.createdAt.getTime() - b.createdAt.getTime();
  function sortDeep(list: CommentTreeNode[]) {
    list.sort(byTime);
    for (const n of list) sortDeep(n.replies);
  }
  sortDeep(roots);
  return roots;
}

const attachmentSelect = {
  id: true,
  filename: true,
  diskFilename: true,
  filesize: true,
  contentType: true,
  description: true,
  createdAt: true,
} as const;

async function listNewsAttachments(newsId: string) {
  return prisma.attachment.findMany({
    where: { containerType: 'News', containerId: newsId },
    orderBy: { createdAt: 'asc' },
    select: attachmentSelect,
  });
}

async function withNewsAttachments<T extends { id: string }>(news: T | null) {
  if (!news) return news;
  const attachments = await listNewsAttachments(news.id);
  return { ...news, attachments };
}

async function withNewsAttachmentsMany<T extends { id: string }>(items: T[]) {
  if (!items.length) return items;
  const ids = items.map((i) => i.id);
  const rows = await prisma.attachment.findMany({
    where: { containerType: 'News', containerId: { in: ids } },
    orderBy: { createdAt: 'asc' },
    select: { ...attachmentSelect, containerId: true },
  });
  const map = new Map<string, Array<Omit<typeof rows[number], 'containerId'>>>();
  for (const row of rows) {
    if (!row.containerId) continue;
    const arr = map.get(row.containerId) ?? [];
    const { containerId: _containerId, ...rest } = row;
    arr.push(rest);
    map.set(row.containerId, arr);
  }
  return items.map((item) => ({ ...item, attachments: map.get(item.id) ?? [] }));
}

async function attachNewsFiles(newsId: string, userId: string, attachmentIds?: string[]) {
  if (!attachmentIds?.length) return;
  await prisma.attachment.updateMany({
    where: { id: { in: attachmentIds }, authorId: userId },
    data: { containerType: 'News', containerId: newsId },
  });
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const query = req.query as Record<string, unknown>;
    const { page, perPage, skip } = parsePagination({
      ...query,
      per_page: query.per_page ?? 30,
    });

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

    const itemsWithAttachments = await withNewsAttachmentsMany(items);
    return sendPaginated(res, itemsWithAttachments, {
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
            author: { select: commentAuthorSelect },
          },
        },
      },
    });
    if (!news) return next(AppError.notFound('ニュースが見つかりません'));
    const { comments, ...newsRest } = news;
    const withTree = { ...newsRest, comments: buildCommentTree(comments as CommentWithAuthor[]) };
    return sendSuccess(res, await withNewsAttachments(withTree));
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
    const canManage = await userCanManageNews(req.user?.userId, req.user?.admin, projectId);
    if (!canManage) return next(AppError.forbidden('ニュースを作成する権限がありません'));

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
    await attachNewsFiles(news.id, req.user!.userId, parsed.data.attachmentIds);
    const full = await prisma.news.findUnique({
      where: { id: news.id },
      include: {
        project: { select: { id: true, name: true, identifier: true } },
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
        comments: true,
      },
    });
    return sendSuccess(res, await withNewsAttachments(full), 201);
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
            author: { select: commentAuthorSelect },
          },
        },
      },
    });
    const { comments: putComments, ...putRest } = news;
    const putWithTree = { ...putRest, comments: buildCommentTree(putComments as CommentWithAuthor[]) };
    return sendSuccess(res, await withNewsAttachments(putWithTree));
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

    let parentId: string | null = parsed.data.parentId ?? null;
    if (parentId) {
      const parent = await prisma.comment.findFirst({
        where: { id: parentId, newsId: id },
      });
      if (!parent) return next(AppError.badRequest('親コメントが見つかりません'));
    }

    const comment = await prisma.comment.create({
      data: {
        newsId: id,
        authorId: req.user!.userId,
        content: parsed.data.content,
        parentId,
      },
      include: {
        author: { select: commentAuthorSelect },
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
