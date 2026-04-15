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

function decodeTitle(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

async function getUserProjectPermissions(userId: string, projectId: string): Promise<Set<string> | null> {
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

  if (!members.length) return null;
  const perms = new Set<string>();
  for (const m of members) {
    for (const mr of m.memberRoles ?? []) {
      for (const p of parseRolePermissions(mr.role?.permissions)) perms.add(p);
    }
  }
  return perms;
}

async function userCanEditWiki(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  projectId: string,
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  const perms = await getUserProjectPermissions(userId, projectId);
  if (!perms) return false;
  return perms.has('edit_wiki_pages');
}

async function ensureWiki(projectId: string) {
  let wiki = await prisma.wiki.findUnique({ where: { projectId } });
  if (!wiki) {
    wiki = await prisma.wiki.create({ data: { projectId } });
  }
  return wiki;
}

async function findPageByTitle(wikiId: string, title: string) {
  const page = await prisma.wikiPage.findUnique({
    where: { wikiId_title: { wikiId, title } },
    include: {
      content: {
        include: {
          author: { select: { id: true, login: true, firstname: true, lastname: true } },
          _count: { select: { versions: true } },
        },
      },
    },
  });
  if (page) return page;

  const redirect = await prisma.wikiRedirect.findUnique({
    where: { wikiId_title: { wikiId, title } },
    include: {
      redirectTo: {
        include: {
          content: {
            include: {
              author: { select: { id: true, login: true, firstname: true, lastname: true } },
              _count: { select: { versions: true } },
            },
          },
        },
      },
    },
  });
  if (redirect?.redirectTo) return redirect.redirectTo;
  return null;
}

const createPageSchema = z.object({
  title: z.string().min(1),
  text: z.string().default(''),
  comments: z.string().optional(),
});

const updatePageSchema = z.object({
  text: z.string(),
  comments: z.string().optional(),
});

/** GET /export/html — must be before /:title */
router.get('/export/html', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));

    const wiki = await prisma.wiki.findUnique({
      where: { projectId },
      include: {
        pages: {
          orderBy: { title: 'asc' },
          include: { content: true },
        },
      },
    });
    if (!wiki) {
      res.type('html').send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Wiki export</title></head><body></body></html>');
      return;
    }

    const parts: string[] = [
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Wiki export</title></head><body>',
    ];
    for (const p of wiki.pages) {
      const text = p.content?.text ?? '';
      parts.push(`<section><h1>${escapeHtml(p.title)}</h1><div class="content"><pre>${escapeHtml(text)}</pre></div></section>`);
    }
    parts.push('</body></html>');
    res.type('html').send(parts.join('\n'));
  } catch (e) {
    next(e);
  }
});

/** GET /date_index */
router.get('/date_index', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));

    const wiki = await prisma.wiki.findUnique({ where: { projectId } });
    if (!wiki) {
      return sendSuccess(res, []);
    }

    const pages = await prisma.wikiPage.findMany({
      where: { wikiId: wiki.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        protected: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return sendSuccess(res, pages);
  } catch (e) {
    next(e);
  }
});

