import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
import PDFDocument from 'pdfkit';

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
  comments: z.string().nullable().optional(),
  attachmentIds: z.array(z.string().uuid()).optional(),
});

const updatePageSchema = z.object({
  newTitle: z.string().min(1).optional(),
  text: z.string(),
  comments: z.string().nullable().optional(),
  attachmentIds: z.array(z.string().uuid()).optional(),
});

const attachmentSelect = {
  id: true,
  filename: true,
  diskFilename: true,
  filesize: true,
  contentType: true,
  description: true,
  createdAt: true,
} as const;

async function listWikiAttachments(pageId: string) {
  return prisma.attachment.findMany({
    where: { containerType: 'WikiPage', containerId: pageId },
    orderBy: { createdAt: 'asc' },
    select: attachmentSelect,
  });
}

async function attachWikiFiles(pageId: string, userId: string, attachmentIds?: string[]) {
  if (!attachmentIds?.length) return;
  await prisma.attachment.updateMany({
    where: { id: { in: attachmentIds }, authorId: userId },
    data: { containerType: 'WikiPage', containerId: pageId },
  });
}

async function withWikiAttachments<T extends { id: string }>(page: T | null) {
  if (!page) return page;
  const attachments = await listWikiAttachments(page.id);
  return { ...page, attachments };
}

function ensurePdfSpace(doc: any, neededHeight = 20) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + neededHeight > bottom) {
    doc.addPage();
  }
}

