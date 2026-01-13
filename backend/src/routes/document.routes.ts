import { Router } from 'express';
import {
  getProjectDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  deleteDocument,
} from '../controllers/document.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkProjectPermission } from '../middleware/permission.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Project documents
router.get('/projects/:projectId/documents', getProjectDocuments);
router.post('/projects/:projectId/documents', checkProjectPermission('manage_documents'), createDocument);

// Document operations
router.get('/documents/:id', getDocumentById);
router.put('/documents/:id', checkProjectPermission('manage_documents'), updateDocument);
router.delete('/documents/:id', checkProjectPermission('manage_documents'), deleteDocument);

export default router;
