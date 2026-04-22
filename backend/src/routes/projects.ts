import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess, sendPaginated, parsePagination } from '../utils/response';
import { authenticate, requireAdmin, optionalAuth } from '../middleware/auth';
import { z } from 'zod';

const router = Router({ mergeParams: true });

const DEFAULT_ENABLED_MODULES = [
  'issue_tracking',
  'time_tracking',
  'wiki',
  'news',
  'documents',
  'files',
  'boards',
  'calendar',
  'gantt',
  'repository',
] as const;

function catchAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

async function resolveProjectRef(ref: string) {
  const project = await prisma.project.findFirst({
    where: {
      OR: [{ id: ref }, { identifier: ref }],
    },
  });
  return project;
}

async function getUserGroupIds(userId: string): Promise<string[]> {
  const rows = await prisma.groupUser.findMany({
    where: { userId },
    select: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

async function userCanAccessProject(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string; isPublic: boolean },
): Promise<boolean> {
  if (isAdmin) return true;
  if (project.isPublic) return true;
  if (!userId) return false;
  const groupIds = await getUserGroupIds(userId);
  const member = await prisma.member.findFirst({
    where: {
      projectId: project.id,
      OR: [{ userId }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
    },
  });
  return !!member;
}

async function userCanManageProject(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string; createdByUserId?: string | null },
): Promise<boolean> {
  // システム管理者は全プロジェクトを管理できる
  if (isAdmin) return true;
  if (!userId) return false;

  // プロジェクト作成者は管理できる
  if (project.createdByUserId === userId) return true;

  // プロジェクト内で「管理者」ロールを持つメンバーは管理できる
  const adminRole = await prisma.role.findFirst({
    where: { name: '管理者' },
  });

  if (!adminRole) return false;

  const memberWithAdminRole = await prisma.member.findFirst({
    where: {
      projectId: project.id,
      userId,
      memberRoles: {
        some: { roleId: adminRole.id },
      },
    },
  });

  return !!memberWithAdminRole;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const createProjectSchema = z.object({
  name: z.string().min(1),
  identifier: z.string().min(1).regex(/^[a-z0-9_-]+$/i, 'identifier の形式が不正です'),
  description: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
  parentId: z.string().uuid().nullable().optional(),
  enabledModules: z.array(z.string()).optional(),
  trackerIds: z.array(z.string().uuid()).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  identifier: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_-]+$/i, 'identifier の形式が不正です')
    .optional(),
  description: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
  parentId: z.string().uuid().nullable().optional(),
  status: z.number().int().optional(),
  enabledModules: z.array(z.string()).optional(),
  trackerIds: z.array(z.string().uuid()).optional(),
});

router.get(
  '/',
  optionalAuth,
  catchAsync(async (req, res) => {
    const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);
    const statusRaw = req.query.status;
    const statusFilter =
      statusRaw !== undefined && statusRaw !== ''
        ? Number(statusRaw)
        : undefined;

    const and: Array<Record<string, unknown>> = [];
    if (statusFilter !== undefined && !Number.isNaN(statusFilter)) {
      and.push({ status: statusFilter });
    }

    if (!req.user?.admin) {
      if (!req.user) {
        and.push({ isPublic: true });
      } else {
        const groupIds = await getUserGroupIds(req.user.userId);
        and.push({
          OR: [
            { isPublic: true },
            {
              members: {
                some: {
                  OR: [{ userId: req.user.userId }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
                },
              },
            },
          ],
        });
      }
    }

    const where = and.length ? { AND: and } : {};

    const [total, rows] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: perPage,
        select: {
          id: true,
          name: true,
          identifier: true,
          description: true,
          isPublic: true,
          status: true,
          parentId: true,
          createdByUserId: true,
          bookmarked: true,
          createdAt: true,
          updatedAt: true,
          enabledModules: { select: { name: true } },
          _count: {
            select: { projectTrackers: true, members: true },
          },
        },
      }),
    ]);

    return sendPaginated(res, rows, {
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage) || 1,
    });
  }),
);

