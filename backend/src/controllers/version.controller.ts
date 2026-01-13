import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Version, VersionStatus } from '../entities/Version';
import { Project } from '../entities/Project';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get all versions for a project
export const getProjectVersions = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  const { status = '' } = req.query;

  const versionRepository = AppDataSource.getRepository(Version);
  const queryBuilder = versionRepository
    .createQueryBuilder('version')
    .leftJoinAndSelect('version.project', 'project')
    .leftJoinAndSelect('version.issues', 'issues')
    .where('version.project_id = :projectId', { projectId: parseInt(projectId) });

  // Filter by status
  if (status) {
    queryBuilder.andWhere('version.status = :status', { status });
  }

  const versions = await queryBuilder
    .orderBy('version.dueDate', 'ASC')
    .addOrderBy('version.name', 'ASC')
    .getMany();

  res.json({
    status: 'success',
    data: { versions },
  });
});

// Get version by ID
export const getVersionById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const versionRepository = AppDataSource.getRepository(Version);
  const version = await versionRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['project', 'issues', 'issues.status', 'issues.tracker', 'issues.priority'],
  });

  if (!version) {
    throw new AppError('バージョンが見つかりません', 404);
  }

  // Calculate completion statistics
  const totalIssues = version.issues?.length || 0;
  const closedIssues = version.issues?.filter((issue) => issue.closedOn !== null).length || 0;
  const completionRate = totalIssues > 0 ? Math.round((closedIssues / totalIssues) * 100) : 0;

  res.json({
    status: 'success',
    data: {
      version,
      statistics: {
        totalIssues,
        closedIssues,
        completionRate,
      },
    },
  });
});

// Create version
export const createVersion = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  const {
    name,
    description = '',
    status = VersionStatus.OPEN,
    dueDate = null,
    sharing = 'none',
  } = req.body;

  if (!name) {
    throw new AppError('バージョン名は必須です', 400);
  }

  // Verify project exists
  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: parseInt(projectId) },
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  const versionRepository = AppDataSource.getRepository(Version);

  // Check for duplicate name
  const existingVersion = await versionRepository.findOne({
    where: {
      projectId: parseInt(projectId),
      name,
    },
  });

  if (existingVersion) {
    throw new AppError('このバージョン名は既に存在します', 400);
  }

  const version = versionRepository.create({
    projectId: parseInt(projectId),
    name,
    description,
    status,
    dueDate: dueDate ? new Date(dueDate) : null,
    sharing,
    createdOn: new Date(),
    updatedOn: new Date(),
  });

  await versionRepository.save(version);

  // Reload with relations
  const savedVersion = await versionRepository.findOne({
    where: { id: version.id },
    relations: ['project'],
  });

  res.status(201).json({
    status: 'success',
    message: 'バージョンを作成しました',
    data: { version: savedVersion },
  });
});

// Update version
export const updateVersion = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, description, status, dueDate, sharing } = req.body;

  const versionRepository = AppDataSource.getRepository(Version);
  const version = await versionRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!version) {
    throw new AppError('バージョンが見つかりません', 404);
  }

  // Check for duplicate name
  if (name !== undefined && name !== version.name) {
    const existingVersion = await versionRepository.findOne({
      where: {
        projectId: version.projectId,
        name,
      },
    });

    if (existingVersion) {
      throw new AppError('このバージョン名は既に存在します', 400);
    }
  }

  // Update fields
  if (name !== undefined) version.name = name;
  if (description !== undefined) version.description = description;
  if (status !== undefined) version.status = status;
  if (dueDate !== undefined) version.dueDate = dueDate ? new Date(dueDate) : null;
  if (sharing !== undefined) version.sharing = sharing;

  version.updatedOn = new Date();

  await versionRepository.save(version);

  // Reload with relations
  const updatedVersion = await versionRepository.findOne({
    where: { id: version.id },
    relations: ['project'],
  });

  res.json({
    status: 'success',
    message: 'バージョンを更新しました',
    data: { version: updatedVersion },
  });
});

// Delete version
export const deleteVersion = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const versionRepository = AppDataSource.getRepository(Version);
  const version = await versionRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['issues'],
  });

  if (!version) {
    throw new AppError('バージョンが見つかりません', 404);
  }

  // Cannot delete if there are issues assigned to this version
  if (version.issues && version.issues.length > 0) {
    throw new AppError('このバージョンに課題が割り当てられているため削除できません', 400);
  }

  await versionRepository.remove(version);

  res.json({
    status: 'success',
    message: 'バージョンを削除しました',
  });
});

// Close version
export const closeVersion = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const versionRepository = AppDataSource.getRepository(Version);
  const version = await versionRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!version) {
    throw new AppError('バージョンが見つかりません', 404);
  }

  version.status = VersionStatus.CLOSED;
  version.updatedOn = new Date();

  await versionRepository.save(version);

  res.json({
    status: 'success',
    message: 'バージョンをクローズしました',
    data: { version },
  });
});

// Reopen version
export const reopenVersion = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const versionRepository = AppDataSource.getRepository(Version);
  const version = await versionRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!version) {
    throw new AppError('バージョンが見つかりません', 404);
  }

  version.status = VersionStatus.OPEN;
  version.updatedOn = new Date();

  await versionRepository.save(version);

  res.json({
    status: 'success',
    message: 'バージョンを再オープンしました',
    data: { version },
  });
});
