import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Issue } from '../entities/Issue';
import { Project } from '../entities/Project';
import { Tracker } from '../entities/Tracker';
import { IssueStatus } from '../entities/IssueStatus';
import { IssuePriority } from '../entities/IssuePriority';
import { IssueCategory } from '../entities/IssueCategory';
import { Version } from '../entities/Version';
import { User } from '../entities/User';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get all issues
export const getAllIssues = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    page = 1,
    limit = 25,
    search = '',
    projectId = '',
    statusId = '',
    trackerId = '',
    priorityId = '',
    assignedToId = '',
    authorId = '',
  } = req.query;

  const issueRepository = AppDataSource.getRepository(Issue);
  const queryBuilder = issueRepository
    .createQueryBuilder('issue')
    .leftJoinAndSelect('issue.project', 'project')
    .leftJoinAndSelect('issue.tracker', 'tracker')
    .leftJoinAndSelect('issue.status', 'status')
    .leftJoinAndSelect('issue.priority', 'priority')
    .leftJoinAndSelect('issue.author', 'author')
    .leftJoinAndSelect('issue.assignedTo', 'assignedTo')
    .leftJoinAndSelect('issue.category', 'category');

  // Non-admin users can only see issues from projects they have access to
  if (!req.user?.admin) {
    if (req.user) {
      queryBuilder.where(
        '(project.isPublic = :isPublic OR EXISTS (SELECT 1 FROM members m WHERE m.project_id = issue.project_id AND m.user_id = :userId))',
        { isPublic: true, userId: req.user.id }
      );
    } else {
      queryBuilder.where('project.isPublic = :isPublic', { isPublic: true });
    }

    // Hide private issues for non-members
    queryBuilder.andWhere(
      '(issue.isPrivate = :isPrivate OR issue.author_id = :userId)',
      { isPrivate: false, userId: req.user?.id || 0 }
    );
  }

  // Filters
  if (search) {
    queryBuilder.andWhere(
      '(issue.subject LIKE :search OR issue.description LIKE :search)',
      { search: `%${search}%` }
    );
  }

  if (projectId) {
    queryBuilder.andWhere('issue.project_id = :projectId', {
      projectId: parseInt(projectId as string),
    });
  }

  if (statusId) {
    queryBuilder.andWhere('issue.status_id = :statusId', {
      statusId: parseInt(statusId as string),
    });
  }

  if (trackerId) {
    queryBuilder.andWhere('issue.tracker_id = :trackerId', {
      trackerId: parseInt(trackerId as string),
    });
  }

  if (priorityId) {
    queryBuilder.andWhere('issue.priority_id = :priorityId', {
      priorityId: parseInt(priorityId as string),
    });
  }

  if (assignedToId) {
    queryBuilder.andWhere('issue.assigned_to_id = :assignedToId', {
      assignedToId: parseInt(assignedToId as string),
    });
  }

  if (authorId) {
    queryBuilder.andWhere('issue.author_id = :authorId', {
      authorId: parseInt(authorId as string),
    });
  }

  // Pagination
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [issues, total] = await queryBuilder
    .skip(skip)
    .take(limitNum)
    .orderBy('issue.id', 'DESC')
    .getManyAndCount();

  res.json({
    status: 'success',
    data: {
      issues,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
  });
});

// Get issue by ID
export const getIssueById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const issueRepository = AppDataSource.getRepository(Issue);
  const issue = await issueRepository.findOne({
    where: { id: parseInt(id) },
    relations: [
      'project',
      'tracker',
      'status',
      'priority',
      'author',
      'assignedTo',
      'category',
      'fixedVersion',
      'parent',
      'children',
      'journals',
      'journals.user',
      'journals.details',
      'timeEntries',
      'timeEntries.user',
      'timeEntries.activity',
      'attachments',
      'attachments.author',
      'relationsFrom',
      'relationsFrom.issueTo',
      'relationsTo',
      'relationsTo.issueFrom',
      'watchers',
      'watchers.user',
    ],
  });

  if (!issue) {
    throw new AppError('課題が見つかりません', 404);
  }

  // Check view permission
  if (issue.isPrivate && !req.user?.admin) {
    if (!req.user || issue.authorId !== req.user.id) {
      throw new AppError('このプライベート課題を閲覧する権限がありません', 403);
    }
  }

  res.json({
    status: 'success',
    data: { issue },
  });
});