function resolveJapaneseFontPath(): string | null {
  const candidates = [
    '/usr/share/fonts/ipaexfont/ipaexg.ttf',
    '/usr/share/fonts/TTF/ipaexg.ttf',
    '/usr/share/fonts/TTF/ipag.ttf',
    '/usr/share/fonts/OTF/ipag.otf',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttf',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolveJapaneseBoldFontPath(): string | null {
  const candidates = [
    '/usr/share/fonts/ipaexfont/ipaexm.ttf',
    '/usr/share/fonts/TTF/ipaexm.ttf',
    '/usr/share/fonts/TTF/ipam.ttf',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

type InlineSegment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  underline?: boolean;
  code?: boolean;
};

function parseInlineSegments(line: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  let i = 0;
  let buffer = '';
  const style = { bold: false, italic: false, strike: false, underline: false, code: false };
  const push = () => {
    if (!buffer) return;
    segments.push({ text: buffer, ...style });
    buffer = '';
  };
  while (i < line.length) {
    const rest = line.slice(i);
    if (rest.startsWith('<u>')) {
      push();
      style.underline = true;
      i += 3;
      continue;
    }
    if (rest.startsWith('</u>')) {
      push();
      style.underline = false;
      i += 4;
      continue;
    }
    if (rest.startsWith('**')) {
      push();
      style.bold = !style.bold;
      i += 2;
      continue;
    }
    if (rest.startsWith('*')) {
      push();
      style.italic = !style.italic;
      i += 1;
      continue;
    }
    if (rest.startsWith('~~')) {
      push();
      style.strike = !style.strike;
      i += 2;
      continue;
    }
    if (rest.startsWith('`')) {
      push();
      style.code = !style.code;
      i += 1;
      continue;
    }
    if (rest.startsWith('_')) {
      push();
      style.italic = !style.italic;
      i += 1;
      continue;
    }
    buffer += line[i];
    i += 1;
  }
  push();
  return segments;
}

function renderStyledLine(doc: any, line: string, fontName: string, boldFontName: string) {
  const segments = parseInlineSegments(line);
  if (segments.length === 0) {
    doc.text(' ');
    return;
  }
  segments.forEach((seg, idx) => {
    const isBoldText = !seg.code && !!seg.bold;
    if (seg.code) {
      doc.font('Courier').fillColor('#0369a1');
    } else {
      doc.font(seg.bold ? boldFontName : fontName).fillColor('#111827');
    }
    if (isBoldText) doc.lineWidth(0.35);
    doc.text(seg.text || ' ', {
      continued: idx !== segments.length - 1,
      underline: !!seg.underline,
      strike: !!seg.strike,
      oblique: !seg.code && !!seg.italic,
      lineGap: 1,
      fill: true,
      stroke: isBoldText,
    });
  });
}

function renderWikiMarkdownToPdf(doc: any, markdown: string, baseFont: string, boldFont: string) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let inCode = false;
  let codeLines: string[] = [];

  const flushCode = () => {
    if (codeLines.length === 0) return;
    const codeText = codeLines.join('\n');
    doc.font('Courier').fontSize(10);
    const textHeight = doc.heightOfString(codeText || ' ', { width: contentWidth - 16 });
    const blockHeight = textHeight + 16;
    ensurePdfSpace(doc, blockHeight + 8);
    const y = doc.y;
    doc.save();
    doc.roundedRect(doc.page.margins.left, y, contentWidth, blockHeight, 4).fill('#0b1220');
    doc.fillColor('#7dd3fc');
    doc.text(codeText || ' ', doc.page.margins.left + 8, y + 8, { width: contentWidth - 16 });
    doc.restore();
    doc.moveDown(0.8);
    codeLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine ?? '';
    if (/^\s*```/.test(line)) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        inCode = true;
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (line.trim() === '') {
      doc.moveDown(0.5);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const sizeMap = [24, 20, 17, 15, 13, 12];
      const fontSize = sizeMap[Math.min(level - 1, sizeMap.length - 1)];
      doc.font(baseFont).fontSize(fontSize).fillColor('#0f172a');
      ensurePdfSpace(doc, doc.heightOfString(text, { width: contentWidth }) + 8);
      doc.text(text, { width: contentWidth, lineGap: 1 });
      doc.moveDown(0.3);
      continue;
    }

    const listItem = /^\s*[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      doc.font(baseFont).fontSize(11).fillColor('#111827');
      ensurePdfSpace(doc, 18);
      doc.text('• ', { continued: true, lineGap: 1 });
      renderStyledLine(doc, listItem[1], baseFont, boldFont);
      continue;
    }

    doc.font(baseFont).fontSize(11).fillColor('#111827');
    ensurePdfSpace(doc, 18);
    renderStyledLine(doc, line, baseFont, boldFont);
  }

  if (inCode) {
    flushCode();
  }
}

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

    await attachWikiFiles(page.id, userId, parsed.data.attachmentIds);

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
    return sendSuccess(res, await withWikiAttachments(full), 201);
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

    const [project, wiki] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true, identifier: true } }),
      prisma.wiki.findUnique({ where: { projectId } }),
    ]);
    if (!wiki) return next(AppError.notFound('Wiki が見つかりません'));

    const page = await findPageByTitle(wiki.id, title);
    if (!page?.content) return next(AppError.notFound('ページが見つかりません'));

    const versions = await prisma.wikiContentVersion.findMany({
      where: { contentId: page.content.id },
      orderBy: { version: 'desc' },
    });
    const authorIds = Array.from(new Set(versions.map((v) => v.authorId)));
    const authors = authorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, login: true, firstname: true, lastname: true },
        })
      : [];
    const authorMap = new Map(authors.map((u) => [u.id, u]));
    const enriched = versions.map((v) => ({
      ...v,
      author: authorMap.get(v.authorId) ?? null,
    }));
    return sendSuccess(res, enriched);
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

router.delete('/:title/version/:version', authenticate, async (req: Request, res: Response, next: NextFunction) => {
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

    const canEdit = await userCanEditWiki(req.user?.userId, req.user?.admin, projectId);
    if (!canEdit) return next(AppError.forbidden('Wikiを編集する権限がありません'));

    const wiki = await prisma.wiki.findUnique({ where: { projectId } });
    if (!wiki) return next(AppError.notFound('Wiki が見つかりません'));

    const page = await findPageByTitle(wiki.id, title);
    if (!page?.content) return next(AppError.notFound('ページが見つかりません'));
    if (versionNum === page.content.version) {
      return next(AppError.badRequest('現在の版は削除できません'));
    }

    const removed = await prisma.wikiContentVersion.deleteMany({
      where: { contentId: page.content.id, version: versionNum },
    });
    if (removed.count === 0) return next(AppError.notFound('指定バージョンが見つかりません'));

    return sendSuccess(res, { deleted: true, version: versionNum });
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

router.get('/:title/export/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const rawTitle = param(req, 'title');
    if (!projectId) return next(AppError.badRequest('projectId が必要です'));
    if (!rawTitle) return next(AppError.badRequest('title が必要です'));
    const title = decodeTitle(rawTitle);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, identifier: true },
    });
    const wiki = await prisma.wiki.findUnique({ where: { projectId } });
    if (!wiki) return next(AppError.notFound('Wiki が見つかりません'));

    const page = await findPageByTitle(wiki.id, title);
    if (!page?.content) return next(AppError.notFound('ページが見つかりません'));

    const exportDate = new Date(page.updatedAt);
    const ymd = `${exportDate.getFullYear()}${String(exportDate.getMonth() + 1).padStart(2, '0')}${String(
      exportDate.getDate(),
    ).padStart(2, '0')}`;
    const fileName = `${page.title}_v${page.content.version}_${ymd}.pdf`;
    const fileNameFallback = fileName.replace(/[^\x20-\x7E]+/g, '_');

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    const jpFontPath = resolveJapaneseFontPath();
    const jpBoldFontPath = resolveJapaneseBoldFontPath();
    if (jpFontPath) (doc as any).registerFont('jp', jpFontPath);
    if (jpBoldFontPath) (doc as any).registerFont('jpBold', jpBoldFontPath);
    const chunks: Buffer[] = [];
    let handled = false;
    doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on('error', (err) => {
      if (handled) return;
      handled = true;
      next(err);
    });
    doc.on('end', () => {
      if (handled) return;
      handled = true;
      const pdfBuffer = Buffer.concat(chunks);
      res.set('Content-Type', 'application/pdf');
      res.set(
        'Content-Disposition',
        `attachment; filename="${fileNameFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );
      res.send(pdfBuffer);
    });

    const baseFont = jpFontPath ? 'jp' : 'Helvetica';
    const boldFont = jpBoldFontPath ? 'jpBold' : jpFontPath ? 'jp' : 'Helvetica-Bold';
    const projectLabel = project?.name?.trim() || project?.identifier || 'Project';
    doc
      .font(baseFont)
      .fontSize(14)
      .fillColor('#111827')
      .text(`${projectLabel} - ${page.title} - #${page.content.version}`);
    doc.moveDown(0.9);
    doc.font(baseFont).fontSize(18).fillColor('#0f172a').text(`# ${page.title}`, { lineGap: 1 });
    doc.moveDown(1.1);

    renderWikiMarkdownToPdf(doc, page.content.text ?? '', baseFont, boldFont);
    doc.end();
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

    return sendSuccess(res, await withWikiAttachments(page));
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

    const requestedTitle = parsed.data.newTitle?.trim();
    const nextTitle = requestedTitle && requestedTitle.length > 0 ? requestedTitle : page.title;
    if (nextTitle !== page.title) {
      const duplicate = await prisma.wikiPage.findUnique({
        where: { wikiId_title: { wikiId: wiki.id, title: nextTitle } },
      });
      if (duplicate) return next(AppError.badRequest('同名のWikiページが既に存在します'));
    }

    const current = page.content;
    const nextVersion = current.version + 1;
    const nextComments = parsed.data.comments === undefined ? current.comments : parsed.data.comments;
    await prisma.$transaction(async (tx: any) => {
      await tx.wikiContent.update({
        where: { id: current.id },
        data: {
          text: parsed.data.text,
          comments: nextComments,
          version: nextVersion,
          authorId: userId,
        },
      });
      await tx.wikiContentVersion.create({
        data: {
          contentId: current.id,
          authorId: userId,
          text: parsed.data.text,
          version: nextVersion,
          comments: nextComments,
        },
      });
      if (nextTitle !== page.title) {
        await tx.wikiPage.update({ where: { id: page.id }, data: { title: nextTitle } });
        await tx.wikiRedirect.upsert({
          where: { wikiId_title: { wikiId: wiki.id, title: page.title } },
          update: { redirectToId: page.id },
          create: { wikiId: wiki.id, title: page.title, redirectToId: page.id },
        });
      }
    });

    await attachWikiFiles(page.id, userId, parsed.data.attachmentIds);

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
    return sendSuccess(res, await withWikiAttachments(full));
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
