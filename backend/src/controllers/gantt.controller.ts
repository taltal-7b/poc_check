import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Issue } from '../entities/Issue';
import { Project } from '../entities/Project';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

interface GanttTask {
  id: number;
  text: string;
  start_date: string;
  duration: number;
  progress: number;
  parent?: number;
  type?: string;
  open?: boolean;
  color?: string;
}

// Get gantt chart data for all issues or filtered by project
export const getGanttData = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  const { start_date, due_date, project_id, status_id, assigned_to_id } = req.query;

  const issueRepository = AppDataSource.getRepository(Issue);
  const queryBuilder = issueRepository
    .createQueryBuilder('issue')
    .leftJoinAndSelect('issue.project', 'project')
    .leftJoinAndSelect('issue.tracker', 'tracker')
    .leftJoinAndSelect('issue.status', 'status')
    .leftJoinAndSelect('issue.priority', 'priority')
    .leftJoinAndSelect('issue.assignedTo', 'assignedTo')
    .leftJoinAndSelect('issue.parent', 'parent');

  // Filter by project if specified (from params or query)
  const effectiveProjectId = projectId || project_id;
  if (effectiveProjectId) {
    const projectIdNum = parseInt(effectiveProjectId as string);
    if (!isNaN(projectIdNum)) {
      queryBuilder.andWhere('issue.projectId = :projectId', { projectId: projectIdNum });
    }
  }

  // Filter by status if specified
  if (status_id) {
    const statusIdNum = parseInt(status_id as string);
    if (!isNaN(statusIdNum)) {
      queryBuilder.andWhere('issue.statusId = :statusId', { statusId: statusIdNum });
    }
  }

  // Filter by assigned user if specified
  if (assigned_to_id) {
    const assignedToIdNum = parseInt(assigned_to_id as string);
    if (!isNaN(assignedToIdNum)) {
      queryBuilder.andWhere('issue.assignedToId = :assignedToId', { assignedToId: assignedToIdNum });
    }
  }

  // Filter by date range if specified (consider createdOn as fallback)
  if (start_date) {
    queryBuilder.andWhere(
      '(issue.dueDate >= :start_date OR (issue.dueDate IS NULL AND issue.createdOn >= :start_date))',
      { start_date }
    );
  }
  if (due_date) {
    queryBuilder.andWhere(
      '(issue.startDate <= :due_date OR (issue.startDate IS NULL AND issue.createdOn <= :due_date))',
      { due_date }
    );
  }

  // Non-admin users can only see issues from projects they have access to
  if (!req.user?.admin) {
    if (req.user) {
      queryBuilder.andWhere(
        '(project.isPublic = :isPublic OR EXISTS (SELECT 1 FROM members m WHERE m.project_id = issue.project_id AND m.user_id = :userId))',
        { isPublic: true, userId: req.user.id }
      );
    } else {
      queryBuilder.andWhere('project.isPublic = :isPublic', { isPublic: true });
    }
  }

  const issues = await queryBuilder
    .orderBy('issue.startDate', 'ASC', 'NULLS LAST')
    .addOrderBy('issue.createdOn', 'ASC', 'NULLS LAST')
    .addOrderBy('issue.dueDate', 'ASC', 'NULLS LAST')
    .addOrderBy('issue.id', 'ASC')
    .getMany();

  console.log(`[Gantt] Found ${issues.length} issues`);

  // Convert issues to Gantt tasks
  const tasks: GanttTask[] = [];
  const today = new Date();

  for (const issue of issues) {
    // Use startDate if available, otherwise use createdOn, otherwise use today
    const startDate = issue.startDate || issue.createdOn || today;
    // Use dueDate if available, otherwise use startDate + 7 days, otherwise use createdOn + 7 days, otherwise use today + 7 days
    let dueDate = issue.dueDate;
    if (!dueDate) {
      if (issue.startDate) {
        const start = new Date(issue.startDate);
        start.setDate(start.getDate() + 7); // Default to 7 days from start date
        dueDate = start;
      } else if (issue.createdOn) {
        const created = new Date(issue.createdOn);
        created.setDate(created.getDate() + 7); // Default to 7 days from creation
        dueDate = created;
      } else {
        const defaultDate = new Date(today);
        defaultDate.setDate(defaultDate.getDate() + 7); // Default to 7 days from today
        dueDate = defaultDate;
      }
    }

    // Calculate duration in days
    const start = new Date(startDate);
    const end = new Date(dueDate);
    const duration = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

    // Determine task color based on priority or status
    let color = '#3b82f6'; // Default blue
    if (issue.priority) {
      switch (issue.priority.name.toLowerCase()) {
        case 'urgent':
        case '緊急':
          color = '#ef4444'; // Red
          break;
        case 'high':
        case '高':
          color = '#f97316'; // Orange
          break;
        case 'normal':
        case '通常':
          color = '#3b82f6'; // Blue
          break;
        case 'low':
        case '低':
          color = '#10b981'; // Green
          break;
      }
    }

    // Determine if task is overdue
    if (issue.dueDate && new Date(issue.dueDate) < today && !issue.closedOn) {
      color = '#ef4444'; // Red for overdue
    }

    const task: GanttTask = {
      id: issue.id,
      text: `#${issue.id}: ${issue.subject}`,
      start_date: start.toISOString().split('T')[0],
      duration,
      progress: issue.doneRatio / 100,
      parent: issue.parentId || undefined,
      type: issue.parentId ? 'task' : 'project',
      open: true,
      color,
    };

    tasks.push(task);
  }

  console.log(`[Gantt] Returning ${tasks.length} tasks for ${req.user?.id || 'anonymous'} user`);
  if (tasks.length > 0) {
    console.log(`[Gantt] First task:`, tasks[0]);
  }

  res.json({
    status: 'success',
    data: {
      tasks,
      links: [], // Dependency links can be added later based on issue relations
    },
  });
});
