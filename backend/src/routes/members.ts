import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';

const router = Router({ mergeParams: true });

function catchAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
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

async function getUserGroupIds(userId: string): Promise<string[]> {
  const rows = await prisma.groupUser.findMany({
    where: { userId },
    select: { groupId: true },
  });
  return rows.map((r) => r.groupId);
}

async function userCanManageProject(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string; createdByUserId?: string | null },
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId) return false;
  if (project.createdByUserId === userId) return true;

  const groupIds = await getUserGroupIds(userId);
  const member = await prisma.member.findFirst({
    where: {
      projectId: project.id,
      OR: [{ userId }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
    },
    include: {
      memberRoles: {
        include: {
          role: { select: { name: true } },
        },
      },
    },
  });

  if (!member) return false;
  return (member.memberRoles ?? []).some((mr) => (mr.role?.name ?? '') === '管理者');
}

const addMemberSchema = z.object({
  userId: z.string().uuid(),
  roleIds: z.array(z.string().uuid()).min(1),
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
    const { userId, roleIds } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw AppError.badRequest('ユーザーが存在しません');

    const roles = await prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) {
      throw AppError.badRequest('存在しないロールが含まれています');
    }

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
