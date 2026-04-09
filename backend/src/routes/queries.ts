import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const router = Router();

const createBodySchema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).default('IssueQuery'),
  projectId: z.string().uuid().optional().nullable(),
  visibility: z.number().int().min(0).max(2).default(0),
  filters: z.record(z.unknown()).default({}),
  columns: z.array(z.unknown()).default([]),
  sortCriteria: z.array(z.unknown()).default([]),
  groupBy: z.string().optional().nullable(),
});

const updateBodySchema = createBodySchema.partial();

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.userId;
      const rows = await prisma.query.findMany({
        where: {
          OR: [{ userId }, { visibility: 2 }],
        },
        orderBy: [{ updatedAt: 'desc' }],
        include: {
          project: { select: { id: true, name: true, identifier: true } },
          user: { select: { id: true, login: true, firstname: true, lastname: true } },
        },
      });
      return sendSuccess(res, rows);
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
      const row = await prisma.query.findUnique({
        where: { id: String(req.params.id) },
        include: {
          project: { select: { id: true, name: true, identifier: true } },
          user: { select: { id: true, login: true, firstname: true, lastname: true } },
        },
      });
      if (!row) throw AppError.notFound('クエリが見つかりません');

      const isOwner = row.userId === req.user!.userId;
      const isPublic = row.visibility === 2;
      if (!isOwner && !isPublic && !req.user!.admin) {
        throw AppError.forbidden();
      }

      return sendSuccess(res, row);
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createBodySchema.parse(req.body);

      if (body.projectId) {
        const p = await prisma.project.findUnique({ where: { id: body.projectId } });
        if (!p) throw AppError.notFound('プロジェクトが見つかりません');
      }

      const data: Prisma.QueryCreateInput = {
        name: body.name,
        type: body.type,
        visibility: body.visibility,
        filters: body.filters as Prisma.InputJsonValue,
        columns: body.columns as Prisma.InputJsonValue,
        sortCriteria: body.sortCriteria as Prisma.InputJsonValue,
        groupBy: body.groupBy ?? null,
        user: { connect: { id: req.user!.userId } },
      };
      if (body.projectId) {
        data.project = { connect: { id: body.projectId } };
      }

      const row = await prisma.query.create({
        data,
        include: {
          project: { select: { id: true, name: true, identifier: true } },
          user: { select: { id: true, login: true, firstname: true, lastname: true } },
        },
      });

      return sendSuccess(res, row, 201);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return next(AppError.badRequest(err.errors.map((e) => e.message).join('; ')));
      }
      next(err);
    }
  },
);

router.put(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.query.findUnique({ where: { id: String(req.params.id) } });
      if (!existing) throw AppError.notFound('クエリが見つかりません');

      const isOwner = existing.userId === req.user!.userId;
      if (!isOwner && !req.user!.admin) {
        throw AppError.forbidden();
      }

      const body = updateBodySchema.parse(req.body);

      if (body.projectId) {
        const p = await prisma.project.findUnique({ where: { id: body.projectId } });
        if (!p) throw AppError.notFound('プロジェクトが見つかりません');
      }

      const data: Prisma.QueryUpdateInput = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.type !== undefined) data.type = body.type;
      if (body.visibility !== undefined) data.visibility = body.visibility;
      if (body.filters !== undefined) data.filters = body.filters as Prisma.InputJsonValue;
      if (body.columns !== undefined) data.columns = body.columns as Prisma.InputJsonValue;
      if (body.sortCriteria !== undefined) data.sortCriteria = body.sortCriteria as Prisma.InputJsonValue;
      if (body.groupBy !== undefined) data.groupBy = body.groupBy;

      if (body.projectId !== undefined) {
        data.project = body.projectId
          ? { connect: { id: body.projectId } }
          : { disconnect: true };
      }

      const row = await prisma.query.update({
        where: { id: String(req.params.id) },
        data,
        include: {
          project: { select: { id: true, name: true, identifier: true } },
          user: { select: { id: true, login: true, firstname: true, lastname: true } },
        },
      });

      return sendSuccess(res, row);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return next(AppError.badRequest(err.errors.map((e) => e.message).join('; ')));
      }
      next(err);
    }
  },
);

router.delete(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await prisma.query.findUnique({ where: { id: String(req.params.id) } });
      if (!existing) throw AppError.notFound('クエリが見つかりません');

      const isOwner = existing.userId === req.user!.userId;
      if (!isOwner && !req.user!.admin) {
        throw AppError.forbidden();
      }

      await prisma.query.delete({ where: { id: String(req.params.id) } });
      return sendSuccess(res, { deleted: true });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
