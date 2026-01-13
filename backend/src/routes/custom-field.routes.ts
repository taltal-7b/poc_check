import { Router } from 'express';
import {
  getAllCustomFields,
  getCustomFieldById,
  createCustomField,
  updateCustomField,
  deleteCustomField,
  associateCustomFieldWithProject,
  getProjectCustomFields,
} from '../controllers/custom-field.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkGlobalPermission } from '../middleware/permission.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Custom field management (admin only)
router.get('/custom-fields', getAllCustomFields);
router.get('/custom-fields/:id', getCustomFieldById);
router.post('/custom-fields', checkGlobalPermission('manage_enumerations'), createCustomField);
router.put('/custom-fields/:id', checkGlobalPermission('manage_enumerations'), updateCustomField);
router.delete('/custom-fields/:id', checkGlobalPermission('manage_enumerations'), deleteCustomField);

// Project-specific custom fields
router.post('/custom-fields/associate', checkGlobalPermission('manage_enumerations'), associateCustomFieldWithProject);
router.get('/projects/:projectId/custom-fields', getProjectCustomFields);

export default router;
