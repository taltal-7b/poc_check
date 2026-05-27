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

const createBodySchema = z.object({
  name: z.string().min(1).max(255),
  defaultStatusId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  position: z.number().int().min(0).optional(),
  standardFields: z.array(z.object({
    fieldKey: z.string().min(1).max(64),
    enabled: z.boolean(),
    required: z.boolean(),
  })).optional(),
});

const updateBodySchema = createBodySchema.partial();

const STANDARD_FIELD_KEYS = new Set([
  'description',
  'assignee',
  'category',
  'parent',
  'startDate',
  'dueDate',
  'estimatedHours',
  'doneRatio',
  'repository',
]);

function normalizeStandardFields(
  fields: Array<{ fieldKey: string; enabled: boolean; required: boolean }> | undefined,
) {
  if (!fields) return undefined;
  const seen = new Set<string>();
  return fields.map((field) => {
    if (!STANDARD_FIELD_KEYS.has(field.fieldKey)) {
      throw AppError.badRequest('Invalid standard field');
    }
    if (seen.has(field.fieldKey)) {
      throw AppError.badRequest('Duplicate standard field');
    }
    seen.add(field.fieldKey);
    return {
      fieldKey: field.fieldKey,
      enabled: field.enabled,
      required: field.enabled ? field.required : false,
    };
  });
}

router.use(authenticate);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const trackers = await prisma.tracker.findMany({
      orderBy: { position: 'asc' },
      include: { defaultStatus: true, standardFields: true },
    });
    sendSuccess(res, trackers);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const tracker = await prisma.tracker.findUnique({
      where: { id },
      include: { defaultStatus: true, standardFields: true },
    });
    if (!tracker) {
      return next(AppError.notFound('作業分類が見つかりません'));
    }
    sendSuccess(res, tracker);
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.badRequest(zodMessage(parsed.error)));
    }
    const { name, defaultStatusId, description } = parsed.data;
    const standardFields = normalizeStandardFields(parsed.data.standardFields);

    if (defaultStatusId) {
      const status = await prisma.issueStatus.findUnique({ where: { id: defaultStatusId } });
      if (!status) {
        return next(AppError.badRequest('指定したデフォルトステータスが存在しません'));
      }
    }

    const maxPos = await prisma.tracker.aggregate({ _max: { position: true } });
    const position = parsed.data.position ?? (maxPos._max.position ?? -1) + 1;

    const tracker = await prisma.tracker.create({
      data: {
        name,
        position,
        defaultStatusId: defaultStatusId ?? null,
        description: description ?? null,
        ...(standardFields
          ? { standardFields: { create: standardFields } }
          : {}),
      },
      include: { defaultStatus: true, standardFields: true },
    });
    sendSuccess(res, tracker, 201);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const parsed = updateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return next(AppError.badRequest(zodMessage(parsed.error)));
    }

    const existing = await prisma.tracker.findUnique({ where: { id } });
    if (!existing) {
      return next(AppError.notFound('作業分類が見つかりません'));
    }

    if (parsed.data.defaultStatusId !== undefined && parsed.data.defaultStatusId !== null) {
      const status = await prisma.issueStatus.findUnique({
        where: { id: parsed.data.defaultStatusId },
      });
      if (!status) {
        return next(AppError.badRequest('指定したデフォルトステータスが存在しません'));
      }
    }
    const standardFields = normalizeStandardFields(parsed.data.standardFields);

    const tracker = await prisma.$transaction(async (tx) => {
      const updated = await tx.tracker.update({
        where: { id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.defaultStatusId !== undefined
            ? { defaultStatusId: parsed.data.defaultStatusId }
            : {}),
          ...(parsed.data.description !== undefined
            ? { description: parsed.data.description }
            : {}),
          ...(parsed.data.position !== undefined
            ? { position: parsed.data.position }
            : {}),
        },
      });

      if (standardFields) {
        await tx.trackerStandardField.deleteMany({ where: { trackerId: id } });
        if (standardFields.length) {
          await tx.trackerStandardField.createMany({
            data: standardFields.map((field) => ({ trackerId: id, ...field })),
          });
        }
      }

      return tx.tracker.findUniqueOrThrow({
        where: { id: updated.id },
        include: { defaultStatus: true, standardFields: true },
      });
    });
    sendSuccess(res, tracker);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = pickParam(req.params.id);
    if (!id) return next(AppError.badRequest('ID が無効です'));
    const existing = await prisma.tracker.findUnique({ where: { id } });
    if (!existing) {
      return next(AppError.notFound('作業分類が見つかりません'));
    }

    const issueCount = await prisma.issue.count({ where: { trackerId: id } });
    if (issueCount > 0) {
      return next(
        AppError.conflict('この作業分類を参照しているチケットがあるため削除できません', 'TRACKER_IN_USE'),
      );
    }

    await prisma.tracker.delete({ where: { id } });
    sendSuccess(res, { deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
