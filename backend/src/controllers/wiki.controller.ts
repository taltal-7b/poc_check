import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Wiki } from '../entities/Wiki';
import { WikiPage } from '../entities/WikiPage';
import { WikiContent } from '../entities/WikiContent';
import { Project } from '../entities/Project';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get or create wiki for project
export const getProjectWiki = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;

  // Verify project exists
  const projectRepository = AppDataSource.getRepository(Project);
  const project = await projectRepository.findOne({
    where: { id: parseInt(projectId) },
  });

  if (!project) {
    throw new AppError('プロジェクトが見つかりません', 404);
  }

  const wikiRepository = AppDataSource.getRepository(Wiki);
  let wiki = await wikiRepository.findOne({
    where: { projectId: parseInt(projectId) },
    relations: ['project'],
  });

  // Create wiki if it doesn't exist
  if (!wiki) {
    wiki = wikiRepository.create({
      projectId: parseInt(projectId),
      startPage: 'Wiki',
    });
    await wikiRepository.save(wiki);
  }

  res.json({
    status: 'success',
    data: { wiki },
  });
});

// Get all wiki pages for a project
export const getWikiPages = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId } = req.params;

  const wikiPageRepository = AppDataSource.getRepository(WikiPage);
  const pages = await wikiPageRepository.find({
    where: { wiki: { projectId: parseInt(projectId) } },
    relations: ['wiki', 'currentContent', 'currentContent.author'],
    order: { title: 'ASC' },
  });

  res.json({
    status: 'success',
    data: { pages },
  });
});

// Get wiki page by title
export const getWikiPage = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId, title } = req.params;

  const wikiPageRepository = AppDataSource.getRepository(WikiPage);
  const page = await wikiPageRepository.findOne({
    where: {
      wiki: { projectId: parseInt(projectId) },
      title: decodeURIComponent(title),
    },
    relations: ['wiki', 'currentContent', 'currentContent.author', 'versions', 'versions.author', 'attachments'],
    order: { versions: { version: 'DESC' } },
  });

  if (!page) {
    throw new AppError('Wikiページが見つかりません', 404);
  }

  res.json({
    status: 'success',
    data: { page },
  });
});

// Create or update wiki page
export const saveWikiPage = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId, title } = req.params;
  const { text, comments = '' } = req.body;

  if (!text) {
    throw new AppError('本文は必須です', 400);
  }

  // Get or create wiki
  const wikiRepository = AppDataSource.getRepository(Wiki);
  let wiki = await wikiRepository.findOne({
    where: { projectId: parseInt(projectId) },
  });

  if (!wiki) {
    wiki = wikiRepository.create({
      projectId: parseInt(projectId),
      startPage: 'Wiki',
    });
    await wikiRepository.save(wiki);
  }

  // Get or create wiki page
  const wikiPageRepository = AppDataSource.getRepository(WikiPage);
  let page = await wikiPageRepository.findOne({
    where: {
      wikiId: wiki.id,
      title: decodeURIComponent(title),
    },
    relations: ['versions'],
  });

  const isNewPage = !page;

  if (!page) {
    page = wikiPageRepository.create({
      wikiId: wiki.id,
      title: decodeURIComponent(title),
      createdOn: new Date(),
      updatedOn: new Date(),
    });
    await wikiPageRepository.save(page);
  }

  // Create new content version
  const wikiContentRepository = AppDataSource.getRepository(WikiContent);
  const version = (page.versions?.length || 0) + 1;

  const content = wikiContentRepository.create({
    pageId: page.id,
    version,
    text,
    comments,
    authorId: req.user!.id,
    updatedOn: new Date(),
  });

  await wikiContentRepository.save(content);

  // Update page
  page.updatedOn = new Date();
  await wikiPageRepository.save(page);

  // Reload with relations
  const savedPage = await wikiPageRepository.findOne({
    where: { id: page.id },
    relations: ['wiki', 'currentContent', 'currentContent.author'],
  });

  res.status(isNewPage ? 201 : 200).json({
    status: 'success',
    message: isNewPage ? 'Wikiページを作成しました' : 'Wikiページを更新しました',
    data: { page: savedPage },
  });
});

// Delete wiki page
export const deleteWikiPage = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId, title } = req.params;

  const wikiPageRepository = AppDataSource.getRepository(WikiPage);
  const page = await wikiPageRepository.findOne({
    where: {
      wiki: { projectId: parseInt(projectId) },
      title: decodeURIComponent(title),
    },
  });

  if (!page) {
    throw new AppError('Wikiページが見つかりません', 404);
  }

  await wikiPageRepository.remove(page);

  res.json({
    status: 'success',
    message: 'Wikiページを削除しました',
  });
});

// Get wiki page version
export const getWikiPageVersion = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId, title, version } = req.params;

  const wikiContentRepository = AppDataSource.getRepository(WikiContent);
  const content = await wikiContentRepository.findOne({
    where: {
      page: {
        wiki: { projectId: parseInt(projectId) },
        title: decodeURIComponent(title),
      },
      version: parseInt(version),
    },
    relations: ['page', 'page.wiki', 'author'],
  });

  if (!content) {
    throw new AppError('指定されたバージョンが見つかりません', 404);
  }

  res.json({
    status: 'success',
    data: { content },
  });
});

// Rename wiki page
export const renameWikiPage = catchAsync(async (req: AuthRequest, res: Response) => {
  const { projectId, title } = req.params;
  const { newTitle } = req.body;

  if (!newTitle) {
    throw new AppError('新しいタイトルは必須です', 400);
  }

  const wikiPageRepository = AppDataSource.getRepository(WikiPage);
  const page = await wikiPageRepository.findOne({
    where: {
      wiki: { projectId: parseInt(projectId) },
      title: decodeURIComponent(title),
    },
  });

  if (!page) {
    throw new AppError('Wikiページが見つかりません', 404);
  }

  // Check if new title already exists
  const existingPage = await wikiPageRepository.findOne({
    where: {
      wikiId: page.wikiId,
      title: newTitle,
    },
  });

  if (existingPage) {
    throw new AppError('この名前のページは既に存在します', 400);
  }

  page.title = newTitle;
  page.updatedOn = new Date();

  await wikiPageRepository.save(page);

  res.json({
    status: 'success',
    message: 'Wikiページの名前を変更しました',
    data: { page },
  });
});
