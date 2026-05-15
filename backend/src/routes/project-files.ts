import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import multer from 'multer';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { config } from '../config';
import { requireProjectView } from '../utils/project-access';
import { hasAnyProjectPermission } from '../utils/project-permissions';

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

const router = Router({ mergeParams: true });
const MAX_PROJECT_FILE_SIZE = 5 * 1024 * 1024;
const projectFileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const normalizedName = normalizeFilename(file.originalname);
      const hash = crypto.randomUUID().replace(/-/g, '');
      const ext = path.extname(normalizedName);
      cb(null, `${hash}${ext}`);
    },
  }),
  limits: { fileSize: MAX_PROJECT_FILE_SIZE },
}).array('files', 10);

const uploadMetaSchema = z
  .object({
    description: z.string().optional(),
    descriptions: z.array(z.string()).optional(),
    versionId: z.string().uuid().nullable().optional(),
  })
  .optional();

function scoreFilename(s: string): number {
  const jp = (s.match(/[\u3040-\u30ff\u3400-\u9fff]/g) ?? []).length;
  const bad = (s.match(/[\u00e3\u00c3\u00e2\u00c2\u00a2\ufffd]/g) ?? []).length;
  return jp * 2 - bad * 2;
}

function normalizeFilename(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return scoreFilename(decoded) > scoreFilename(name) ? decoded : name;
}

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

async function requireFilesProject(req: Request) {
  return requireProjectView(req.user, req.params.projectId, ['view_files']);
}

async function canManageFiles(user: Express.Request['user'], projectId: string): Promise<boolean> {
  if (user?.admin) return true;
  if (!user?.userId) return false;
  return hasAnyProjectPermission(user.userId, user.admin, projectId, ['manage_files']);
}

async function enrichFiles<T extends { authorId: string; versionId: string | null; filename: string }>(files: T[]) {
  const authorIds = Array.from(new Set(files.map((file) => file.authorId)));
  const versionIds = Array.from(new Set(files.map((file) => file.versionId).filter((id): id is string => Boolean(id))));

  const [authors, versions] = await Promise.all([
    authorIds.length
      ? prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, login: true, firstname: true, lastname: true },
      })
      : [],
    versionIds.length
      ? prisma.version.findMany({
        where: { id: { in: versionIds } },
        select: { id: true, name: true, status: true, dueDate: true },
      })
      : [],
  ]);

  const authorMap = new Map(authors.map((author) => [author.id, author]));
  const versionMap = new Map(versions.map((version) => [version.id, version]));
  return files.map((file) => ({
    ...file,
    filename: normalizeFilename(file.filename),
    author: authorMap.get(file.authorId) ?? null,
    version: file.versionId ? versionMap.get(file.versionId) ?? null : null,
  }));
}

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const project = await requireFilesProject(req);
      const [files, versions] = await Promise.all([
        prisma.projectFile.findMany({
          where: { projectId: project.id },
          orderBy: [{ createdAt: 'desc' }],
          select: {
            id: true,
            projectId: true,
            filename: true,
            filesize: true,
            contentType: true,
            description: true,
            versionId: true,
            authorId: true,
            createdAt: true,
          },
        }),
        prisma.version.findMany({
          where: { projectId: project.id },
          orderBy: [{ dueDate: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, status: true, dueDate: true },
        }),
      ]);

      return sendSuccess(res, {
        files: await enrichFiles(files),
        versions,
        canManage: await canManageFiles(req.user, project.id),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  authenticate,
  (req: Request, res: Response, next: NextFunction) => {
    projectFileUpload(req, res, (err) => {
      if (err) cleanupUploadedFiles(req);
      if (err?.code === 'LIMIT_FILE_SIZE') {
        return next(AppError.badRequest('ファイルサイズが大きすぎます。上限は5MBです'));
      }
      return next(err);
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const project = await requireFilesProject(req);
      if (!(await canManageFiles(req.user, project.id))) throw AppError.forbidden();

      const files = (req as Request & { files?: MulterDiskFile[] }).files;
      if (!files?.length) throw AppError.badRequest('ファイルが選択されていません');
      if (files.some((file) => file.size > MAX_PROJECT_FILE_SIZE)) {
        throw AppError.badRequest('ファイルサイズが大きすぎます。上限は5MBです');
      }

      const meta = uploadMetaSchema.parse(
        typeof req.body.meta === 'string' ? JSON.parse(req.body.meta) : req.body.meta ?? undefined,
      );

      if (meta?.versionId) {
        const version = await prisma.version.findFirst({ where: { id: meta.versionId, projectId: project.id } });
        if (!version) throw AppError.badRequest('バージョンが正しくありません');
      }

      const created = await prisma.$transaction(
        files.map((file, index) =>
          prisma.projectFile.create({
            data: {
              projectId: project.id,
              filename: normalizeFilename(file.originalname),
              diskFilename: file.filename,
              filesize: file.size,
              contentType: file.mimetype || null,
              description: meta?.descriptions?.[index]?.trim() || meta?.description?.trim() || null,
              versionId: meta?.versionId || null,
              authorId: req.user!.userId,
            },
            select: {
              id: true,
              projectId: true,
              filename: true,
              filesize: true,
              contentType: true,
              description: true,
              versionId: true,
              authorId: true,
              createdAt: true,
            },
          }),
        ),
      );

      await prisma.activity.createMany({
        data: created.map((file, index) => ({
          projectId: project.id,
          userId: req.user!.userId,
          actType: 'file_add',
          actId: file.id,
          title: normalizeFilename(file.filename),
          description: meta?.descriptions?.[index]?.trim() || meta?.description?.trim() || null,
        })),
      });

      return sendSuccess(res, { files: await enrichFiles(created) }, 201);
    } catch (err) {
      cleanupUploadedFiles(req);
      next(err);
    }
  },
);

router.get(
  '/:id/download',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const project = await requireFilesProject(req);
      const file = await prisma.projectFile.findFirst({
        where: { id: String(req.params.id), projectId: project.id },
      });
      if (!file) throw AppError.notFound('ファイルが見つかりません');

      const filePath = resolveUploadPath(file.diskFilename);
      if (!fs.existsSync(filePath)) throw AppError.notFound('ファイルがディスク上に存在しません');

      return res.download(filePath, normalizeFilename(file.filename), (err) => {
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
      const project = await requireFilesProject(req);
      if (!(await canManageFiles(req.user, project.id))) throw AppError.forbidden();

      const file = await prisma.projectFile.findFirst({
        where: { id: String(req.params.id), projectId: project.id },
      });
      if (!file) throw AppError.notFound('ファイルが見つかりません');

      const filePath = resolveUploadPath(file.diskFilename);
      await prisma.projectFile.delete({ where: { id: file.id } });
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      await prisma.activity.create({
        data: {
          projectId: project.id,
          userId: req.user!.userId,
          actType: 'file_delete',
          actId: file.id,
          title: normalizeFilename(file.filename),
          description: file.description,
        },
      });

      return sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
