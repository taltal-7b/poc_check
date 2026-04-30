import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate, AuthPayload } from '../middleware/auth';
import { config } from '../config';
import { Prisma } from '@prisma/client';
import { sendMail } from '../services/mail-service';

const router = Router();

const BCRYPT_ROUNDS = 12;
const ACCESS_EXPIRES: jwt.SignOptions['expiresIn'] = '15m';
const REFRESH_EXPIRES: jwt.SignOptions['expiresIn'] = '7d';
const TWO_FACTOR_PENDING_EXPIRES: jwt.SignOptions['expiresIn'] = '5m';
const EMAIL_OTP_EXPIRES_MINUTES = 5;
const EMAIL_OTP_LOGIN_ACTION = 'email_2fa_login';
const EMAIL_OTP_SETUP_ACTION = 'email_2fa_setup';

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

function signTwoFactorPendingToken(userId: string): string {
  return jwt.sign({ userId, typ: 'two_factor_pending' }, config.JWT_REFRESH_SECRET, {
    expiresIn: TWO_FACTOR_PENDING_EXPIRES,
  });
}

function normalizeOtpCode(code: string): string {
  return code.replace(/\s/g, '').trim();
}

function generateEmailOtp(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

async function verifyPassword(userId: string, currentPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw AppError.notFound('繝ｦ繝ｼ繧ｶ繝ｼ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ');
  }
  const ok = await bcrypt.compare(currentPassword, user.hashedPassword);
  if (!ok) {
    throw AppError.unauthorized('迴ｾ蝨ｨ縺ｮ繝代せ繝ｯ繝ｼ繝峨′豁｣縺励￥縺ゅｊ縺ｾ縺帙ｓ');
  }
  return user;
}

function otpExpiresAt(): Date {
  return new Date(Date.now() + EMAIL_OTP_EXPIRES_MINUTES * 60 * 1000);
}

async function issueEmailOtp(user: { id: string; login: string; mail: string }, action: string): Promise<void> {
  const code = generateEmailOtp();
  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  await prisma.$transaction(async (tx) => {
    await tx.token.deleteMany({ where: { userId: user.id, action } });
    await tx.token.create({
      data: {
        userId: user.id,
        action,
        value: codeHash,
        expiresAt: otpExpiresAt(),
      },
    });
  });
  await sendMail({
    to: [user.mail],
    subject: 'TaskNova 二段階認証コードのお知らせ',
    text: [
      'TaskNova の二段階認証コードは以下です。',
      '',
      code,
      '',
      `このコードの有効期限は ${EMAIL_OTP_EXPIRES_MINUTES} 分です。`,
      'このメールに心当たりがない場合は、破棄してください。',
    ].join('\n'),
  });
}

async function consumeEmailOtp(userId: string, action: string, code: string): Promise<boolean> {
  const normalized = normalizeOtpCode(code);
  if (!/^\d{6}$/.test(normalized)) return false;
  const rows = await prisma.token.findMany({
    where: {
      userId,
      action,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });
  for (const row of rows) {
    if (await bcrypt.compare(normalized, row.value)) {
      await prisma.token.deleteMany({ where: { userId, action } });
      return true;
    }
  }
  return false;
}

async function issueTokensForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 1) {
    throw AppError.unauthorized('繧｢繧ｫ繧ｦ繝ｳ繝医′蛻ｩ逕ｨ縺ｧ縺阪∪縺帙ｓ');
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
        throw AppError.unauthorized('繝ｭ繧ｰ繧､繝ｳ縺ｾ縺溘・繝代せ繝ｯ繝ｼ繝峨′豁｣縺励￥縺ゅｊ縺ｾ縺帙ｓ');
      }

      const ok = await bcrypt.compare(body.password, user.hashedPassword);
      if (!ok) {
        throw AppError.unauthorized('繝ｭ繧ｰ繧､繝ｳ縺ｾ縺溘・繝代せ繝ｯ繝ｼ繝峨′豁｣縺励￥縺ゅｊ縺ｾ縺帙ｓ');
      }

      if (user.status === 3) {
        throw AppError.forbidden('Account is locked');
      }
      if (user.status === 2) {
        throw AppError.forbidden('繧｢繧ｫ繧ｦ繝ｳ繝医・縺ｾ縺譛牙柑蛹悶＆繧後※縺・∪縺帙ｓ');
      }
      if (user.status !== 1) {
        throw AppError.forbidden('Account is inactive');
      }

      if (user.totpEnabled) {
        await issueEmailOtp(user, EMAIL_OTP_LOGIN_ACTION);
        const token = signTwoFactorPendingToken(user.id);
        return sendSuccess(res, {
          totpRequired: true,
          token,
          delivery: 'email',
          expiresInMinutes: EMAIL_OTP_EXPIRES_MINUTES,
        });
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
        throw AppError.unauthorized('Temporary token is invalid or expired');
      }

      if (decoded.typ !== 'two_factor_pending' || !decoded.userId) {
        throw AppError.unauthorized('Temporary token is invalid');
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
      });
      if (!user || !user.totpEnabled) {
        throw AppError.unauthorized('莠瑚ｦ∫ｴ隱崎ｨｼ縺悟茜逕ｨ縺ｧ縺阪∪縺帙ｓ');
      }
      if (user.status === 3) {
        throw AppError.forbidden('Account is locked');
      }
      if (user.status === 2) {
        throw AppError.forbidden('繧｢繧ｫ繧ｦ繝ｳ繝医・縺ｾ縺譛牙柑蛹悶＆繧後※縺・∪縺帙ｓ');
      }
      if (user.status !== 1) {
        throw AppError.forbidden('Account is inactive');
      }

      const valid = await consumeEmailOtp(user.id, EMAIL_OTP_LOGIN_ACTION, body.code);
      if (!valid) {
        throw AppError.unauthorized('隱崎ｨｼ繧ｳ繝ｼ繝峨′豁｣縺励￥縺ゅｊ縺ｾ縺帙ｓ');
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
        throw AppError.unauthorized('Refresh token is invalid or expired');
      }

      if (decoded.typ !== 'refresh' || !decoded.userId) {
        throw AppError.unauthorized('Refresh token is invalid');
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
        return next(AppError.conflict('Login or email is already in use'));
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
      return sendSuccess(res, { ok: true, message: '繝ｪ繧ｯ繧ｨ繧ｹ繝医ｒ蜿励￠莉倥￠縺ｾ縺励◆' });
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
        throw AppError.notFound('繝ｦ繝ｼ繧ｶ繝ｼ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ');
      }
      return sendSuccess(res, serializeUser(user));
    } catch (err) {
      next(err);
    }
  },
);

