import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const groups = await prisma.group.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { groupUsers: true } },
      },
    });
    return sendSuccess(
      res,
      groups.map(g => ({
        id: g.id,
        name: g.name,
        createdAt: g.createdAt,
        updatedAt: g.updatedAt,
        userCount: g._count.groupUsers,
      })),
    );
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        groupUsers: {
          include: {
            user: {
              select: {
                id: true,
                login: true,
                firstname: true,
                lastname: true,
                mail: true,
                admin: true,
                status: true,
                language: true,
                totpEnabled: true,
                createdAt: true,
              },
            },
          },
        },
        members: {
          include: {
            project: { select: { id: true, name: true, identifier: true } },
            memberRoles: {
              include: {
                role: {
                  select: {
                    id: true,
                    name: true,
                    position: true,
                    assignable: true,
                    builtin: true,
                    permissions: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!group) {
      throw AppError.notFound('グループが見つかりません');
    }
    return sendSuccess(res, {
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      users: group.groupUsers.map((gu) => gu.user),
      projects: group.members.map((m) => ({
        memberId: m.id,
        projectId: m.projectId,
        projectName: m.project.name,
        projectIdentifier: m.project.identifier,
        roles: m.memberRoles.map((mr) => mr.role),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ name: z.string().min(1).max(255) }).parse(req.body);
    const group = await prisma.group.create({ data: { name: body.name } });
    return sendSuccess(res, group, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('このグループ名は既に使用されています'));
    }
    next(err);
  }
});

router.post('/:id/users/bulk', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groupId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        userIds: z.array(z.string().uuid()).min(1),
      })
      .parse(req.body);

    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { id: true } });
    if (!group) throw AppError.notFound('グループが見つかりません');

    const users = await prisma.user.findMany({
      where: { id: { in: body.userIds } },
      select: { id: true },
    });
    if (users.length !== body.userIds.length) {
      throw AppError.badRequest('存在しないユーザーが含まれています');
    }

    const existing = await prisma.groupUser.findMany({
      where: { groupId, userId: { in: body.userIds } },
      select: { userId: true },
    });
    const existingUserIds = new Set(existing.map((r) => r.userId));
    const toCreate = body.userIds.filter((uid) => !existingUserIds.has(uid));

    if (toCreate.length === 0) {
      return sendSuccess(res, { added: 0 });
    }

    const result = await prisma.groupUser.createMany({
      data: toCreate.map((userId) => ({ groupId, userId })),
      skipDuplicates: true,
    });
    return sendSuccess(res, { added: result.count });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('このユーザーは既にグループに所属しています'));
    }
    next(err);
  }
});

router.post('/:id/projects', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groupId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        projectId: z.string().uuid(),
        roleIds: z.array(z.string().uuid()).min(1),
      })
      .parse(req.body);

    const [group, project, roles] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId }, select: { id: true } }),
      prisma.project.findUnique({
        where: { id: body.projectId },
        select: { id: true, name: true, identifier: true },
      }),
      prisma.role.findMany({ where: { id: { in: body.roleIds }, assignable: true } }),
    ]);

    if (!group) throw AppError.notFound('グループが見つかりません');
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');
    if (roles.length !== body.roleIds.length) {
      throw AppError.badRequest('存在しないロールが含まれています');
    }

    const existing = await prisma.member.findFirst({
      where: { projectId: body.projectId, groupId },
      select: { id: true },
    });
    if (existing) {
      throw AppError.conflict('このグループは既に対象プロジェクトに追加されています');
    }

    const member = await prisma.$transaction(async (tx) => {
      const created = await tx.member.create({
        data: {
          projectId: body.projectId,
          userId: null,
          groupId,
        },
      });
      await tx.memberRole.createMany({
        data: body.roleIds.map((roleId) => ({ memberId: created.id, roleId })),
      });
      return tx.member.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          project: { select: { id: true, name: true, identifier: true } },
          memberRoles: {
            include: {
              role: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  assignable: true,
                  builtin: true,
                  permissions: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });
    });

    return sendSuccess(
      res,
      {
        memberId: member.id,
        projectId: member.projectId,
        projectName: member.project.name,
        projectIdentifier: member.project.identifier,
        roles: member.memberRoles.map((mr) => mr.role),
      },
      201,
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('この組み合わせは既に存在します'));
    }
    next(err);
  }
});

router.delete('/:id/projects/:projectId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groupId = z.string().uuid().parse(req.params.id);
    const projectId = z.string().uuid().parse(req.params.projectId);

    const result = await prisma.member.deleteMany({
      where: { groupId, projectId },
    });
    if (result.count === 0) {
      throw AppError.notFound('グループのプロジェクト割り当てが見つかりません');
    }
    return sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const body = z.object({ name: z.string().min(1).max(255) }).parse(req.body);
    const group = await prisma.group.update({
      where: { id },
      data: { name: body.name },
    });
    return sendSuccess(res, group);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('このグループ名は既に使用されています'));
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return next(AppError.notFound('グループが見つかりません'));
    }
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    await prisma.group.delete({ where: { id } });
    return sendSuccess(res, { ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return next(AppError.notFound('グループが見つかりません'));
    }
    next(err);
  }
});

router.post('/:id/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groupId = z.string().uuid().parse(req.params.id);
    const body = z.object({ userId: z.string().uuid() }).parse(req.body);

    const [group, user] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId } }),
      prisma.user.findUnique({ where: { id: body.userId } }),
    ]);
    if (!group) throw AppError.notFound('グループが見つかりません');
    if (!user) throw AppError.notFound('ユーザーが見つかりません');

    const link = await prisma.groupUser.create({
      data: { groupId, userId: body.userId },
    });
    return sendSuccess(res, link, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('このユーザーは既にグループに所属しています'));
    }
    next(err);
  }
});

router.delete('/:id/users/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groupId = z.string().uuid().parse(req.params.id);
    const userId = z.string().uuid().parse(req.params.userId);

    const result = await prisma.groupUser.deleteMany({
      where: { groupId, userId },
    });
    if (result.count === 0) {
      throw AppError.notFound('グループメンバーが見つかりません');
    }
    return sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
