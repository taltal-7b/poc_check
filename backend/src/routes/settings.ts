import { Router, Request, Response, NextFunction } from 'express';
import nodemailer from 'nodemailer';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate, requireAdmin } from '../middleware/auth';
import { config } from '../config';
import { z } from 'zod';

const router = Router();

router.use(authenticate, requireAdmin);

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.setting.findMany();
    const kv: Record<string, string> = {};
    for (const row of rows) {
      kv[row.name] = row.value;
    }
    return sendSuccess(res, kv);
  } catch (err) {
    next(err);
  }
});

const putBodySchema = z.record(z.string(), z.string());

router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = putBodySchema.parse(req.body);
    for (const [name, value] of Object.entries(body)) {
      await prisma.setting.upsert({
        where: { name },
        create: { name, value },
        update: { value },
      });
    }
    const rows = await prisma.setting.findMany();
    const kv: Record<string, string> = {};
    for (const row of rows) {
      kv[row.name] = row.value;
    }
    return sendSuccess(res, kv);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(AppError.badRequest(err.errors.map((e) => e.message).join('; ')));
    }
    next(err);
  }
});

router.post('/test_email', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth:
        config.SMTP_USER && config.SMTP_PASS
          ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
          : undefined,
    });

    const adminUser = await prisma.user.findFirst({
      where: { admin: true, status: 1 },
      orderBy: { createdAt: 'asc' },
    });
    if (!adminUser?.mail) {
      throw AppError.badRequest('管理者ユーザーのメールアドレスが見つかりません');
    }

    await transporter.sendMail({
      from: config.SMTP_FROM,
      to: adminUser.mail,
      subject: 'TaskNova — メール送信テスト',
      text: 'これは SMTP 設定のテスト送信です。',
    });

    return sendSuccess(res, { sent: true, to: adminUser.mail });
  } catch (err) {
    next(err);
  }
});

router.get('/info', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.$queryRaw<{ version: string }[]>`
      SELECT version() AS version
    `;
    const dbVersion = rows[0]?.version ?? 'unknown';

    return sendSuccess(res, {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      uptimeSeconds: Math.floor(process.uptime()),
      memory: process.memoryUsage(),
      database: { version: dbVersion },
      env: config.NODE_ENV,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
