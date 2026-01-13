import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import {
  getAllGroups,
  getGroupById,
  createGroup,
  updateGroup,
  deleteGroup,
  addUserToGroup,
  removeUserFromGroup,
  getGroupUsers,
} from '../controllers/group.controller';

const router = Router();

// All group routes require authentication
router.use(authenticate);

// Group CRUD
router.get('/', getAllGroups);
router.get('/:id', getGroupById);
router.post('/', requireAdmin, createGroup);
router.put('/:id', requireAdmin, updateGroup);
router.delete('/:id', requireAdmin, deleteGroup);

// Group users
router.get('/:id/users', getGroupUsers);
router.post('/:id/users', requireAdmin, addUserToGroup);
router.delete('/:id/users/:userId', requireAdmin, removeUserFromGroup);

export default router;
