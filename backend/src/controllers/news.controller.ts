import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { News } from '../entities/News';
import { Project } from '../entities/Project';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get all news
export const getAllNews = catchAsync(async (req: AuthRequest, res: Response) => {
  const { page = 1, limit = 25, projectId = '' } = req.query;

  const newsRepository = AppDataSource.getRepository(News);
  const queryBuilder = newsRepository
    .createQueryBuilder('news')
    .leftJoinAndSelect('news.project', 'project')
    .leftJoinAndSelect('news.author', 'author');

  // Filter by project
  if (projectId) {
    queryBuilder.where('news.project_id = :projectId', {
      projectId: parseInt(projectId as string),
    });
  }

  // Pagination
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [newsList, total] = await queryBuilder
    .skip(skip)
    .take(limitNum)
    .orderBy('news.created_on', 'DESC')
    .getManyAndCount();

  res.json({
    status: 'success',
    data: {
      news: newsList,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    },
  });
});

// Get news by ID
export const getNewsById = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const newsRepository = AppDataSource.getRepository(News);
  const news = await newsRepository.findOne({
    where: { id: parseInt(id) },
    relations: ['project', 'author', 'comments', 'comments.author'],
  });

  if (!news) {
    throw new AppError('ニュースが見つかりません', 404);
  }

  res.json({
    status: 'success',
    data: { news },
  });
});

// Create news
export const createNews = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId, title, summary = '', description = '' } = req.body;

  if (!projectId || !title) {
    throw new AppError('プロジェクトIDとタイトルは必須です', 400);
  }

  // Verify project exists
  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: projectId },
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  const newsRepository = AppDataSource.getRepository(News);
  const news = newsRepository.create({
    projectId,
    title,
    summary,
    description,
    authorId: req.user!.id,
    createdOn: new Date(),
    updatedOn: new Date(),
  });

  await newsRepository.save(news);

  // Reload with relations
  const savedNews = await newsRepository.findOne({
    where: { id: news.id },
    relations: ['project', 'author'],
  });

  res.status(201).json({
    status: 'success',
    message: 'ニュースを作成しました',
    data: { news: savedNews },
  });
});

// Update news
export const updateNews = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { title, summary, description } = req.body;

  const newsRepository = AppDataSource.getRepository(News);
  const news = await newsRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!news) {
    throw new AppError('ニュースが見つかりません', 404);
  }

  // Only author or admin can edit
  if (!req.user?.admin && news.authorId !== req.user?.id) {
    throw new AppError('このニュースを編集する権限がありません', 403);
  }

  // Update fields
  if (title !== undefined) news.title = title;
  if (summary !== undefined) news.summary = summary;
  if (description !== undefined) news.description = description;

  news.updatedOn = new Date();

  await newsRepository.save(news);

  // Reload with relations
  const updatedNews = await newsRepository.findOne({
    where: { id: news.id },
    relations: ['project', 'author'],
  });

  res.json({
    status: 'success',
    message: 'ニュースを更新しました',
    data: { news: updatedNews },
  });
});

// Delete news
export const deleteNews = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const newsRepository = AppDataSource.getRepository(News);
  const news = await newsRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!news) {
    throw new AppError('ニュースが見つかりません', 404);
  }

  // Only author or admin can delete
  if (!req.user?.admin && news.authorId !== req.user?.id) {
    throw new AppError('このニュースを削除する権限がありません', 403);
  }

  await newsRepository.remove(news);

  res.json({
    status: 'success',
    message: 'ニュースを削除しました',
  });
});