router.get(
  '/atom',
  optionalAuth,
  catchAsync(async (req, res) => {
    let feedUser = req.user;
    const key = typeof req.query.key === 'string' ? req.query.key : '';
    if (!feedUser && key) {
      const user = await prisma.user.findFirst({
        where: { apiKey: key, status: 1 },
        select: { id: true, login: true, admin: true, language: true },
      });
      if (user) {
        feedUser = { userId: user.id, login: user.login, admin: user.admin };
      }
    }

    const limitRaw = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 20;
    const statusRaw = req.query.status;
    const statusFilter =
      statusRaw !== undefined && statusRaw !== ''
        ? Number(statusRaw)
        : undefined;

    const and: Array<Record<string, unknown>> = [];
    if (statusFilter !== undefined && !Number.isNaN(statusFilter)) {
      and.push({ status: statusFilter });
    }

    if (!feedUser?.admin) {
      if (!feedUser) {
        and.push({ isPublic: true });
      } else {
        const groupIds = await getUserGroupIds(feedUser.userId);
        and.push({
          OR: [
            { isPublic: true },
            {
              members: {
                some: {
                  OR: [{ userId: feedUser.userId }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
                },
              },
            },
          ],
        });
      }
    }
    const where = and.length ? { AND: and } : {};

    const rows = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        identifier: true,
        description: true,
        updatedAt: true,
      },
    });

    const host = `${req.protocol}://${req.get('host')}`;
    const projectsUrl = `${host}/projects`;
    const feedUrl = `${host}${req.originalUrl}`;
    const updatedAt = rows[0]?.updatedAt ?? new Date();
    const feedId = `${host}/`;

    const entries = rows
      .map((row) => {
        const entryUrl = `${host}/projects/${row.identifier}`;
        const title = `${row.name} - プロジェクト: ${row.name}`;
        return [
          '  <entry>',
          `    <id>${escapeXml(entryUrl)}</id>`,
          `    <title>${escapeXml(title)}</title>`,
          `    <link rel="alternate" href="${escapeXml(entryUrl)}" />`,
          `    <updated>${row.updatedAt.toISOString()}</updated>`,
          '    <content type="html">',
          `${escapeXml(row.description ?? '')}`,
          '    </content>',
          '  </entry>',
        ].join('\n');
      })
      .join('\n');

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<feed xmlns="http://www.w3.org/2005/Atom">',
      `  <id>${escapeXml(feedId)}</id>`,
      '  <title>TaskNova: 最近のプロジェクト</title>',
      `  <updated>${updatedAt.toISOString()}</updated>`,
      `  <link rel="self" href="${escapeXml(feedUrl)}" />`,
      `  <link rel="alternate" href="${escapeXml(projectsUrl)}" />`,
      `  <icon>${escapeXml(`${host}/favicon.ico`)}</icon>`,
      '  <author>',
      '    <name>TaskNova</name>',
      '  </author>',
      '  <generator uri="https://www.redmine.org/">TaskNova</generator>',
      entries,
      '</feed>',
      '',
    ].join('\n');

    const accept = String(req.headers.accept ?? '').toLowerCase();
    const prefersHtml = accept.includes('text/html');
    if (prefersHtml) {
      const html = [
        '<!doctype html>',
        '<html lang="ja">',
        '<head>',
        '  <meta charset="utf-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
        '  <title>Projects Atom</title>',
        '  <style>',
        '    :root { color-scheme: dark; }',
        '    body { margin: 0; background: #000; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }',
        '    pre { margin: 0; padding: 12px 14px; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.45; }',
        '  </style>',
        '</head>',
        '<body>',
        `  <pre>${escapeXml(xml)}</pre>`,
        '</body>',
        '</html>',
      ].join('\n');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }

    res.setHeader('Content-Type', 'application/atom+xml; charset=utf-8');
    return res.status(200).send(xml);
  }),
);

router.get(
  '/:id',
  optionalAuth,
  catchAsync(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: {
        OR: [{ id: req.params.id }, { identifier: req.params.id }],
      },
      select: {
        id: true,
        name: true,
        identifier: true,
        description: true,
        isPublic: true,
        status: true,
        parentId: true,
        createdByUserId: true,
        bookmarked: true,
        createdAt: true,
        updatedAt: true,
        enabledModules: { select: { name: true } },
        projectTrackers: { include: { tracker: true } },
        _count: {
          select: { projectTrackers: true, members: true },
        },
      },
    });
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const ok = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
    if (!ok) throw AppError.forbidden();

    return sendSuccess(res, project);
  }),
);

router.post(
  '/',
  authenticate,
  catchAsync(async (req, res) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }
    const body = parsed.data;
    const modules = body.enabledModules?.length ? body.enabledModules : [...DEFAULT_ENABLED_MODULES];

    if (body.parentId) {
      const parent = await prisma.project.findUnique({ where: { id: body.parentId } });
      if (!parent) throw AppError.badRequest('親プロジェクトが存在しません');
    }

    const existing = await prisma.project.findUnique({
      where: { identifier: body.identifier },
    });
    if (existing) throw AppError.conflict('identifier が既に使用されています');

    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          name: body.name,
          identifier: body.identifier,
          description: body.description ?? null,
          isPublic: body.isPublic ?? true,
          parentId: body.parentId ?? null,
          createdByUserId: req.user!.userId,
        },
      });

      await tx.enabledModule.createMany({
        data: modules.map((name) => ({ projectId: p.id, name })),
        skipDuplicates: true,
      });

      if (body.trackerIds?.length) {
        await tx.projectTracker.createMany({
          data: body.trackerIds.map((trackerId) => ({ projectId: p.id, trackerId })),
          skipDuplicates: true,
        });
      }

      return tx.project.findUniqueOrThrow({
        where: { id: p.id },
        include: {
          enabledModules: true,
          projectTrackers: { include: { tracker: true } },
        },
      });
    });

    return sendSuccess(res, project, 201);
  }),
);

