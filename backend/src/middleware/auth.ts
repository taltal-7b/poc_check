import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';

export interface AuthPayload {
  userId: string;
  login: string;
  admin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
      language?: string;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (apiKey) {
    prisma.user.findFirst({ where: { apiKey, status: 1 } })
      .then(user => {
        if (!user) return next(AppError.unauthorized());
        req.user = { userId: user.id, login: user.login, admin: user.admin };
        req.language = user.language;
        next();
      })
      .catch(next);
    return;
  }

  if (!authHeader?.startsWith('Bearer ')) {
    return next(AppError.unauthorized());
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as AuthPayload;
    req.user = payload;
    req.language = req.headers['accept-language']?.startsWith('en') ? 'en' : 'ja';
    next();
  } catch {
    next(AppError.unauthorized('トークンが無効または期限切れです'));
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    req.language = req.headers['accept-language']?.startsWith('en') ? 'en' : 'ja';
    return next();
  }
  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, config.JWT_SECRET) as AuthPayload;
  } catch {
    // ignore
  }
  req.language = req.headers['accept-language']?.startsWith('en') ? 'en' : 'ja';
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.admin) {
    return next(AppError.forbidden('管理者権限が必要です'));
  }
  next();
}
