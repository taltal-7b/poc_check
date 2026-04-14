import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { authenticator } from 'otplib';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate, AuthPayload } from '../middleware/auth';
import { config } from '../config';
import { Prisma } from '@prisma/client';

const router = Router();

const BCRYPT_ROUNDS = 12;
const ACCESS_EXPIRES: jwt.SignOptions['expiresIn'] = '15m';
const REFRESH_EXPIRES: jwt.SignOptions['expiresIn'] = '7d';
const TOTP_PENDING_EXPIRES: jwt.SignOptions['expiresIn'] = '5m';

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

function signAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
}

function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, typ: 'refresh' }, config.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES,
  });
}

function signTotpPendingToken(userId: string): string {
  return jwt.sign({ userId, typ: 'totp_pending' }, config.JWT_REFRESH_SECRET, {
    expiresIn: TOTP_PENDING_EXPIRES,
  });
}

async function issueTokensForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 1) {
    throw AppError.unauthorized('アカウントが利用できません');
  }
  const payload: AuthPayload = {
    userId: user.id,
    login: user.login,
    admin: user.admin,
  };
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginOn: new Date() },
  });
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(userId),
    user: serializeUser(user),
  };
}

router.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          login: z.string().min(1),
          password: z.string().min(1),
        })
        .parse(req.body);

      const user = await prisma.user.findUnique({
        where: { login: body.login },
      });
      if (!user) {
        throw AppError.unauthorized('ログインまたはパスワードが正しくありません');
      }

      const ok = await bcrypt.compare(body.password, user.hashedPassword);
      if (!ok) {
        throw AppError.unauthorized('ログインまたはパスワードが正しくありません');
      }

      if (user.status === 3) {
        throw AppError.forbidden('アカウントはロックされています');
      }
      if (user.status === 2) {
        throw AppError.forbidden('アカウントはまだ有効化されていません');
      }
      if (user.status !== 1) {
        throw AppError.forbidden('アカウントの状態が無効です');
      }

      if (user.totpEnabled) {
        if (!user.totpSecret) {
          throw AppError.badRequest('二要素設定が不完全です');
        }
        const token = signTotpPendingToken(user.id);
        return sendSuccess(res, { totpRequired: true, token });
      }

      const tokens = await issueTokensForUser(user.id);
      return sendSuccess(res, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: tokens.user,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/login/totp',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          token: z.string().min(1),
          code: z.string().min(1),
        })
        .parse(req.body);

      let decoded: { userId?: string; typ?: string };
      try {
        decoded = jwt.verify(body.token, config.JWT_REFRESH_SECRET) as {
          userId: string;
          typ: string;
        };
      } catch {
        throw AppError.unauthorized('一時トークンが無効または期限切れです');
      }

      if (decoded.typ !== 'totp_pending' || !decoded.userId) {
        throw AppError.unauthorized('一時トークンが無効です');
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });
      if (!user || !user.totpEnabled || !user.totpSecret) {
        throw AppError.unauthorized('二要素認証が利用できません');
      }
      if (user.status === 3) {
        throw AppError.forbidden('アカウントはロックされています');
      }
      if (user.status === 2) {
        throw AppError.forbidden('アカウントはまだ有効化されていません');
      }
      if (user.status !== 1) {
        throw AppError.forbidden('アカウントの状態が無効です');
      }

      const valid = authenticator.check(body.code, user.totpSecret);
      if (!valid) {
        throw AppError.unauthorized('認証コードが正しくありません');
      }

      const tokens = await issueTokensForUser(user.id);
      return sendSuccess(res, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: tokens.user,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          refreshToken: z.string().min(1),
        })
        .parse(req.body);

      let decoded: { userId?: string; typ?: string };
      try {
        decoded = jwt.verify(body.refreshToken, config.JWT_REFRESH_SECRET) as {
          userId: string;
          typ: string;
        };
      } catch {
        throw AppError.unauthorized('リフレッシュトークンが無効または期限切れです');
      }

      if (decoded.typ !== 'refresh' || !decoded.userId) {
        throw AppError.unauthorized('リフレッシュトークンが無効です');
      }

      const tokens = await issueTokensForUser(decoded.userId);
      return sendSuccess(res, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: tokens.user,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/logout', (_req: Request, res: Response) => {
  return sendSuccess(res, { ok: true });
});

router.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          login: z.string().min(1).max(255),
          firstname: z.string().min(1).max(255),
          lastname: z.string().min(1).max(255),
          mail: z.string().email().max(255),
          password: z.string().min(8).max(128),
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
          status: 2,
        },
      });

      return sendSuccess(res, serializeUser(user), 201);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return next(AppError.conflict('ログイン名またはメールアドレスが既に使用されています'));
      }
      next(err);
    }
  },
);

router.post(
  '/password/reset',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          mail: z.string().email().optional(),
        })
        .passthrough()
        .parse(_req.body);

      void body;
      return sendSuccess(res, { ok: true, message: 'リクエストを受け付けました' });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
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
  },
);

router.put(
  '/password',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = z
        .object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(8).max(128),
          newPasswordConfirmation: z.string().min(1),
        })
        .parse(req.body);

      if (body.newPassword !== body.newPasswordConfirmation) {
        throw AppError.badRequest('新しいパスワードと確認用パスワードが一致しません');
      }

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

      return sendSuccess(res, { ok: true, message: 'パスワードを変更しました' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
