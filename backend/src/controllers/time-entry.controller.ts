import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { TimeEntry } from '../entities/TimeEntry';
import { Project } from '../entities/Project';
import { Issue } from '../entities/Issue';
import { TimeEntryActivity } from '../entities/TimeEntryActivity';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get all time entries
export const getAllTimeEntries = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    page = 1,
    limit = 25,
    projectId = '',
    issueId = '',
    userId = '',
    from = '',
    to = '',
  } = req.query;

  const timeEntryRepository = AppDataSource.getRepository(TimeEntry);
  const queryBuilder = timeEntryRepository
    .createQueryBuilder('timeEntry')
    .leftJoinAndSelect('timeEntry.project', 'project')
    .leftJoinAndSelect('timeEntry.issue', 'issue')
    .leftJoinAndSelect('timeEntry.user', 'user')
    .leftJoinAndSelect('timeEntry.activity', 'activity');

  // Non-admin users can only see time entries from projects they have access to
  if (!req.user?.admin) {
    if (req.user) {
      queryBuilder.where(
        '(project.isPublic = :isPublic OR EXISTS (SELECT 1 FROM members m WHERE m.project_id = timeEntry.project_id AND m.user_id = :userId))',
        { isPublic: true, userId: req.user.id }
      );
    } else {
      queryBuilder.where('project.isPublic = :isPublic', { isPublic: true });
    }
  }

  // Filters
  if (projectId) {
    queryBuilder.andWhere('timeEntry.project_id = :projectId', {
      projectId: parseInt(projectId as string),
    });
  }

  if (issueId) {
    queryBuilder.andWhere('timeEntry.issue_id = :issueId', {
      issueId: parseInt(issueId as string),
    });
  }

  if (userId) {
    queryBuilder.andWhere('timeEntry.user_id = :userId', {
      userId: parseInt(userId as string),
    });
  }

  if (from) {
    queryBuilder.andWhere('timeEntry.spent_on >= :from', { from });
  }

  if (to) {
    queryBuilder.andWhere('timeEntry.spent_on <= :to', { to });
  }

  // Pagination
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [timeEntries, total] = await queryBuilder
    .skip(skip)
    .take(limitNum)
    .orderBy('timeEntry.spent_on', 'DESC')
    .getManyAndCount();

  // Calculate total hours
  const totalHours = timeEntries.reduce(
    (sum, entry) => sum + parseFloat(entry.hours.toString()),
    0
  );

  res.json({
    status: 'success',
    data: {
      timeEntries,
      totalHours: totalHours.toFixed(2),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
  });
});

// Get time entry by ID
export const getTimeEntryById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const timeEntryRepository = AppDataSource.getRepository(TimeEntry);
  const timeEntry = await timeEntryRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['project', 'issue', 'user', 'activity'],
  });

  if (!timeEntry) {
    throw new AppError('作業時間が見つかりません', 404);
  }

  res.json({
    status: 'success',
    data: { timeEntry },
  });
});

// Create time entry
export const createTimeEntry = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    projectId,
    issueId = null,
    hours,
    comments = '',
    activityId,
    spentOn,
    userId = null,
  } = req.body;

  if (!projectId || !hours || !activityId || !spentOn) {
    throw new AppError('プロジェクト、時間、活動、日付は必須です', 400);
  }

  if (hours <= 0) {
    throw new AppError('時間は0より大きい値を指定してください', 400);
  }

  // Verify project exists
  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: projectId },
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  // Check if user has log_time permission for this project
  if (!req.user?.admin) {
    const { Member } = await import('../entities/Member');
    const memberRepository = AppDataSource.getRepository(Member);
    const members = await memberRepository.find({
      where: {
        userId: req.user!.id,
        projectId: projectId,
      },
      relations: ['memberRoles', 'memberRoles.role'],
    });

    if (members.length === 0) {
      throw new AppError('このプロジェクトのメンバーではありません', 403);
    }

    let hasPermission = false;
    for (const member of members) {
      for (const memberRole of member.memberRoles) {
        if (memberRole.role.hasPermission('log_time')) {
          hasPermission = true;
          break;
        }
      }
      if (hasPermission) break;
    }

    if (!hasPermission) {
      throw new AppError('作業時間を記録する権限がありません', 403);
    }
  }

  // Verify issue exists if provided
  if (issueId) {
    const issueRepository = AppDataSource.getRepository(Issue);
    const issue = await issueRepository.findOne({
      where: { id: issueId },
    });

    if (!issue) {
      throw new AppError('課題が見つかりません', 404);
    }

    if (issue.projectId !== projectId) {
      throw new AppError('課題がこのプロジェクトに属していません', 400);
    }
  }

  // Verify activity exists
  const activityRepository = AppDataSource.getRepository(TimeEntryActivity);
  const activity = await activityRepository.findOne({
    where: { id: activityId },
  });

  if (!activity) {
    throw new AppError('活動が見つかりません', 404);
  }

  const timeEntryRepository = AppDataSource.getRepository(TimeEntry);
  const timeEntry = timeEntryRepository.create({
    projectId,
    issueId,
    userId: userId || req.user!.id,
    hours,
    comments,
    activityId,
    spentOn: new Date(spentOn),
    authorId: req.user!.id,
  });

  await timeEntryRepository.save(timeEntry);

  // Reload with relations
  const savedTimeEntry = await timeEntryRepository.findOne({
    where: { id: timeEntry.id },
    relations: ['project', 'issue', 'user', 'activity'],
  });

  res.status(201).json({
    status: 'success',
    message: '作業時間を記録しました',
    data: { timeEntry: savedTimeEntry },
  });
});

