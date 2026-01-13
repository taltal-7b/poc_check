import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  getRolePermissions,
  updateRolePermissions,
  getAvailablePermissions,
} from '../controllers/role.controller';

const router = Router();

// All role routes require authentication
router.use(authenticate);

// Get available permissions
router.get('/permissions/available', getAvailablePermissions);

// Role CRUD (admin only for create/update/delete)
router.get('/', getAllRoles);
router.get('/:id', getRoleById);
router.post('/', requireAdmin, createRole);
router.put('/:id', requireAdmin, updateRole);
router.delete('/:id', requireAdmin, deleteRole);

// Role permissions
router.get('/:id/permissions', getRolePermissions);
router.put('/:id/permissions', requireAdmin, updateRolePermissions);

export default router;
