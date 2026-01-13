import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { IssueRelation, IssueRelationType } from '../entities/IssueRelation';
import { Issue } from '../entities/Issue';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get issue relations
export const getIssueRelations = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId } = req.params;

  const relationRepository = AppDataSource.getRepository(IssueRelation);
  
  const relationsFrom = await relationRepository.find({
    where: { issueFromId: parseInt(issueId) },
    relations: ['issueTo', 'issueTo.status', 'issueTo.tracker'],
  });

  const relationsTo = await relationRepository.find({
    where: { issueToId: parseInt(issueId) },
    relations: ['issueFrom', 'issueFrom.status', 'issueFrom.tracker'],
  });

  res.json({
    status: 'success',
    data: {
      relationsFrom,
      relationsTo,
    },
  });
});

// Create issue relation
export const createIssueRelation = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId } = req.params;
  const { issueToId, relationType, delay = null } = req.body;

  if (!issueToId || !relationType) {
    throw new AppError('関連先の課題とリレーション種別は必須です', 400);
  }

  // Validate relation type
  if (!Object.values(IssueRelationType).includes(relationType)) {
    throw new AppError('無効なリレーション種別です', 400);
  }

  const issueRepository = AppDataSource.getRepository(Issue);
  
  // Check if both issues exist
  const issueFrom = await issueRepository.findOne({
    where: { id: parseInt(issueId) },
  });
  const issueTo = await issueRepository.findOne({
    where: { id: issueToId },
  });

  if (!issueFrom || !issueTo) {
    throw new AppError('課題が見つかりません', 404);
  }

  // Cannot relate to self
  if (issueFrom.id === issueTo.id) {
    throw new AppError('自分自身とは関連付けできません', 400);
  }

  const relationRepository = AppDataSource.getRepository(IssueRelation);

  // Check if relation already exists
  const existingRelation = await relationRepository.findOne({
    where: {
      issueFromId: issueFrom.id,
      issueToId: issueTo.id,
      relationType,
    },
  });

  if (existingRelation) {
    throw new AppError('この関連は既に存在します', 400);
  }

  const relation = relationRepository.create({
    issueFromId: issueFrom.id,
    issueToId: issueTo.id,
    relationType,
    delay,
  });

  await relationRepository.save(relation);

  // Reload with relations
  const savedRelation = await relationRepository.findOne({
    where: { id: relation.id },
    relations: ['issueFrom', 'issueTo'],
  });

  res.status(201).json({
    status: 'success',
    message: '関連を作成しました',
    data: { relation: savedRelation },
  });
});

// Delete issue relation
export const deleteIssueRelation = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId, relationId } = req.params;

  const relationRepository = AppDataSource.getRepository(IssueRelation);
  const relation = await relationRepository.findOne({
    where: { id: parseInt(relationId) },
  });

  if (!relation) {
    throw new AppError('関連が見つかりません', 404);
  }

  // Verify the relation belongs to this issue
  if (
    relation.issueFromId !== parseInt(issueId) &&
    relation.issueToId !== parseInt(issueId)
  ) {
    throw new AppError('この課題の関連ではありません', 400);
  }

  await relationRepository.remove(relation);

  res.json({
    status: 'success',
    message: '関連を削除しました',
  });
});
