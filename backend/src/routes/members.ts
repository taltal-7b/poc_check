import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { userCanManageProject } from '../utils/project-permissions';
import { z } from 'zod';

const router = Router({ mergeParams: true });

function catchAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

async function resolveProjectIdParam(projectId: string) {
  const p = await prisma.project.findFirst({
    where: { OR: [{ id: projectId }, { identifier: projectId }] },
    select: { id: true, createdByUserId: true },
  });
  return p;
}

const addMemberSchema = z
  .object({
    userId: z.string().uuid().optional(),
    groupId: z.string().uuid().optional(),
    roleIds: z.array(z.string().uuid()).min(1),
  })
  .refine((v) => Boolean(v.userId) !== Boolean(v.groupId), {
    message: 'userId または groupId のどちらか一方を指定してください',
  });

const updateMemberRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1),
});

router.get(
  '/',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectIdParam(req.params.projectId);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');
    const projectId = project.id;

    const members = await prisma.member.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            login: true,
            firstname: true,
            lastname: true,
            mail: true,
            status: true,
          },
        },
        group: { select: { id: true, name: true } },
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
              },
            },
          },
        },
      },
    });

    return sendSuccess(res, members);
  }),
);

router.get(
  '/groups',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectIdParam(req.params.projectId);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');
    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, project);
    if (!canManage) throw AppError.forbidden('このプロジェクトのメンバーを編集する権限がありません');

    const groups = await prisma.group.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
    return sendSuccess(res, groups);
  }),
);

router.post(
  '/',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectIdParam(req.params.projectId);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');
    const projectId = project.id;
    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, project);
    if (!canManage) throw AppError.forbidden('このプロジェクトのメンバーを編集する権限がありません');

    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }
    const { userId, groupId, roleIds } = parsed.data;

    const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) {
      throw AppError.badRequest('存在しないロールが含まれています');
    }

    if (userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw AppError.badRequest('ユーザーが存在しません');

      const existing = await prisma.member.findFirst({
        where: { projectId, userId },
      });
      if (existing) throw AppError.conflict('既にメンバーに登録されています');

      const member = await prisma.$transaction(async (tx) => {
        const m = await tx.member.create({
          data: {
            projectId,
            userId,
            groupId: null,
          },
        });
        await tx.memberRole.createMany({
          data: roleIds.map((roleId) => ({ memberId: m.id, roleId })),
        });
        return tx.member.findUniqueOrThrow({
          where: { id: m.id },
          include: {
            user: {
              select: {
                id: true,
                login: true,
                firstname: true,
                lastname: true,
                mail: true,
                status: true,
              },
            },
            group: { select: { id: true, name: true } },
            memberRoles: { include: { role: true } },
          },
        });
      });
      return sendSuccess(res, member, 201);
    }

    const group = await prisma.group.findUnique({ where: { id: groupId! } });
    if (!group) throw AppError.badRequest('グループが存在しません');

    const existingGroupMember = await prisma.member.findFirst({
      where: { projectId, groupId: groupId! },
    });
    if (existingGroupMember) throw AppError.conflict('既にメンバーに登録されています');

    const member = await prisma.$transaction(async (tx) => {
      const m = await tx.member.create({
        data: {
          projectId,
          userId: null,
          groupId: groupId!,
        },
      });
      await tx.memberRole.createMany({
        data: roleIds.map((roleId) => ({ memberId: m.id, roleId })),
      });
      return tx.member.findUniqueOrThrow({
        where: { id: m.id },
        include: {
          user: {
            select: {
              id: true,
              login: true,
              firstname: true,
              lastname: true,
              mail: true,
              status: true,
            },
          },
          group: { select: { id: true, name: true } },
          memberRoles: { include: { role: true } },
        },
      });
    });
    return sendSuccess(res, member, 201);
  }),
);

router.put(
  '/:id',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectIdParam(req.params.projectId);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');
    const projectId = project.id;
    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, project);
    if (!canManage) throw AppError.forbidden('このプロジェクトのメンバーを編集する権限がありません');

    const parsed = updateMemberRolesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }
    const { roleIds } = parsed.data;

    const member = await prisma.member.findFirst({
      where: { id: req.params.id, projectId },
    });
    if (!member) throw AppError.notFound('メンバーが見つかりません');

    const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) {
      throw AppError.badRequest('存在しないロールが含まれています');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.memberRole.deleteMany({ where: { memberId: member.id } });
      await tx.memberRole.createMany({
        data: roleIds.map((roleId) => ({ memberId: member.id, roleId })),
      });
      return tx.member.findUniqueOrThrow({
        where: { id: member.id },
        include: {
          user: {
            select: {
              id: true,
              login: true,
              firstname: true,
              lastname: true,
              mail: true,
              status: true,
            },
          },
          group: true,
          memberRoles: { include: { role: true } },
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
    const project = await resolveProjectIdParam(req.params.projectId);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');
    const projectId = project.id;
    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, project);
    if (!canManage) throw AppError.forbidden('このプロジェクトのメンバーを編集する権限がありません');

    const member = await prisma.member.findFirst({
      where: { id: req.params.id, projectId },
    });
    if (!member) throw AppError.notFound('メンバーが見つかりません');

    await prisma.member.delete({ where: { id: member.id } });
    return sendSuccess(res, { deleted: true });
  }),
);

export default router;
