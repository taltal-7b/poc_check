import { Router } from 'express';
import {
  getProjectWiki,
  getWikiPages,
  getWikiPage,
  saveWikiPage,
  deleteWikiPage,
  getWikiPageVersion,
  renameWikiPage,
} from '../controllers/wiki.controller';
import { authenticate } from '../middleware/auth.middleware';
import { checkProjectPermission } from '../middleware/permission.middleware';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Wiki management
router.get('/projects/:projectId/wiki', getProjectWiki);
router.get('/projects/:projectId/wiki/pages', getWikiPages);

// Wiki pages
router.get('/projects/:projectId/wiki/:title', getWikiPage);
router.put('/projects/:projectId/wiki/:title', checkProjectPermission('edit_wiki_pages'), saveWikiPage);
router.delete('/projects/:projectId/wiki/:title', checkProjectPermission('delete_wiki_pages'), deleteWikiPage);
router.post('/projects/:projectId/wiki/:title/rename', checkProjectPermission('rename_wiki_pages'), renameWikiPage);

// Wiki page versions
router.get('/projects/:projectId/wiki/:title/version/:version', getWikiPageVersion);

export default router;
