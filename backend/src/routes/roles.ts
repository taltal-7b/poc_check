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
    const roles = await prisma.role.findMany();
    // Normalize permissions to array format
    const normalized = roles.map(r => ({
      ...r,
      permissions: Array.isArray(r.permissions) ? r.permissions : [],
    }));
    return sendSuccess(res, normalized);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) {
      throw AppError.notFound('ロールが見つかりません');
    }
    // Normalize permissions to array format
    const normalized = {
      ...role,
      permissions: Array.isArray(role.permissions) ? role.permissions : [],
    };
    return sendSuccess(res, normalized);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z
      .object({
        name: z.string().min(1).max(255),
        position: z.number().int().optional(),
        assignable: z.boolean().optional(),
        builtin: z.number().int().min(0).max(2).optional(),
        permissions: z.array(z.unknown()).optional(),
      })
      .parse(req.body);

    const role = await prisma.role.create({
      data: {
        name: body.name,
        position: body.position ?? 0,
        assignable: body.assignable ?? true,
        builtin: body.builtin ?? 0,
        permissions: (body.permissions ?? []) as Prisma.InputJsonValue,
      },
    });
    // Normalize permissions to array format
    const normalized = {
      ...role,
      permissions: Array.isArray(role.permissions) ? role.permissions : [],
    };
    return sendSuccess(res, normalized, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('このロール名は既に使用されています'));
    }
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    
    // Check if trying to edit 管理者 role
    const existingRole = await prisma.role.findUnique({ where: { id } });
    if (existingRole?.name === '管理者') {
      return next(AppError.forbidden('管理者ロールは編集できません'));
    }
    
    const body = z
      .object({
        name: z.string().min(1).max(255).optional(),
        position: z.number().int().optional(),
        assignable: z.boolean().optional(),
        builtin: z.number().int().min(0).max(2).optional(),
        permissions: z.array(z.unknown()).optional(),
      })
      .parse(req.body);

    const data: Prisma.RoleUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.position !== undefined) data.position = body.position;
    if (body.assignable !== undefined) data.assignable = body.assignable;
    if (body.builtin !== undefined) data.builtin = body.builtin;
    if (body.permissions !== undefined) {
      data.permissions = body.permissions as Prisma.InputJsonValue;
    }

    const role = await prisma.role.update({
      where: { id },
      data,
    });
    // Normalize permissions to array format
    const normalized = {
      ...role,
      permissions: Array.isArray(role.permissions) ? role.permissions : [],
    };
    return sendSuccess(res, normalized);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('このロール名は既に使用されています'));
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return next(AppError.notFound('ロールが見つかりません'));
    }
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    
    // Check if trying to delete 管理者 role
    const existingRole = await prisma.role.findUnique({ where: { id } });
    if (existingRole?.name === '管理者') {
      return next(AppError.forbidden('管理者ロールは削除できません'));
    }
    
    await prisma.role.delete({ where: { id } });
    return sendSuccess(res, { ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return next(AppError.notFound('ロールが見つかりません'));
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      return next(AppError.conflict('このロールは参照されているため削除できません'));
    }
    next(err);
  }
});

export default router;
