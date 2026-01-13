import { Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';
import { Member } from '../entities/Member';
import { Project } from '../entities/Project';
import { Role } from '../entities/Role';
import { AppError } from './error.middleware';
import { AuthRequest } from './auth.middleware';

/**
 * Check if user has permission for a project
 */
export const checkProjectPermission = (permission: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        throw new AppError('認証が必要です', 401);
      }

      // Admin has all permissions
      if (user.admin) {
        return next();
      }

      // Get project ID from params or body
      const projectId = req.params.projectId || req.params.id || req.body.projectId;
      
      if (!projectId) {
        throw new AppError('プロジェクトIDが必要です', 400);
      }

      // Check if user is member of project
      const memberRepository = AppDataSource.getRepository(Member);
      const members = await memberRepository.find({
        where: {
          userId: user.id,
          projectId: parseInt(projectId),
        },
        relations: ['memberRoles', 'memberRoles.role'],
      });

      if (members.length === 0) {
        throw new AppError('このプロジェクトのメンバーではありません', 403);
      }

      // Check if any of the user's roles have the required permission
      let hasPermission = false;
      for (const member of members) {
        for (const memberRole of member.memberRoles) {
          if (memberRole.role.hasPermission(permission)) {
            hasPermission = true;
            break;
          }
        }
        if (hasPermission) break;
      }

      if (!hasPermission) {
        throw new AppError('この操作を行う権限がありません', 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user has global permission (not project-specific)
 */
export const checkGlobalPermission = (permission: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        throw new AppError('認証が必要です', 401);
      }

      // Admin has all permissions
      if (user.admin) {
        return next();
      }

      // Get all user's roles from all projects
      const memberRepository = AppDataSource.getRepository(Member);
      const members = await memberRepository.find({
        where: { userId: user.id },
        relations: ['memberRoles', 'memberRoles.role'],
      });

      // Check if any role has the permission
      let hasPermission = false;
      for (const member of members) {
        for (const memberRole of member.memberRoles) {
          if (memberRole.role.hasPermission(permission)) {
            hasPermission = true;
            break;
          }
        }
        if (hasPermission) break;
      }

      if (!hasPermission) {
        throw new AppError('この操作を行う権限がありません', 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user has permission to perform action on issues
 */
export const checkIssuePermission = (permission: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        throw new AppError('認証が必要です', 401);
      }

      // Admin has all permissions
      if (user.admin) {
        return next();
      }

      // For issue creation or bulk operations, check project permission
      if (req.method === 'POST' || req.path === '/bulk') {
        const projectId = req.body.projectId;
        if (!projectId) {
          throw new AppError('プロジェクトIDが必要です', 400);
        }

        const memberRepository = AppDataSource.getRepository(Member);
        const members = await memberRepository.find({
          where: {
            userId: user.id,
            projectId: parseInt(projectId),
          },
          relations: ['memberRoles', 'memberRoles.role'],
        });

        if (members.length === 0) {
          throw new AppError('このプロジェクトのメンバーではありません', 403);
        }

        let hasPermission = false;
        for (const member of members) {
          for (const memberRole of member.memberRoles) {
            if (memberRole.role.hasPermission(permission)) {
              hasPermission = true;
              break;
            }
          }
          if (hasPermission) break;
        }

        if (!hasPermission) {
          throw new AppError('この操作を行う権限がありません', 403);
        }

        return next();
      }

      // For update/delete, check issue's project membership
      const issueId = req.params.id || req.params.issueId;
      if (!issueId) {
        throw new AppError('課題IDが必要です', 400);
      }

      const { Issue } = await import('../entities/Issue');
      const issueRepository = AppDataSource.getRepository(Issue);
      const issue = await issueRepository.findOne({
        where: { id: parseInt(issueId) },
        relations: ['project'],
      });

      if (!issue) {
        throw new AppError('課題が見つかりません', 404);
      }

      const memberRepository = AppDataSource.getRepository(Member);
      const members = await memberRepository.find({
        where: {
          userId: user.id,
          projectId: issue.projectId,
        },
        relations: ['memberRoles', 'memberRoles.role'],
      });

      if (members.length === 0) {
        throw new AppError('このプロジェクトのメンバーではありません', 403);
      }

      let hasPermission = false;
      for (const member of members) {
        for (const memberRole of member.memberRoles) {
          if (memberRole.role.hasPermission(permission)) {
            hasPermission = true;
            break;
          }
        }
        if (hasPermission) break;
      }

      if (!hasPermission) {
        throw new AppError('この操作を行う権限がありません', 403);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user can view project
 */
export const canViewProject = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const projectId = req.params.projectId || req.params.id;

    if (!projectId) {
      throw new AppError('プロジェクトIDが必要です', 400);
    }

    const projectRepository = AppDataSource.getRepository(Project);
    const project = await projectRepository.findOne({
      where: { id: parseInt(projectId) },
    });

    if (!project) {
      throw new AppError('プロジェクトが見つかりません', 404);
    }

    // Public projects can be viewed by anyone (if authenticated)
    if (project.isPublic && user) {
      return next();
    }

    // Admin can view all projects
    if (user?.admin) {
      return next();
    }

    // Check if user is member
    if (user) {
      const memberRepository = AppDataSource.getRepository(Member);
      const member = await memberRepository.findOne({
        where: {
          userId: user.id,
          projectId: project.id,
        },
      });

      if (member) {
        return next();
      }
    }

    throw new AppError('このプロジェクトを閲覧する権限がありません', 403);
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user can view issue
 */
export const canViewIssue = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = req.user;
    const issueId = req.params.issueId || req.params.id;

    if (!issueId) {
      throw new AppError('課題IDが必要です', 400);
    }

    // Get issue with project
    const { Issue } = await import('../entities/Issue');
    const issueRepository = AppDataSource.getRepository(Issue);
    const issue = await issueRepository.findOne({
      where: { id: parseInt(issueId) },
      relations: ['project'],
    });

    if (!issue) {
      throw new AppError('課題が見つかりません', 404);
    }

    // Admin can view all issues
    if (user?.admin) {
      return next();
    }

    // Check if project is public and user is authenticated
    const projectRepository = AppDataSource.getRepository(Project);
    const project = await projectRepository.findOne({
      where: { id: issue.projectId },
    });

    if (!project) {
      throw new AppError('プロジェクトが見つかりません', 404);
    }

    // For non-public projects, user must be a member
    if (!project.isPublic) {
      if (!user) {
        throw new AppError('認証が必要です', 401);
      }

      const memberRepository = AppDataSource.getRepository(Member);
      const member = await memberRepository.findOne({
        where: {
          userId: user.id,
          projectId: issue.projectId,
        },
        relations: ['memberRoles', 'memberRoles.role'],
      });

      if (!member) {
        throw new AppError('このプロジェクトのメンバーではありません', 403);
      }

      // Check if user has view_issues permission
      let canView = false;
      for (const memberRole of member.memberRoles) {
        if (memberRole.role.hasPermission('view_issues')) {
          canView = true;
          break;
        }
      }

      if (!canView) {
        throw new AppError('課題を閲覧する権限がありません', 403);
      }
    } else {
      // Public project: user must be authenticated
      if (!user) {
        throw new AppError('認証が必要です', 401);
      }
    }

    // Private issues require special permission
    if (issue.isPrivate) {
      // Admin or author can always view
      if (user.admin || issue.authorId === user.id) {
        return next();
      }

      // Check view_private_notes or set_notes_private permission
      const memberRepository = AppDataSource.getRepository(Member);
      const members = await memberRepository.find({
        where: {
          userId: user.id,
          projectId: issue.projectId,
        },
        relations: ['memberRoles', 'memberRoles.role'],
      });

      if (members.length === 0) {
        throw new AppError('このプロジェクトのメンバーではありません', 403);
      }

      let canViewPrivate = false;
      for (const member of members) {
        for (const memberRole of member.memberRoles) {
          if (memberRole.role.hasPermission('view_private_notes') || 
              memberRole.role.hasPermission('set_notes_private')) {
            canViewPrivate = true;
            break;
          }
        }
        if (canViewPrivate) break;
      }

      if (!canViewPrivate) {
        throw new AppError('このプライベート課題を閲覧する権限がありません', 403);
      }
    }

    // Check if user can view the project
    if (issue.project.isPublic && user) {
      return next();
    }

    if (user?.admin) {
      return next();
    }

    if (user) {
      const memberRepository = AppDataSource.getRepository(Member);
      const member = await memberRepository.findOne({
        where: {
          userId: user.id,
          projectId: issue.projectId,
        },
        relations: ['memberRoles', 'memberRoles.role'],
      });

      if (member) {
        // Check view_issues permission
        let canView = false;
        for (const memberRole of member.memberRoles) {
          if (memberRole.role.hasPermission('view_issues')) {
            canView = true;
            break;
          }
        }

        if (canView) {
          return next();
        }
      }
    }

    throw new AppError('この課題を閲覧する権限がありません', 403);
  } catch (error) {
    next(error);
  }
};

/**
 * Attach user's permissions to request
 */
export const attachPermissions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next();
    }

    // Admin has all permissions
    if (req.user.admin) {
      req.user.permissions = ['*']; // Wildcard for all permissions
      return next();
    }

    // Get all user's roles
    const memberRepository = AppDataSource.getRepository(Member);
    const members = await memberRepository.find({
      where: { userId: req.user.id },
      relations: ['memberRoles', 'memberRoles.role'],
    });

    // Collect unique permissions
    const permissions = new Set<string>();
    for (const member of members) {
      for (const memberRole of member.memberRoles) {
        const rolePermissions = memberRole.role.getPermissions();
        rolePermissions.forEach((p) => permissions.add(p));
      }
    }

    req.user.permissions = Array.from(permissions);
    next();
  } catch (error) {
    next(error);
  }
};
