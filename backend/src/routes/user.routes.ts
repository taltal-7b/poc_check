import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';

// Middleware to check if user can access user info (self or admin)
const checkUserAccess = async (req: any, res: any, next: any) => {
  const userId = parseInt(req.params.id);
  if (req.user.admin || req.user.id === userId) {
    return next();
  }
  return res.status(403).json({
    status: 'error',
    message: '他のユーザーの情報にアクセスする権限がありません',
  });
};
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserProjects,
  toggleUserLock,
} from '../controllers/user.controller';

const router = Router();

// All user routes require authentication
router.use(authenticate);

// User CRUD (restrict to admin or same user)
router.get('/', requireAdmin, getAllUsers);
router.get('/:id', checkUserAccess, getUserById);
router.post('/', requireAdmin, createUser);
router.put('/:id', updateUser);
router.delete('/:id', requireAdmin, deleteUser);

// User specific routes
router.get('/:id/projects', getUserProjects);
router.post('/:id/lock', requireAdmin, toggleUserLock);

export default router;
