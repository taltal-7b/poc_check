import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/errors';
import { sendError } from '../utils/response';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return sendError(res, err.statusCode, err.code, err.message);
  }

  if (err instanceof z.ZodError) {
    const firstIssue = err.issues[0];
    const field = firstIssue?.path.join('.');
    const message =
      firstIssue?.code === 'invalid_string' && firstIssue.validation === 'email'
        ? `${field || 'mail'} はメールアドレス形式で入力してください`
        : '入力内容に誤りがあります';
    return sendError(res, 400, 'VALIDATION_ERROR', message);
  }

  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  return sendError(res, 500, 'INTERNAL_ERROR', 'サーバーエラーが発生しました');
}
