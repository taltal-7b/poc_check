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
  AI_PROGRESS_SUMMARY_MODEL: envString('gpt-5-mini'),
  AI_PROGRESS_SUMMARY_ISSUE_LIMIT: z.coerce.number().int().min(1).max(1000).default(100),
  AI_PROGRESS_SUMMARY_MAX_COMMENTS: z.coerce.number().int().min(0).max(20).default(3),
  AI_PROGRESS_SUMMARY_MAX_DESCRIPTION_CHARS: z.coerce.number().int().min(100).max(20000).default(1200),
  AI_PROGRESS_SUMMARY_MAX_COMMENT_CHARS: z.coerce.number().int().min(100).max(10000).default(600),
  AI_PROGRESS_SUMMARY_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(100).max(4000).default(900),
  AI_PROGRESS_SUMMARY_MAX_INPUT_CHARS: z.coerce.number().int().min(1000).max(200000).default(50000),
  AI_PROGRESS_SUMMARY_PROMPT: envString('あなたはプロジェクト管理ツールの進捗を要約するアシスタントです。プロジェクト概要、メンバー、未完了チケットの内容から、進捗状況、注意点、次の指示を日本語で簡潔にまとめてください。'),
  AI_WEEKLY_REPORT_MODEL: envString('gpt-5-mini'),
  AI_WEEKLY_REPORT_ISSUE_LIMIT: z.coerce.number().int().min(1).max(1000).default(200),
  AI_WEEKLY_REPORT_MAX_COMMENTS: z.coerce.number().int().min(0).max(50).default(5),
  AI_WEEKLY_REPORT_MAX_DESCRIPTION_CHARS: z.coerce.number().int().min(100).max(30000).default(1500),
  AI_WEEKLY_REPORT_MAX_COMMENT_CHARS: z.coerce.number().int().min(100).max(10000).default(800),
  AI_WEEKLY_REPORT_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(100).max(6000).default(1400),
  AI_WEEKLY_REPORT_MAX_INPUT_CHARS: z.coerce.number().int().min(1000).max(300000).default(80000),
  AI_WEEKLY_REPORT_MOCK_OPENAI: envBoolean.default(false),
  AI_WEEKLY_REPORT_PROMPT: envString('あなたはプロジェクト管理ツールの週次レポートを作成するアシスタントです。プロジェクト情報、直近1週間に作成・更新・期日到来したチケット情報から、今週の動き、完了/進行中の状況、リスク、来週の推奨アクションを日本語で簡潔にまとめてください。'),
  AI_BOTTLENECK_DETECTION_MODEL: envString('gpt-5-mini'),
  AI_BOTTLENECK_DETECTION_OPEN_ISSUE_LIMIT: z.coerce.number().int().min(1).max(1000).default(30),
  AI_BOTTLENECK_DETECTION_CLOSED_ISSUE_LIMIT: z.coerce.number().int().min(1).max(1000).default(30),
  AI_BOTTLENECK_DETECTION_MAX_COMMENTS: z.coerce.number().int().min(0).max(20).default(3),
  AI_BOTTLENECK_DETECTION_MAX_DESCRIPTION_CHARS: z.coerce.number().int().min(100).max(20000).default(1200),
  AI_BOTTLENECK_DETECTION_MAX_COMMENT_CHARS: z.coerce.number().int().min(100).max(10000).default(600),
  AI_BOTTLENECK_DETECTION_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(100).max(6000).default(2200),
  AI_BOTTLENECK_DETECTION_MAX_INPUT_CHARS: z.coerce.number().int().min(1000).max(300000).default(80000),
  AI_BOTTLENECK_DETECTION_MOCK_OPENAI: envBoolean.default(false),
  AI_BOTTLENECK_DETECTION_PROMPT: envString('あなたはチケット管理システムのボトルネック検知アシスタントです。未完了で期日超過しているチケットと、過去に期日超過後に完了したチケットの情報から、担当者・内容・トラッカー・カテゴリ・見積・進捗・履歴に見られる法則性、遅延要因、改善策を日本語で簡潔に示してください。個人攻撃ではなく、プロセス改善につながる表現にしてください。'),
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
