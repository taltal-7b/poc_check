import { Prisma } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../utils/db';
import { logger } from '../utils/logger';
import { sendMail } from './mail-service';
import { createOpenAiSummary } from './openai-service';

const LAST_RUN_SETTING_PREFIX = 'ai_due_summary_last_run';
const LOCK_EXPIRES_MS = 30 * 60 * 1000;
const DUE_SUMMARY_RANGE_VALUES = [
  '5_days_before',
  '4_days_before',
  '3_days_before',
  '2_days_before',
  '1_day_before',
  'due_today',
  'overdue',
  'estimated_hours_exceeds_remaining_days',
] as const;
const DEFAULT_DUE_SUMMARY_NOTIFICATION = {
  enabled: true,
  sendTime: '07:00',
  ranges: ['3_days_before'] as DueSummaryRange[],
  includeAuthoredAssignedToOthers: false,
};

type DueSummaryRange = typeof DUE_SUMMARY_RANGE_VALUES[number];
type DueSummaryNotificationPreference = {
  enabled: boolean;
  sendTime: string;
  ranges: DueSummaryRange[];
  includeAuthoredAssignedToOthers: boolean;
};

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

function isValidDueSummarySendTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^([01]\d|2[0-3]):00$/.test(value);
}

function dueSummaryPreference(user: RecipientUser): DueSummaryNotificationPreference {
  const others = user.userPreference ? jsonObject(user.userPreference.others) : null;
  const raw = others?.dueSummaryNotification;
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Prisma.JsonObject : {};
  const ranges = Array.isArray(source.ranges)
    ? source.ranges.filter((value): value is DueSummaryRange => (
        typeof value === 'string' && DUE_SUMMARY_RANGE_VALUES.includes(value as DueSummaryRange)
      ))
    : DEFAULT_DUE_SUMMARY_NOTIFICATION.ranges;

  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULT_DUE_SUMMARY_NOTIFICATION.enabled,
    sendTime: isValidDueSummarySendTime(source.sendTime) ? source.sendTime : DEFAULT_DUE_SUMMARY_NOTIFICATION.sendTime,
    ranges: ranges.length ? ranges : DEFAULT_DUE_SUMMARY_NOTIFICATION.ranges,
    includeAuthoredAssignedToOthers: typeof source.includeAuthoredAssignedToOthers === 'boolean'
      ? source.includeAuthoredAssignedToOthers
      : DEFAULT_DUE_SUMMARY_NOTIFICATION.includeAuthoredAssignedToOthers,
  };
}

