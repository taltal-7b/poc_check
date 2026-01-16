import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import { config } from 'dotenv';
import { AppDataSource } from './config/database';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import roleRoutes from './routes/role.routes';
import groupRoutes from './routes/group.routes';
import projectRoutes from './routes/project.routes';
import issueRoutes from './routes/issue.routes';
import workflowRoutes from './routes/workflow.routes';
import timeEntryRoutes from './routes/time-entry.routes';
import versionRoutes from './routes/version.routes';
import categoryRoutes from './routes/category.routes';
import customFieldRoutes from './routes/custom-field.routes';
import documentRoutes from './routes/document.routes';
import newsRoutes from './routes/news.routes';
import wikiRoutes from './routes/wiki.routes';
import masterDataRoutes from './routes/master-data.routes';
import attachmentRoutes from './routes/attachment.routes';
import { errorHandler } from './middleware/error.middleware';

config();

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests, please try again later.',
  skip: (req) => {
    // Skip rate limiting for certain paths in development
    if (process.env.NODE_ENV === 'development') {
      return req.path.startsWith('/api/trackers') || 
             req.path.startsWith('/api/issue-statuses') || 
             req.path.startsWith('/api/issue-priorities');
    }
    return false;
  }
});

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));
app.use('/api', limiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/time-entries', timeEntryRoutes);
app.use('/api', versionRoutes);
app.use('/api', categoryRoutes);
app.use('/api', customFieldRoutes);
app.use('/api', documentRoutes);
app.use('/api', newsRoutes);
app.use('/api', wikiRoutes);
app.use('/api', masterDataRoutes);
app.use('/api', attachmentRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Database connection and server start
AppDataSource.initialize()
  .then(() => {
    console.log('Database connected successfully');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((error) => {
    console.error('Error connecting to database:', error);
    process.exit(1);
  });

export default app;
