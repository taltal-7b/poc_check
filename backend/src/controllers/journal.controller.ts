import { Response } from 'express';
import { AppDataSource } from '../config/database';
import { In } from 'typeorm';
import { Journal } from '../entities/Journal';
import { JournalDetail } from '../entities/JournalDetail';
import { Issue } from '../entities/Issue';
import { Attachment } from '../entities/Attachment';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';
import { notifyIssueCommented, notifyIssueUpdated } from '../services/notification.service';

// Get issue journals (comments/history)
export const getIssueJournals = catchAsync(async (req: AuthRequest, res: Response) => {
  const { issueId } = req.params;

  const journalRepository = AppDataSource.getRepository(Journal);
  const journals = await journalRepository.find({
    where: { 
      journalizedId: parseInt(issueId),
      journalizedType: 'Issue'
    },
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

  const attachmentRepository = AppDataSource.getRepository(Attachment);
  const journalIds = filteredJournals.map((journal) => journal.id);
  const journalAttachments = journalIds.length
    ? await attachmentRepository.find({
        where: {
          containerType: 'Journal',
          containerId: In(journalIds),
        },
        relations: ['author'],
        order: { createdOn: 'ASC' },
      })
    : [];

  const journalAttachmentMap = new Map<number, Attachment[]>();
  for (const attachment of journalAttachments) {
    const list = journalAttachmentMap.get(attachment.containerId) || [];
    list.push(attachment);
    journalAttachmentMap.set(attachment.containerId, list);
  }

  const journalsWithAttachments = filteredJournals.map((journal) => ({
    ...journal,
    attachments: journalAttachmentMap.get(journal.id) || [],
  }));

  res.json({
    status: 'success',
    data: { journals: journalsWithAttachments },
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
    journalizedId: parseInt(issueId),
    journalizedType: 'Issue',
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

  // Reload issue with relations for notification using QueryBuilder
  const issueWithRelations = await issueRepository
    .createQueryBuilder('issue')
    .leftJoinAndSelect('issue.project', 'project')
    .leftJoinAndSelect('issue.author', 'author')
    .leftJoinAndSelect('issue.assignedTo', 'assignedTo')
    .leftJoinAndSelect('issue.status', 'status')
    .leftJoinAndSelect('issue.priority', 'priority')
    .where('issue.id = :id', { id: parseInt(issueId) })
    .getOne();

  // Debug: Check what we got
  console.log(`[Journal] addJournalEntry: savedJournal=${!!savedJournal}, issueWithRelations=${!!issueWithRelations}`);
  if (issueWithRelations) {
    console.log(`[Journal] issue.projectId=${issueWithRelations.projectId}, issue.project=${!!issueWithRelations.project}, issue.project?.name=${issueWithRelations.project?.name || 'N/A'}`);
  }

  // Send notification (async, don't wait for it)
  console.log(`[Journal] addJournalEntry: savedJournal=${!!savedJournal}, issueWithRelations=${!!issueWithRelations}, project=${!!issueWithRelations?.project}, notes="${notes}"`);
  if (savedJournal && issueWithRelations && issueWithRelations.project) {
    if (notes && notes.trim().length > 0) {
      // This is a comment
      console.log(`[Journal] Calling notifyIssueCommented for issue #${issueWithRelations.id}`);
      notifyIssueCommented(issueWithRelations, issueWithRelations.project, savedJournal).catch((error) => {
        console.error('[Journal] Failed to send comment notification:', error);
      });
    } else {
      // This is an update (field change)
      console.log(`[Journal] Calling notifyIssueUpdated for issue #${issueWithRelations.id}`);
      notifyIssueUpdated(issueWithRelations, issueWithRelations.project, savedJournal).catch((error) => {
        console.error('[Journal] Failed to send update notification:', error);
      });
    }
  } else {
    console.log(`[Journal] Notification skipped: savedJournal=${!!savedJournal}, issueWithRelations=${!!issueWithRelations}, project=${!!issueWithRelations?.project}`);
  }

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
    where: { 
      id: parseInt(journalId), 
      journalizedId: parseInt(issueId),
      journalizedType: 'Issue'
    },
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
