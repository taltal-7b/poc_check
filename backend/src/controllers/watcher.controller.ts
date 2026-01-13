import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Watcher } from '../entities/Watcher';
import { Issue } from '../entities/Issue';
import { User } from '../entities/User';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get watchers for an issue
export const getIssueWatchers = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId } = req.params;

  const watcherRepository = AppDataSource.getRepository(Watcher);
  const watchers = await watcherRepository.find({
    where: {
      watchableType: 'Issue',
      watchableId: parseInt(issueId),
    },
    relations: ['user'],
  });

  res.json({
    status: 'success',
    data: { watchers },
  });
});

// Add watcher to issue
export const addWatcher = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId } = req.params;
  const { userId } = req.body;

  if (!userId) {
    throw new AppError('ユーザーIDは必須です', 400);
  }

  // Verify issue exists
  const issueRepository = AppDataSource.getRepository(Issue);
  const issue = await issueRepository.findOne({
    where: { id: parseInt(issueId) },
  });

  if (!issue) {
    throw new AppError('課題が見つかりません', 404);
  }

  // Verify user exists
  const userRepository = AppDataSource.getRepository(User);
  const user = await userRepository.findOne({
    where: { id: userId },
  });

  if (!user) {
    throw new AppError('ユーザーが見つかりません', 404);
  }

  const watcherRepository = AppDataSource.getRepository(Watcher);

  // Check if already watching
  const existingWatcher = await watcherRepository.findOne({
    where: {
      watchableType: 'Issue',
      watchableId: parseInt(issueId),
      userId,
    },
  });

  if (existingWatcher) {
    throw new AppError('既にウォッチしています', 400);
  }

  const watcher = watcherRepository.create({
    watchableType: 'Issue',
    watchableId: parseInt(issueId),
    userId,
  });

  await watcherRepository.save(watcher);

  // Reload with user relation
  const savedWatcher = await watcherRepository.findOne({
    where: { id: watcher.id },
    relations: ['user'],
  });

  res.status(201).json({
    status: 'success',
    message: 'ウォッチャーを追加しました',
    data: { watcher: savedWatcher },
  });
});

// Remove watcher from issue
export const removeWatcher = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId, userId } = req.params;

  const watcherRepository = AppDataSource.getRepository(Watcher);
  const watcher = await watcherRepository.findOne({
    where: {
      watchableType: 'Issue',
      watchableId: parseInt(issueId),
      userId: parseInt(userId),
    },
  });

  if (!watcher) {
    throw new AppError('ウォッチャーが見つかりません', 404);
  }

  await watcherRepository.remove(watcher);

  res.json({
    status: 'success',
    message: 'ウォッチャーを削除しました',
  });
});

// Watch issue (current user)
export const watchIssue = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId } = req.params;

  if (!req.user) {
    throw new AppError('認証が必要です', 401);
  }

  // Verify issue exists
  const issueRepository = AppDataSource.getRepository(Issue);
  const issue = await issueRepository.findOne({
    where: { id: parseInt(issueId) },
  });

  if (!issue) {
    throw new AppError('課題が見つかりません', 404);
  }

  const watcherRepository = AppDataSource.getRepository(Watcher);

  // Check if already watching
  const existingWatcher = await watcherRepository.findOne({
    where: {
      watchableType: 'Issue',
      watchableId: parseInt(issueId),
      userId: req.user.id,
    },
  });

  if (existingWatcher) {
    return res.json({
      status: 'success',
      message: '既にウォッチしています',
      data: { watcher: existingWatcher },
    });
  }

  const watcher = watcherRepository.create({
    watchableType: 'Issue',
    watchableId: parseInt(issueId),
    userId: req.user.id,
  });

  await watcherRepository.save(watcher);

  res.status(201).json({
    status: 'success',
    message: 'ウォッチを開始しました',
    data: { watcher },
  });
});

// Unwatch issue (current user)
export const unwatchIssue = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId } = req.params;

  if (!req.user) {
    throw new AppError('認証が必要です', 401);
  }

  const watcherRepository = AppDataSource.getRepository(Watcher);
  const watcher = await watcherRepository.findOne({
    where: {
      watchableType: 'Issue',
      watchableId: parseInt(issueId),
      userId: req.user.id,
    },
  });

  if (!watcher) {
    throw new AppError('ウォッチしていません', 404);
  }

  await watcherRepository.remove(watcher);

  res.json({
    status: 'success',
    message: 'ウォッチを解除しました',
  });
});