// Create issue
export const createIssue = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    projectId,
    trackerId,
    subject,
    description = '',
    statusId,
    priorityId,
    assignedToId = null,
    categoryId = null,
    fixedVersionId = null,
    startDate = null,
    dueDate = null,
    estimatedHours = null,
    doneRatio = 0,
    isPrivate = false,
    parentId = null,
  } = req.body;

  if (!projectId || !trackerId || !subject) {
    throw new AppError('プロジェクト、トラッカー、件名は必須です', 400);
  }

  // Verify project exists
  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: projectId },
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  // Get default status if not provided
  let finalStatusId = statusId;
  if (!finalStatusId) {
    const trackerRepository = AppDataSource.getRepository(Tracker);
    const tracker = await trackerRepository.findOne({
      where: { id: trackerId },
      relations: ['defaultStatus'],
    });
    
    if (tracker?.defaultStatus) {
      finalStatusId = tracker.defaultStatus.id;
    } else {
      // Get first available status
      const statusRepository = AppDataSource.getRepository(IssueStatus);
      const firstStatus = await statusRepository.findOne({
        order: { position: 'ASC' },
      });
      finalStatusId = firstStatus?.id || 1;
    }
  }

  // Get default priority if not provided
  let finalPriorityId = priorityId;
  if (!finalPriorityId) {
    const priorityRepository = AppDataSource.getRepository(IssuePriority);
    const defaultPriority = await priorityRepository.findOne({
      where: { isDefault: true },
    });
    finalPriorityId = defaultPriority?.id || 1;
  }

  const issueRepository = AppDataSource.getRepository(Issue);
  const issue = issueRepository.create({
    projectId,
    trackerId,
    subject,
    description,
    statusId: finalStatusId,
    priorityId: finalPriorityId,
    authorId: req.user!.id,
    assignedToId,
    categoryId,
    fixedVersionId,
    startDate,
    dueDate,
    estimatedHours,
    doneRatio,
    isPrivate,
    parentId,
  });

  await issueRepository.save(issue);

  // Reload with relations
  const savedIssue = await issueRepository.findOne({
    where: { id: issue.id },
    relations: [
      'project',
      'tracker',
      'status',
      'priority',
      'author',
      'assignedTo',
      'category',
      'fixedVersion',
    ],
  });

  res.status(201).json({
    status: 'success',
    message: '課題を作成しました',
    data: { issue: savedIssue },
  });
});

// Update issue
export const updateIssue = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    subject,
    description,
    statusId,
    priorityId,
    assignedToId,
    categoryId,
    fixedVersionId,
    startDate,
    dueDate,
    estimatedHours,
    doneRatio,
    isPrivate,
    parentId,
  } = req.body;

  const issueRepository = AppDataSource.getRepository(Issue);
  const issue = await issueRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['project', 'status'],
  });

  if (!issue) {
    throw new AppError('課題が見つかりません', 404);
  }

  // Check if issue is closed
  if (issue.closedOn && !req.user?.admin) {
    throw new AppError('クローズされた課題は編集できません', 400);
  }

  // Update fields
  if (subject !== undefined) issue.subject = subject;
  if (description !== undefined) issue.description = description;
  if (statusId !== undefined) {
    // Check if new status is closed
    const statusRepository = AppDataSource.getRepository(IssueStatus);
    const newStatus = await statusRepository.findOne({
      where: { id: statusId },
    });
    
    if (newStatus?.isClosed && !issue.closedOn) {
      issue.closedOn = new Date();
    } else if (!newStatus?.isClosed && issue.closedOn) {
      issue.closedOn = null;
    }
    
    issue.statusId = statusId;
  }
  if (priorityId !== undefined) issue.priorityId = priorityId;
  if (assignedToId !== undefined) issue.assignedToId = assignedToId;
  if (categoryId !== undefined) issue.categoryId = categoryId;
  if (fixedVersionId !== undefined) issue.fixedVersionId = fixedVersionId;
  if (startDate !== undefined) issue.startDate = startDate;
  if (dueDate !== undefined) issue.dueDate = dueDate;
  if (estimatedHours !== undefined) issue.estimatedHours = estimatedHours;
  if (doneRatio !== undefined) issue.doneRatio = doneRatio;
  if (isPrivate !== undefined) issue.isPrivate = isPrivate;
  if (parentId !== undefined) issue.parentId = parentId;

  await issueRepository.save(issue);

  // Reload with relations
  const updatedIssue = await issueRepository.findOne({
    where: { id: issue.id },
    relations: [
      'project',
      'tracker',
      'status',
      'priority',
      'author',
      'assignedTo',
      'category',
      'fixedVersion',
    ],
  });

  res.json({
    status: 'success',
    message: '課題を更新しました',
    data: { issue: updatedIssue },
  });
});

