import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { WorkflowRule } from '../entities/WorkflowRule';
import { Role } from '../entities/Role';
import { Tracker } from '../entities/Tracker';
import { IssueStatus } from '../entities/IssueStatus';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get workflow rules
export const getWorkflowRules = catchAsync(async (req: AuthRequest, res: Response) => {
  const { roleId, trackerId } = req.query;

  const ruleRepository = AppDataSource.getRepository(WorkflowRule);
  const queryBuilder = ruleRepository
    .createQueryBuilder('rule')
    .leftJoinAndSelect('rule.role', 'role')
    .leftJoinAndSelect('rule.tracker', 'tracker')
    .leftJoinAndSelect('rule.oldStatus', 'oldStatus')
    .leftJoinAndSelect('rule.newStatus', 'newStatus');

  if (roleId) {
    queryBuilder.andWhere('rule.role_id = :roleId', {
      roleId: parseInt(roleId as string),
    });
  }

  if (trackerId) {
    queryBuilder.andWhere('rule.tracker_id = :trackerId', {
      trackerId: parseInt(trackerId as string),
    });
  }

  const rules = await queryBuilder
    .orderBy('role.name', 'ASC')
    .addOrderBy('tracker.name', 'ASC')
    .addOrderBy('oldStatus.position', 'ASC')
    .getMany();

  res.json({
    status: 'success',
    data: { rules },
  });
});

// Get workflow rule by ID
export const getWorkflowRuleById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const ruleRepository = AppDataSource.getRepository(WorkflowRule);
  const rule = await ruleRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['role', 'tracker', 'oldStatus', 'newStatus'],
  });

  if (!rule) {
    throw new AppError('ワークフロールールが見つかりません', 404);
  }

  res.json({
    status: 'success',
    data: { rule },
  });
});

// Create workflow rule
export const createWorkflowRule = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    roleId,
    trackerId,
    oldStatusId,
    newStatusId,
    author = false,
    assignee = false,
    fieldPermissions = '{}',
  } = req.body;

  if (!roleId || !trackerId || !oldStatusId || !newStatusId) {
    throw new AppError('ロール、トラッカー、旧ステータス、新ステータスは必須です', 400);
  }

  // Verify role exists
  const roleRepository = AppDataSource.getRepository(Role);
  const role = await roleRepository.findOne({ where: { id: roleId } });
  if (!role) {
    throw new AppError('ロールが見つかりません', 404);
  }

  // Verify tracker exists
  const trackerRepository = AppDataSource.getRepository(Tracker);
  const tracker = await trackerRepository.findOne({ where: { id: trackerId } });
  if (!tracker) {
    throw new AppError('トラッカーが見つかりません', 404);
  }

  // Verify statuses exist
  const statusRepository = AppDataSource.getRepository(IssueStatus);
  const oldStatus = await statusRepository.findOne({ where: { id: oldStatusId } });
  const newStatus = await statusRepository.findOne({ where: { id: newStatusId } });

  if (!oldStatus || !newStatus) {
    throw new AppError('ステータスが見つかりません', 404);
  }

  const ruleRepository = AppDataSource.getRepository(WorkflowRule);

  // Check if rule already exists
  const existingRule = await ruleRepository.findOne({
    where: {
      roleId,
      trackerId,
      oldStatusId,
      newStatusId,
    },
  });

  if (existingRule) {
    throw new AppError('このワークフロールールは既に存在します', 400);
  }

  const rule = ruleRepository.create({
    roleId,
    trackerId,
    oldStatusId,
    newStatusId,
    author,
    assignee,
    fieldPermissions,
  });

  await ruleRepository.save(rule);

  // Reload with relations
  const savedRule = await ruleRepository.findOne({
    where: { id: rule.id },
    relations: ['role', 'tracker', 'oldStatus', 'newStatus'],
  });

  res.status(201).json({
    status: 'success',
    message: 'ワークフロールールを作成しました',
    data: { rule: savedRule },
  });
});

// Update workflow rule
export const updateWorkflowRule = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { author, assignee, fieldPermissions } = req.body;

  const ruleRepository = AppDataSource.getRepository(WorkflowRule);
  const rule = await ruleRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!rule) {
    throw new AppError('ワークフロールールが見つかりません', 404);
  }

  // Update fields
  if (author !== undefined) rule.author = author;
  if (assignee !== undefined) rule.assignee = assignee;
  if (fieldPermissions !== undefined) rule.fieldPermissions = fieldPermissions;

  await ruleRepository.save(rule);

  // Reload with relations
  const updatedRule = await ruleRepository.findOne({
    where: { id: rule.id },
    relations: ['role', 'tracker', 'oldStatus', 'newStatus'],
  });

  res.json({
    status: 'success',
    message: 'ワークフロールールを更新しました',
    data: { rule: updatedRule },
  });
});

