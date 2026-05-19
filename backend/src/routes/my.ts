import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { userCanViewProject } from '../utils/project-access';

const router = Router();

const BCRYPT_ROUNDS = 12;

function serializeUser(user: {
  id: string;
  login: string;
  firstname: string;
  lastname: string;
  mail: string;
  admin: boolean;
  status: number;
  language: string;
  totpEnabled: boolean;
  lastLoginOn: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    login: user.login,
    firstname: user.firstname,
    lastname: user.lastname,
    mail: user.mail,
    admin: user.admin,
    status: user.status,
    language: user.language,
    totpEnabled: user.totpEnabled,
    lastLoginOn: user.lastLoginOn,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });
    if (!user) {
      throw AppError.notFound('ユーザーが見つかりません');
    }
    return sendSuccess(res, serializeUser(user));
  } catch (err) {
    next(err);
  }
});

router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z
      .object({
        firstname: z.string().min(1).max(255).optional(),
        lastname: z.string().min(1).max(255).optional(),
        mail: z.string().email().max(255).optional(),
        language: z.string().min(1).max(32).optional(),
      })
      .strict()
      .parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: body,
    });
    return sendSuccess(res, serializeUser(user));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('このメールアドレスは既に使用されています'));
    }
    next(err);
  }
});

router.put('/password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8).max(128),
      })
      .parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });
    if (!user) {
      throw AppError.notFound('ユーザーが見つかりません');
    }

    const ok = await bcrypt.compare(body.currentPassword, user.hashedPassword);
    if (!ok) {
      throw AppError.unauthorized('現在のパスワードが正しくありません');
    }

    const hashedPassword = await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { hashedPassword },
    });

    return sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/page', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pref = await prisma.userPreference.findUnique({
      where: { userId: req.user!.userId },
    });
    const others = pref?.others;
    const page =
      others !== null && typeof others === 'object' && !Array.isArray(others)
        ? others
        : {};
    return sendSuccess(res, page);
  } catch (err) {
    next(err);
  }
});

router.put('/page', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.record(z.string(), z.unknown()).parse(req.body) as Prisma.InputJsonObject;

    const pref = await prisma.userPreference.upsert({
      where: { userId: req.user!.userId },
      create: {
        userId: req.user!.userId,
        others: body,
      },
      update: { others: body },
    });

    const others = pref.others;
    const page =
      others !== null && typeof others === 'object' && !Array.isArray(others)
        ? others
        : {};
    return sendSuccess(res, page);
  } catch (err) {
    next(err);
  }
});

function preferenceOthersObject(value: Prisma.JsonValue | null | undefined): Prisma.InputJsonObject {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Prisma.InputJsonObject;
  }
  return {};
}

router.get('/mail_notifications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pref = await prisma.userPreference.findUnique({
      where: { userId: req.user!.userId },
    });
    const others = preferenceOthersObject(pref?.others);
    return sendSuccess(res, {
      mailNotificationsEnabled: others.mailNotificationsEnabled !== false,
    });
  } catch (err) {
    next(err);
  }
});

async function rootMessageId(boardId: string, messageId: string): Promise<string | null> {
  let currentId: string | null = messageId;
  while (currentId) {
    const row: { id: string; parentId: string | null } | null = await prisma.message.findFirst({
      where: { id: currentId, boardId },
      select: { id: true, parentId: true },
    });
    if (!row) return null;
    if (!row.parentId) return row.id;
    currentId = row.parentId;
  }
  return null;
}

