import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const groups = await prisma.group.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { groupUsers: true } },
      },
    });
    return sendSuccess(
      res,
      groups.map(g => ({
        id: g.id,
        name: g.name,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        userCount: g._count.groupUsers,
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ name: z.string().min(1).max(255) }).parse(req.body);
    const group = await prisma.group.create({ data: { name: body.name } });
    return sendSuccess(res, group, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('このグループ名は既に使用されています'));
    }
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({ name: z.string().min(1).max(255) }).parse(req.body);
    const group = await prisma.group.update({
      where: { id },
      data: { name: body.name },
    });
    return sendSuccess(res, group);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('このグループ名は既に使用されています'));
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return next(AppError.notFound('グループが見つかりません'));
    }
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    await prisma.group.delete({ where: { id } });
    return sendSuccess(res, { ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return next(AppError.notFound('グループが見つかりません'));
    }
    next(err);
  }
});

router.post('/:id/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groupId = z.string().uuid().parse(req.params.id);
    const body = z.object({ userId: z.string().uuid() }).parse(req.body);

    const [group, user] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId } }),
      prisma.user.findUnique({ where: { id: body.userId } }),
    ]);
    if (!group) throw AppError.notFound('グループが見つかりません');
    if (!user) throw AppError.notFound('ユーザーが見つかりません');

    const link = await prisma.groupUser.create({
      data: { groupId, userId: body.userId },
    });
    return sendSuccess(res, link, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('このユーザーは既にグループに所属しています'));
    }
    next(err);
  }
});

router.delete('/:id/users/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groupId = z.string().uuid().parse(req.params.id);
    const userId = z.string().uuid().parse(req.params.userId);

    const result = await prisma.groupUser.deleteMany({
      where: { groupId, userId },
    });
    if (result.count === 0) {
      throw AppError.notFound('グループメンバーが見つかりません');
    }
    return sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
