import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { userCanViewProject } from '../utils/project-access';

const router = Router();

const watchableTypes = ['Issue', 'Board', 'Message', 'WikiPage'] as const;

const watcherSchema = z.object({
  watchableType: z.enum(watchableTypes),
  watchableId: z.string().uuid(),
});

type WatchableType = (typeof watchableTypes)[number];

async function assertCanViewWatchable(
  req: Request,
  watchableType: WatchableType,
  watchableId: string,
): Promise<{ issueId?: string }> {
  if (watchableType === 'Issue') {
    const issue = await prisma.issue.findUnique({
      where: { id: watchableId },
      select: { id: true, project: { select: { id: true, isPublic: true } } },
    });
    if (!issue) throw AppError.notFound('Watchable not found');
    if (!(await userCanViewProject(req.user, issue.project, ['view_issues']))) {
      throw AppError.forbidden();
    }
    return { issueId: issue.id };
  }

  if (watchableType === 'Board') {
    const board = await prisma.board.findUnique({
      where: { id: watchableId },
      select: { project: { select: { id: true, isPublic: true } } },
    });
    if (!board) throw AppError.notFound('Watchable not found');
    if (!(await userCanViewProject(req.user, board.project, ['view_messages']))) {
      throw AppError.forbidden();
    }
    return {};
  }

  if (watchableType === 'Message') {
    const message = await prisma.message.findUnique({
      where: { id: watchableId },
      select: { board: { select: { project: { select: { id: true, isPublic: true } } } } },
    });
    if (!message) throw AppError.notFound('Watchable not found');
    if (!(await userCanViewProject(req.user, message.board.project, ['view_messages']))) {
      throw AppError.forbidden();
    }
    return {};
  }

  const page = await prisma.wikiPage.findUnique({
    where: { id: watchableId },
    select: { wiki: { select: { project: { select: { id: true, isPublic: true } } } } },
  });
  if (!page) throw AppError.notFound('Watchable not found');
  if (!(await userCanViewProject(req.user, page.wiki.project, ['view_wiki_pages']))) {
    throw AppError.forbidden();
  }
  return {};
}

function parseWatcherInput(source: unknown) {
  const parsed = watcherSchema.safeParse(source);
  if (!parsed.success) throw AppError.badRequest(parsed.error.message);
  return parsed.data;
}

router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseWatcherInput(req.query);
    await assertCanViewWatchable(req, input.watchableType, input.watchableId);

    const watchers = await prisma.watcher.findMany({
      where: input,
      orderBy: { user: { login: 'asc' } },
      select: {
        user: { select: { id: true, login: true, firstname: true, lastname: true } },
      },
    });

    return sendSuccess(res, {
      watching: watchers.some((watcher) => watcher.user.id === req.user!.userId),
      watchers,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseWatcherInput(req.body);
    const refs = await assertCanViewWatchable(req, input.watchableType, input.watchableId);

    const watcher = await prisma.watcher.upsert({
      where: {
        watchableType_watchableId_userId: {
          watchableType: input.watchableType,
          watchableId: input.watchableId,
          userId: req.user!.userId,
        },
      },
      create: {
        ...input,
        userId: req.user!.userId,
        issueId: refs.issueId ?? null,
      },
      update: {
        issueId: refs.issueId ?? null,
      },
      select: {
        id: true,
        watchableType: true,
        watchableId: true,
        userId: true,
      },
    });

    return sendSuccess(res, { watching: true, watcher }, 201);
  } catch (e) {
    next(e);
  }
});

router.delete('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = parseWatcherInput(req.body);
    await assertCanViewWatchable(req, input.watchableType, input.watchableId);

    await prisma.watcher.deleteMany({
      where: {
        ...input,
        userId: req.user!.userId,
      },
    });

    return sendSuccess(res, { watching: false });
  } catch (e) {
    next(e);
  }
});

export default router;
