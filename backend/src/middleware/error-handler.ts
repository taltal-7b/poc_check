import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { sendError } from '../utils/response';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return sendError(res, err.statusCode, err.code, err.message);
  }

  logger.error('Unhandled error', { message: err.message, stack: err.stack });
  return sendError(res, 500, 'INTERNAL_ERROR', 'サーバーエラーが発生しました');
}