/** GET / — wiki index */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));

    const wiki = await prisma.wiki.findUnique({
      where: { projectId },
      include: {
        pages: {
          orderBy: { title: 'asc' },
          select: {
            id: true,
            title: true,
            protected: true,
            parentId: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
    if (!wiki) {
      return sendSuccess(res, { wiki: null, pages: [] });
    }
    return sendSuccess(res, { wiki: { id: wiki.id, startPage: wiki.startPage }, pages: wiki.pages });
  } catch (e) {
    next(e);
  }
});

router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    const userId = req.user!.userId;

    const parsed = createPageSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const canEdit = await userCanEditWiki(req.user?.userId, req.user?.admin, projectId);
    if (!canEdit) return next(AppError.forbidden('Wikiを編集する権限がありません'));

    const wiki = await ensureWiki(projectId);

    const existing = await prisma.wikiPage.findUnique({
      where: { wikiId_title: { wikiId: wiki.id, title: parsed.data.title } },
    });
    if (existing) return next(AppError.conflict('同じタイトルのページが既に存在します'));

    const page = await prisma.wikiPage.create({
      data: {
        wikiId: wiki.id,
        title: parsed.data.title,
        content: {
          create: {
            authorId: userId,
            text: parsed.data.text,
            version: 1,
            comments: parsed.data.comments ?? null,
          },
        },
      },
      include: { content: true },
    });

    if (page.content) {
      await prisma.wikiContentVersion.create({
        data: {
          contentId: page.content.id,
          authorId: userId,
          text: parsed.data.text,
          version: 1,
          comments: parsed.data.comments ?? null,
        },
      });
    }

    const full = await prisma.wikiPage.findUnique({
      where: { id: page.id },
      include: {
        content: {
          include: {
            author: { select: { id: true, login: true, firstname: true, lastname: true } },
            _count: { select: { versions: true } },
          },
        },
      },
    });
    return sendSuccess(res, full, 201);
  } catch (e) {
    next(e);
  }
});

router.get('/:title/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const rawTitle = param(req, 'title');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!rawTitle) return next(AppError.badRequest('title が必要です'));
    const title = decodeTitle(rawTitle);

    const wiki = await prisma.wiki.findUnique({ where: { projectId } });
    if (!wiki) return next(AppError.notFound('Wiki が見つかりません'));

    const page = await findPageByTitle(wiki.id, title);
    if (!page?.content) return next(AppError.notFound('ページが見つかりません'));

    const versions = await prisma.wikiContentVersion.findMany({
      where: { contentId: page.content.id },
      orderBy: { version: 'desc' },
    });
    return sendSuccess(res, versions);
  } catch (e) {
    next(e);
  }
});

router.get('/:title/version/:version', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const rawTitle = param(req, 'title');
    const verStr = param(req, 'version');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!rawTitle) return next(AppError.badRequest('title が必要です'));
    const title = decodeTitle(rawTitle);
    const versionNum = Number(verStr);
    if (!Number.isInteger(versionNum) || versionNum < 1) {
      return next(AppError.badRequest('無効なバージョンです'));
    }

    const wiki = await prisma.wiki.findUnique({ where: { projectId } });
    if (!wiki) return next(AppError.notFound('Wiki が見つかりません'));

    const page = await findPageByTitle(wiki.id, title);
    if (!page?.content) return next(AppError.notFound('ページが見つかりません'));

    const row = await prisma.wikiContentVersion.findUnique({
      where: { contentId_version: { contentId: page.content.id, version: versionNum } },
    });
    if (!row) return next(AppError.notFound('指定バージョンが見つかりません'));
    return sendSuccess(res, row);
  } catch (e) {
    next(e);
  }
});

router.get('/:title/diff', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const rawTitle = param(req, 'title');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!rawTitle) return next(AppError.badRequest('title が必要です'));
    const title = decodeTitle(rawTitle);
    const fromV = Number(req.query.from);
    const toV = Number(req.query.to);
    if (!Number.isInteger(fromV) || !Number.isInteger(toV)) {
      return next(AppError.badRequest('query from, to は整数で指定してください'));
    }

    const wiki = await prisma.wiki.findUnique({ where: { projectId } });
    if (!wiki) return next(AppError.notFound('Wiki が見つかりません'));

    const page = await findPageByTitle(wiki.id, title);
    if (!page?.content) return next(AppError.notFound('ページが見つかりません'));

    const [a, b] = await Promise.all([
      prisma.wikiContentVersion.findUnique({
        where: { contentId_version: { contentId: page.content.id, version: fromV } },
      }),
      prisma.wikiContentVersion.findUnique({
        where: { contentId_version: { contentId: page.content.id, version: toV } },
      }),
    ]);
    if (!a || !b) return next(AppError.notFound('比較対象のバージョンが見つかりません'));

    return sendSuccess(res, {
      fromVersion: fromV,
      toVersion: toV,
      oldText: a.text,
      newText: b.text,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/:title/protect', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const rawTitle = param(req, 'title');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!rawTitle) return next(AppError.badRequest('title が必要です'));
    const title = decodeTitle(rawTitle);

    const canEdit = await userCanEditWiki(req.user?.userId, req.user?.admin, projectId);
    if (!canEdit) return next(AppError.forbidden('Wikiを編集する権限がありません'));

    const wiki = await prisma.wiki.findUnique({ where: { projectId } });
    if (!wiki) return next(AppError.notFound('Wiki が見つかりません'));

    const page = await findPageByTitle(wiki.id, title);
    if (!page) return next(AppError.notFound('ページが見つかりません'));

    const explicit = z.object({ protected: z.boolean().optional() }).safeParse(req.body);
    const nextProtected =
      explicit.success && typeof explicit.data.protected === 'boolean'
        ? explicit.data.protected
        : !page.protected;

    const updated = await prisma.wikiPage.update({
      where: { id: page.id },
      data: { protected: nextProtected },
    });
    return sendSuccess(res, updated);
  } catch (e) {
    next(e);
  }
});

