import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { authenticate } from '../middleware/auth.middleware';
import {
  deleteAttachment,
  downloadAttachment,
  getUploadSettings,
  uploadIssueAttachments,
  uploadJournalAttachments,
} from '../controllers/attachment.controller';

const router = Router();

const { storageDir, maxSizeBytes } = getUploadSettings();

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const now = new Date();
      const dir = path.join(
        storageDir,
        `${now.getFullYear()}`,
        `${String(now.getMonth() + 1).padStart(2, '0')}`
      );
      await import('fs/promises').then((fs) => fs.mkdir(dir, { recursive: true }));
      cb(null, dir);
    } catch (error) {
      cb(error as Error, storageDir);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: maxSizeBytes },
});

router.use(authenticate);

router.post('/issues/:issueId/attachments', upload.array('files', 10), uploadIssueAttachments);
router.post(
  '/issues/:issueId/journals/:journalId/attachments',
  upload.array('files', 10),
  uploadJournalAttachments
);

router.get('/attachments/:id/download', downloadAttachment);
router.delete('/attachments/:id', deleteAttachment);

export default router;
