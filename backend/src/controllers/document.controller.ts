import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Document } from '../entities/Document';
import { Project } from '../entities/Project';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get all documents for a project
export const getProjectDocuments = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;

  const documentRepository = AppDataSource.getRepository(Document);
  const documents = await documentRepository.find({
    where: { projectId: parseInt(projectId) },
    relations: ['project', 'category', 'author'],
    order: { createdOn: 'DESC' },
  });

  res.json({
    status: 'success',
    data: { documents },
  });
});

// Get document by ID
export const getDocumentById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const documentRepository = AppDataSource.getRepository(Document);
  const document = await documentRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['project', 'category', 'author', 'attachments', 'attachments.author'],
  });

  if (!document) {
    throw new AppError('ドキュメントが見つかりません', 404);
  }

  res.json({
    status: 'success',
    data: { document },
  });
});

// Create document
export const createDocument = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;
  const {
    title,
    description = '',
    categoryId = null,
  } = req.body;

  if (!title) {
    throw new AppError('タイトルは必須です', 400);
  }

  // Verify project exists
  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: parseInt(projectId) },
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  const documentRepository = AppDataSource.getRepository(Document);
  const document = documentRepository.create({
    projectId: parseInt(projectId),
    categoryId,
    title,
    description,
    authorId: req.user!.id,
    createdOn: new Date(),
    updatedOn: new Date(),
  });

  await documentRepository.save(document);

  // Reload with relations
  const savedDocument = await documentRepository.findOne({
    where: { id: document.id },
    relations: ['project', 'category', 'author'],
  });

  res.status(201).json({
    status: 'success',
    message: 'ドキュメントを作成しました',
    data: { document: savedDocument },
  });
});

// Update document
export const updateDocument = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { title, description, categoryId } = req.body;

  const documentRepository = AppDataSource.getRepository(Document);
  const document = await documentRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!document) {
    throw new AppError('ドキュメントが見つかりません', 404);
  }

  // Update fields
  if (title !== undefined) document.title = title;
  if (description !== undefined) document.description = description;
  if (categoryId !== undefined) document.categoryId = categoryId;

  document.updatedOn = new Date();

  await documentRepository.save(document);

  // Reload with relations
  const updatedDocument = await documentRepository.findOne({
    where: { id: document.id },
    relations: ['project', 'category', 'author'],
  });

  res.json({
    status: 'success',
    message: 'ドキュメントを更新しました',
    data: { document: updatedDocument },
  });
});

// Delete document
export const deleteDocument = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const documentRepository = AppDataSource.getRepository(Document);
  const document = await documentRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!document) {
    throw new AppError('ドキュメントが見つかりません', 404);
  }

  await documentRepository.remove(document);

  res.json({
    status: 'success',
    message: 'ドキュメントを削除しました',
  });
});