router.get('/watchers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const watchers = await prisma.watcher.findMany({
      where: { userId: req.user!.userId },
      orderBy: [{ watchableType: 'asc' }, { watchableId: 'asc' }],
      select: { id: true, watchableType: true, watchableId: true },
    });

    const watchersByType = new Map<string, typeof watchers>();
    for (const watcher of watchers) {
      const rows = watchersByType.get(watcher.watchableType) ?? [];
      rows.push(watcher);
      watchersByType.set(watcher.watchableType, rows);
    }
    const idsByType = (type: string) => (watchersByType.get(type) ?? []).map((watcher) => watcher.watchableId);
    const watcherByKey = new Map(watchers.map((watcher) => [`${watcher.watchableType}:${watcher.watchableId}`, watcher]));

    const [issues, boards, messages, pages] = await Promise.all([
      prisma.issue.findMany({
        where: { id: { in: idsByType('Issue') } },
        select: {
          id: true,
          number: true,
          subject: true,
          updatedAt: true,
          project: { select: { id: true, name: true, identifier: true, isPublic: true } },
          status: { select: { name: true, isClosed: true } },
        },
      }),
      prisma.board.findMany({
        where: { id: { in: idsByType('Board') } },
        select: {
          id: true,
          name: true,
          description: true,
          updatedAt: true,
          project: { select: { id: true, name: true, identifier: true, isPublic: true } },
        },
      }),
      prisma.message.findMany({
        where: { id: { in: idsByType('Message') } },
        select: {
          id: true,
          boardId: true,
          parentId: true,
          subject: true,
          content: true,
          updatedAt: true,
          board: { select: { project: { select: { id: true, name: true, identifier: true, isPublic: true } } } },
        },
      }),
      prisma.wikiPage.findMany({
        where: { id: { in: idsByType('WikiPage') } },
        select: {
          id: true,
          title: true,
          updatedAt: true,
          content: { select: { comments: true } },
          wiki: { select: { project: { select: { id: true, name: true, identifier: true, isPublic: true } } } },
        },
      }),
    ]);

    const canViewCache = new Map<string, Promise<boolean>>();
    const canView = (project: { id: string; isPublic: boolean }, permissions: string[]) => {
      const key = `${project.id}:${permissions.join(',')}`;
      const cached = canViewCache.get(key);
      if (cached) return cached;
      const result = userCanViewProject(req.user, project, permissions);
      canViewCache.set(key, result);
      return result;
    };

    const items = [];

    for (const issue of issues) {
      if (!(await canView(issue.project, ['view_issues']))) continue;
      const watcher = watcherByKey.get(`Issue:${issue.id}`);
      if (!watcher) continue;
      items.push({
        id: watcher.id,
        watchableType: watcher.watchableType,
        watchableId: watcher.watchableId,
        title: `#${issue.number} ${issue.subject}`,
        subtitle: issue.status.name,
        updatedAt: issue.updatedAt,
        url: `/projects/${issue.project.identifier}/issues/${issue.id}`,
        project: { id: issue.project.id, name: issue.project.name, identifier: issue.project.identifier },
      });
    }

    for (const board of boards) {
      if (!(await canView(board.project, ['view_messages']))) continue;
      const watcher = watcherByKey.get(`Board:${board.id}`);
      if (!watcher) continue;
      items.push({
        id: watcher.id,
        watchableType: watcher.watchableType,
        watchableId: watcher.watchableId,
        title: board.name,
        subtitle: board.description,
        updatedAt: board.updatedAt,
        url: `/projects/${board.project.identifier}/forums/${board.id}`,
        project: { id: board.project.id, name: board.project.name, identifier: board.project.identifier },
      });
    }

    for (const message of messages) {
      if (!(await canView(message.board.project, ['view_messages']))) continue;
      const watcher = watcherByKey.get(`Message:${message.id}`);
      if (!watcher) continue;
      const topicId = await rootMessageId(message.boardId, message.id);
      items.push({
        id: watcher.id,
        watchableType: watcher.watchableType,
        watchableId: watcher.watchableId,
        title: message.subject,
        subtitle: message.content,
        updatedAt: message.updatedAt,
        url: `/projects/${message.board.project.identifier}/forums/${message.boardId}/topics/${topicId ?? message.id}`,
        project: {
          id: message.board.project.id,
          name: message.board.project.name,
          identifier: message.board.project.identifier,
        },
      });
    }

    for (const page of pages) {
      if (!(await canView(page.wiki.project, ['view_wiki_pages']))) continue;
      const watcher = watcherByKey.get(`WikiPage:${page.id}`);
      if (!watcher) continue;
      items.push({
        id: watcher.id,
        watchableType: watcher.watchableType,
        watchableId: watcher.watchableId,
        title: page.title,
        subtitle: page.content?.comments ?? null,
        updatedAt: page.updatedAt,
        url: `/projects/${page.wiki.project.identifier}/wiki/${encodeURIComponent(page.title)}`,
        project: { id: page.wiki.project.id, name: page.wiki.project.name, identifier: page.wiki.project.identifier },
      });
    }

    items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return sendSuccess(res, items);
  } catch (err) {
    next(err);
  }
});

router.put('/mail_notifications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z
      .object({
        mailNotificationsEnabled: z.boolean(),
      })
      .parse(req.body);

    const current = await prisma.userPreference.findUnique({
      where: { userId: req.user!.userId },
    });
    const others = {
      ...preferenceOthersObject(current?.others),
      mailNotificationsEnabled: body.mailNotificationsEnabled,
    };

    const pref = await prisma.userPreference.upsert({
      where: { userId: req.user!.userId },
      create: {
        userId: req.user!.userId,
        others,
      },
      update: { others },
    });

    const nextOthers = preferenceOthersObject(pref.others);
    return sendSuccess(res, {
      mailNotificationsEnabled: nextOthers.mailNotificationsEnabled !== false,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/api_key', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = crypto.randomBytes(32).toString('hex');
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { apiKey },
    });
    return sendSuccess(res, { apiKey: user.apiKey });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('APIキーの生成に失敗しました。再試行してください'));
    }
    next(err);
  }
});

router.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.user.delete({ where: { id: req.user!.userId } });
    return sendSuccess(res, { ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return next(AppError.notFound('ユーザーが見つかりません'));
    }
    next(err);
  }
});

export default router;
