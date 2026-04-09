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

const router = Router({ mergeParams: true });

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

      const created = await Promise.all(
        files.map((file) =>
          prisma.attachment.create({
            data: {
              filename: file.originalname,
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
      return sendSuccess(res, attachment);
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

      const filePath = resolveUploadPath(attachment.diskFilename);
      if (!fs.existsSync(filePath)) {
        throw AppError.notFound('ファイルがディスク上に存在しません');
      }

      return res.download(filePath, attachment.filename, (err) => {
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
