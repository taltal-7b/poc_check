import { Router } from 'express';
import {
  getAllIssues,
  getIssueById,
  createIssue,
  updateIssue,
  deleteIssue,
  copyIssue,
  bulkUpdateIssues,
} from '../controllers/issue.controller';
import {
  getIssueRelations,
  createIssueRelation,
  deleteIssueRelation,
} from '../controllers/issue-relation.controller';
import {
  getIssueWatchers,
  addWatcher,
  removeWatcher,
  watchIssue,
  unwatchIssue,
} from '../controllers/watcher.controller';
import {
  getIssueJournals,
  addJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
} from '../controllers/journal.controller';
import { getGanttData } from '../controllers/gantt.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkIssuePermission, canViewIssue } from '../middleware/permission.middleware';
import { AppDataSource } from '../config/database';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Issue CRUD
router.get('/', getAllIssues);
// Gantt chart (must be before /:id route to avoid matching)
router.get('/gantt', getGanttData);
router.get('/:id', canViewIssue, getIssueById);
router.post('/', checkIssuePermission('add_issues'), createIssue);
router.put('/:id', checkIssuePermission('edit_issues'), updateIssue);
router.delete('/:id', checkIssuePermission('delete_issues'), deleteIssue);

// Issue operations
router.post('/:id/copy', checkIssuePermission('add_issues'), copyIssue);
router.put('/bulk', checkIssuePermission('edit_issues'), bulkUpdateIssues);

// Issue relations
router.get('/:issueId/relations', getIssueRelations);
router.post('/:issueId/relations', checkIssuePermission('manage_issue_relations'), createIssueRelation);
router.delete('/:issueId/relations/:relationId', checkIssuePermission('manage_issue_relations'), deleteIssueRelation);

// Issue watchers
router.get('/:issueId/watchers', getIssueWatchers);
router.post('/:issueId/watchers', checkIssuePermission('add_issue_watchers'), addWatcher);
router.delete('/:issueId/watchers/:userId', checkIssuePermission('delete_issue_watchers'), removeWatcher);

// Watch/unwatch (current user)
router.post('/:issueId/watch', watchIssue);
router.delete('/:issueId/watch', unwatchIssue);

// Issue journals (comments/history)
router.get('/:issueId/journals', canViewIssue, getIssueJournals);
router.post('/:issueId/journals', checkIssuePermission('add_issue_notes'), addJournalEntry);
router.put('/:issueId/journals/:journalId', checkIssuePermission('edit_issue_notes'), updateJournalEntry);
router.delete('/:issueId/journals/:journalId', checkIssuePermission('edit_issue_notes'), deleteJournalEntry);

// Issue time entries
router.get('/:issueId/time-entries', async (req, res) => {
  const { TimeEntry } = await import('../entities/TimeEntry');
  const timeEntryRepository = AppDataSource.getRepository(TimeEntry);
  const timeEntries = await timeEntryRepository.find({
    where: { issueId: parseInt(req.params.issueId) },
    relations: ['user', 'activity', 'project'],
    order: { spentOn: 'DESC' },
  });
  res.json({ status: 'success', data: { timeEntries } });
});
router.post('/:issueId/time-entries', async (req, res) => {
  res.status(400).json({ 
    status: 'error', 
    message: 'Use POST /api/time-entries instead with issueId in the body' 
  });
});

export default router;
