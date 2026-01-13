import { Router } from 'express';
import {
  getProjectVersions,
  getVersionById,
  createVersion,
  updateVersion,
  deleteVersion,
  closeVersion,
  reopenVersion,
} from '../controllers/version.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkProjectPermission } from '../middleware/permission.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Project versions
router.get('/projects/:projectId/versions', getProjectVersions);
router.post('/projects/:projectId/versions', checkProjectPermission('manage_versions'), createVersion);

// Version operations
router.get('/versions/:id', getVersionById);
router.put('/versions/:id', checkProjectPermission('manage_versions'), updateVersion);
router.delete('/versions/:id', checkProjectPermission('manage_versions'), deleteVersion);
router.post('/versions/:id/close', checkProjectPermission('manage_versions'), closeVersion);
router.post('/versions/:id/reopen', checkProjectPermission('manage_versions'), reopenVersion);

export default router;