function wantsMail(user: RecipientUser, slotTime: string): boolean {
  if (user.status !== 1 || !user.mail.trim()) return false;
  const others = user.userPreference ? jsonObject(user.userPreference.others) : null;
  const pref = dueSummaryPreference(user);
  return others?.mailNotificationsEnabled !== false && pref.enabled && pref.sendTime === slotTime;
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

function zonedDayRange(dateKey: string, timeZone: string, offsetDays: number) {
  const { start } = zonedDateRange(dateKey, timeZone, 0);
  start.setUTCDate(start.getUTCDate() + offsetDays);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
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

function lastRunSettingName(dateKey: string, slotTime: string): string {
  return `${LAST_RUN_SETTING_PREFIX}_${dateKey}_${slotTime.replace(':', '')}`;
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
  author: {
    select: {
      id: true,
      mail: true,
      status: true,
      userPreference: { select: { others: true } },
    },
  },
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

function assignedRecipients(issue: DueIssue): RecipientUser[] {
  return [
    issue.assignee,
    ...(issue.assigneeGroup?.groupUsers.map((groupUser) => groupUser.user) ?? []),
  ].filter((user): user is RecipientUser => Boolean(user));
}

function daysUntilDue(issue: DueIssue, dateKey: string): number | null {
  if (!issue.dueDate) return null;
  const dueDateKey = zonedParts(issue.dueDate, config.AI_DUE_SUMMARY_TIME_ZONE).dateKey;
  const todayDate = new Date(`${dateKey}T00:00:00.000Z`);
  const dueDate = new Date(`${dueDateKey}T00:00:00.000Z`);
  return Math.round((dueDate.getTime() - todayDate.getTime()) / 86_400_000);
}

function rangesForIssue(issue: DueIssue, dateKey: string): DueSummaryRange[] {
  if (!issue.dueDate) return [];
  const ranges: DueSummaryRange[] = [];
  const { start: todayStart } = zonedDayRange(dateKey, config.AI_DUE_SUMMARY_TIME_ZONE, 0);
  const { end: fifthDayEnd } = zonedDayRange(dateKey, config.AI_DUE_SUMMARY_TIME_ZONE, 5);
  if (issue.dueDate < todayStart) ranges.push('overdue');
  if (issue.dueDate <= fifthDayEnd && issue.dueDate >= todayStart) {
    const dayDiff = daysUntilDue(issue, dateKey);
    if (dayDiff === 0) ranges.push('due_today');
    if (dayDiff !== null && dayDiff >= 1 && dayDiff <= 5) {
      ranges.push(`${dayDiff}_day${dayDiff === 1 ? '' : 's'}_before` as DueSummaryRange);
    }
  }

  const remainingDays = daysUntilDue(issue, dateKey);
  if (
    remainingDays !== null &&
    remainingDays >= 0 &&
    typeof issue.estimatedHours === 'number' &&
    issue.estimatedHours > remainingDays
  ) {
    ranges.push('estimated_hours_exceeds_remaining_days');
  }
  return ranges;
}

function issueRecipients(issue: DueIssue, dateKey: string, slotTime: string): RecipientUser[] {
  const ranges = rangesForIssue(issue, dateKey);
  if (!ranges.length) return [];

  const assigned = assignedRecipients(issue);
  const assignedIds = new Set(assigned.map((user) => user.id));
  const authorHasDifferentAssignee = Boolean(issue.assigneeId || issue.assigneeGroupId) && !assignedIds.has(issue.author.id);
  const users = [...assigned];
  if (authorHasDifferentAssignee) {
    users.push(issue.author);
  }

  const deduped = new Map(users.map((user) => [user.id, user]));
  return Array.from(deduped.values()).filter((user) => {
    if (!wantsMail(user, slotTime)) return false;
    const pref = dueSummaryPreference(user);
    if (!ranges.some((range) => pref.ranges.includes(range))) return false;
    if (assignedIds.has(user.id)) return true;
    return pref.includeAuthoredAssignedToOthers && authorHasDifferentAssignee && issue.author.id === user.id;
  });
}

type EstimatedHoursRecipientScope = {
  assigneeUserIds: string[];
  authorUserIds: string[];
};

async function estimatedHoursRecipientScope(slotTime: string): Promise<EstimatedHoursRecipientScope | null> {
  const users = await prisma.user.findMany({
    where: { status: 1, mail: { not: '' } },
    select: {
      id: true,
      mail: true,
      status: true,
      userPreference: { select: { others: true } },
    },
  });
  const assigneeUserIds: string[] = [];
  const authorUserIds: string[] = [];
  for (const user of users) {
    if (!wantsMail(user, slotTime)) continue;
    const pref = dueSummaryPreference(user);
    if (!pref.ranges.includes('estimated_hours_exceeds_remaining_days')) continue;
    assigneeUserIds.push(user.id);
    if (pref.includeAuthoredAssignedToOthers) authorUserIds.push(user.id);
  }
  return assigneeUserIds.length || authorUserIds.length ? { assigneeUserIds, authorUserIds } : null;
}

async function dueIssuesFor(dateKey: string, estimatedHoursScope: EstimatedHoursRecipientScope | null): Promise<DueIssue[]> {
  const { end: fifthDayEnd } = zonedDayRange(dateKey, config.AI_DUE_SUMMARY_TIME_ZONE, 5);
  const estimatedHoursConditions: Prisma.IssueWhereInput[] = estimatedHoursScope
    ? [
        ...(estimatedHoursScope.assigneeUserIds.length
          ? [
              { assigneeId: { in: estimatedHoursScope.assigneeUserIds } },
              { assigneeGroup: { groupUsers: { some: { userId: { in: estimatedHoursScope.assigneeUserIds } } } } },
            ] satisfies Prisma.IssueWhereInput[]
          : []),
        ...(estimatedHoursScope.authorUserIds.length
          ? [{ authorId: { in: estimatedHoursScope.authorUserIds } } satisfies Prisma.IssueWhereInput]
          : []),
      ]
    : [];
  return prisma.issue.findMany({
    where: {
      dueDate: { not: null },
      status: { isClosed: false },
      OR: estimatedHoursConditions.length
        ? [
            { dueDate: { lte: fifthDayEnd } },
            {
              estimatedHours: { gt: 0 },
              OR: estimatedHoursConditions,
            },
          ]
        : [
            { dueDate: { lte: fifthDayEnd } },
          ],
    },
    include: dueIssueInclude,
    orderBy: [{ dueDate: 'asc' }, { number: 'asc' }],
  });
}

async function sendIssueDueSummary(issue: DueIssue, recipients: RecipientUser[]): Promise<void> {
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

  const { dateKey, hour, minute } = zonedParts(date, config.AI_DUE_SUMMARY_TIME_ZONE);
  const slotTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const locked = await tryAcquireJobLock(dateKey);
  if (!locked) {
    logger.info('AI due summary notification skipped because another worker is running', { dateKey });
    return;
  }

  try {
    const lastRunSetting = lastRunSettingName(dateKey, slotTime);
    if ((await settingValue(lastRunSetting)) === 'done') return;
    if (!config.AI_DUE_SUMMARY_MOCK_OPENAI && !config.OPENAI_API_KEY.trim()) {
      logger.warn('AI due summary notification skipped because OPENAI_API_KEY is not configured');
      return;
    }

    const estimatedScope = await estimatedHoursRecipientScope(slotTime);
    const issues = await dueIssuesFor(dateKey, estimatedScope);
    logger.info('AI due summary notification started', { dateKey, slotTime, issues: issues.length });

    let failed = 0;
    let sentIssues = 0;
    for (const issue of issues) {
      const recipients = issueRecipients(issue, dateKey, slotTime);
      if (!recipients.length) continue;
      try {
        await sendIssueDueSummary(issue, recipients);
        sentIssues += 1;
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
      await saveSetting(lastRunSetting, 'done');
    }
    logger.info('AI due summary notification finished', { dateKey, slotTime, issues: issues.length, sentIssues, failed });
  } finally {
    await releaseJobLock(dateKey);
  }
}

export function shouldRunIssueDueSummary(date = new Date()): boolean {
  const { minute } = zonedParts(date, config.AI_DUE_SUMMARY_TIME_ZONE);
  return minute === 0;
}