router.put(
  '/:id',
  authenticate,
  catchAsync(async (req, res) => {
    const current = await resolveProjectRef(req.params.id);
    if (!current) throw AppError.notFound('プロジェクトが見つかりません');

    // 権限チェック
    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, current);
    if (!canManage) throw AppError.forbidden('このプロジェクトを編集する権限がありません');

    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }
    const body = parsed.data;

    if (body.identifier && body.identifier !== current.identifier) {
      const taken = await prisma.project.findUnique({ where: { identifier: body.identifier } });
      if (taken) throw AppError.conflict('identifier が既に使用されています');
    }

    if (body.parentId) {
      if (body.parentId === current.id) {
        throw AppError.badRequest('自身を親にできません');
      }
      const parent = await prisma.project.findUnique({ where: { id: body.parentId } });
      if (!parent) throw AppError.badRequest('親プロジェクトが存在しません');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: current.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.identifier !== undefined && { identifier: body.identifier }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.isPublic !== undefined && { isPublic: body.isPublic }),
          ...(body.parentId !== undefined && { parentId: body.parentId }),
          ...(body.status !== undefined && { status: body.status }),
        },
      });

      if (body.enabledModules) {
        await tx.enabledModule.deleteMany({ where: { projectId: current.id } });
        if (body.enabledModules.length) {
          await tx.enabledModule.createMany({
            data: body.enabledModules.map((name) => ({ projectId: current.id, name })),
          });
        }
      }

      if (body.trackerIds) {
        await tx.projectTracker.deleteMany({ where: { projectId: current.id } });
        if (body.trackerIds.length) {
          await tx.projectTracker.createMany({
            data: body.trackerIds.map((trackerId) => ({
              projectId: current.id,
              trackerId,
            })),
          });
        }
      }

      return tx.project.findUniqueOrThrow({
        where: { id: current.id },
        include: {
          enabledModules: true,
          projectTrackers: { include: { tracker: true } },
        },
      });
    });

    return sendSuccess(res, updated);
  }),
);

router.delete(
  '/:id',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    // 権限チェック
    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, project);
    if (!canManage) throw AppError.forbidden('このプロジェクトを削除する権限がありません');

    await prisma.project.delete({ where: { id: project.id } });
    return sendSuccess(res, { deleted: true });
  }),
);

router.post(
  '/:id/archive',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { status: 5 },
    });
    return sendSuccess(res, updated);
  }),
);

router.post(
  '/:id/unarchive',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { status: 1 },
    });
    return sendSuccess(res, updated);
  }),
);

router.post(
  '/:id/close',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { status: 9 },
    });
    return sendSuccess(res, updated);
  }),
);

router.post(
  '/:id/reopen',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { status: 1 },
    });
    return sendSuccess(res, updated);
  }),
);

router.post(
  '/:id/bookmark',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { bookmarked: !project.bookmarked },
    });
    return sendSuccess(res, updated);
  }),
);

router.post(
  '/:id/copy',
  authenticate,
  catchAsync(async (req, res) => {
    const src = await prisma.project.findFirst({
      where: {
        OR: [{ id: req.params.id }, { identifier: req.params.id }],
      },
      include: {
        enabledModules: true,
        projectTrackers: true,
      },
    });
    if (!src) throw AppError.notFound('プロジェクトが見つかりません');

    const newIdentifier = `${src.identifier}-copy-${Date.now()}`.replace(/-+/g, '-');
    const copy = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          name: `${src.name} (copy)`,
          identifier: newIdentifier,
          description: src.description,
          homepage: src.homepage,
          isPublic: src.isPublic,
          parentId: null,
          status: 1,
          bookmarked: false,
        },
      });

      if (src.enabledModules.length) {
        await tx.enabledModule.createMany({
          data: src.enabledModules.map((m) => ({ projectId: p.id, name: m.name })),
        });
      } else {
        await tx.enabledModule.createMany({
          data: DEFAULT_ENABLED_MODULES.map((name) => ({ projectId: p.id, name })),
        });
      }

      if (src.projectTrackers.length) {
        await tx.projectTracker.createMany({
          data: src.projectTrackers.map((pt) => ({
            projectId: p.id,
            trackerId: pt.trackerId,
          })),
        });
      }

      return tx.project.findUniqueOrThrow({
        where: { id: p.id },
        include: {
          enabledModules: true,
          projectTrackers: { include: { tracker: true } },
        },
      });
    });

    return sendSuccess(res, copy, 201);
  }),
);

export default router;
