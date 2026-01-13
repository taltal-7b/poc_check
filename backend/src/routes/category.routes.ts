import { Router } from 'express';
import {
  getProjectCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkProjectPermission } from '../middleware/permission.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Project categories
router.get('/projects/:projectId/categories', getProjectCategories);
router.post('/projects/:projectId/categories', checkProjectPermission('manage_categories'), createCategory);

// Category operations
router.get('/categories/:id', getCategoryById);
router.put('/categories/:id', checkProjectPermission('manage_categories'), updateCategory);
router.delete('/categories/:id', checkProjectPermission('manage_categories'), deleteCategory);

export default router;
