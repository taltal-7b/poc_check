import { Router } from 'express';
import {
  getAllTimeEntries,
  getTimeEntryById,
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  getActivities,
  createActivity,
  updateActivity,
  deleteActivity,
} from '../controllers/time-entry.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkGlobalPermission } from '../middleware/permission.middleware';
import { AppDataSource } from '../config/database';
import { TimeEntry } from '../entities/TimeEntry';
import { Member } from '../entities/Member';

// Middleware to check time entry access
const checkTimeEntryAccess = async (req: any, res: any, next: any) => {
  try {
    const timeEntryId = req.params.id;
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: '認証が必要です',
      });
    }

    if (user.admin) {
      return next();
    }

    const timeEntryRepository = AppDataSource.getRepository(TimeEntry);
    const timeEntry = await timeEntryRepository.findOne({
      where: { id: parseInt(timeEntryId) },
      relations: ['project'],
    });

    if (!timeEntry) {
      return res.status(404).json({
        status: 'error',
        message: '作業時間が見つかりません',
      });
    }

    // Check if user is member of the project
    const memberRepository = AppDataSource.getRepository(Member);
    const member = await memberRepository.findOne({
      where: {
        userId: user.id,
        projectId: timeEntry.projectId,
      },
      relations: ['memberRoles', 'memberRoles.role'],
    });

    if (!member) {
      return res.status(403).json({
        status: 'error',
        message: 'このプロジェクトのメンバーではありません',
      });
    }

    // User can edit/delete their own time entries
    if (timeEntry.authorId === user.id) {
      return next();
    }

    // Or if they have edit_time_entries permission
    for (const memberRole of member.memberRoles) {
      if (memberRole.role.hasPermission('edit_time_entries')) {
        return next();
      }
    }

    return res.status(403).json({
      status: 'error',
      message: 'この作業時間を編集する権限がありません',
    });
  } catch (error) {
    next(error);
  }
};

const router = Router();

// All routes require authentication
router.use(authenticate);

// Time entry CRUD
router.get('/', getAllTimeEntries);
router.get('/:id', checkTimeEntryAccess, getTimeEntryById);
router.post('/', createTimeEntry);
router.put('/:id', checkTimeEntryAccess, updateTimeEntry);
router.delete('/:id', checkTimeEntryAccess, deleteTimeEntry);

// Activity management (admin only)
router.get('/activities/list', getActivities);
router.post('/activities', checkGlobalPermission('manage_enumerations'), createActivity);
router.put('/activities/:id', checkGlobalPermission('manage_enumerations'), updateActivity);
router.delete('/activities/:id', checkGlobalPermission('manage_enumerations'), deleteActivity);

export default router;
