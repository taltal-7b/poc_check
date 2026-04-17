import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';

export function requireProjectModule(moduleName: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const ref = req.params.projectId;
      if (!ref) {
        return next(AppError.badRequest('projectId が必要です'));
      }

      const project = await prisma.project.findFirst({
        where: {
          OR: [{ id: ref }, { identifier: ref }],
        },
        select: {
          enabledModules: { select: { name: true } },
        },
      });
      if (!project) {
        return next(AppError.notFound('プロジェクトが見つかりません'));
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

