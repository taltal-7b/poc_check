import { Router } from 'express';
import { authenticate, optionalAuth, requireAdmin } from '../middleware/auth.middleware';
import { checkProjectPermission, canViewProject, checkGlobalPermission } from '../middleware/permission.middleware';
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  closeProject,
  reopenProject,
  archiveProject,
  unarchiveProject,
} from '../controllers/project.controller';
import {
  getProjectMembers,
  getMemberById,
  addMember,
  updateMemberRoles,
  removeMember,
  autocompleteMembersToAdd,
} from '../controllers/member.controller';

const router = Router();

// Public routes (with optional auth)
router.get('/', optionalAuth, getAllProjects);
router.get('/:id', optionalAuth, canViewProject, getProjectById);

// Protected routes
router.post('/', authenticate, checkGlobalPermission('add_project'), createProject);
router.put('/:id', authenticate, checkProjectPermission('edit_project'), updateProject);
router.delete('/:id', authenticate, requireAdmin, deleteProject);

// Project status management
router.post('/:id/close', authenticate, checkProjectPermission('close_project'), closeProject);
router.post('/:id/reopen', authenticate, checkProjectPermission('close_project'), reopenProject);
router.post('/:id/archive', authenticate, requireAdmin, archiveProject);
router.post('/:id/unarchive', authenticate, requireAdmin, unarchiveProject);

// Project members
router.get('/:projectId/members', optionalAuth, canViewProject, getProjectMembers);
router.get('/:projectId/members/:memberId', optionalAuth, canViewProject, getMemberById);
router.post('/:projectId/members', authenticate, checkProjectPermission('manage_members'), addMember);
router.put('/:projectId/members/:memberId', authenticate, checkProjectPermission('manage_members'), updateMemberRoles);
router.delete('/:projectId/members/:memberId', authenticate, checkProjectPermission('manage_members'), removeMember);
router.get('/:projectId/members/autocomplete', authenticate, checkProjectPermission('manage_members'), autocompleteMembersToAdd);

export default router;
