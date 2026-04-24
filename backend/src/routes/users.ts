import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess, sendPaginated, parsePagination } from '../utils/response';
import { authenticate, requireAdmin } from '../middleware/auth';

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

function serializeUserProject(member: {
  id: string;
  projectId: string;
  project: { id: string; name: string; identifier: string };
  memberRoles: {
    role: {
      id: string;
      name: string;
      position: number;
      assignable: boolean;
      builtin: number;
      permissions: Prisma.JsonValue;
      createdAt: Date;
    };
  }[];
}) {
  return {
    memberId: member.id,
    projectId: member.projectId,
    projectName: member.project.name,
    projectIdentifier: member.project.identifier,
    roles: member.memberRoles.map((mr) => mr.role),
  };
}

router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);
    const [total, rows] = await prisma.$transaction([
      prisma.user.count(),
      prisma.user.findMany({
        skip,
        take: perPage,
        orderBy: { login: 'asc' },
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
          lastLoginOn: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return sendPaginated(
      res,
      rows.map(serializeUser),
      {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage) || 1,
      },
    );
  } catch (err) {
    next(err);
  }
});

router.post(
  '/bulk_lock',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(req.body);
      const result = await prisma.user.updateMany({
        where: { id: { in: body.ids } },
        data: { status: 3 },
      });
      return sendSuccess(res, { updated: result.count });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/bulk_unlock',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(req.body);
      const result = await prisma.user.updateMany({
        where: { id: { in: body.ids } },
        data: { status: 1 },
      });
      return sendSuccess(res, { updated: result.count });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/bulk',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(req.body);
      const selfId = req.user!.userId;
      const ids = body.ids.filter(i => i !== selfId);
      const result = await prisma.user.deleteMany({
        where: { id: { in: ids } },
      });
      return sendSuccess(res, { deleted: result.count });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    if (!req.user!.admin) {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) throw AppError.notFound('ユーザーが見つかりません');
      return sendSuccess(res, serializeUser(user));
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        groupUsers: {
          include: {
            group: {
              select: {
                id: true,
                name: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
          orderBy: { group: { name: 'asc' } },
        },
        members: {
          where: { userId: id },
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
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) {
      throw AppError.notFound('ユーザーが見つかりません');
    }
    return sendSuccess(res, {
      ...serializeUser(user),
      groups: user.groupUsers.map((gu) => gu.group),
      projects: user.members.map(serializeUserProject),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/projects', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = z.string().uuid().parse(req.params.id);
    const body = z
      .object({
        projectId: z.string().uuid(),
        roleIds: z.array(z.string().uuid()).min(1),
      })
      .parse(req.body);

    const [user, project, roles] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
      prisma.project.findUnique({
        where: { id: body.projectId },
        select: { id: true, name: true, identifier: true },
      }),
      prisma.role.findMany({ where: { id: { in: body.roleIds }, assignable: true } }),
    ]);

    if (!user) throw AppError.notFound('ユーザーが見つかりません');
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');
    if (roles.length !== body.roleIds.length) {
      throw AppError.badRequest('存在しないロールが含まれています');
    }

    const existing = await prisma.member.findFirst({
      where: { projectId: body.projectId, userId },
      select: { id: true },
    });
    if (existing) {
      throw AppError.conflict('このユーザーは既に対象プロジェクトに追加されています');
    }

    const member = await prisma.$transaction(async (tx) => {
      const created = await tx.member.create({
        data: {
          projectId: body.projectId,
          userId,
          groupId: null,
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

    return sendSuccess(res, serializeUserProject(member), 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('この組み合わせは既に存在します'));
    }
    next(err);
  }
});

router.delete('/:id/projects/:projectId', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = z.string().uuid().parse(req.params.id);
    const projectId = z.string().uuid().parse(req.params.projectId);

    const result = await prisma.member.deleteMany({
      where: { userId, projectId },
    });
    if (result.count === 0) {
      throw AppError.notFound('ユーザーのプロジェクト割り当てが見つかりません');
    }
    return sendSuccess(res, { ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z
      .object({
        login: z.string().min(1).max(255),
        firstname: z.string().min(1).max(255),
        lastname: z.string().min(1).max(255),
        mail: z.string().email().max(255),
        password: z.string().min(8).max(128),
        admin: z.boolean().optional(),
        status: z.number().int().min(1).max(3).optional(),
        language: z.string().min(1).max(32).optional(),
      })
      .parse(req.body);

    const hashedPassword = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        login: body.login,
        firstname: body.firstname,
        lastname: body.lastname,
        mail: body.mail,
        hashedPassword,
        admin: body.admin ?? false,
        status: body.status ?? 1,
        language: body.language ?? 'ja',
      },
    });

    return sendSuccess(res, serializeUser(user), 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('ログイン名またはメールアドレスが既に使用されています'));
    }
    next(err);
  }
});

router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw AppError.notFound('ユーザーが見つかりません');
    }

    const isAdmin = req.user!.admin;
    const isSelf = req.user!.userId === id;

    if (!isAdmin && !isSelf) {
      throw AppError.forbidden();
    }

    const adminSchema = z
      .object({
        login: z.string().min(1).max(255).optional(),
        firstname: z.string().min(1).max(255).optional(),
        lastname: z.string().min(1).max(255).optional(),
        mail: z.string().email().max(255).optional(),
        password: z.string().min(8).max(128).optional(),
        admin: z.boolean().optional(),
        status: z.number().int().min(1).max(3).optional(),
        language: z.string().min(1).max(32).optional(),
      })
      .strict();

    const selfSchema = z
      .object({
        firstname: z.string().min(1).max(255).optional(),
        lastname: z.string().min(1).max(255).optional(),
        mail: z.string().email().max(255).optional(),
        language: z.string().min(1).max(32).optional(),
      })
      .strict();

    let data: Prisma.UserUpdateInput;
    if (isAdmin) {
      const body = adminSchema.parse(req.body);
      const { password, ...rest } = body;
      data = { ...rest };
      if (password) {
        data.hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
      }
    } else {
      data = selfSchema.parse(req.body);
    }

    const user = await prisma.user.update({
      where: { id },
      data,
    });

    return sendSuccess(res, serializeUser(user));
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return next(AppError.conflict('ログイン名またはメールアドレスが既に使用されています'));
    }
    next(err);
  }
});

router.delete('/:id', requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    if (id === req.user!.userId) {
      throw AppError.badRequest('自分自身は削除できません');
    }
    await prisma.user.delete({ where: { id } });
    return sendSuccess(res, { ok: true });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return next(AppError.notFound('ユーザーが見つかりません'));
    }
    next(err);
  }
});

export default router;