// Delete workflow rule
export const deleteWorkflowRule = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const ruleRepository = AppDataSource.getRepository(WorkflowRule);
  const rule = await ruleRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!rule) {
    throw new AppError('ワークフロールールが見つかりません', 404);
  }

  await ruleRepository.remove(rule);

  res.json({
    status: 'success',
    message: 'ワークフロールールを削除しました',
  });
});

// Copy workflow rules
export const copyWorkflowRules = catchAsync(async (req: AuthRequest, res: Response) => {
  const { sourceTrackerId, targetTrackerId, sourceRoleId, targetRoleId } = req.body;

  if (!sourceTrackerId || !targetTrackerId) {
    throw new AppError('コピー元とコピー先のトラッカーは必須です', 400);
  }

  const ruleRepository = AppDataSource.getRepository(WorkflowRule);
  const where: any = { trackerId: sourceTrackerId };

  if (sourceRoleId) {
    where.roleId = sourceRoleId;
  }

  const sourceRules = await ruleRepository.find({ where });

  if (sourceRules.length === 0) {
    throw new AppError('コピーするルールが見つかりません', 404);
  }

  const copiedRules = [];
  for (const sourceRule of sourceRules) {
    // Check if rule already exists
    const existingRule = await ruleRepository.findOne({
      where: {
        roleId: targetRoleId || sourceRule.roleId,
        trackerId: targetTrackerId,
        oldStatusId: sourceRule.oldStatusId,
        newStatusId: sourceRule.newStatusId,
      },
    });

    if (!existingRule) {
      const newRule = ruleRepository.create({
        roleId: targetRoleId || sourceRule.roleId,
        trackerId: targetTrackerId,
        oldStatusId: sourceRule.oldStatusId,
        newStatusId: sourceRule.newStatusId,
        author: sourceRule.author,
        assignee: sourceRule.assignee,
        fieldPermissions: sourceRule.fieldPermissions,
      });

      await ruleRepository.save(newRule);
      copiedRules.push(newRule);
    }
  }

  res.status(201).json({
    status: 'success',
    message: `${copiedRules.length}件のワークフロールールをコピーしました`,
    data: { count: copiedRules.length, rules: copiedRules },
  });
});

// Check if status transition is allowed
export const checkStatusTransition = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId, newStatusId } = req.body;

  if (!issueId || !newStatusId) {
    throw new AppError('課題IDと新しいステータスは必須です', 400);
  }

  const { Issue } = await import('../entities/Issue');
  const { Member } = await import('../entities/Member');
  
  const issueRepository = AppDataSource.getRepository(Issue);
  const issue = await issueRepository.findOne({
    where: { id: issueId },
    relations: ['tracker', 'status', 'author', 'assignedTo'],
  });

  if (!issue) {
    throw new AppError('課題が見つかりません', 404);
  }

  // Admin can always transition
  if (req.user?.admin) {
    return res.json({
      status: 'success',
      data: { allowed: true, reason: '管理者権限' },
    });
  }

  // Get user's roles in the project
  const memberRepository = AppDataSource.getRepository(Member);
  const members = await memberRepository.find({
    where: {
      projectId: issue.projectId,
      userId: req.user!.id,
    },
    relations: ['memberRoles', 'memberRoles.role'],
  });

  if (members.length === 0) {
    return res.json({
      status: 'success',
      data: { allowed: false, reason: 'プロジェクトのメンバーではありません' },
    });
  }

  const roleIds = members.flatMap((m) =>
    m.memberRoles.map((mr) => mr.role.id)
  );

  // Check workflow rules
  const ruleRepository = AppDataSource.getRepository(WorkflowRule);
  const rules = await ruleRepository.find({
    where: {
      trackerId: issue.trackerId,
      oldStatusId: issue.statusId,
      newStatusId: newStatusId,
    },
  });

  let allowed = false;
  let reason = 'ワークフロールールにより許可されていません';

  for (const rule of rules) {
    if (roleIds.includes(rule.roleId)) {
      // Check author/assignee conditions
      if (rule.author && issue.authorId === req.user!.id) {
        allowed = true;
        reason = '作成者として許可';
        break;
      }
      if (rule.assignee && issue.assignedToId === req.user!.id) {
        allowed = true;
        reason = '担当者として許可';
        break;
      }
      if (!rule.author && !rule.assignee) {
        allowed = true;
        reason = 'ロールにより許可';
        break;
      }
    }
  }

  res.json({
    status: 'success',
    data: { allowed, reason },
  });
});
