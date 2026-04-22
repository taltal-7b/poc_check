import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';

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