// Update time entry
export const updateTimeEntry = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { hours, comments, activityId, spentOn } = req.body;

  const timeEntryRepository = AppDataSource.getRepository(TimeEntry);
  const timeEntry = await timeEntryRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!timeEntry) {
    throw new AppError('作業時間が見つかりません', 404);
  }

  // Only author or admin can update
  if (!req.user?.admin && timeEntry.authorId !== req.user!.id) {
    throw new AppError('この作業時間を編集する権限がありません', 403);
  }

  // Update fields
  if (hours !== undefined) {
    if (hours <= 0) {
      throw new AppError('時間は0より大きい値を指定してください', 400);
    }
    timeEntry.hours = hours;
  }

  if (comments !== undefined) timeEntry.comments = comments;
  if (activityId !== undefined) timeEntry.activityId = activityId;
  if (spentOn !== undefined) timeEntry.spentOn = new Date(spentOn);

  await timeEntryRepository.save(timeEntry);

  // Reload with relations
  const updatedTimeEntry = await timeEntryRepository.findOne({
    where: { id: timeEntry.id },
    relations: ['project', 'issue', 'user', 'activity'],
  });

  res.json({
    status: 'success',
    message: '作業時間を更新しました',
    data: { timeEntry: updatedTimeEntry },
  });
});

// Delete time entry
export const deleteTimeEntry = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const timeEntryRepository = AppDataSource.getRepository(TimeEntry);
  const timeEntry = await timeEntryRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!timeEntry) {
    throw new AppError('作業時間が見つかりません', 404);
  }

  // Only author or admin can delete
  if (!req.user?.admin && timeEntry.authorId !== req.user!.id) {
    throw new AppError('この作業時間を削除する権限がありません', 403);
  }

  await timeEntryRepository.remove(timeEntry);

  res.json({
    status: 'success',
    message: '作業時間を削除しました',
  });
});

// Get time entry activities
export const getActivities = catchAsync(async (req: AuthRequest, res: Response) => {
  const activityRepository = AppDataSource.getRepository(TimeEntryActivity);
  const activities = await activityRepository.find({
    order: { position: 'ASC' },
  });

  res.json({
    status: 'success',
    data: { activities },
  });
});

// Create time entry activity
export const createActivity = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name, position = 1, isDefault = false } = req.body;

  if (!name) {
    throw new AppError('活動名は必須です', 400);
  }

  const activityRepository = AppDataSource.getRepository(TimeEntryActivity);

  // Check for duplicate name
  const existingActivity = await activityRepository.findOne({
    where: { name },
  });

  if (existingActivity) {
    throw new AppError('この活動名は既に存在します', 400);
  }

  // If this is set as default, unset other defaults
  if (isDefault) {
    await activityRepository.update({ isDefault: true }, { isDefault: false });
  }

  const activity = activityRepository.create({
    name,
    position,
    isDefault,
  });

  await activityRepository.save(activity);

  res.status(201).json({
    status: 'success',
    message: '活動を作成しました',
    data: { activity },
  });
});

// Update time entry activity
export const updateActivity = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, position, isDefault } = req.body;

  const activityRepository = AppDataSource.getRepository(TimeEntryActivity);
  const activity = await activityRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!activity) {
    throw new AppError('活動が見つかりません', 404);
  }

  // If this is set as default, unset other defaults
  if (isDefault && !activity.isDefault) {
    await activityRepository.update({ isDefault: true }, { isDefault: false });
  }

  // Update fields
  if (name !== undefined) activity.name = name;
  if (position !== undefined) activity.position = position;
  if (isDefault !== undefined) activity.isDefault = isDefault;

  await activityRepository.save(activity);

  res.json({
    status: 'success',
    message: '活動を更新しました',
    data: { activity },
  });
});

// Delete time entry activity
export const deleteActivity = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const activityRepository = AppDataSource.getRepository(TimeEntryActivity);
  const activity = await activityRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['timeEntries'],
  });

  if (!activity) {
    throw new AppError('活動が見つかりません', 404);
  }

  // Cannot delete if there are time entries using this activity
  if (activity.timeEntries && activity.timeEntries.length > 0) {
    throw new AppError('この活動を使用している作業時間が存在するため削除できません', 400);
  }

  await activityRepository.remove(activity);

  res.json({
    status: 'success',
    message: '活動を削除しました',
  });
});
