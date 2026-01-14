import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Tracker } from '../entities/Tracker';
import { IssueStatus } from '../entities/IssueStatus';
import { IssuePriority } from '../entities/IssuePriority';
import { catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get all trackers
export const getAllTrackers = catchAsync(async (req: AuthRequest, res: Response) => {
  const trackerRepository = AppDataSource.getRepository(Tracker);
  const trackers = await trackerRepository.find({
    order: { position: 'ASC' },
  });

  res.json({
    status: 'success',
    data: { trackers },
  });
});

// Get all issue statuses
export const getAllIssueStatuses = catchAsync(async (req: AuthRequest, res: Response) => {
  const statusRepository = AppDataSource.getRepository(IssueStatus);
  const statuses = await statusRepository.find({
    order: { position: 'ASC' },
  });

  res.json({
    status: 'success',
    data: { statuses },
  });
});

// Get all issue priorities
export const getAllIssuePriorities = catchAsync(async (req: AuthRequest, res: Response) => {
  const priorityRepository = AppDataSource.getRepository(IssuePriority);
  const priorities = await priorityRepository.find({
    where: { active: true },
    order: { position: 'ASC' },
  });

  res.json({
    status: 'success',
    data: { priorities },
  });
});
