import { Router } from 'express';
import {
  register,
  login,
  logout,
  getCurrentUser,
  verifyTwoFA,
  enableTwoFA,
  confirmTwoFA,
  disableTwoFA,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

// 2FA routes
router.post('/2fa/verify', authenticate, verifyTwoFA);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.post('/2fa/enable', authenticate, enableTwoFA);
router.post('/2fa/confirm', authenticate, confirmTwoFA);
router.post('/2fa/disable', authenticate, disableTwoFA);

export default router;
