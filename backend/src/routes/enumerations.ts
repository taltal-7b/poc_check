import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate, requireAdmin } from '../middleware/auth';
import { z } from 'zod';

const router = Router({ mergeParams: true });

function pickParam(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v[0] !== undefined) return v[0];
  return undefined;
}

function zodMessage(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join('; ');
}

const enumerationTypeSchema = z.enum(['IssuePriority', 'DocumentCategory', 'TimeEntryActivity']);

const createBodySchema = z.object({
  type: enumerationTypeSchema,
  name: z.string().min(1).max(255),
  position: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

const updateBodySchema = z.object({
  type: enumerationTypeSchema.optional(),
  name: z.string().min(1).max(255).optional(),
  position: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

router.use(authenticate, requireAdmin);

async function assertEnumerationNotInUse(id: string, type: string): Promise<void> {
  if (type === 'TimeEntryActivity') {
    const n = await prisma.timeEntry.count({ where: { activityId: id } });
    if (n > 0) {
      throw AppError.conflict(
        'この活動種別を参照している工数があるため削除できません',
        'ENUMERATION_IN_USE',
      );
    }
  }
  if (type === 'DocumentCategory') {
    const n = await prisma.document.count({ where: { categoryId: id } });
    if (n > 0) {
      throw AppError.conflict(
        'このカテゴリを参照している文書があるため削除できません',
        'ENUMERATION_IN_USE',
      );
    }
  }
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const typeParam = typeof req.query.type === 'string' ? req.query.type : undefined;
    if (typeParam !== undefined && !enumerationTypeSchema.safeParse(typeParam).success) {
      return next(AppError.badRequest('無効な type です'));
    }

    const where = typeParam ? { type: typeParam } : {};
    const items = await prisma.enumeration.findMany({
      where,
      orderBy: [{ type: 'asc' }, { position: 'asc' }, { name: 'asc' }],
    });
    sendSuccess(res, items);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const item = await prisma.enumeration.findUnique({ where: { id } });
    if (!item) {
      return next(AppError.notFound('列挙が見つかりません'));
    }
    sendSuccess(res, item);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.badRequest(zodMessage(parsed.error)));
    }

    const { type, name, position: bodyPosition, isDefault, active } = parsed.data;

    let position = bodyPosition;
    if (position === undefined) {
      const maxPos = await prisma.enumeration.aggregate({
        where: { type },
        _max: { position: true },
      });
      position = (maxPos._max.position ?? -1) + 1;
    }

    const item = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.enumeration.updateMany({
          where: { type },
          data: { isDefault: false },
        });
      }

      return tx.enumeration.create({
        data: {
          type,
          name,
          position,
          isDefault: isDefault ?? false,
          active: active ?? true,
        },
      });
    });

    sendSuccess(res, item, 201);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const parsed = updateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.badRequest(zodMessage(parsed.error)));
    }

    const existing = await prisma.enumeration.findUnique({ where: { id } });
    if (!existing) {
      return next(AppError.notFound('列挙が見つかりません'));
    }

    const nextType = parsed.data.type ?? existing.type;

    const item = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault === true) {
        await tx.enumeration.updateMany({
          where: { type: nextType, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.enumeration.update({
        where: { id },
        data: {
          ...(parsed.data.type !== undefined ? { type: parsed.data.type } : {}),
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.position !== undefined ? { position: parsed.data.position } : {}),
          ...(parsed.data.isDefault !== undefined ? { isDefault: parsed.data.isDefault } : {}),
          ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
        },
      });
    });

    sendSuccess(res, item);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const existing = await prisma.enumeration.findUnique({ where: { id } });
    if (!existing) {
      return next(AppError.notFound('列挙が見つかりません'));
    }

    try {
      await assertEnumerationNotInUse(id, existing.type);
    } catch (e) {
      return next(e);
    }

    await prisma.enumeration.delete({ where: { id } });
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
