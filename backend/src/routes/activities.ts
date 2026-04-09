import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { sendPaginated, parsePagination } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { Prisma } from '@prisma/client';

const router = Router();

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);
      const where: Prisma.ActivityWhereInput = {};

      const projectId = req.query.project_id;
      if (typeof projectId === 'string' && projectId.length > 0) {
        where.projectId = projectId;
      }

      const userId = req.query.user_id;
      if (typeof userId === 'string' && userId.length > 0) {
        where.userId = userId;
      }

      const from = req.query.from;
      const to = req.query.to;
      if (typeof from === 'string' && from.length > 0) {
        where.createdAt = { ...(where.createdAt as object), gte: new Date(from) };
      }
      if (typeof to === 'string' && to.length > 0) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter), lte: end };
      }

      const [total, rows] = await Promise.all([
        prisma.activity.count({ where }),
        prisma.activity.findMany({
          where,
          skip,
          take: perPage,
          orderBy: { createdAt: 'desc' },
          include: {
            project: { select: { id: true, name: true, identifier: true } },
          },
        }),
      ]);

      return sendPaginated(res, rows, {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage) || 1,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
