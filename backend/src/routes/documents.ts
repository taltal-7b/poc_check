import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess, sendPaginated, parsePagination } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { config } from '../config';

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

async function userCanManageDocuments(
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
      if (perms.includes('manage_documents')) return true;
    }
  }
  return false;
}

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  categoryId: z.string().min(1),
  attachmentIds: z.array(z.string().uuid()).optional(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  categoryId: z.string().min(1).optional(),
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

type AttachmentRow = {
  id: string;
  filename: string;
  diskFilename: string;
  filesize: number;
  contentType: string | null;
  description: string | null;
  createdAt: Date;
};

function scoreFilename(s: string): number {
  const jp = (s.match(/[\u3040-\u30ff\u3400-\u9fff]/g) ?? []).length;
  const bad = (s.match(/[ãÃâÂ¢�]/g) ?? []).length;
  return jp * 2 - bad * 2;
}

function normalizeFilename(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return scoreFilename(decoded) > scoreFilename(name) ? decoded : name;
}

function normalizeAttachmentName<T extends { filename: string }>(att: T): T {
  return { ...att, filename: normalizeFilename(att.filename) };
}

function resolveUploadPath(diskFilename: string): string {
  return path.resolve(config.UPLOAD_DIR, diskFilename);
}

async function attachDocumentFiles(documentId: string, userId: string, attachmentIds?: string[]) {
  if (!attachmentIds?.length) return;
  await prisma.attachment.updateMany({
    where: { id: { in: attachmentIds }, authorId: userId },
    data: { containerType: 'Document', containerId: documentId, documentId },
  });
}

async function mapDocumentAttachments(documentIds: string[]): Promise<Map<string, AttachmentRow[]>> {
  const map = new Map<string, AttachmentRow[]>();
  if (!documentIds.length) return map;

  const rows = await prisma.attachment.findMany({
    where: { documentId: { in: documentIds } },
    select: { ...attachmentSelect, documentId: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const row of rows) {
    if (!row.documentId) continue;
    const arr = map.get(row.documentId) ?? [];
    const { documentId, ...rest } = row;
    arr.push(normalizeAttachmentName(rest));
    map.set(documentId, arr);
  }

  return map;
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    if (!projectId) return next(AppError.badRequest('projectId is required'));

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

    const attachmentMap = await mapDocumentAttachments(items.map((x) => x.id));
    const rows = items.map((item) => ({
      ...item,
      attachments: attachmentMap.get(item.id) ?? [],
    }));

    return sendPaginated(res, rows, {
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
    if (!projectId) return next(AppError.badRequest('projectId is required'));
    if (!id) return next(AppError.badRequest('id is required'));

    const doc = await prisma.document.findFirst({
      where: { id, projectId },
      include: {
        category: { select: { id: true, name: true, type: true } },
        author: { select: { id: true, login: true, firstname: true, lastname: true } },
        attachments: { select: attachmentSelect, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!doc) return next(AppError.notFound('Document not found'));
    return sendSuccess(res, {
      ...doc,
      attachments: (doc.attachments ?? []).map((a) => normalizeAttachmentName(a)),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    if (!projectId) return next(AppError.badRequest('projectId is required'));
    const canManage = await userCanManageDocuments(req.user?.userId, req.user?.admin, projectId);
    if (!canManage) return next(AppError.forbidden('No permission to manage documents'));

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const category = await prisma.enumeration.findFirst({
      where: { id: parsed.data.categoryId, type: 'DocumentCategory' },
    });
    if (!category) return next(AppError.badRequest('Invalid document category'));

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
      },
    });

    await attachDocumentFiles(doc.id, req.user!.userId, parsed.data.attachmentIds);
    const attachments = await prisma.attachment.findMany({
      where: { documentId: doc.id },
      orderBy: { createdAt: 'asc' },
      select: attachmentSelect,
    });

    return sendSuccess(res, { ...doc, attachments: attachments.map((a) => normalizeAttachmentName(a)) }, 201);
  } catch (e) {
    next(e);
  }
});

router.put('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const id = param(req, 'id');
    if (!projectId) return next(AppError.badRequest('projectId is required'));
    if (!id) return next(AppError.badRequest('id is required'));
    const canManage = await userCanManageDocuments(req.user?.userId, req.user?.admin, projectId);
    if (!canManage) return next(AppError.forbidden('No permission to manage documents'));

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return next(AppError.badRequest(parsed.error.message));

    const existing = await prisma.document.findFirst({ where: { id, projectId } });
    if (!existing) return next(AppError.notFound('Document not found'));

    if (parsed.data.categoryId) {
      const category = await prisma.enumeration.findFirst({
        where: { id: parsed.data.categoryId, type: 'DocumentCategory' },
      });
      if (!category) return next(AppError.badRequest('Invalid document category'));
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
      },
    });

    await attachDocumentFiles(doc.id, req.user!.userId, parsed.data.attachmentIds);
    const attachments = await prisma.attachment.findMany({
      where: { documentId: doc.id },
      orderBy: { createdAt: 'asc' },
      select: attachmentSelect,
    });

    return sendSuccess(res, { ...doc, attachments: attachments.map((a) => normalizeAttachmentName(a)) });
  } catch (e) {
    next(e);
  }
});

router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const projectId = param(req, 'projectId');
    const id = param(req, 'id');
    if (!projectId) return next(AppError.badRequest('projectId is required'));
    if (!id) return next(AppError.badRequest('id is required'));
    const canManage = await userCanManageDocuments(req.user?.userId, req.user?.admin, projectId);
    if (!canManage) return next(AppError.forbidden('No permission to manage documents'));

    const existing = await prisma.document.findFirst({ where: { id, projectId } });
    if (!existing) return next(AppError.notFound('Document not found'));

    const attachments = await prisma.attachment.findMany({
      where: { documentId: id },
      select: { id: true, diskFilename: true },
    });

    if (attachments.length > 0) {
      await prisma.attachment.deleteMany({
        where: { id: { in: attachments.map((a) => a.id) } },
      });
      for (const att of attachments) {
        const filePath = resolveUploadPath(att.diskFilename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    }

    await prisma.document.delete({ where: { id } });
    return sendSuccess(res, { deleted: true, id });
  } catch (e) {
    next(e);
  }
});

export default router;
