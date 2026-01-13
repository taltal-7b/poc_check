import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { User } from '../entities/User';
import { AppError } from './error.middleware';

export interface AuthRequest extends Request {
  user?: User & { permissions?: string[] };
  userId?: number;
  twoFactorVerified?: boolean;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check for token in header or cookie
    const token =
      req.headers.authorization?.replace('Bearer ', '') ||
      req.cookies?.token;

    if (!token) {
      throw new AppError('認証が必要です', 401);
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET!
    ) as { userId: number; twoFactorVerified?: boolean; twoFactorPending?: boolean };

    // Reject if this is a pending 2FA token
    if (decoded.twoFactorPending) {
      throw new AppError('2段階認証が必要です', 401);
    }

    // Get user from database
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { id: decoded.userId },
      relations: ['groups', 'preference'],
    });

    if (!user) {
      throw new AppError('ユーザーが見つかりません', 401);
    }

    if (!user.isActive) {
      throw new AppError('アカウントが無効です', 401);
    }

    // Check if user has 2FA enabled but token is not 2FA verified
    if (user.twofaScheme && !decoded.twoFactorVerified) {
      throw new AppError('2段階認証が必要です', 401);
    }

    // Attach user to request
    req.user = user;
    req.userId = user.id;
    req.twoFactorVerified = decoded.twoFactorVerified || false;

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      next(new AppError('無効なトークンです', 401));
    } else {
      next(error);
    }
  }
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.admin) {
    return next(new AppError('管理者権限が必要です', 403));
  }
  next();
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token =
      req.headers.authorization?.replace('Bearer ', '') ||
      req.cookies?.token;

    if (token) {
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET!
      ) as { userId: number; twoFactorVerified?: boolean; twoFactorPending?: boolean };

      // Skip if token is pending 2FA
      if (decoded.twoFactorPending) {
        return next();
      }

      const userRepository = AppDataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: { id: decoded.userId },
        relations: ['groups', 'preference'],
      });

      // Only attach user if active and (no 2FA or 2FA verified)
      if (user && user.isActive) {
        if (!user.twofaScheme || decoded.twoFactorVerified) {
          req.user = user;
          req.userId = user.id;
          req.twoFactorVerified = decoded.twoFactorVerified || false;
        }
      }
    }
  } catch (error) {
    // Ignore errors for optional auth
  }

  next();
};