router.get('/:title', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const rawTitle = param(req, 'title');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!rawTitle) return next(AppError.badRequest('title が必要です'));
    const title = decodeTitle(rawTitle);

    const wiki = await prisma.wiki.findUnique({ where: { projectId } });
    if (!wiki) return next(AppError.notFound('Wiki が見つかりません'));

    const page = await findPageByTitle(wiki.id, title);
    if (!page) return next(AppError.notFound('ページが見つかりません'));

    return sendSuccess(res, page);
  } catch (e) {
    next(e);
  }
});

router.put('/:title', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const rawTitle = param(req, 'title');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!rawTitle) return next(AppError.badRequest('title が必要です'));
    const title = decodeTitle(rawTitle);
    const userId = req.user!.userId;

    const parsed = updatePageSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const canEdit = await userCanEditWiki(req.user?.userId, req.user?.admin, projectId);
    if (!canEdit) return next(AppError.forbidden('Wikiを編集する権限がありません'));

    const wiki = await prisma.wiki.findUnique({ where: { projectId } });
    if (!wiki) return next(AppError.notFound('Wiki が見つかりません'));

    const page = await findPageByTitle(wiki.id, title);
    if (!page?.content) return next(AppError.notFound('ページが見つかりません'));

    const current = page.content;
    await prisma.$transaction([
      prisma.wikiContentVersion.create({
        data: {
          contentId: current.id,
          authorId: userId,
          text: current.text,
          version: current.version,
          comments: current.comments,
        },
      }),
      prisma.wikiContent.update({
        where: { id: current.id },
        data: {
          text: parsed.data.text,
          comments: parsed.data.comments ?? current.comments,
          version: current.version + 1,
          authorId: userId,
        },
      }),
    ]);

    const full = await prisma.wikiPage.findUnique({
      where: { id: page.id },
      include: {
        content: {
          include: {
            author: { select: { id: true, login: true, firstname: true, lastname: true } },
            _count: { select: { versions: true } },
          },
        },
      },
    });
    return sendSuccess(res, full);
  } catch (e) {
    next(e);
  }
});

router.delete('/:title', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const rawTitle = param(req, 'title');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!rawTitle) return next(AppError.badRequest('title が必要です'));
    const title = decodeTitle(rawTitle);

    const canEdit = await userCanEditWiki(req.user?.userId, req.user?.admin, projectId);
    if (!canEdit) return next(AppError.forbidden('Wikiを編集する権限がありません'));

    const wiki = await prisma.wiki.findUnique({ where: { projectId } });
    if (!wiki) return next(AppError.notFound('Wiki が見つかりません'));

    const page = await findPageByTitle(wiki.id, title);
    if (!page) return next(AppError.notFound('ページが見つかりません'));

    await prisma.wikiPage.delete({ where: { id: page.id } });
    return sendSuccess(res, { deleted: true, id: page.id });
  } catch (e) {
    next(e);
  }
});

export default router;
