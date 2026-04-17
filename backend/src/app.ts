import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { config } from './config';
import { errorHandler } from './middleware/error-handler';
import { requireProjectModule } from './middleware/project-module';

import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import issueRoutes from './routes/issues';
import trackerRoutes from './routes/trackers';
import statusRoutes from './routes/statuses';
import workflowRoutes from './routes/workflows';
import customFieldRoutes from './routes/custom-fields';
import timeEntryRoutes from './routes/time-entries';
import wikiRoutes from './routes/wiki';
import documentRoutes from './routes/documents';
import newsRoutes from './routes/news';
import boardRoutes from './routes/boards';
import versionRoutes from './routes/versions';
import userRoutes from './routes/users';
import roleRoutes from './routes/roles';
import groupRoutes from './routes/groups';
import searchRoutes from './routes/search';
import activityRoutes from './routes/activities';
import attachmentRoutes from './routes/attachments';
import queryRoutes from './routes/queries';
import settingRoutes from './routes/settings';
import memberRoutes from './routes/members';
import enumerationRoutes from './routes/enumerations';
import importExportRoutes from './routes/import-export';
import myRoutes from './routes/my';
import journalRoutes from './routes/journals';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.FRONTEND_URL, credentials: true }));
app.use(morgan('short'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.resolve(config.UPLOAD_DIR)));

const api = express.Router();
api.use('/auth', authRoutes);
api.use('/projects', projectRoutes);
api.use('/issues', issueRoutes);
api.use('/trackers', trackerRoutes);
api.use('/issue_statuses', statusRoutes);
api.use('/workflows', workflowRoutes);
api.use('/custom_fields', customFieldRoutes);
api.use('/time_entries', timeEntryRoutes);
api.use('/users', userRoutes);
api.use('/roles', roleRoutes);
api.use('/groups', groupRoutes);
api.use('/search', searchRoutes);
api.use('/activities', activityRoutes);
api.use('/attachments', attachmentRoutes);
api.use('/queries', queryRoutes);
api.use('/settings', settingRoutes);
api.use('/enumerations', enumerationRoutes);
api.use('/import', importExportRoutes);
api.use('/my', myRoutes);
api.use('/news', newsRoutes);
api.use('/versions', versionRoutes);
api.use('/journals', journalRoutes);

app.use('/api/v1', api);

// Nested project routes
api.use('/projects/:projectId/issues', requireProjectModule('issue_tracking'), issueRoutes);
api.use('/projects/:projectId/wiki', requireProjectModule('wiki'), wikiRoutes);
api.use('/projects/:projectId/documents', requireProjectModule('documents'), documentRoutes);
api.use('/projects/:projectId/news', requireProjectModule('news'), newsRoutes);
api.use('/projects/:projectId/boards', requireProjectModule('boards'), boardRoutes);
api.use('/projects/:projectId/versions', versionRoutes);
api.use('/projects/:projectId/members', memberRoutes);
api.use('/projects/:projectId/time_entries', requireProjectModule('time_tracking'), timeEntryRoutes);
api.use('/projects/:projectId/files', attachmentRoutes);

app.get('/up', (_req, res) => res.json({ status: 'ok' }));
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /api/\n');
});

app.use(errorHandler);

export default app;
