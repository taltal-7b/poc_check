import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { hasAnyProjectPermission } from '../utils/project-permissions';
import { notifyIssueEvent } from '../services/notification-service';
import { logger } from '../utils/logger';
import { z } from 'zod';

const router = Router();

function dispatchIssueCommentNotification(issueId: string, actorId: string) {
  notifyIssueEvent(issueId, actorId, 'commented').catch((error) => {
    logger.warn('チケットコメント通知の送信準備に失敗しました', {
      issueId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

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

async function userCanEditJournal(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  journal: { userId: string; issue: { projectId: string } },
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  const permissions = journal.userId === userId
    ? ['add_issue_notes', 'edit_own_issue_notes', 'edit_issue_notes', 'edit_issues']
    : ['edit_issue_notes', 'edit_issues'];
  return hasAnyProjectPermission(userId, isAdmin, journal.issue.projectId, permissions);
}

async function userCanDeleteJournal(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  journal: { userId: string; issue: { projectId: string } },
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  const permissions = journal.userId === userId
    ? ['add_issue_notes', 'delete_issue_notes', 'edit_issue_notes', 'edit_issues']
    : ['delete_issue_notes', 'edit_issues'];
  return hasAnyProjectPermission(userId, isAdmin, journal.issue.projectId, permissions);
}

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

    if (!(await userCanEditJournal(req.user?.userId, req.user?.admin, journal))) {
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

    dispatchIssueCommentNotification(journal.issueId, req.user!.userId);
    return sendSuccess(res, updated);
  }),
);

router.delete(
  '/:id',
  authenticate,
  catchAsync(async (req, res) => {
    const journal = await prisma.journal.findUnique({
      where: { id: req.params.id },
      include: { details: true, issue: { select: { projectId: true } } },
    });
    if (!journal) throw AppError.notFound('ジャーナルが見つかりません');

    if (!(await userCanDeleteJournal(req.user?.userId, req.user?.admin, journal))) {
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

    dispatchIssueCommentNotification(journal.issueId, req.user!.userId);
    return sendSuccess(res, { deleted: true });
  }),
);

export default router;
