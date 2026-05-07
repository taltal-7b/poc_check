import { Prisma } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../utils/db';
import { logger } from '../utils/logger';
import { sendMail } from './mail-service';
import { createOpenAiSummary } from './openai-service';

const LAST_RUN_SETTING = 'ai_due_summary_last_run_date';
const LOCK_EXPIRES_MS = 30 * 60 * 1000;

type RecipientUser = {
  id: string;
  mail: string;
  status: number;
  userPreference: { others: Prisma.JsonValue } | null;
};

function jsonObject(value: Prisma.JsonValue): Prisma.JsonObject | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Prisma.JsonObject;
  }
  return null;
}

function wantsMail(user: RecipientUser): boolean {
  if (user.status !== 1 || !user.mail.trim()) return false;
  const others = user.userPreference ? jsonObject(user.userPreference.others) : null;
  return others?.mailNotificationsEnabled !== false;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    dateKey: `${value('year')}-${value('month')}-${value('day')}`,
    hour: Number(value('hour')),
    minute: Number(value('minute')),
  };
}

function zonedDateRange(dateKey: string, timeZone: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const offsetMinutes = timeZoneOffsetMinutes(new Date(Date.UTC(year, month - 1, day, 0, 0, 0)), timeZone);
  const start = new Date(Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMinutes * 60_000);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days + 1);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  return { start, end };
}

function timeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
  return (asUtc - date.getTime()) / 60_000;
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n...`;
}

function issueUrl(issue: { id: string; project: { identifier: string } }) {
  const baseUrl = config.FRONTEND_URL.replace(/\/+$/, '');
  return `${baseUrl}/projects/${issue.project.identifier}/issues/${issue.id}`;
}

function buildIssueInput(issue: DueIssue): string {
  const comments = issue.journals
    .filter((journal) => journal.notes?.trim())
    .slice(-config.AI_DUE_SUMMARY_MAX_COMMENTS)
    .map((journal) => {
      const author = `${journal.user.lastname} ${journal.user.firstname}`.trim() || journal.user.login;
      return `- ${journal.createdAt.toISOString()} ${author}: ${journal.notes}`;
    })
    .join('\n');

  return truncate(
    [
      `チケット: #${issue.number} ${issue.subject}`,
      `プロジェクト: ${issue.project.name}`,
      `ステータス: ${issue.status.name}`,
      `進捗率: ${issue.doneRatio}%`,
      `期日: ${issue.dueDate?.toISOString().slice(0, 10) ?? '-'}`,
      '',
      '説明:',
      issue.description ?? '',
      '',
      'コメント:',
      comments || 'コメントはありません。',
    ].join('\n'),
    config.AI_DUE_SUMMARY_MAX_INPUT_CHARS,
  );
}

async function settingValue(name: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { name } });
  return row?.value ?? null;
}

async function saveSetting(name: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { name },
    create: { name, value },
    update: { value },
  });
}

function lockSettingName(dateKey: string): string {
  return `ai_due_summary_lock_${dateKey}`;
}

async function tryAcquireJobLock(dateKey: string): Promise<boolean> {
  const name = lockSettingName(dateKey);
  const now = new Date();
  try {
    await prisma.setting.create({ data: { name, value: now.toISOString() } });
    return true;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      throw error;
    }

    const existing = await settingValue(name);
    const lockedAt = existing ? new Date(existing) : null;
    const expired = !lockedAt || Number.isNaN(lockedAt.getTime()) || now.getTime() - lockedAt.getTime() > LOCK_EXPIRES_MS;
    if (!expired) return false;

    const refreshed = await prisma.setting.updateMany({
      where: { name, value: existing ?? '' },
      data: { value: now.toISOString() },
    });
    return refreshed.count === 1;
  }
}

async function releaseJobLock(dateKey: string): Promise<void> {
  await prisma.setting.deleteMany({ where: { name: lockSettingName(dateKey) } });
}

const dueIssueInclude = {
  project: { select: { name: true, identifier: true } },
  status: { select: { name: true } },
  assignee: {
    select: {
      id: true,
      mail: true,
      status: true,
      userPreference: { select: { others: true } },
    },
  },
  assigneeGroup: {
    select: {
      groupUsers: {
        select: {
          user: {
            select: {
              id: true,
              mail: true,
              status: true,
              userPreference: { select: { others: true } },
            },
          },
        },
      },
    },
  },
  journals: {
    where: { private: false, notes: { not: null } },
    orderBy: { createdAt: 'asc' },
    select: {
      notes: true,
      createdAt: true,
      user: { select: { login: true, firstname: true, lastname: true } },
    },
  },
} satisfies Prisma.IssueInclude;

