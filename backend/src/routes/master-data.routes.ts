import { Router } from 'express';
import {
  getAllTrackers,
  getAllIssueStatuses,
  getAllIssuePriorities,
} from '../controllers/master-data.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Master data endpoints
router.get('/trackers', getAllTrackers);
router.get('/issue-statuses', getAllIssueStatuses);
router.get('/issue-priorities', getAllIssuePriorities);

export default router;
