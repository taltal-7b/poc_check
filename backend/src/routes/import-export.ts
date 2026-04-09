import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import PDFDocument from 'pdfkit';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate, requireAdmin } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const router = Router();
const BCRYPT_ROUNDS = 12;
const importFile = upload.single('file');

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

type RequestWithFile = Request & { file?: MulterDiskFile };

function issueExportWhere(query: Request['query']): Prisma.IssueWhereInput {
  const where: Prisma.IssueWhereInput = {};
  if (typeof query.project_id === 'string' && query.project_id.length > 0) {
    where.projectId = query.project_id;
  }
  if (typeof query.tracker_id === 'string' && query.tracker_id.length > 0) {
    where.trackerId = query.tracker_id;
  }
  if (typeof query.status_id === 'string' && query.status_id.length > 0) {
    where.statusId = query.status_id;
  }
  if (typeof query.assignee_id === 'string' && query.assignee_id.length > 0) {
    where.assigneeId = query.assignee_id;
  }
  if (typeof query.author_id === 'string' && query.author_id.length > 0) {
    where.authorId = query.author_id;
  }
  if (typeof query.q === 'string' && query.q.trim().length > 0) {
    const q = query.q.trim();
    where.OR = [
      { subject: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

router.post(
  '/issues',
  authenticate,
  importFile,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = (req as RequestWithFile).file;
      if (!file?.path) {
        throw AppError.badRequest('CSV ファイル (file) が必要です');
      }

      const content = fs.readFileSync(file.path, 'utf8');
      let records: Record<string, string>[];
      try {
        records = parse(content, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }) as Record<string, string>[];
      } catch (e) {
        throw AppError.badRequest(`CSV の解析に失敗しました: ${(e as Error).message}`);
      } finally {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }

      const rowSchema = z.object({
        project_id: z.string().uuid(),
        tracker_id: z.string().uuid(),
        status_id: z.string().uuid(),
        subject: z.string().min(1),
        description: z.string().optional(),
        priority: z.coerce.number().int().min(1).max(5).optional(),
        assignee_id: z.string().uuid().optional().or(z.literal('')),
      });

      const errors: { row: number; message: string }[] = [];
      let imported = 0;
      const authorId = req.user!.userId;

      for (let i = 0; i < records.length; i++) {
        const rowNum = i + 2;
        try {
          const raw = records[i];
          const row = rowSchema.parse({
            ...raw,
            project_id: raw.project_id ?? raw.projectId,
            tracker_id: raw.tracker_id ?? raw.trackerId,
            status_id: raw.status_id ?? raw.statusId,
            assignee_id: raw.assignee_id ?? raw.assigneeId,
          });

          const project = await prisma.project.findUnique({ where: { id: row.project_id } });
          if (!project) {
            errors.push({ row: rowNum, message: 'プロジェクトが存在しません' });
            continue;
          }
          const tracker = await prisma.tracker.findUnique({ where: { id: row.tracker_id } });
          if (!tracker) {
            errors.push({ row: rowNum, message: 'トラッカーが存在しません' });
            continue;
          }
          const status = await prisma.issueStatus.findUnique({ where: { id: row.status_id } });
          if (!status) {
            errors.push({ row: rowNum, message: 'ステータスが存在しません' });
            continue;
          }

          let assigneeId: string | null = null;
          if (row.assignee_id && row.assignee_id.length > 0) {
            const u = await prisma.user.findUnique({ where: { id: row.assignee_id } });
            if (!u) {
              errors.push({ row: rowNum, message: '担当ユーザーが存在しません' });
              continue;
            }
            assigneeId = row.assignee_id;
          }

          await prisma.issue.create({
            data: {
              projectId: row.project_id,
              trackerId: row.tracker_id,
              statusId: row.status_id,
              subject: row.subject,
              description: row.description || null,
              priority: row.priority ?? 2,
              authorId,
              assigneeId,
            },
          });
          imported += 1;
        } catch (e) {
          if (e instanceof z.ZodError) {
            errors.push({ row: rowNum, message: e.errors.map((x) => x.message).join('; ') });
          } else {
            errors.push({ row: rowNum, message: (e as Error).message });
          }
        }
      }

      return sendSuccess(res, { imported, errors });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/time_entries',
  authenticate,
  importFile,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = (req as RequestWithFile).file;
      if (!file?.path) {
        throw AppError.badRequest('CSV ファイル (file) が必要です');
      }

      const content = fs.readFileSync(file.path, 'utf8');
      let records: Record<string, string>[];
      try {
        records = parse(content, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }) as Record<string, string>[];
      } catch (e) {
        throw AppError.badRequest(`CSV の解析に失敗しました: ${(e as Error).message}`);
      } finally {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }

      const rowSchema = z.object({
        project_id: z.string().uuid(),
        activity_id: z.string().uuid(),
        hours: z.coerce.number().positive(),
        spent_on: z.coerce.date(),
        comments: z.string().optional(),
        issue_id: z.string().uuid().optional().or(z.literal('')),
        user_id: z.string().uuid().optional().or(z.literal('')),
      });

      const errors: { row: number; message: string }[] = [];
      let imported = 0;

      for (let i = 0; i < records.length; i++) {
        const rowNum = i + 2;
        try {
          const raw = records[i];
          const row = rowSchema.parse({
            ...raw,
            project_id: raw.project_id ?? raw.projectId,
            activity_id: raw.activity_id ?? raw.activityId,
            spent_on: raw.spent_on ?? raw.spentOn,
            issue_id: raw.issue_id ?? raw.issueId,
            user_id: raw.user_id ?? raw.userId,
          });

          const targetUserId =
            row.user_id && row.user_id.length > 0 ? row.user_id : req.user!.userId;

          if (targetUserId !== req.user!.userId && !req.user!.admin) {
            errors.push({ row: rowNum, message: '他ユーザーの工数はインポートできません' });
            continue;
          }

          const project = await prisma.project.findUnique({ where: { id: row.project_id } });
          if (!project) {
            errors.push({ row: rowNum, message: 'プロジェクトが存在しません' });
            continue;
          }

          const activity = await prisma.enumeration.findFirst({
            where: { id: row.activity_id, type: 'TimeEntryActivity', active: true },
          });
          if (!activity) {
            errors.push({ row: rowNum, message: '作業分類が無効です' });
            continue;
          }

          let issueId: string | null = null;
          if (row.issue_id && row.issue_id.length > 0) {
            const issue = await prisma.issue.findFirst({
              where: { id: row.issue_id, projectId: row.project_id },
            });
            if (!issue) {
              errors.push({ row: rowNum, message: 'チケットがプロジェクトに存在しません' });
              continue;
            }
            issueId = row.issue_id;
          }

          await prisma.timeEntry.create({
            data: {
              projectId: row.project_id,
              issueId,
              userId: targetUserId,
              activityId: row.activity_id,
              hours: row.hours,
              comments: row.comments || null,
              spentOn: row.spent_on,
            },
          });
          imported += 1;
        } catch (e) {
          if (e instanceof z.ZodError) {
            errors.push({ row: rowNum, message: e.errors.map((x) => x.message).join('; ') });
          } else {
            errors.push({ row: rowNum, message: (e as Error).message });
          }
        }
      }

      return sendSuccess(res, { imported, errors });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/users',
  authenticate,
  requireAdmin,
  importFile,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = (req as RequestWithFile).file;
      if (!file?.path) {
        throw AppError.badRequest('CSV ファイル (file) が必要です');
      }

      const content = fs.readFileSync(file.path, 'utf8');
      let records: Record<string, string>[];
      try {
        records = parse(content, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        }) as Record<string, string>[];
      } catch (e) {
        throw AppError.badRequest(`CSV の解析に失敗しました: ${(e as Error).message}`);
      } finally {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      }

      const rowSchema = z.object({
        login: z.string().min(1),
        firstname: z.string().min(1),
        lastname: z.string().min(1),
        mail: z.string().email(),
        password: z.string().min(8),
        admin: z
          .union([z.string(), z.boolean()])
          .optional()
          .transform((v) => {
            if (v === undefined || v === '') return false;
            if (typeof v === 'boolean') return v;
            return ['1', 'true', 'yes', 'Y'].includes(v.toLowerCase());
          }),
      });

      const errors: { row: number; message: string }[] = [];
      let imported = 0;

      for (let i = 0; i < records.length; i++) {
        const rowNum = i + 2;
        try {
          const row = rowSchema.parse(records[i]);
          const hashedPassword = await bcrypt.hash(row.password, BCRYPT_ROUNDS);
          await prisma.user.create({
            data: {
              login: row.login,
              firstname: row.firstname,
              lastname: row.lastname,
              mail: row.mail,
              hashedPassword,
              admin: row.admin ?? false,
              status: 1,
            },
          });
          imported += 1;
        } catch (e) {
          if (e instanceof z.ZodError) {
            errors.push({ row: rowNum, message: e.errors.map((x) => x.message).join('; ') });
          } else if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            errors.push({ row: rowNum, message: 'ログインまたはメールが重複しています' });
          } else {
            errors.push({ row: rowNum, message: (e as Error).message });
          }
        }
      }

      return sendSuccess(res, { imported, errors });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/issues/csv',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const where = issueExportWhere(req.query);
      const issues = await prisma.issue.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 10_000,
        include: {
          project: { select: { identifier: true, name: true } },
          tracker: { select: { name: true } },
          status: { select: { name: true } },
          assignee: { select: { login: true } },
        },
      });

      const rows = issues.map((issue) => ({
        id: issue.id,
        project_id: issue.projectId,
        project_identifier: issue.project.identifier,
        tracker: issue.tracker.name,
        status: issue.status.name,
        priority: issue.priority,
        subject: issue.subject,
        description: issue.description ?? '',
        assignee_login: issue.assignee?.login ?? '',
        updated_at: issue.updatedAt.toISOString(),
      }));

      const csv = stringify(rows, { header: true });
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', 'attachment; filename="issues.csv"');
      return res.status(200).send('\uFEFF' + csv);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/issues/pdf',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const where = issueExportWhere(req.query);
      const issues = await prisma.issue.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: 500,
        include: {
          project: { select: { identifier: true } },
          status: { select: { name: true } },
        },
      });

      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', 'attachment; filename="issues.pdf"');

      const doc = new PDFDocument({ margin: 36, size: 'A4' });
      doc.pipe(res);

      doc.fontSize(16).font('Helvetica-Bold').text('Issues export');
      doc.font('Helvetica');
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#666666').text(`Generated: ${new Date().toISOString()}`);
      doc.moveDown();
      doc.fillColor('#000000');

      const colX = [40, 130, 280, 360];
      const headerY = doc.y;
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('ID', colX[0], headerY, { width: 80, continued: false });
      doc.text('Project', colX[1], headerY, { width: 140, continued: false });
      doc.text('Subject', colX[2], headerY, { width: 200, continued: false });
      doc.text('Status', colX[3], headerY, { width: 120, continued: false });
      doc.font('Helvetica');
      doc.moveDown(1.2);

      for (const issue of issues) {
        if (doc.y > doc.page.height - 80) {
          doc.addPage();
        }
        const y = doc.y;
        const shortId = issue.id.slice(0, 8);
        doc.fontSize(8).text(shortId, colX[0], y, { width: 80 });
        doc.text(issue.project.identifier, colX[1], y, { width: 140 });
        doc.text(issue.subject.slice(0, 80), colX[2], y, { width: 200 });
        doc.text(issue.status.name, colX[3], y, { width: 120 });
        doc.moveDown(0.6);
      }

      doc.end();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
