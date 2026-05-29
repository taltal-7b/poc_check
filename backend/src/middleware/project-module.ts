import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';

const PROJECT_STATUS_ARCHIVED = 5;
const LEGACY_PROJECT_STATUS_ARCHIVED = 2;

function param(req: Request, key: string): string | undefined {
  const v = req.params[key];
  if (typeof v === 'string' && v.length > 0) return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

export function requireProjectModule(moduleName: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const ref = param(req, 'projectId');
      if (!ref) {
        return next(AppError.badRequest('projectId が必要です'));
      }

      const project = await prisma.project.findFirst({
        where: {
          OR: [{ id: ref }, { identifier: ref }],
        },
        select: {
          status: true,
          enabledModules: { select: { name: true } },
        },
      });
      if (!project) {
        return next(AppError.notFound('プロジェクトが見つかりません'));
      }

      if (project.status === PROJECT_STATUS_ARCHIVED || project.status === LEGACY_PROJECT_STATUS_ARCHIVED) {
        return next(AppError.forbidden('Archived projects can only be accessed from settings'));
      }

      const enabled = project.enabledModules.some((m) => m.name === moduleName);
      if (!enabled) {
        return next(AppError.forbidden('この機能はプロジェクト設定で無効化されています'));
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

