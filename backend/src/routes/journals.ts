import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

function catchAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const updateJournalSchema = z.object({
  notes: z.string().min(1),
});

router.put(
  '/:id',
  authenticate,
  catchAsync(async (req, res) => {
    const parsed = updateJournalSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }

    const journal = await prisma.journal.findUnique({
      where: { id: req.params.id },
      include: { issue: { select: { projectId: true } } },
    });
    if (!journal) throw AppError.notFound('ジャーナルが見つかりません');

    if (journal.userId !== req.user!.userId && !req.user!.admin) {
      throw AppError.forbidden('自分のコメントのみ編集できます');
    }

    if (!journal.notes) {
      throw AppError.badRequest('このジャーナルにはコメントがありません');
    }

    const updated = await prisma.journal.update({
      where: { id: journal.id },
      data: { notes: parsed.data.notes },
      include: {
        user: { select: { id: true, login: true, firstname: true, lastname: true } },
        details: true,
        attachments: {
          select: { id: true, filename: true, diskFilename: true, filesize: true, contentType: true, createdAt: true },
        },
      },
    });

    return sendSuccess(res, updated);
  }),
);

router.delete(
  '/:id',
  authenticate,
  catchAsync(async (req, res) => {
    const journal = await prisma.journal.findUnique({
      where: { id: req.params.id },
      include: { details: true },
    });
    if (!journal) throw AppError.notFound('ジャーナルが見つかりません');

    if (journal.userId !== req.user!.userId && !req.user!.admin) {
      throw AppError.forbidden('自分のコメントのみ削除できます');
    }

    if (journal.details.length > 0 && journal.notes) {
      await prisma.journal.update({
        where: { id: journal.id },
        data: { notes: null },
      });
    } else if (journal.details.length > 0) {
      throw AppError.badRequest('属性変更履歴を含むジャーナルは削除できません');
    } else {
      await prisma.journal.delete({ where: { id: journal.id } });
    }

    return sendSuccess(res, { deleted: true });
  }),
);

export default router;
