import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { IssueCategory } from '../entities/IssueCategory';
import { Project } from '../entities/Project';
import { User } from '../entities/User';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get all categories for a project
export const getProjectCategories = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;

  const categoryRepository = AppDataSource.getRepository(IssueCategory);
  const categories = await categoryRepository.find({
    where: { projectId: parseInt(projectId) },
    relations: ['assignedTo', 'issues'],
    order: { name: 'ASC' },
  });

  res.json({
    status: 'success',
    data: { categories },
  });
});

// Get category by ID
export const getCategoryById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const categoryRepository = AppDataSource.getRepository(IssueCategory);
  const category = await categoryRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['project', 'assignedTo', 'issues'],
  });

  if (!category) {
    throw new AppError('カテゴリが見つかりません', 404);
  }

  res.json({
    status: 'success',
    data: { category },
  });
});

// Create category
export const createCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  const { name, assignedToId = null } = req.body;

  if (!name) {
    throw new AppError('カテゴリ名は必須です', 400);
  }

  // Verify project exists
  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: parseInt(projectId) },
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  // Verify assigned user exists if provided
  if (assignedToId) {
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { id: assignedToId },
    });

    if (!user) {
      throw new AppError('担当者が見つかりません', 404);
    }
  }

  const categoryRepository = AppDataSource.getRepository(IssueCategory);

  // Check for duplicate name
  const existingCategory = await categoryRepository.findOne({
    where: {
      projectId: parseInt(projectId),
      name,
    },
  });

  if (existingCategory) {
    throw new AppError('このカテゴリ名は既に存在します', 400);
  }

  const category = categoryRepository.create({
    projectId: parseInt(projectId),
    name,
    assignedToId,
  });

  await categoryRepository.save(category);

  // Reload with relations
  const savedCategory = await categoryRepository.findOne({
    where: { id: category.id },
    relations: ['project', 'assignedTo'],
  });

  res.status(201).json({
    status: 'success',
    message: 'カテゴリを作成しました',
    data: { category: savedCategory },
  });
});

// Update category
export const updateCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { name, assignedToId } = req.body;

  const categoryRepository = AppDataSource.getRepository(IssueCategory);
  const category = await categoryRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!category) {
    throw new AppError('カテゴリが見つかりません', 404);
  }

  // Check for duplicate name
  if (name !== undefined && name !== category.name) {
    const existingCategory = await categoryRepository.findOne({
      where: {
        projectId: category.projectId,
        name,
      },
    });

    if (existingCategory) {
      throw new AppError('このカテゴリ名は既に存在します', 400);
    }
  }

  // Verify assigned user exists if provided
  if (assignedToId !== undefined && assignedToId !== null) {
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { id: assignedToId },
    });

    if (!user) {
      throw new AppError('担当者が見つかりません', 404);
    }
  }

  // Update fields
  if (name !== undefined) category.name = name;
  if (assignedToId !== undefined) category.assignedToId = assignedToId;

  await categoryRepository.save(category);

  // Reload with relations
  const updatedCategory = await categoryRepository.findOne({
    where: { id: category.id },
    relations: ['project', 'assignedTo'],
  });

  res.json({
    status: 'success',
    message: 'カテゴリを更新しました',
    data: { category: updatedCategory },
  });
});

// Delete category
export const deleteCategory = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const categoryRepository = AppDataSource.getRepository(IssueCategory);
  const category = await categoryRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['issues'],
  });

  if (!category) {
    throw new AppError('カテゴリが見つかりません', 404);
  }

  // Cannot delete if there are issues in this category
  if (category.issues && category.issues.length > 0) {
    throw new AppError('このカテゴリに課題が割り当てられているため削除できません', 400);
  }

  await categoryRepository.remove(category);

  res.json({
    status: 'success',
    message: 'カテゴリを削除しました',
  });
});
