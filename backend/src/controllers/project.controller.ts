import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Project, ProjectStatus } from '../entities/Project';
import { Member } from '../entities/Member';
import { MemberRole } from '../entities/MemberRole';
import { Role } from '../entities/Role';
import { User } from '../entities/User';
import { EnabledModule } from '../entities/EnabledModule';
import { Tracker } from '../entities/Tracker';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get all projects
export const getAllProjects = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 25, search = '', status = '' } = req.query;
  
  const projectRepository = AppDataSource.getRepository(Project);
  const queryBuilder = projectRepository
    .createQueryBuilder('project')
    .leftJoinAndSelect('project.trackers', 'trackers')
    .leftJoinAndSelect('project.enabledModules', 'enabledModules');

  // Non-admin users can only see public projects or projects they're members of
  if (!req.user?.admin) {
    if (req.user) {
      queryBuilder.where(
        '(project.isPublic = :isPublic OR EXISTS (SELECT 1 FROM members m WHERE m.project_id = project.id AND m.user_id = :userId))',
        { isPublic: true, userId: req.user.id }
      );
    } else {
      queryBuilder.where('project.isPublic = :isPublic', { isPublic: true });
    }
  }

  // Search filter
  if (search) {
    queryBuilder.andWhere(
      '(project.name LIKE :search OR project.identifier LIKE :search OR project.description LIKE :search)',
      { search: `%${search}%` }
    );
  }

  // Status filter
  if (status) {
    queryBuilder.andWhere('project.status = :status', { status: parseInt(status as string) });
  }

  // Pagination
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [projects, total] = await queryBuilder
    .skip(skip)
    .take(limitNum)
    .orderBy('project.id', 'DESC')
    .getManyAndCount();

  res.json({
    status: 'success',
    data: {
      projects,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
  });
});

// Get project by ID
export const getProjectById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: parseInt(id) },
    relations: [
      'parent',
      'children',
      'trackers',
      'enabledModules',
      'members',
      'members.user',
      'members.memberRoles',
      'members.memberRoles.role',
    ],
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  // Check view permission
  if (!project.isPublic && !req.user?.admin) {
    if (!req.user) {
      throw new AppError('認証が必要です', 401);
    }

    const isMember = project.members.some((m) => m.userId === req.user!.id);
    if (!isMember) {
      throw new AppError('このプロジェクトを閲覧する権限がありません', 403);
    }
  }

  res.json({
    status: 'success',
    data: { project },
  });
});

// Create project
export const createProject = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    identifier,
    name,
    description = '',
    isPublic = true,
    parentId = null,
    trackerIds = [],
    enabledModuleNames = ['issue_tracking', 'time_tracking'],
  } = req.body;

  if (!identifier || !name) {
    throw new AppError('識別子とプロジェクト名は必須です', 400);
  }

  const projectRepository = AppDataSource.getRepository(Project);

  // Check if identifier exists
  const existingProject = await projectRepository.findOne({
    where: { identifier },
  });

  if (existingProject) {
    throw new AppError('この識別子は既に使用されています', 400);
  }

  // Create project
  const project = projectRepository.create({
    identifier,
    name,
    description,
    isPublic,
    parentId,
    status: ProjectStatus.ACTIVE,
  });

  await projectRepository.save(project);

  // Add trackers
  if (trackerIds.length > 0) {
    const trackerRepository = AppDataSource.getRepository(Tracker);
    const trackers = await trackerRepository.findByIds(trackerIds);
    project.trackers = trackers;
    await projectRepository.save(project);
  }

  // Add enabled modules
  if (enabledModuleNames.length > 0) {
    const enabledModuleRepository = AppDataSource.getRepository(EnabledModule);
    for (const moduleName of enabledModuleNames) {
      const module = enabledModuleRepository.create({
        projectId: project.id,
        name: moduleName,
      });
      await enabledModuleRepository.save(module);
    }
  }

  // Add creator as manager
  if (req.user) {
    const memberRepository = AppDataSource.getRepository(Member);
    const memberRoleRepository = AppDataSource.getRepository(MemberRole);
    const roleRepository = AppDataSource.getRepository(Role);

    // Find manager role (or create if not exists)
    let managerRole = await roleRepository.findOne({
      where: { name: '管理者' },
    });

    if (!managerRole) {
      managerRole = await roleRepository.findOne({
        where: { builtin: 1 }, // Built-in manager role
      });
    }

    if (managerRole) {
      const member = memberRepository.create({
        userId: req.user.id,
        projectId: project.id,
      });
      await memberRepository.save(member);

      const memberRole = memberRoleRepository.create({
        memberId: member.id,
        roleId: managerRole.id,
      });
      await memberRoleRepository.save(memberRole);
    }
  }

  res.status(201).json({
    status: 'success',
    message: 'プロジェクトを作成しました',
    data: { project },
  });
});

// Update project
export const updateProject = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    name,
    description,
    isPublic,
    status,
    parentId,
    trackerIds,
    enabledModuleNames,
  } = req.body;

  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['trackers', 'enabledModules'],
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  // Update fields
  if (name !== undefined) project.name = name;
  if (description !== undefined) project.description = description;
  if (isPublic !== undefined) project.isPublic = isPublic;
  if (status !== undefined) project.status = status;
  if (parentId !== undefined) project.parentId = parentId;

  // Update trackers
  if (trackerIds !== undefined) {
    const trackerRepository = AppDataSource.getRepository(Tracker);
    const trackers = await trackerRepository.findByIds(trackerIds);
    project.trackers = trackers;
  }

  // Update enabled modules
  if (enabledModuleNames !== undefined) {
    // Remove existing modules
    const enabledModuleRepository = AppDataSource.getRepository(EnabledModule);
    await enabledModuleRepository.delete({ projectId: project.id });

    // Add new modules
    for (const moduleName of enabledModuleNames) {
      const module = enabledModuleRepository.create({
        projectId: project.id,
        name: moduleName,
      });
      await enabledModuleRepository.save(module);
    }
  }

  await projectRepository.save(project);

  res.json({
    status: 'success',
    message: 'プロジェクトを更新しました',
    data: { project },
  });
});

// Delete project (admin only)
export const deleteProject = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['children'],
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  // Cannot delete if has children
  if (project.children && project.children.length > 0) {
    throw new AppError('サブプロジェクトが存在するため削除できません', 400);
  }

  // Soft delete by setting status to archived
  project.status = ProjectStatus.ARCHIVED;
  await projectRepository.save(project);

  res.json({
    status: 'success',
    message: 'プロジェクトをアーカイブしました',
  });
});

// Close project
export const closeProject = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  project.status = ProjectStatus.CLOSED;
  await projectRepository.save(project);

  res.json({
    status: 'success',
    message: 'プロジェクトをクローズしました',
    data: { project },
  });
});

// Reopen project
export const reopenProject = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  project.status = ProjectStatus.ACTIVE;
  await projectRepository.save(project);

  res.json({
    status: 'success',
    message: 'プロジェクトを再オープンしました',
    data: { project },
  });
});

// Archive project
export const archiveProject = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  project.status = ProjectStatus.ARCHIVED;
  await projectRepository.save(project);

  res.json({
    status: 'success',
    message: 'プロジェクトをアーカイブしました',
    data: { project },
  });
});

// Unarchive project
export const unarchiveProject = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  project.status = ProjectStatus.ACTIVE;
  await projectRepository.save(project);

  res.json({
    status: 'success',
    message: 'プロジェクトのアーカイブを解除しました',
    data: { project },
  });
});