// Delete issue
export const deleteIssue = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const issueRepository = AppDataSource.getRepository(Issue);
  const issue = await issueRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['children'],
  });

  if (!issue) {
    throw new AppError('課題が見つかりません', 404);
  }

  // Cannot delete if has children
  if (issue.children && issue.children.length > 0) {
    throw new AppError('サブタスクが存在するため削除できません', 400);
  }

  await issueRepository.remove(issue);

  res.json({
    status: 'success',
    message: '課題を削除しました',
  });
});

// Copy issue
export const copyIssue = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { projectId, copyWatchers = false, copyAttachments = false } = req.body;

  const issueRepository = AppDataSource.getRepository(Issue);
  const originalIssue = await issueRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['watchers', 'attachments'],
  });

  if (!originalIssue) {
    throw new AppError('課題が見つかりません', 404);
  }

  // Create copy
  const copiedIssue = issueRepository.create({
    projectId: projectId || originalIssue.projectId,
    trackerId: originalIssue.trackerId,
    subject: `Copy of: ${originalIssue.subject}`,
    description: originalIssue.description,
    statusId: originalIssue.statusId,
    priorityId: originalIssue.priorityId,
    authorId: req.user!.id,
    categoryId: originalIssue.categoryId,
    estimatedHours: originalIssue.estimatedHours,
    isPrivate: originalIssue.isPrivate,
  });

  await issueRepository.save(copiedIssue);

  // Copy watchers if requested
  if (copyWatchers && originalIssue.watchers) {
    const { Watcher } = await import('../entities/Watcher');
    const watcherRepository = AppDataSource.getRepository(Watcher);
    
    for (const watcher of originalIssue.watchers) {
      const newWatcher = watcherRepository.create({
        watchableType: 'Issue',
        watchableId: copiedIssue.id,
        userId: watcher.userId,
      });
      await watcherRepository.save(newWatcher);
    }
  }

  res.status(201).json({
    status: 'success',
    message: '課題をコピーしました',
    data: { issue: copiedIssue },
  });
});

// Bulk update issues
export const bulkUpdateIssues = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueIds, updates } = req.body;

  if (!issueIds || !Array.isArray(issueIds) || issueIds.length === 0) {
    throw new AppError('課題IDは必須です', 400);
  }

  const issueRepository = AppDataSource.getRepository(Issue);
  const issues = await issueRepository.findByIds(issueIds);

  if (issues.length === 0) {
    throw new AppError('課題が見つかりません', 404);
  }

  // Apply updates to all issues
  for (const issue of issues) {
    if (updates.statusId !== undefined) issue.statusId = updates.statusId;
    if (updates.priorityId !== undefined) issue.priorityId = updates.priorityId;
    if (updates.assignedToId !== undefined) issue.assignedToId = updates.assignedToId;
    if (updates.categoryId !== undefined) issue.categoryId = updates.categoryId;
    if (updates.fixedVersionId !== undefined) issue.fixedVersionId = updates.fixedVersionId;
    if (updates.doneRatio !== undefined) issue.doneRatio = updates.doneRatio;
  }

  await issueRepository.save(issues);

  res.json({
    status: 'success',
    message: `${issues.length}件の課題を更新しました`,
    data: { count: issues.length },
  });
});
