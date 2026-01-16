import { Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { AppDataSource } from '../config/database';
import { Attachment } from '../entities/Attachment';
import { Issue } from '../entities/Issue';
import { Journal } from '../entities/Journal';
import { Project } from '../entities/Project';
import { Member } from '../entities/Member';
import { AppError, catchAsync } from '../middleware/error.middleware';
import { AuthRequest } from '../middleware/auth.middleware';

const ATTACHMENTS_ROOT = process.env.ATTACHMENTS_DIR || path.join(process.cwd(), 'uploads', 'attachments');
const MAX_SIZE_KB = parseInt(process.env.ATTACHMENTS_MAX_SIZE_KB || '5120', 10);
const ALLOWED_EXT = (process.env.ATTACHMENTS_ALLOWED_EXTENSIONS || '')
  .split(',')
  .map((ext) => ext.trim().toLowerCase())
  .filter(Boolean);
const DENIED_EXT = (process.env.ATTACHMENTS_DENIED_EXTENSIONS || '')
  .split(',')
  .map((ext) => ext.trim().toLowerCase())
  .filter(Boolean);

const ensureDirectory = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const getFileExtension = (filename: string) => {
  const ext = path.extname(filename || '').toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : ext;
};
const normalizeFilename = (filename: string) => {
  if (!filename) return '';
  if (!/[\u00c0-\u00ff]/.test(filename)) return filename;
  const decoded = Buffer.from(filename, 'latin1').toString('utf8');
  if (!decoded || decoded === filename) return filename;
  if (decoded.includes('\uFFFD')) return filename;
  return decoded;
};

const isExtensionAllowed = (filename: string) => {
  const ext = getFileExtension(filename);
  if (DENIED_EXT.length > 0 && ext && DENIED_EXT.includes(ext)) {
    return false;
  }
  if (ALLOWED_EXT.length > 0) {
    return ext ? ALLOWED_EXT.includes(ext) : false;
  }
  return true;
};

const getIssueWithAccess = async (issueId: number, user: AuthRequest['user']) => {
  const issueRepository = AppDataSource.getRepository(Issue);
  const issue = await issueRepository.findOne({
    where: { id: issueId },
  });

  if (!issue) {
    throw new AppError('課題が見つかりません', 404);
  }

  if (!user) {
    throw new AppError('権限がありません', 403);
  }

  if (issue.isPrivate && !user.admin && issue.authorId !== user.id) {
    throw new AppError('この課題にアクセスする権限がありません', 403);
  }

  if (!user.admin) {
    const projectRepository = AppDataSource.getRepository(Project);
    const project = await projectRepository.findOne({
      where: { id: issue.projectId },
    });

    if (!project) {
      throw new AppError('プロジェクトが見つかりません', 404);
    }

    if (!project.isPublic) {
      const memberRepository = AppDataSource.getRepository(Member);
      const member = await memberRepository.findOne({
        where: {
          projectId: issue.projectId,
          userId: user.id,
        },
      });

      if (!member) {
        throw new AppError('この課題にアクセスする権限がありません', 403);
      }
    }
  }

  return issue;
};

const createAttachmentRecord = async (
  file: Express.Multer.File,
  containerType: string,
  containerId: number,
  userId: number
) => {
  const originalFilename = normalizeFilename(file.originalname);
  if (!isExtensionAllowed(originalFilename)) {
    await fs.unlink(file.path);
    throw new AppError('許可されていない拡張子です', 400);
  }

  const digest = crypto.createHash('sha1').update(await fs.readFile(file.path)).digest('hex');
  const attachmentRepository = AppDataSource.getRepository(Attachment);

  const diskDirectory = path.dirname(path.relative(ATTACHMENTS_ROOT, file.path));
  const attachment = attachmentRepository.create({
    containerId,
    containerType,
    filename: originalFilename,
    diskFilename: path.basename(file.path),
    filesize: file.size,
    contentType: file.mimetype,
    digest,
    downloads: 0,
    authorId: userId,
    description: '',
    diskDirectory: diskDirectory === '.' ? null : diskDirectory,
  });

  await attachmentRepository.save(attachment);
  return attachment;
};

export const uploadIssueAttachments = catchAsync(async (req: AuthRequest, res: Response) => {
  const issueId = parseInt(req.params.issueId);
  await getIssueWithAccess(issueId, req.user);

  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    throw new AppError('ファイルが見つかりません', 400);
  }

  const attachments = [];
  for (const file of files) {
    const attachment = await createAttachmentRecord(file, 'Issue', issueId, req.user!.id);
    attachments.push(attachment);
  }

  res.status(201).json({
    status: 'success',
    message: '豺ｻ莉倥ヵ繧｡繧､繝ｫ繧定ｿｽ蜉縺励∪縺励◆',
    data: { attachments },
  });
});

