import { Router } from 'express';
import {
  getWorkflowRules,
  getWorkflowRuleById,
  createWorkflowRule,
  updateWorkflowRule,
  deleteWorkflowRule,
  copyWorkflowRules,
  checkStatusTransition,
} from '../controllers/workflow.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkGlobalPermission } from '../middleware/permission.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Workflow rules CRUD
router.get('/', checkGlobalPermission('manage_workflows'), getWorkflowRules);
router.get('/:id', checkGlobalPermission('manage_workflows'), getWorkflowRuleById);
router.post('/', checkGlobalPermission('manage_workflows'), createWorkflowRule);
router.put('/:id', checkGlobalPermission('manage_workflows'), updateWorkflowRule);
router.delete('/:id', checkGlobalPermission('manage_workflows'), deleteWorkflowRule);

// Workflow operations
router.post('/copy', checkGlobalPermission('manage_workflows'), copyWorkflowRules);

// Check status transition (public)
router.post('/check-transition', checkStatusTransition);

export default router;
