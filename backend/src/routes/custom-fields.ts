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

const customFieldTypeSchema = z.enum(['IssueCustomField']);

const issueCustomFieldFormats = new Set([
  'string',
  'text',
  'int',
  'float',
  'list',
  'key_value',
  'date',
  'bool',
  'link',
  'user',
  'issue',
  'attachment',
  'progress',
]);

const createBodySchema = z.object({
  type: customFieldTypeSchema.default('IssueCustomField'),
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
  isForAll: z.boolean().optional(),
  defaultValue: z.string().nullable().optional(),
  position: z.number().int().min(1).optional(),
  trackerIds: z.array(z.string().uuid()).optional(),
  projectIds: z.array(z.string().uuid()).optional(),
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
  return fieldFormat === 'list' || fieldFormat === 'key_value';
}

function validateCustomFieldFormat(type: string, fieldFormat: string) {
  if (type === 'IssueCustomField' && !issueCustomFieldFormats.has(fieldFormat)) {
    throw AppError.badRequest('未対応の書式です');
  }
}

function validateDefaultValue(fieldFormat: string, defaultValue: string | null | undefined) {
  if (fieldFormat !== 'progress' || defaultValue === undefined || defaultValue === null || defaultValue === '') {
    return;
  }
  if (!/^\d+$/.test(defaultValue) || Number(defaultValue) < 0 || Number(defaultValue) > 100 || Number(defaultValue) % 10 !== 0) {
    throw AppError.badRequest('進捗バーのデフォルト値は 0 から 100 の10%区切りで入力してください');
  }
}

type CustomFieldWithRelations = Prisma.CustomFieldGetPayload<{
  include: {
    enumerations: true;
    customFieldTrackers: { include: { tracker: { select: { id: true; name: true } } } };
    projectCustomFields: { include: { project: { select: { id: true; name: true; identifier: true } } } };
  };
}>;

function serializeCustomField(field: CustomFieldWithRelations) {
  return {
    ...field,
    trackerIds: field.customFieldTrackers.map((row) => row.trackerId),
    projectIds: field.projectCustomFields.map((row) => row.projectId),
  };
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const typeParam = typeof req.query.type === 'string' ? req.query.type : undefined;
    if (typeParam !== undefined && !customFieldTypeSchema.safeParse(typeParam).success) {
      return next(AppError.badRequest('無効な type です'));
    }

    const fields = await prisma.customField.findMany({
      where: { type: 'IssueCustomField' },
      orderBy: [{ type: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      include: {
        enumerations: { orderBy: { position: 'asc' } },
        customFieldTrackers: { include: { tracker: { select: { id: true, name: true } } } },
        projectCustomFields: { include: { project: { select: { id: true, name: true, identifier: true } } } },
      },
    });
    sendSuccess(res, fields.map(serializeCustomField));
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
        projectCustomFields: { include: { project: { select: { id: true, name: true, identifier: true } } } },
      },
    });
    if (!field) {
      return next(AppError.notFound('カスタムフィールドが見つかりません'));
    }
    if (field.type !== 'IssueCustomField') {
      return next(AppError.notFound('カスタムフィールドが見つかりません'));
    }
    sendSuccess(res, serializeCustomField(field));
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
    const projectIds = data.projectIds ?? [];
    const isForAll = data.isForAll ?? true;
    validateCustomFieldFormat(data.type, data.fieldFormat);
    validateDefaultValue(data.fieldFormat, data.defaultValue);

    if (data.type === 'IssueCustomField' && trackerIds.length > 0) {
      const count = await prisma.tracker.count({ where: { id: { in: trackerIds } } });
      if (count !== trackerIds.length) {
        return next(AppError.badRequest('存在しないトラッカー ID が含まれています'));
      }
    } else if (data.type !== 'IssueCustomField' && trackerIds.length > 0) {
      return next(AppError.badRequest('trackerIds はチケット用カスタムフィールドでのみ指定できます'));
    }

    if (data.type !== 'IssueCustomField' && projectIds.length > 0) {
      return next(AppError.badRequest('projectIds はチケット用カスタムフィールドでのみ指定できます'));
    }
    if (!isForAll && projectIds.length > 0) {
      const count = await prisma.project.count({ where: { id: { in: projectIds } } });
      if (count !== projectIds.length) {
        return next(AppError.badRequest('存在しないプロジェクト ID が含まれています'));
      }
    }

    const maxPos = await prisma.customField.aggregate({ _max: { position: true } });
    const position = data.position ?? ((maxPos._max.position ?? 0) + 1);

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
          isForAll,
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

      if (created.type === 'IssueCustomField' && !created.isForAll && projectIds.length > 0) {
        await tx.projectCustomField.createMany({
          data: projectIds.map((projectId) => ({
            customFieldId: created.id,
            projectId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.customField.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          enumerations: { orderBy: { position: 'asc' } },
          customFieldTrackers: { include: { tracker: { select: { id: true, name: true } } } },
          projectCustomFields: { include: { project: { select: { id: true, name: true, identifier: true } } } },
        },
      });
    });

    sendSuccess(res, serializeCustomField(field), 201);
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
    if (existing.type !== 'IssueCustomField') {
      return next(AppError.notFound('カスタムフィールドが見つかりません'));
    }

    const data = parsed.data;
    const effectiveFieldFormat = data.fieldFormat ?? existing.fieldFormat;
    validateCustomFieldFormat(data.type ?? existing.type, effectiveFieldFormat);
    validateDefaultValue(
      effectiveFieldFormat,
      data.defaultValue !== undefined ? data.defaultValue : existing.defaultValue,
    );

    if (data.trackerIds !== undefined) {
      const effectiveType = data.type ?? existing.type;
      if (effectiveType !== 'IssueCustomField') {
        return next(AppError.badRequest('trackerIds はチケット用カスタムフィールドでのみ指定できます'));
      }
      const count = await prisma.tracker.count({ where: { id: { in: data.trackerIds } } });
      if (count !== data.trackerIds.length) {
        return next(AppError.badRequest('存在しないトラッカー ID が含まれています'));
      }
    }

    if (data.projectIds !== undefined) {
      const effectiveType = data.type ?? existing.type;
      if (effectiveType !== 'IssueCustomField') {
        return next(AppError.badRequest('projectIds はチケット用カスタムフィールドでのみ指定できます'));
      }
      const count = await prisma.project.count({ where: { id: { in: data.projectIds } } });
      if (count !== data.projectIds.length) {
        return next(AppError.badRequest('存在しないプロジェクト ID が含まれています'));
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
          ...(data.isForAll !== undefined ? { isForAll: data.isForAll } : {}),
          ...(data.defaultValue !== undefined ? { defaultValue: data.defaultValue } : {}),
          ...(data.position !== undefined ? { position: data.position } : {}),
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

      if (data.projectIds !== undefined || data.isForAll !== undefined) {
        await tx.projectCustomField.deleteMany({ where: { customFieldId: id } });
        const nextIsForAll = data.isForAll ?? existing.isForAll;
        const nextProjectIds = data.projectIds ?? [];
        if (!nextIsForAll && nextProjectIds.length > 0) {
          await tx.projectCustomField.createMany({
            data: nextProjectIds.map((projectId) => ({
              customFieldId: id,
              projectId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.customField.findUniqueOrThrow({
        where: { id },
        include: {
          enumerations: { orderBy: { position: 'asc' } },
          customFieldTrackers: { include: { tracker: { select: { id: true, name: true } } } },
          projectCustomFields: { include: { project: { select: { id: true, name: true, identifier: true } } } },
        },
      });
    });

    sendSuccess(res, serializeCustomField(field));
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
    if (existing.type !== 'IssueCustomField') {
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
    if (field.type !== 'IssueCustomField') {
      return next(AppError.notFound('カスタムフィールドが見つかりません'));
    }
    if (!isListFormat(field.fieldFormat)) {
      return next(
        AppError.badRequest('候補値の追加はリスト形式のカスタムフィールドでのみ可能です'),
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
    if (field.type !== 'IssueCustomField') {
      return next(AppError.notFound('カスタムフィールドが見つかりません'));
    }
    if (!isListFormat(field.fieldFormat)) {
      return next(
        AppError.badRequest('候補値の更新はリスト形式のカスタムフィールドでのみ可能です'),
      );
    }

    const existing = await prisma.customFieldEnumeration.findFirst({
      where: { id: enumId, customFieldId: id },
    });
    if (!existing) {
      return next(AppError.notFound('候補値が見つかりません'));
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
    if (field.type !== 'IssueCustomField') {
      return next(AppError.notFound('カスタムフィールドが見つかりません'));
    }
    if (!isListFormat(field.fieldFormat)) {
      return next(
        AppError.badRequest('候補値の削除はリスト形式のカスタムフィールドでのみ可能です'),
      );
    }

    const existing = await prisma.customFieldEnumeration.findFirst({
      where: { id: enumId, customFieldId: id },
    });
    if (!existing) {
      return next(AppError.notFound('候補値が見つかりません'));
    }

    await prisma.customFieldEnumeration.delete({ where: { id: enumId } });
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
