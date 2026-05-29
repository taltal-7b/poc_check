import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
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

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.admin) {
    return next(AppError.forbidden('システム管理者権限が必要です'));
  }
  next();
}
