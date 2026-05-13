import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
interface MulterDiskFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
}
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { config } from '../config';
import { z } from 'zod';
import { userCanAccessAttachment } from '../utils/project-access';
import { hasAnyProjectPermission } from '../utils/project-permissions';

const router = Router({ mergeParams: true });

function scoreFilename(s: string): number {
  const jp = (s.match(/[\u3040-\u30ff\u3400-\u9fff]/g) ?? []).length;
  const bad = (s.match(/[\u00e3\u00c3\u00e2\u00c2\u00a2\ufffd]/g) ?? []).length;
  return jp * 2 - bad * 2;
}

function normalizeFilename(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return scoreFilename(decoded) > scoreFilename(name) ? decoded : name;
}

const optionalLinkSchema = z
  .object({
    containerType: z.string().min(1).optional(),
    containerId: z.string().uuid().optional(),
    issueId: z.string().uuid().optional(),
    documentId: z.string().uuid().optional(),
    journalId: z.string().uuid().optional(),
    description: z.string().optional(),
  })
  .optional();

function resolveUploadPath(diskFilename: string): string {
  return path.resolve(config.UPLOAD_DIR, diskFilename);
}

function cleanupUploadedFiles(req: Request) {
  const files = (req as Request & { files?: MulterDiskFile[] }).files;
  for (const file of files ?? []) {
    const filePath = resolveUploadPath(file.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

async function userCanWriteAttachmentTarget(
  user: Express.Request['user'],
  attachment: {
    issueId?: string | null;
    documentId?: string | null;
    journalId?: string | null;
    containerType?: string | null;
    containerId?: string | null;
  },
): Promise<boolean> {
  if (user?.admin) return true;
  if (!user?.userId) return false;

  if (attachment.issueId) {
    const issue = await prisma.issue.findUnique({ where: { id: attachment.issueId }, select: { projectId: true } });
    return issue
      ? hasAnyProjectPermission(user.userId, user.admin, issue.projectId, ['add_issues', 'edit_issues', 'add_issue_notes'])
      : false;
  }

  if (attachment.documentId) {
    const document = await prisma.document.findUnique({ where: { id: attachment.documentId }, select: { projectId: true } });
    return document ? hasAnyProjectPermission(user.userId, user.admin, document.projectId, ['manage_documents']) : false;
  }

  if (attachment.journalId) {
    const journal = await prisma.journal.findUnique({
      where: { id: attachment.journalId },
      select: { issue: { select: { projectId: true } } },
    });
    return journal
      ? hasAnyProjectPermission(user.userId, user.admin, journal.issue.projectId, ['add_issue_notes', 'edit_issue_notes', 'edit_issues'])
      : false;
  }

  if (attachment.containerType && attachment.containerId) {
    if (attachment.containerType === 'News') {
      const news = await prisma.news.findUnique({ where: { id: attachment.containerId }, select: { projectId: true } });
      return news ? hasAnyProjectPermission(user.userId, user.admin, news.projectId, ['manage_news']) : false;
    }

    if (attachment.containerType === 'WikiPage') {
      const page = await prisma.wikiPage.findUnique({
        where: { id: attachment.containerId },
        select: { wiki: { select: { projectId: true } } },
      });
      return page ? hasAnyProjectPermission(user.userId, user.admin, page.wiki.projectId, ['edit_wiki_pages']) : false;
    }

    if (attachment.containerType === 'Message') {
      const message = await prisma.message.findUnique({
        where: { id: attachment.containerId },
        select: { board: { select: { projectId: true } } },
      });
      return message ? hasAnyProjectPermission(user.userId, user.admin, message.board.projectId, ['add_messages', 'manage_boards']) : false;
    }
  }

  return true;
}

router.post(
  '/upload',
  authenticate,
  upload.array('files', 10),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = (req as Request & { files?: MulterDiskFile[] }).files;
      if (!files?.length) {
        throw AppError.badRequest('ファイルがありません');
      }

      let meta: z.infer<typeof optionalLinkSchema>;
      try {
        meta = optionalLinkSchema.parse(
          typeof req.body.meta === 'string' ? JSON.parse(req.body.meta) : req.body.meta ?? undefined,
        );
      } catch {
        meta = undefined;
      }

      if (meta && (meta.issueId || meta.documentId || meta.journalId || (meta.containerType && meta.containerId))) {
        const target = {
          containerType: meta.containerType ?? null,
          containerId: meta.containerId ?? null,
          issueId: meta.issueId ?? null,
          documentId: meta.documentId ?? null,
          journalId: meta.journalId ?? null,
        };
        const canAttach = await userCanAccessAttachment(req.user, {
          authorId: req.user!.userId,
          ...target,
        });
        if (!canAttach) throw AppError.forbidden();
        const canWriteTarget = await userCanWriteAttachmentTarget(req.user, target);
        if (!canWriteTarget) throw AppError.forbidden();
      }

      const created = await prisma.$transaction(
        files.map((file) =>
          prisma.attachment.create({
            data: {
              filename: normalizeFilename(file.originalname),
              diskFilename: file.filename,
              filesize: file.size,
              contentType: file.mimetype || null,
              authorId: req.user!.userId,
              description: meta?.description ?? null,
              containerType: meta?.containerType ?? null,
              containerId: meta?.containerId ?? null,
              issueId: meta?.issueId ?? null,
              documentId: meta?.documentId ?? null,
              journalId: meta?.journalId ?? null,
            },
            select: {
              id: true,
              filename: true,
              diskFilename: true,
              filesize: true,
              contentType: true,
              description: true,
              containerType: true,
              containerId: true,
              issueId: true,
              documentId: true,
              authorId: true,
              createdAt: true,
            },
          }),
        ),
      );

      return sendSuccess(res, { attachments: created }, 201);
    } catch (err) {
      cleanupUploadedFiles(req);
      next(err);
    }
  },
);

router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const attachment = await prisma.attachment.findUnique({
        where: { id: String(req.params.id) },
        select: {
          id: true,
          filename: true,
          diskFilename: true,
          filesize: true,
          contentType: true,
          digest: true,
          description: true,
          containerType: true,
          containerId: true,
          issueId: true,
          documentId: true,
          authorId: true,
          createdAt: true,
        },
      });
      if (!attachment) throw AppError.notFound('添付が見つかりません');
      const canRead = await userCanAccessAttachment(req.user, attachment);
      if (!canRead) throw AppError.forbidden();
      return sendSuccess(res, { ...attachment, filename: normalizeFilename(attachment.filename) });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id/download',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const attachment = await prisma.attachment.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!attachment) throw AppError.notFound('添付が見つかりません');

      const canRead = await userCanAccessAttachment(req.user, attachment);
      if (!canRead) throw AppError.forbidden();

      const filePath = resolveUploadPath(attachment.diskFilename);
      if (!fs.existsSync(filePath)) {
        throw AppError.notFound('ファイルがディスク上に存在しません');
      }

      return res.download(filePath, normalizeFilename(attachment.filename), (err) => {
        if (err) next(err);
      });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const attachment = await prisma.attachment.findUnique({
        where: { id: String(req.params.id) },
      });
      if (!attachment) throw AppError.notFound('添付が見つかりません');

      if (!req.user!.admin && attachment.authorId !== req.user!.userId) {
        throw AppError.forbidden();
      }
      if (!req.user!.admin && !(await userCanWriteAttachmentTarget(req.user, attachment))) {
        throw AppError.forbidden();
      }

      const filePath = resolveUploadPath(attachment.diskFilename);
      await prisma.attachment.delete({ where: { id: String(req.params.id) } });
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