type DueIssue = Prisma.IssueGetPayload<{ include: typeof dueIssueInclude }>;

function issueRecipients(issue: DueIssue): RecipientUser[] {
  const users = [
    issue.assignee,
    ...(issue.assigneeGroup?.groupUsers.map((groupUser) => groupUser.user) ?? []),
  ].filter((user): user is RecipientUser => Boolean(user));

  const deduped = new Map(users.map((user) => [user.id, user]));
  return Array.from(deduped.values()).filter(wantsMail);
}

async function dueIssuesFor(dateKey: string): Promise<DueIssue[]> {
  const { start, end } = zonedDateRange(dateKey, config.AI_DUE_SUMMARY_TIME_ZONE, config.AI_DUE_SUMMARY_LOOKAHEAD_DAYS);
  return prisma.issue.findMany({
    where: {
      dueDate: { gte: start, lte: end },
      status: { isClosed: false },
      OR: [
        { assigneeId: { not: null } },
        { assigneeGroupId: { not: null } },
      ],
    },
    include: dueIssueInclude,
    orderBy: [{ dueDate: 'asc' }, { number: 'asc' }],
  });
}

async function sendIssueDueSummary(issue: DueIssue): Promise<void> {
  const recipients = issueRecipients(issue);
  if (!recipients.length) return;

  const summary = await createOpenAiSummary(buildIssueInput(issue));
  const dueDate = issue.dueDate?.toISOString().slice(0, 10) ?? '-';
  const mail = {
    to: recipients.map((user) => user.mail),
    subject: `TaskNova: 期限間近のチケット #${issue.number} ${issue.subject}`,
    text: [
      `期限が近づいているチケットの状況報告です。`,
      '',
      `プロジェクト: ${issue.project.name}`,
      `チケット: #${issue.number} ${issue.subject}`,
      `期日: ${dueDate}`,
      `URL: ${issueUrl(issue)}`,
      '',
      summary,
    ].join('\n'),
  };

  if (config.AI_DUE_SUMMARY_DRY_RUN) {
    logger.info('AI due summary notification dry run', {
      issueId: issue.id,
      issueNumber: issue.number,
      recipients: mail.to.length,
      subject: mail.subject,
      text: mail.text,
    });
    return;
  }

  await sendMail(mail);
}

export async function runIssueDueSummaryJob(date = new Date()): Promise<void> {
  if (!config.AI_DUE_SUMMARY_ENABLED) return;

  const { dateKey } = zonedParts(date, config.AI_DUE_SUMMARY_TIME_ZONE);
  const locked = await tryAcquireJobLock(dateKey);
  if (!locked) {
    logger.info('AI due summary notification skipped because another worker is running', { dateKey });
    return;
  }

  try {
    if ((await settingValue(LAST_RUN_SETTING)) === dateKey) return;
    if (!config.AI_DUE_SUMMARY_MOCK_OPENAI && !config.OPENAI_API_KEY.trim()) {
      logger.warn('AI due summary notification skipped because OPENAI_API_KEY is not configured');
      return;
    }

    const issues = await dueIssuesFor(dateKey);
    logger.info('AI due summary notification started', { dateKey, issues: issues.length });

    let failed = 0;
    for (const issue of issues) {
      try {
        await sendIssueDueSummary(issue);
      } catch (error) {
        failed += 1;
        logger.warn('AI due summary notification failed for issue', {
          issueId: issue.id,
          issueNumber: issue.number,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (!failed && !config.AI_DUE_SUMMARY_DRY_RUN) {
      await saveSetting(LAST_RUN_SETTING, dateKey);
    }
    logger.info('AI due summary notification finished', { dateKey, issues: issues.length, failed });
  } finally {
    await releaseJobLock(dateKey);
  }
}

export function shouldRunIssueDueSummary(date = new Date()): boolean {
  const { hour, minute } = zonedParts(date, config.AI_DUE_SUMMARY_TIME_ZONE);
  return hour === config.AI_DUE_SUMMARY_HOUR && minute === 0;
}