router.get('/totp/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { totpEnabled: true, mail: true },
    });
    if (!user) throw AppError.notFound('ユーザーが見つかりません');
    return sendSuccess(res, {
      totpEnabled: user.totpEnabled,
      delivery: 'email',
      mail: user.mail,
      expiresInMinutes: EMAIL_OTP_EXPIRES_MINUTES,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/totp/setup', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ currentPassword: z.string().min(1) }).parse(req.body);
    const user = await verifyPassword(req.user!.userId, body.currentPassword);
    if (user.totpEnabled) {
      throw AppError.badRequest('二段階認証は既に有効です');
    }

    await issueEmailOtp(user, EMAIL_OTP_SETUP_ACTION);
    return sendSuccess(res, {
      delivery: 'email',
      mail: user.mail,
      expiresInMinutes: EMAIL_OTP_EXPIRES_MINUTES,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/totp/confirm', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ code: z.string().min(1) }).parse(req.body);
    const valid = await consumeEmailOtp(req.user!.userId, EMAIL_OTP_SETUP_ACTION, body.code);
    if (!valid) {
      throw AppError.unauthorized('認証コードが正しくありません');
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        totpSecret: 'email',
        totpEnabled: true,
      },
    });

    return sendSuccess(res, {
      totpEnabled: true,
      delivery: 'email',
      expiresInMinutes: EMAIL_OTP_EXPIRES_MINUTES,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/totp/disable', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = z.object({ currentPassword: z.string().min(1) }).parse(req.body);
    const user = await verifyPassword(req.user!.userId, body.currentPassword);
    if (!user.totpEnabled) {
      throw AppError.badRequest('二段階認証が有効ではありません');
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          totpSecret: null,
          totpEnabled: false,
        },
      }),
      prisma.token.deleteMany({
        where: {
          userId: user.id,
          action: { in: [EMAIL_OTP_LOGIN_ACTION, EMAIL_OTP_SETUP_ACTION] },
        },
      }),
    ]);

    return sendSuccess(res, {
      totpEnabled: false,
      delivery: 'email',
      expiresInMinutes: EMAIL_OTP_EXPIRES_MINUTES,
    });
  } catch (err) {
    next(err);
  }
});
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
        throw AppError.badRequest('譁ｰ縺励＞繝代せ繝ｯ繝ｼ繝峨→遒ｺ隱咲畑繝代せ繝ｯ繝ｼ繝峨′荳閾ｴ縺励∪縺帙ｓ');
      }

      if (body.currentPassword === body.newPassword) {
        throw AppError.badRequest('譁ｰ縺励＞繝代せ繝ｯ繝ｼ繝峨・迴ｾ蝨ｨ縺ｮ繝代せ繝ｯ繝ｼ繝峨→逡ｰ縺ｪ繧九ｂ縺ｮ繧定ｨｭ螳壹＠縺ｦ縺上□縺輔＞');
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user!.userId },
      });
      if (!user) {
        throw AppError.notFound('繝ｦ繝ｼ繧ｶ繝ｼ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ');
      }

      console.log('[DEBUG] Password change attempt:', {
        userId: user.id,
        login: user.login,
        hasCurrentPassword: !!body.currentPassword,
        currentPasswordLength: body.currentPassword?.length,
        hasHashedPassword: !!user.hashedPassword,
        hashedPasswordPrefix: user.hashedPassword?.substring(0, 10),
      });

      const ok = await bcrypt.compare(body.currentPassword, user.hashedPassword);
      console.log('[DEBUG] Password comparison result:', ok);
      
      if (!ok) {
        throw AppError.unauthorized('迴ｾ蝨ｨ縺ｮ繝代せ繝ｯ繝ｼ繝峨′豁｣縺励￥縺ゅｊ縺ｾ縺帙ｓ');
      }

      const hashedPassword = await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS);
      await prisma.user.update({
        where: { id: user.id },
        data: { hashedPassword },
      });

      return sendSuccess(res, { ok: true, message: '繝代せ繝ｯ繝ｼ繝峨ｒ螟画峩縺励∪縺励◆' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;


