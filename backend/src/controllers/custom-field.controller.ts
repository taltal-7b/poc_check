import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { CustomField } from '../entities/CustomField';
import { IssueCustomField } from '../entities/IssueCustomField';
import { Project } from '../entities/Project';
import { Tracker } from '../entities/Tracker';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get all custom fields
export const getAllCustomFields = catchAsync(async (req: AuthRequest, res: Response) => {
  const customFieldRepository = AppDataSource.getRepository(CustomField);
  const customFields = await customFieldRepository.find({
    relations: ['trackers', 'projects', 'roles'],
    order: { position: 'ASC' },
  });

  res.json({
    status: 'success',
    data: { customFields },
  });
});

// Get custom field by ID
export const getCustomFieldById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const customFieldRepository = AppDataSource.getRepository(CustomField);
  const customField = await customFieldRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['trackers', 'projects', 'roles'],
  });

  if (!customField) {
    throw new AppError('カスタムフィールドが見つかりません', 404);
  }

  res.json({
    status: 'success',
    data: { customField },
  });
});

// Create custom field
export const createCustomField = catchAsync(async (req: AuthRequest, res: Response) => {
  const {
    name,
    fieldFormat = 'string',
    regexp = '',
    minLength = null,
    maxLength = null,
    isRequired = false,
    isForAll = true,
    isFilter = true,
    searchable = true,
    multiple = false,
    defaultValue = '',
    visible = true,
    description = '',
    position = 1,
    possibleValues = '',
  } = req.body;

  if (!name) {
    throw new AppError('フィールド名は必須です', 400);
  }

  const customFieldRepository = AppDataSource.getRepository(CustomField);

  // Check for duplicate name
  const existingField = await customFieldRepository.findOne({
    where: { name },
  });

  if (existingField) {
    throw new AppError('このフィールド名は既に存在します', 400);
  }

  const customField = customFieldRepository.create({
    name,
    fieldFormat,
    regexp,
    minLength,
    maxLength,
    isRequired,
    isForAll,
    isFilter,
    searchable,
    multiple,
    defaultValue,
    visible,
    description,
    position,
    possibleValues,
  });

  await customFieldRepository.save(customField);

  res.status(201).json({
    status: 'success',
    message: 'カスタムフィールドを作成しました',
    data: { customField },
  });
});

// Update custom field
export const updateCustomField = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const {
    name,
    fieldFormat,
    regexp,
    minLength,
    maxLength,
    isRequired,
    isForAll,
    isFilter,
    searchable,
    multiple,
    defaultValue,
    visible,
    description,
    position,
    possibleValues,
  } = req.body;

  const customFieldRepository = AppDataSource.getRepository(CustomField);
  const customField = await customFieldRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!customField) {
    throw new AppError('カスタムフィールドが見つかりません', 404);
  }

  // Check for duplicate name
  if (name !== undefined && name !== customField.name) {
    const existingField = await customFieldRepository.findOne({
      where: { name },
    });

    if (existingField) {
      throw new AppError('このフィールド名は既に存在します', 400);
    }
  }

  // Update fields
  if (name !== undefined) customField.name = name;
  if (fieldFormat !== undefined) customField.fieldFormat = fieldFormat;
  if (regexp !== undefined) customField.regexp = regexp;
  if (minLength !== undefined) customField.minLength = minLength;
  if (maxLength !== undefined) customField.maxLength = maxLength;
  if (isRequired !== undefined) customField.isRequired = isRequired;
  if (isForAll !== undefined) customField.isForAll = isForAll;
  if (isFilter !== undefined) customField.isFilter = isFilter;
  if (searchable !== undefined) customField.searchable = searchable;
  if (multiple !== undefined) customField.multiple = multiple;
  if (defaultValue !== undefined) customField.defaultValue = defaultValue;
  if (visible !== undefined) customField.visible = visible;
  if (description !== undefined) customField.description = description;
  if (position !== undefined) customField.position = position;
  if (possibleValues !== undefined) customField.possibleValues = possibleValues;

  await customFieldRepository.save(customField);

  res.json({
    status: 'success',
    message: 'カスタムフィールドを更新しました',
    data: { customField },
  });
});

// Delete custom field
export const deleteCustomField = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const customFieldRepository = AppDataSource.getRepository(CustomField);
  const customField = await customFieldRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!customField) {
    throw new AppError('カスタムフィールドが見つかりません', 404);
  }

  await customFieldRepository.remove(customField);

  res.json({
    status: 'success',
    message: 'カスタムフィールドを削除しました',
  });
});

// Associate custom field with project and tracker
export const associateCustomFieldWithProject = catchAsync(async (req: AuthRequest, res: Response) => {
  const { customFieldId, projectId, trackerId } = req.body;

  if (!customFieldId || !projectId || !trackerId) {
    throw new AppError('カスタムフィールドID、プロジェクトID、トラッカーIDは必須です', 400);
  }

  // Verify custom field exists
  const customFieldRepository = AppDataSource.getRepository(CustomField);
  const customField = await customFieldRepository.findOne({
    where: { id: customFieldId },
  });

  if (!customField) {
    throw new AppError('カスタムフィールドが見つかりません', 404);
  }

  // Verify project exists
  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: projectId },
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  // Verify tracker exists
  const trackerRepository = AppDataSource.getRepository(Tracker);
  const tracker = await trackerRepository.findOne({
    where: { id: trackerId },
  });

  if (!tracker) {
    throw new AppError('トラッカーが見つかりません', 404);
  }

  const issueCustomFieldRepository = AppDataSource.getRepository(IssueCustomField);

  // Check if association already exists
  const existingAssociation = await issueCustomFieldRepository.findOne({
    where: {
      customFieldId,
      projectId,
      trackerId,
    },
  });

  if (existingAssociation) {
    throw new AppError('この関連付けは既に存在します', 400);
  }

  const association = issueCustomFieldRepository.create({
    customFieldId,
    projectId,
    trackerId,
  });

  await issueCustomFieldRepository.save(association);

  res.status(201).json({
    status: 'success',
    message: 'カスタムフィールドをプロジェクトに関連付けました',
    data: { association },
  });
});

// Get custom fields for a project
export const getProjectCustomFields = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  const { trackerId = '' } = req.query;

  const issueCustomFieldRepository = AppDataSource.getRepository(IssueCustomField);
  const queryBuilder = issueCustomFieldRepository
    .createQueryBuilder('icf')
    .leftJoinAndSelect('icf.customField', 'customField')
    .leftJoinAndSelect('icf.project', 'project')
    .leftJoinAndSelect('icf.tracker', 'tracker')
    .where('icf.project_id = :projectId', { projectId: parseInt(projectId) });

  if (trackerId) {
    queryBuilder.andWhere('icf.tracker_id = :trackerId', {
      trackerId: parseInt(trackerId as string),
    });
  }

  const associations = await queryBuilder
    .orderBy('customField.position', 'ASC')
    .getMany();

  res.json({
    status: 'success',
    data: { customFields: associations },
  });
});
