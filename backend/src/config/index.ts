import { z } from 'zod';

const envBoolean = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  if (['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) return true;
  if (['0', 'false', 'no', 'off'].includes(value.toLowerCase())) return false;
  return value;
}, z.boolean());

const envString = (defaultValue: string) => z.preprocess((value) => (
  typeof value === 'string' && !value.trim() ? undefined : value
), z.string().default(defaultValue));

const envSchema = z.object({
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(3000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().default('noreply@tasknova.local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().default('gpt-5.2'),
  AI_DUE_SUMMARY_ENABLED: envBoolean.default(true),
  AI_DUE_SUMMARY_TIME_ZONE: z.string().default('Asia/Tokyo'),
  AI_DUE_SUMMARY_HOUR: z.coerce.number().int().min(0).max(23).default(7),
  AI_DUE_SUMMARY_LOOKAHEAD_DAYS: z.coerce.number().int().min(1).max(30).default(3),
  AI_DUE_SUMMARY_MAX_COMMENTS: z.coerce.number().int().min(0).max(100).default(20),
  AI_DUE_SUMMARY_MAX_INPUT_CHARS: z.coerce.number().int().min(1000).max(100000).default(20000),
  AI_DUE_SUMMARY_MOCK_OPENAI: envBoolean.default(false),
  AI_DUE_SUMMARY_DRY_RUN: envBoolean.default(false),
  AI_DUE_SUMMARY_PROMPT: envString('あなたはプロジェクト管理ツールのチケット内容を担当者向けに要約するアシスタントです。タイトル、説明、コメントから、期限前に担当者が確認すべき状況・未解決点・次の行動を日本語で簡潔にまとめてください。'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const config: Config = loadConfig();