export const uploadJournalAttachments = catchAsync(async (req: AuthRequest, res: Response) => {
  const issueId = parseInt(req.params.issueId);
  const journalId = parseInt(req.params.journalId);
  await getIssueWithAccess(issueId, req.user);

  const journalRepository = AppDataSource.getRepository(Journal);
  const journal = await journalRepository.findOne({
    where: { id: journalId, journalizedId: issueId, journalizedType: 'Issue' },
  });

  if (!journal) {
    throw new AppError('コメントが見つかりません', 404);
  }

  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    throw new AppError('ファイルが見つかりません', 400);
  }

  const attachments = [];
  for (const file of files) {
    const attachment = await createAttachmentRecord(file, 'Journal', journalId, req.user!.id);
    attachments.push(attachment);
  }

  res.status(201).json({
    status: 'success',
    message: '繧ｳ繝｡繝ｳ繝医↓豺ｻ莉倥ｒ霑ｽ蜉縺励∪縺励◆',
    data: { attachments },
  });
});

export const downloadAttachment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const attachmentRepository = AppDataSource.getRepository(Attachment);
  const attachment = await attachmentRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!attachment) {
    throw new AppError('添付ファイルが見つかりません', 404);
  }

  if (attachment.containerType === 'Issue') {
    await getIssueWithAccess(attachment.containerId, req.user);
  } else if (attachment.containerType === 'Journal') {
    const journalRepository = AppDataSource.getRepository(Journal);
    const journal = await journalRepository.findOne({
      where: { id: attachment.containerId, journalizedType: 'Issue' },
    });
    if (!journal) {
      throw new AppError('コメントが見つかりません', 404);
    }
    await getIssueWithAccess(journal.journalizedId, req.user);
  }

  const diskPath = attachment.diskDirectory
    ? path.join(ATTACHMENTS_ROOT, attachment.diskDirectory, attachment.diskFilename)
    : path.join(ATTACHMENTS_ROOT, attachment.diskFilename);

  attachment.downloads = (attachment.downloads || 0) + 1;
  await attachmentRepository.save(attachment);

  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (attachment.contentType && attachment.contentType.startsWith('image/')) {
    // Escape filename for Content-Disposition header (remove invalid characters)
    const escapedFilename = attachment.filename.replace(/[\r\n"]/g, '').replace(/\\/g, '');
    res.setHeader('Content-Disposition', `inline; filename="${escapedFilename}"`);
    res.setHeader('Content-Type', attachment.contentType);
    res.sendFile(diskPath);
    return;
  }

  res.download(diskPath, attachment.filename);
});

export const deleteAttachment = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const attachmentRepository = AppDataSource.getRepository(Attachment);
  const attachment = await attachmentRepository.findOne({
    where: { id: parseInt(id) },
  });

  if (!attachment) {
    throw new AppError('添付ファイルが見つかりません', 404);
  }

  if (!req.user?.admin && attachment.authorId !== req.user?.id) {
    throw new AppError('この添付を削除する権限がありません', 403);
  }

  const diskPath = attachment.diskDirectory
    ? path.join(ATTACHMENTS_ROOT, attachment.diskDirectory, attachment.diskFilename)
    : path.join(ATTACHMENTS_ROOT, attachment.diskFilename);

  await attachmentRepository.remove(attachment);
  await fs.unlink(diskPath).catch(() => null);

  res.json({
    status: 'success',
    message: '豺ｻ莉倥ヵ繧｡繧､繝ｫ繧貞炎髯､縺励∪縺励◆',
  });
});

export const getUploadSettings = () => ({
  storageDir: ATTACHMENTS_ROOT,
  maxSizeBytes: MAX_SIZE_KB * 1024,
});




