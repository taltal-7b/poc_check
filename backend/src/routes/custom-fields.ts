import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
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

const customFieldTypeSchema = z.enum([
  'IssueCustomField',
  'ProjectCustomField',
  'UserCustomField',
  'TimeEntryCustomField',
  'VersionCustomField',
]);

const createBodySchema = z.object({
  type: customFieldTypeSchema,
  name: z.string().min(1).max(255),
  fieldFormat: z.string().min(1).max(64),
  possibleValues: z.unknown().optional().nullable(),
  regexp: z.string().nullable().optional(),
  minLength: z.number().int().nullable().optional(),
  maxLength: z.number().int().nullable().optional(),
  isRequired: z.boolean().optional(),
  isFilter: z.boolean().optional(),
  searchable: z.boolean().optional(),
  multiple: z.boolean().optional(),
  defaultValue: z.string().nullable().optional(),
  trackerIds: z.array(z.string().uuid()).optional(),
});

const updateBodySchema = createBodySchema.partial();

const enumerationBodySchema = z.object({
  name: z.string().min(1).max(255),
  position: z.number().int().optional(),
  active: z.boolean().optional(),
});

const enumerationUpdateSchema = enumerationBodySchema.partial();

router.use(authenticate, requireAdmin);

function isListFormat(fieldFormat: string): boolean {
  return fieldFormat === 'list';
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const typeParam = typeof req.query.type === 'string' ? req.query.type : undefined;
    if (typeParam !== undefined && !customFieldTypeSchema.safeParse(typeParam).success) {
      return next(AppError.badRequest('無効な type です'));
    }

    const where = typeParam ? { type: typeParam } : {};
    const fields = await prisma.customField.findMany({
      where,
      orderBy: [{ type: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      include: {
        customFieldTrackers: { include: { tracker: { select: { id: true, name: true } } } },
      },
    });
    sendSuccess(res, fields);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const field = await prisma.customField.findUnique({
      where: { id },
      include: {
        enumerations: { orderBy: { position: 'asc' } },
        customFieldTrackers: { include: { tracker: { select: { id: true, name: true } } } },
      },
    });
    if (!field) {
      return next(AppError.notFound('カスタムフィールドが見つかりません'));
    }
    sendSuccess(res, field);
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

    const data = parsed.data;
    const trackerIds = data.trackerIds ?? [];

    if (data.type === 'IssueCustomField' && trackerIds.length > 0) {
      const count = await prisma.tracker.count({ where: { id: { in: trackerIds } } });
      if (count !== trackerIds.length) {
        return next(AppError.badRequest('存在しないトラッカー ID が含まれています'));
      }
    } else if (data.type !== 'IssueCustomField' && trackerIds.length > 0) {
      return next(AppError.badRequest('trackerIds は Issue 用カスタムフィールドでのみ指定できます'));
    }

    const maxPos = await prisma.customField.aggregate({ _max: { position: true } });
    const position = (maxPos._max.position ?? -1) + 1;

    const possibleValues =
      data.possibleValues === undefined || data.possibleValues === null
        ? undefined
        : (data.possibleValues as Prisma.InputJsonValue);

    const field = await prisma.$transaction(async (tx) => {
      const created = await tx.customField.create({
        data: {
          type: data.type,
          name: data.name,
          fieldFormat: data.fieldFormat,
          possibleValues,
          regexp: data.regexp ?? null,
          minLength: data.minLength ?? null,
          maxLength: data.maxLength ?? null,
          isRequired: data.isRequired ?? false,
          isFilter: data.isFilter ?? false,
          searchable: data.searchable ?? false,
          multiple: data.multiple ?? false,
          defaultValue: data.defaultValue ?? null,
          position,
        },
      });

      if (data.type === 'IssueCustomField' && trackerIds.length > 0) {
        await tx.customFieldTracker.createMany({
          data: trackerIds.map((trackerId) => ({
            customFieldId: created.id,
            trackerId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.customField.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          enumerations: { orderBy: { position: 'asc' } },
          customFieldTrackers: { include: { tracker: { select: { id: true, name: true } } } },
        },
      });
    });

    sendSuccess(res, field, 201);
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

    const existing = await prisma.customField.findUnique({ where: { id } });
    if (!existing) {
      return next(AppError.notFound('カスタムフィールドが見つかりません'));
    }

    const data = parsed.data;

    if (data.trackerIds !== undefined) {
      const effectiveType = data.type ?? existing.type;
      if (effectiveType !== 'IssueCustomField') {
        return next(AppError.badRequest('trackerIds は Issue 用カスタムフィールドでのみ指定できます'));
      }
      const count = await prisma.tracker.count({ where: { id: { in: data.trackerIds } } });
      if (count !== data.trackerIds.length) {
        return next(AppError.badRequest('存在しないトラッカー ID が含まれています'));
      }
    }

    let possibleValues: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
    if (data.possibleValues !== undefined) {
      possibleValues =
        data.possibleValues === null ? Prisma.JsonNull : (data.possibleValues as Prisma.InputJsonValue);
    }

    const field = await prisma.$transaction(async (tx) => {
      await tx.customField.update({
        where: { id },
        data: {
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.fieldFormat !== undefined ? { fieldFormat: data.fieldFormat } : {}),
          ...(possibleValues !== undefined ? { possibleValues } : {}),
          ...(data.regexp !== undefined ? { regexp: data.regexp } : {}),
          ...(data.minLength !== undefined ? { minLength: data.minLength } : {}),
          ...(data.maxLength !== undefined ? { maxLength: data.maxLength } : {}),
          ...(data.isRequired !== undefined ? { isRequired: data.isRequired } : {}),
          ...(data.isFilter !== undefined ? { isFilter: data.isFilter } : {}),
          ...(data.searchable !== undefined ? { searchable: data.searchable } : {}),
          ...(data.multiple !== undefined ? { multiple: data.multiple } : {}),
          ...(data.defaultValue !== undefined ? { defaultValue: data.defaultValue } : {}),
        },
      });

      if (data.trackerIds !== undefined) {
        await tx.customFieldTracker.deleteMany({ where: { customFieldId: id } });
        if (data.trackerIds.length > 0) {
          await tx.customFieldTracker.createMany({
            data: data.trackerIds.map((trackerId) => ({
              customFieldId: id,
              trackerId,
            })),
          });
        }
      }

      return tx.customField.findUniqueOrThrow({
        where: { id },
        include: {
          enumerations: { orderBy: { position: 'asc' } },
          customFieldTrackers: { include: { tracker: { select: { id: true, name: true } } } },
        },
      });
    });

    sendSuccess(res, field);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const existing = await prisma.customField.findUnique({ where: { id } });
    if (!existing) {
      return next(AppError.notFound('カスタムフィールドが見つかりません'));
    }

    await prisma.customField.delete({ where: { id } });
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/enumerations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const parsed = z
      .object({
        name: z.string().min(1).max(255),
        position: z.number().int().optional(),
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.badRequest(zodMessage(parsed.error)));
    }

    const field = await prisma.customField.findUnique({ where: { id } });
    if (!field) {
      return next(AppError.notFound('カスタムフィールドが見つかりません'));
    }
    if (!isListFormat(field.fieldFormat)) {
      return next(
        AppError.badRequest('列挙の追加は fieldFormat が list のカスタムフィールドのみ可能です'),
      );
    }

    let position = parsed.data.position;
    if (position === undefined) {
      const maxPos = await prisma.customFieldEnumeration.aggregate({
        where: { customFieldId: id },
        _max: { position: true },
      });
      position = (maxPos._max.position ?? -1) + 1;
    }

    const enumeration = await prisma.customFieldEnumeration.create({
      data: {
        customFieldId: id,
        name: parsed.data.name,
        position,
        active: parsed.data.active ?? true,
      },
    });
    sendSuccess(res, enumeration, 201);
  } catch (err) {
    next(err);
  }
});

router.put('/:id/enumerations/:enumId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    const enumId = pickParam(req.params.enumId);
    if (!id || !enumId) return next(AppError.badRequest('ID が無効です'));
    const parsed = enumerationUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.badRequest(zodMessage(parsed.error)));
    }

    const field = await prisma.customField.findUnique({ where: { id } });
    if (!field) {
      return next(AppError.notFound('カスタムフィールドが見つかりません'));
    }
    if (!isListFormat(field.fieldFormat)) {
      return next(
        AppError.badRequest('列挙の更新は fieldFormat が list のカスタムフィールドのみ可能です'),
      );
    }

    const existing = await prisma.customFieldEnumeration.findFirst({
      where: { id: enumId, customFieldId: id },
    });
    if (!existing) {
      return next(AppError.notFound('列挙が見つかりません'));
    }

    const enumeration = await prisma.customFieldEnumeration.update({
      where: { id: enumId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.position !== undefined ? { position: parsed.data.position } : {}),
        ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
      },
    });
    sendSuccess(res, enumeration);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/enumerations/:enumId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    const enumId = pickParam(req.params.enumId);
    if (!id || !enumId) return next(AppError.badRequest('ID が無効です'));

    const field = await prisma.customField.findUnique({ where: { id } });
    if (!field) {
      return next(AppError.notFound('カスタムフィールドが見つかりません'));
    }
    if (!isListFormat(field.fieldFormat)) {
      return next(
        AppError.badRequest('列挙の削除は fieldFormat が list のカスタムフィールドのみ可能です'),
      );
    }

    const existing = await prisma.customFieldEnumeration.findFirst({
      where: { id: enumId, customFieldId: id },
    });
    if (!existing) {
      return next(AppError.notFound('列挙が見つかりません'));
    }

    await prisma.customFieldEnumeration.delete({ where: { id: enumId } });
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
