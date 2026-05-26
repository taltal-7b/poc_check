import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
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

router.get('/projects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;
    const groupRows = await prisma.groupUser.findMany({
      where: { userId },
      select: { groupId: true },
    });
    const groupIds = groupRows.map((row) => row.groupId);

    const memberRows = await prisma.member.findMany({
      where: {
        OR: [
          { userId },
          ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
        ],
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            identifier: true,
            description: true,
          },
        },
        memberRoles: {
          include: {
            role: { select: { name: true } },
          },
        },
      },
    });

    const projectMap = new Map<string, {
      projectId: string;
      projectName: string;
      projectIdentifier: string;
      description: string | null;
      roles: Set<string>;
    }>();

    for (const member of memberRows) {
      const existing = projectMap.get(member.projectId) ?? {
        projectId: member.project.id,
        projectName: member.project.name,
        projectIdentifier: member.project.identifier,
        description: member.project.description,
        roles: new Set<string>(),
      };
      for (const row of member.memberRoles) {
        if (row.role?.name) existing.roles.add(row.role.name);
      }
      projectMap.set(member.projectId, existing);
    }

    const projectIds = [...projectMap.keys()];
    const childRows = projectIds.length
      ? await prisma.project.findMany({
          where: { parentId: { in: projectIds } },
          select: { parentId: true, name: true },
          orderBy: { name: 'asc' },
        })
      : [];

    const childNamesByParent = new Map<string, string[]>();
    for (const row of childRows) {
      if (!row.parentId) continue;
      const list = childNamesByParent.get(row.parentId) ?? [];
      list.push(row.name);
      childNamesByParent.set(row.parentId, list);
    }

    const projects = [...projectMap.values()]
      .map((project) => ({
        projectId: project.projectId,
        projectName: project.projectName,
        projectIdentifier: project.projectIdentifier,
        description: project.description,
        childProjectNames: childNamesByParent.get(project.projectId) ?? [],
        roles: [...project.roles].sort((a, b) => a.localeCompare(b, 'ja')),
      }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName, 'ja'));

    return sendSuccess(res, projects);
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

/**
 * メッセージ群のルートトピック ID を一括解決する。
 * ループごとに DB を叩く N+1 を避けるため、未解決の parentId を
 * ラウンドトリップごとにまとめてフェッチし、深さ O(depth) 回で収束させる。
 */
async function resolveRootMessageIds(
  messages: { id: string; parentId: string | null }[],
): Promise<Map<string, string>> {
  const rootMap = new Map<string, string>();
  const fetched = new Map<string, { id: string; parentId: string | null }>(
    messages.map((m) => [m.id, m]),
  );

  for (const m of messages) {
    if (!m.parentId) rootMap.set(m.id, m.id);
  }

  let pending = messages.filter((m) => m.parentId && !rootMap.has(m.id));

  while (pending.length > 0) {
    const unknownParentIds = [
      ...new Set(
        pending.map((m) => m.parentId!).filter((id) => !fetched.has(id)),
      ),
    ];

    if (unknownParentIds.length > 0) {
      const rows = await prisma.message.findMany({
        where: { id: { in: unknownParentIds } },
        select: { id: true, parentId: true },
      });
      for (const row of rows) fetched.set(row.id, row);
    }

    const stillPending: typeof pending = [];
    for (const msg of pending) {
      const parent = fetched.get(msg.parentId!);
      if (!parent) {
        rootMap.set(msg.id, msg.id);
        continue;
      }
      if (!parent.parentId) {
        rootMap.set(parent.id, parent.id);
        rootMap.set(msg.id, parent.id);
      } else if (rootMap.has(parent.id)) {
        rootMap.set(msg.id, rootMap.get(parent.id)!);
      } else {
        stillPending.push(msg);
      }
    }

    if (stillPending.length === pending.length) {
      for (const msg of stillPending) rootMap.set(msg.id, msg.id);
      break;
    }
    pending = stillPending;
  }

  return rootMap;
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

    // ① 各 watchable 種別を並列でフィルタ・整形し、② メッセージのルート解決も一括で行う
    const rootIdMap = await resolveRootMessageIds(messages);

    const [issueItems, boardItems, messageItems, pageItems] = await Promise.all([
      Promise.all(
        issues.map(async (issue) => {
          if (!(await canView(issue.project, ['view_issues']))) return null;
          const watcher = watcherByKey.get(`Issue:${issue.id}`);
          if (!watcher) return null;
          return {
            id: watcher.id,
            watchableType: watcher.watchableType,
            watchableId: watcher.watchableId,
            title: `#${issue.number} ${issue.subject}`,
            subtitle: issue.status.name,
            updatedAt: issue.updatedAt,
            url: `/projects/${issue.project.identifier}/issues/${issue.id}`,
            project: { id: issue.project.id, name: issue.project.name, identifier: issue.project.identifier },
          };
        }),
      ),
      Promise.all(
        boards.map(async (board) => {
          if (!(await canView(board.project, ['view_messages']))) return null;
          const watcher = watcherByKey.get(`Board:${board.id}`);
          if (!watcher) return null;
          return {
            id: watcher.id,
            watchableType: watcher.watchableType,
            watchableId: watcher.watchableId,
            title: board.name,
            subtitle: board.description,
            updatedAt: board.updatedAt,
            url: `/projects/${board.project.identifier}/forums/${board.id}`,
            project: { id: board.project.id, name: board.project.name, identifier: board.project.identifier },
          };
        }),
      ),
      Promise.all(
        messages.map(async (message) => {
          if (!(await canView(message.board.project, ['view_messages']))) return null;
          const watcher = watcherByKey.get(`Message:${message.id}`);
          if (!watcher) return null;
          const topicId = rootIdMap.get(message.id) ?? message.id;
          return {
            id: watcher.id,
            watchableType: watcher.watchableType,
            watchableId: watcher.watchableId,
            title: message.subject,
            subtitle: message.content,
            updatedAt: message.updatedAt,
            url: `/projects/${message.board.project.identifier}/forums/${message.boardId}/topics/${topicId}`,
            project: {
              id: message.board.project.id,
              name: message.board.project.name,
              identifier: message.board.project.identifier,
            },
          };
        }),
      ),
      Promise.all(
        pages.map(async (page) => {
          if (!(await canView(page.wiki.project, ['view_wiki_pages']))) return null;
          const watcher = watcherByKey.get(`WikiPage:${page.id}`);
          if (!watcher) return null;
          return {
            id: watcher.id,
            watchableType: watcher.watchableType,
            watchableId: watcher.watchableId,
            title: page.title,
            subtitle: page.content?.comments ?? null,
            updatedAt: page.updatedAt,
            url: `/projects/${page.wiki.project.identifier}/wiki/${encodeURIComponent(page.title)}`,
            project: { id: page.wiki.project.id, name: page.wiki.project.name, identifier: page.wiki.project.identifier },
          };
        }),
      ),
    ]);

    const items = [...issueItems, ...boardItems, ...messageItems, ...pageItems]
      .filter((item): item is NonNullable<typeof item> => item !== null);

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
