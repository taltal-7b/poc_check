import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { Journal } from '../entities/Journal';
import { JournalDetail } from '../entities/JournalDetail';
import { Issue } from '../entities/Issue';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

// Get issue journals (comments/history)
export const getIssueJournals = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId } = req.params;

  const journalRepository = AppDataSource.getRepository(Journal);
  const journals = await journalRepository.find({
    where: { issueId: parseInt(issueId) },
    relations: ['user', 'details'],
    order: { createdOn: 'ASC' },
  });

  // Filter out private notes if user doesn't have permission
  const filteredJournals = journals.filter((journal) => {
    if (!journal.privateNotes) {
      return true;
    }

    // Admin or author can see all
    if (req.user?.admin || journal.userId === req.user?.id) {
      return true;
    }

    // Check view_private_notes permission
    // TODO: Implement proper permission check
    return false;
  });

  res.json({
    status: 'success',
    data: { journals: filteredJournals },
  });
});

// Add journal entry (comment/note)
export const addJournalEntry = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId } = req.params;
  const { notes, privateNotes = false } = req.body;

  if (!notes) {
    throw new AppError('コメント内容は必須です', 400);
  }

  // Verify issue exists
  const issueRepository = AppDataSource.getRepository(Issue);
  const issue = await issueRepository.findOne({
    where: { id: parseInt(issueId) },
  });

  if (!issue) {
    throw new AppError('課題が見つかりません', 404);
  }

  const journalRepository = AppDataSource.getRepository(Journal);
  const journal = journalRepository.create({
    issueId: parseInt(issueId),
    userId: req.user!.id,
    notes,
    privateNotes,
    createdOn: new Date(),
  });

  await journalRepository.save(journal);

  // Reload with relations
  const savedJournal = await journalRepository.findOne({
    where: { id: journal.id },
    relations: ['user', 'details'],
  });

  res.status(201).json({
    status: 'success',
    message: 'コメントを追加しました',
    data: { journal: savedJournal },
  });
});

// Update journal entry
export const updateJournalEntry = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId, journalId } = req.params;
  const { notes, privateNotes } = req.body;

  const journalRepository = AppDataSource.getRepository(Journal);
  const journal = await journalRepository.findOne({
    where: { id: parseInt(journalId), issueId: parseInt(issueId) },
  });

  if (!journal) {
    throw new AppError('コメントが見つかりません', 404);
  }

  // Only author or admin can edit
  if (!req.user?.admin && journal.userId !== req.user?.id) {
    throw new AppError('このコメントを編集する権限がありません', 403);
  }

  if (notes !== undefined) journal.notes = notes;
  if (privateNotes !== undefined) journal.privateNotes = privateNotes;

  await journalRepository.save(journal);

  // Reload with relations
  const updatedJournal = await journalRepository.findOne({
    where: { id: journal.id },
    relations: ['user', 'details'],
  });

  res.json({
    status: 'success',
    message: 'コメントを更新しました',
    data: { journal: updatedJournal },
  });
});

// Delete journal entry
export const deleteJournalEntry = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId, journalId } = req.params;

  const journalRepository = AppDataSource.getRepository(Journal);
  const journal = await journalRepository.findOne({
    where: { id: parseInt(journalId), issueId: parseInt(issueId) },
  });

  if (!journal) {
    throw new AppError('コメントが見つかりません', 404);
  }

  // Only author or admin can delete
  if (!req.user?.admin && journal.userId !== req.user?.id) {
    throw new AppError('このコメントを削除する権限がありません', 403);
  }

  await journalRepository.remove(journal);

  res.json({
    status: 'success',
    message: 'コメントを削除しました',
  });
});
