import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config';
import fs from 'fs';

const uploadDir = config.UPLOAD_DIR;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const normalizedName = normalizeFilename(file.originalname);
    const hash = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(normalizedName);
    cb(null, `${hash}${ext}`);
  },
});

function scoreFilename(s: string): number {
  const jp = (s.match(/[\u3040-\u30ff\u3400-\u9fff]/g) ?? []).length;
  const bad = (s.match(/[ãÃâÂ¢�]/g) ?? []).length;
  return jp * 2 - bad * 2;
}

function normalizeFilename(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return scoreFilename(decoded) > scoreFilename(name) ? decoded : name;
}

export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});
