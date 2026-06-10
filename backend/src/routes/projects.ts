import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess, sendPaginated, parsePagination } from '../utils/response';
import { authenticate, requireAdmin } from '../middleware/auth';
import { createOpenAiProjectBottleneckDetection, createOpenAiProjectProgressSummary, createOpenAiProjectTaskInstruction, createOpenAiProjectWeeklyReport } from '../services/openai-service';
import {
  getUserGroupIds,
  getUserProjectPermissionSet,
  hasAnyProjectPermission,
  userIsProjectMember,
  userCanManageProject,
} from '../utils/project-permissions';
import { z } from 'zod';

const router = Router({ mergeParams: true });

const PROJECT_STATUS_ACTIVE = 1;
const PROJECT_STATUS_ARCHIVED = 5;
const PROJECT_STATUS_CLOSED = 9;
const LEGACY_PROJECT_STATUS_ARCHIVED = 2;
const LEGACY_PROJECT_STATUS_CLOSED = 3;
const progressSummaryBodySchema = z.object({
  scope: z.enum(['project', 'assigned']).optional().default('project'),
});
const weeklyReportBodySchema = z.object({
  scope: z.enum(['project', 'assigned']).optional().default('project'),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const bottleneckDetectionBodySchema = z.object({
  scope: z.enum(['project', 'assigned']).optional().default('project'),
});
const taskInstructionBodySchema = z.object({
  scope: z.enum(['project', 'assigned']).optional().default('project'),
});

type ProgressSummaryScope = z.infer<typeof progressSummaryBodySchema>['scope'];
type WeeklyReportScope = z.infer<typeof weeklyReportBodySchema>['scope'];
type BottleneckDetectionScope = z.infer<typeof bottleneckDetectionBodySchema>['scope'];
type TaskInstructionScope = z.infer<typeof taskInstructionBodySchema>['scope'];

const DEFAULT_ENABLED_MODULES = [
  'issue_tracking',
  'time_tracking',
  'wiki',
  'news',
  'documents',
  'files',
  'boards',
  'calendar',
  'gantt',
  'repository',
] as const;

function catchAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

async function resolveProjectRef(ref: string) {
  const project = await prisma.project.findFirst({
    where: {
      OR: [{ id: ref }, { identifier: ref }],
    },
  });
  return project;
}

function normalizeProjectStatus(status: number): number {
  if (status === LEGACY_PROJECT_STATUS_ARCHIVED) return PROJECT_STATUS_ARCHIVED;
  if (status === LEGACY_PROJECT_STATUS_CLOSED) return PROJECT_STATUS_CLOSED;
  return status;
}

function projectStatusFilter(status: number) {
  if (status === PROJECT_STATUS_ARCHIVED) {
    return { in: [PROJECT_STATUS_ARCHIVED, LEGACY_PROJECT_STATUS_ARCHIVED] };
  }
  if (status === PROJECT_STATUS_CLOSED) {
    return { in: [PROJECT_STATUS_CLOSED, LEGACY_PROJECT_STATUS_CLOSED] };
  }
  return status;
}

function withNormalizedProjectStatus<T extends { status: number }>(project: T): T {
  return { ...project, status: normalizeProjectStatus(project.status) };
}

function assertProjectReadable(project: { status: number }) {
  if (normalizeProjectStatus(project.status) === PROJECT_STATUS_ARCHIVED) {
    throw AppError.forbidden('アーカイブされたプロジェクトの情報は参照できません');
  }
}

async function userCanAccessProject(
  userId: string | undefined,
  isAdmin: boolean | undefined,
  project: { id: string; isPublic: boolean },
): Promise<boolean> {
  if (isAdmin) return true;
  if (project.isPublic) return true;
  if (!userId) return false;
  const groupIds = await getUserGroupIds(userId);
  const member = await prisma.member.findFirst({
    where: {
      projectId: project.id,
      OR: [{ userId }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
    },
  });
  return !!member;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const createProjectSchema = z.object({
  name: z.string().min(1),
  identifier: z.string().min(1).regex(/^[a-z0-9_-]+$/i, 'identifier の形式が不正です'),
  description: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
  parentId: z.string().uuid().nullable().optional(),
  enabledModules: z.array(z.string()).optional(),
  trackerIds: z.array(z.string().uuid()).optional(),
  customFieldIds: z.array(z.string().uuid()).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  identifier: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_-]+$/i, 'identifier の形式が不正です')
    .optional(),
  description: z.string().nullable().optional(),
  isPublic: z.boolean().optional(),
  parentId: z.string().uuid().nullable().optional(),
  status: z.number().int().optional(),
  enabledModules: z.array(z.string()).optional(),
  trackerIds: z.array(z.string().uuid()).optional(),
  customFieldIds: z.array(z.string().uuid()).optional(),
});

async function validateIssueProjectCustomFieldIds(customFieldIds: string[]) {
  if (!customFieldIds.length) return [];
  const fields = await prisma.customField.findMany({
    where: {
      id: { in: customFieldIds },
      type: 'IssueCustomField',
      isForAll: false,
    },
    select: { id: true },
  });
  if (fields.length !== new Set(customFieldIds).size) {
    throw AppError.badRequest('存在しないカスタムフィールド ID が含まれています');
  }
  return fields.map((field) => field.id);
}

function compactText(value: string | null | undefined, fallback = 'なし'): string {
  const text = value?.replace(/\r\n/g, '\n').trim();
  return text || fallback;
}

function truncateText(value: string | null | undefined, maxChars: number, fallback = 'なし'): string {
  const text = compactText(value, fallback);
  if (text === fallback || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[上限文字数により省略]`;
}

function formatDate(value: Date | null | undefined): string {
  return value ? value.toISOString().slice(0, 10) : '未設定';
}

function priorityLabel(priority: number): string {
  const labels: Record<number, string> = {
    1: '低め',
    2: '通常',
    3: '高め',
    4: '緊急',
  };
  return labels[priority] ?? String(priority);
}

function limitInputChars(input: string): string {
  if (input.length <= config.AI_PROGRESS_SUMMARY_MAX_INPUT_CHARS) return input;
  return `${input.slice(0, config.AI_PROGRESS_SUMMARY_MAX_INPUT_CHARS)}\n\n[入力が上限文字数を超えたため、以降は省略しました]`;
}

function limitWeeklyReportInputChars(input: string): string {
  if (input.length <= config.AI_WEEKLY_REPORT_MAX_INPUT_CHARS) return input;
  return `${input.slice(0, config.AI_WEEKLY_REPORT_MAX_INPUT_CHARS)}\n\n[入力が上限文字数を超えたため、以降は省略しました]`;
}

function limitBottleneckDetectionInputChars(input: string): string {
  if (input.length <= config.AI_BOTTLENECK_DETECTION_MAX_INPUT_CHARS) return input;
  return `${input.slice(0, config.AI_BOTTLENECK_DETECTION_MAX_INPUT_CHARS)}\n\n[入力が上限文字数を超えたため、以降は省略しました]`;
}

function limitTaskInstructionInputChars(input: string): string {
  if (input.length <= config.AI_TASK_INSTRUCTION_MAX_INPUT_CHARS) return input;
  return `${input.slice(0, config.AI_TASK_INSTRUCTION_MAX_INPUT_CHARS)}\n\n[入力が上限文字数を超えたため、以降は省略しました]`;
}

function formatDateTime(value: Date | null | undefined): string {
  return value ? value.toISOString() : '未設定';
}

function formatUserName(user: { login: string; firstname: string; lastname: string } | null | undefined): string {
  return user ? `${user.lastname} ${user.firstname} (${user.login})` : '不明';
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

const WEEKLY_REPORT_FIELD_LABELS: Record<string, string> = {
  projectId: 'プロジェクト',
  trackerId: '作業分類',
  statusId: 'ステータス',
  priority: '優先度',
  subject: '題名',
  description: '説明',
  assigneeId: '担当者',
  assigneeGroupId: '担当グループ',
  categoryId: 'カテゴリ',
  versionId: '対象バージョン',
  parentId: '親チケット',
  startDate: '開始日',
  dueDate: '期日',
  estimatedHours: '予定工数',
  doneRatio: '進捗率',
};

function isUuidLike(value: string | null | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function formatWeeklyReportChangeValue(propKey: string, value: string | null | undefined, labels: Map<string, string>): string {
  if (!value) return 'なし';
  if (labels.has(value)) return labels.get(value)!;
  if (propKey === 'startDate' || propKey === 'dueDate') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return formatDate(date);
  }
  if (propKey === 'doneRatio') return `${value}%`;
  if (propKey === 'priority') {
    const priority = Number(value);
    if (!Number.isNaN(priority)) return priorityLabel(priority);
  }
  return value;
}

function parseStoredWeeklyCustomValue(value: string | null): string[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Fall through to simple separators.
  }
  return value
    .split(/[,\r\n]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseWeeklyReportDateRange(periodStart?: string, periodEnd?: string): { periodStartDate: Date; periodEndDate: Date } {
  const defaultEnd = new Date();
  const defaultStart = new Date(defaultEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startSource = periodStart ?? formatDate(defaultStart);
  const endSource = periodEnd ?? formatDate(defaultEnd);
  const periodStartDate = new Date(`${startSource}T00:00:00.000`);
  const periodEndDate = new Date(`${endSource}T23:59:59.999`);

  if (Number.isNaN(periodStartDate.getTime()) || Number.isNaN(periodEndDate.getTime())) {
    throw AppError.badRequest('週次レポートの対象期間が不正です');
  }
  if (periodStartDate > periodEndDate) {
    throw AppError.badRequest('週次レポートの開始日は終了日以前にしてください');
  }

  return { periodStartDate, periodEndDate };
}

async function buildProjectProgressSummaryInput(
  projectId: string,
  scope: ProgressSummaryScope,
  userId: string,
): Promise<{ input: string; issueCount: number; issueLimit: number; scope: ProgressSummaryScope }> {
  const issueLimit = config.AI_PROGRESS_SUMMARY_ISSUE_LIMIT;
  const groupIds = scope === 'assigned' ? await getUserGroupIds(userId) : [];
  const issueWhere = {
    projectId,
    status: { isClosed: false },
    ...(scope === 'assigned'
      ? {
        OR: [
          { assigneeId: userId },
          ...(groupIds.length ? [{ assigneeGroupId: { in: groupIds } }] : []),
        ],
      }
      : {}),
  };

  const [project, members, issueCount, issues] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        name: true,
        identifier: true,
        description: true,
      },
    }),
    scope === 'project'
      ? prisma.member.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
        select: {
          user: { select: { login: true, firstname: true, lastname: true } },
          group: { select: { name: true } },
          memberRoles: {
            select: { role: { select: { name: true } } },
            orderBy: { role: { position: 'asc' } },
          },
        },
      })
      : Promise.resolve([]),
    prisma.issue.count({
      where: issueWhere,
    }),
    prisma.issue.findMany({
      where: issueWhere,
      orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }, { updatedAt: 'desc' }],
      take: issueLimit,
      select: {
        number: true,
        subject: true,
        description: true,
        priority: true,
        startDate: true,
        dueDate: true,
        estimatedHours: true,
        doneRatio: true,
        createdAt: true,
        updatedAt: true,
        tracker: { select: { name: true } },
        status: { select: { name: true } },
        author: { select: { login: true, firstname: true, lastname: true } },
        assignee: { select: { login: true, firstname: true, lastname: true } },
        assigneeGroup: { select: { name: true } },
        category: { select: { name: true } },
        version: { select: { name: true } },
        journals: {
          where: { private: false, notes: { not: null } },
          orderBy: { createdAt: 'desc' },
          take: config.AI_PROGRESS_SUMMARY_MAX_COMMENTS,
          select: {
            notes: true,
            createdAt: true,
            user: { select: { login: true, firstname: true, lastname: true } },
          },
        },
      },
    }),
  ]);

  const memberLines = scope !== 'project'
    ? []
    : members.length
    ? members.map((member) => {
      const name = member.user
        ? `${member.user.lastname} ${member.user.firstname} (${member.user.login})`
        : `グループ: ${member.group?.name ?? '不明'}`;
      const roles = member.memberRoles.map((row) => row.role.name).join(', ') || 'ロールなし';
      return `- ${name} / ${roles}`;
    })
    : ['- メンバーなし'];

  const issueLines = issues.length
    ? issues.map((issue) => {
      const assignee = issue.assignee
        ? `${issue.assignee.lastname} ${issue.assignee.firstname} (${issue.assignee.login})`
        : issue.assigneeGroup
          ? `グループ: ${issue.assigneeGroup.name}`
          : '未担当';
      const comments = issue.journals
        .slice()
        .reverse()
        .map((journal) => {
          const author = `${journal.user.lastname} ${journal.user.firstname} (${journal.user.login})`;
          return `    - ${formatDate(journal.createdAt)} ${author}: ${truncateText(journal.notes, config.AI_PROGRESS_SUMMARY_MAX_COMMENT_CHARS)}`;
        });

      return [
        `## #${issue.number} ${issue.subject}`,
        `- 作業分類: ${issue.tracker.name}`,
        `- ステータス: ${issue.status.name}`,
        `- 優先度: ${priorityLabel(issue.priority)}`,
        `- 担当者: ${assignee}`,
        `- 作成者: ${issue.author.lastname} ${issue.author.firstname} (${issue.author.login})`,
        `- カテゴリ: ${issue.category?.name ?? '未設定'}`,
        `- 対象バージョン: ${issue.version?.name ?? '未設定'}`,
        `- 開始日: ${formatDate(issue.startDate)}`,
        `- 期日: ${formatDate(issue.dueDate)}`,
        `- 予定工数: ${issue.estimatedHours ?? '未設定'}`,
        `- 進捗率: ${issue.doneRatio}%`,
        `- 作成日: ${formatDate(issue.createdAt)}`,
        `- 更新日: ${formatDate(issue.updatedAt)}`,
        '- 説明:',
        truncateText(issue.description, config.AI_PROGRESS_SUMMARY_MAX_DESCRIPTION_CHARS),
        '- コメント:',
        comments.length ? comments.join('\n') : '    - なし',
      ].join('\n');
    })
    : ['未完了チケットなし'];

  const omittedCount = Math.max(0, issueCount - issues.length);
  const inputLines = [
    '# プロジェクト',
    `- タイトル: ${project.name}`,
    `- 識別子: ${project.identifier}`,
    '- 概要:',
    compactText(project.description),
    '',
    '# メンバー',
    ...memberLines,
    '',
    '# 未完了チケット',
    `- 分析範囲: ${scope === 'assigned' ? '担当チケットのみ' : 'プロジェクト全体'}`,
    `- 対象件数: ${issues.length} / ${issueCount}`,
    omittedCount ? `- 環境変数の上限により ${omittedCount} 件を省略` : '',
    '',
    ...issueLines,
  ];
  const input = (scope === 'assigned'
    ? inputLines.filter((_, index) => index !== 6)
    : inputLines
  ).filter((line) => line !== '').join('\n');

  return { input: limitInputChars(input), issueCount, issueLimit, scope };
}

async function buildProjectWeeklyReportInput(
  projectId: string,
  scope: WeeklyReportScope,
  userId: string,
  periodStart?: string,
  periodEnd?: string,
): Promise<{
  input: string;
  issueCount: number;
  issueLimit: number;
  periodStart: string;
  periodEnd: string;
  scope: WeeklyReportScope;
}> {
  const issueLimit = config.AI_WEEKLY_REPORT_ISSUE_LIMIT;
  const { periodStartDate, periodEndDate } = parseWeeklyReportDateRange(periodStart, periodEnd);
  const groupIds = scope === 'assigned' ? await getUserGroupIds(userId) : [];

  const issueWhere = {
    projectId,
    AND: [
      ...(scope === 'assigned'
        ? [{
          OR: [
            { assigneeId: userId },
            ...(groupIds.length ? [{ assigneeGroupId: { in: groupIds } }] : []),
          ],
        }]
        : []),
      {
        OR: [
          { createdAt: { gte: periodStartDate, lte: periodEndDate } },
          { updatedAt: { gte: periodStartDate, lte: periodEndDate } },
          { dueDate: { gte: periodStartDate, lte: periodEndDate } },
        ],
      },
    ],
  };

  const [project, members, issueCount, issues, weeklyTimeEntries] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        name: true,
        identifier: true,
        description: true,
        isPublic: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            members: true,
            issues: true,
            documents: true,
            news: true,
            timeEntries: true,
          },
        },
      },
    }),
    scope === 'project'
      ? prisma.member.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
        select: {
          user: { select: { login: true, firstname: true, lastname: true } },
          group: { select: { name: true } },
          memberRoles: {
            select: { role: { select: { name: true } } },
            orderBy: { role: { position: 'asc' } },
          },
        },
      })
      : Promise.resolve([]),
    prisma.issue.count({ where: issueWhere }),
    prisma.issue.findMany({
      where: issueWhere,
      orderBy: [{ updatedAt: 'desc' }, { priority: 'desc' }, { dueDate: 'asc' }],
      take: issueLimit,
      select: {
        id: true,
        number: true,
        subject: true,
        description: true,
        priority: true,
        startDate: true,
        dueDate: true,
        estimatedHours: true,
        doneRatio: true,
        closedOn: true,
        createdAt: true,
        updatedAt: true,
        tracker: { select: { name: true } },
        status: { select: { name: true, isClosed: true } },
        author: { select: { login: true, firstname: true, lastname: true } },
        assignee: { select: { login: true, firstname: true, lastname: true } },
        assigneeGroup: { select: { name: true } },
        category: { select: { name: true } },
        version: { select: { name: true } },
        parent: { select: { number: true, subject: true } },
        children: { select: { number: true, subject: true, status: { select: { name: true, isClosed: true } } } },
        relationsFrom: {
          select: {
            relationType: true,
            delay: true,
            issueTo: { select: { number: true, subject: true, status: { select: { name: true, isClosed: true } } } },
          },
        },
        relationsTo: {
          select: {
            relationType: true,
            delay: true,
            issueFrom: { select: { number: true, subject: true, status: { select: { name: true, isClosed: true } } } },
          },
        },
        journals: {
          where: { private: false, createdAt: { gte: periodStartDate, lte: periodEndDate } },
          orderBy: { createdAt: 'desc' },
          take: config.AI_WEEKLY_REPORT_MAX_COMMENTS,
          select: {
            notes: true,
            createdAt: true,
            user: { select: { login: true, firstname: true, lastname: true } },
            details: { select: { property: true, propKey: true, oldValue: true, newValue: true } },
          },
        },
        timeEntries: {
          where: { spentOn: { gte: periodStartDate, lte: periodEndDate } },
          orderBy: { spentOn: 'desc' },
          take: 20,
          select: {
            spentOn: true,
            hours: true,
            comments: true,
            user: { select: { login: true, firstname: true, lastname: true } },
            activity: { select: { name: true } },
          },
        },
      },
    }),
    prisma.timeEntry.findMany({
      where: {
        projectId,
        spentOn: { gte: periodStartDate, lte: periodEndDate },
        ...(scope === 'assigned'
          ? {
            issue: {
              OR: [
                { assigneeId: userId },
                ...(groupIds.length ? [{ assigneeGroupId: { in: groupIds } }] : []),
              ],
            },
          }
          : {}),
      },
      select: {
        hours: true,
        user: { select: { login: true, firstname: true, lastname: true } },
        activity: { select: { name: true } },
      },
    }),
  ]);

  const issueIds = issues.map((issue) => issue.id);
  const customValues = issueIds.length
    ? await prisma.customValue.findMany({
      where: { customizedType: 'Issue', customizedId: { in: issueIds } },
      select: {
        customizedId: true,
        value: true,
        customField: { select: { name: true, fieldFormat: true } },
      },
      orderBy: { customField: { position: 'asc' } },
    })
    : [];

  const customValuesByIssue = new Map<string, typeof customValues>();
  for (const customValue of customValues) {
    const values = customValuesByIssue.get(customValue.customizedId) ?? [];
    values.push(customValue);
    customValuesByIssue.set(customValue.customizedId, values);
  }

  const changeDetails = issues.flatMap((issue) => issue.journals.flatMap((journal) => journal.details));
  const changeLabels = new Map<string, string>();
  const customFieldIds = uniqueValues(changeDetails.filter((detail) => detail.property === 'cf' && isUuidLike(detail.propKey)).map((detail) => detail.propKey));
  const projectIds = uniqueValues(changeDetails.filter((detail) => detail.propKey === 'projectId').flatMap((detail) => [detail.oldValue, detail.newValue]));
  const trackerIds = uniqueValues(changeDetails.filter((detail) => detail.propKey === 'trackerId').flatMap((detail) => [detail.oldValue, detail.newValue]));
  const statusIds = uniqueValues(changeDetails.filter((detail) => detail.propKey === 'statusId').flatMap((detail) => [detail.oldValue, detail.newValue]));
  const assigneeIds = uniqueValues(changeDetails.filter((detail) => detail.propKey === 'assigneeId').flatMap((detail) => [detail.oldValue, detail.newValue]));
  const assigneeGroupIds = uniqueValues(changeDetails.filter((detail) => detail.propKey === 'assigneeGroupId').flatMap((detail) => [detail.oldValue, detail.newValue]));
  const categoryIds = uniqueValues(changeDetails.filter((detail) => detail.propKey === 'categoryId').flatMap((detail) => [detail.oldValue, detail.newValue]));
  const versionIds = uniqueValues(changeDetails.filter((detail) => detail.propKey === 'versionId').flatMap((detail) => [detail.oldValue, detail.newValue]));
  const parentIds = uniqueValues(changeDetails.filter((detail) => detail.propKey === 'parentId').flatMap((detail) => [detail.oldValue, detail.newValue]));

  await Promise.all([
    customFieldIds.length
      ? prisma.customField.findMany({ where: { id: { in: customFieldIds } }, select: { id: true, name: true } })
        .then((rows) => rows.forEach((row) => changeLabels.set(row.id, row.name)))
      : Promise.resolve(),
    projectIds.length
      ? prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } })
        .then((rows) => rows.forEach((row) => changeLabels.set(row.id, row.name)))
      : Promise.resolve(),
    trackerIds.length
      ? prisma.tracker.findMany({ where: { id: { in: trackerIds } }, select: { id: true, name: true } })
        .then((rows) => rows.forEach((row) => changeLabels.set(row.id, row.name)))
      : Promise.resolve(),
    statusIds.length
      ? prisma.issueStatus.findMany({ where: { id: { in: statusIds } }, select: { id: true, name: true } })
        .then((rows) => rows.forEach((row) => changeLabels.set(row.id, row.name)))
      : Promise.resolve(),
    assigneeIds.length
      ? prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, login: true, firstname: true, lastname: true } })
        .then((rows) => rows.forEach((row) => changeLabels.set(row.id, formatUserName(row))))
      : Promise.resolve(),
    assigneeGroupIds.length
      ? prisma.group.findMany({ where: { id: { in: assigneeGroupIds } }, select: { id: true, name: true } })
        .then((rows) => rows.forEach((row) => changeLabels.set(row.id, `グループ: ${row.name}`)))
      : Promise.resolve(),
    categoryIds.length
      ? prisma.issueCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } })
        .then((rows) => rows.forEach((row) => changeLabels.set(row.id, row.name)))
      : Promise.resolve(),
    versionIds.length
      ? prisma.version.findMany({ where: { id: { in: versionIds } }, select: { id: true, name: true } })
        .then((rows) => rows.forEach((row) => changeLabels.set(row.id, row.name)))
      : Promise.resolve(),
    parentIds.length
      ? prisma.issue.findMany({ where: { id: { in: parentIds } }, select: { id: true, number: true, subject: true } })
        .then((rows) => rows.forEach((row) => changeLabels.set(row.id, `#${row.number} ${row.subject}`)))
      : Promise.resolve(),
  ]);

  const customValueIdsByFormat = customValues.reduce<Record<string, string[]>>((acc, customValue) => {
    if (!customValue.value) return acc;
    const values = parseStoredWeeklyCustomValue(customValue.value).filter(isUuidLike);
    if (!values.length) return acc;
    const format = customValue.customField.fieldFormat;
    acc[format] = uniqueValues([...(acc[format] ?? []), ...values]);
    return acc;
  }, {});
  const customValueLabels = new Map<string, string>();
  await Promise.all([
    customValueIdsByFormat.user?.length
      ? prisma.user.findMany({ where: { id: { in: customValueIdsByFormat.user } }, select: { id: true, login: true, firstname: true, lastname: true } })
        .then((rows) => rows.forEach((row) => customValueLabels.set(row.id, formatUserName(row))))
      : Promise.resolve(),
    customValueIdsByFormat.issue?.length
      ? prisma.issue.findMany({ where: { id: { in: customValueIdsByFormat.issue } }, select: { id: true, number: true, subject: true } })
        .then((rows) => rows.forEach((row) => customValueLabels.set(row.id, `#${row.number} ${row.subject}`)))
      : Promise.resolve(),
    customValueIdsByFormat.attachment?.length
      ? prisma.attachment.findMany({ where: { id: { in: customValueIdsByFormat.attachment } }, select: { id: true, filename: true } })
        .then((rows) => rows.forEach((row) => customValueLabels.set(row.id, row.filename)))
      : Promise.resolve(),
  ]);

  const formatCustomValue = (value: string | null, fieldFormat: string) => {
    const values = parseStoredWeeklyCustomValue(value);
    if (!values.length) return 'なし';
    if (!['user', 'issue', 'attachment'].includes(fieldFormat)) return values.join(', ');
    return values
      .map((part) => customValueLabels.get(part) ?? part)
      .join(', ');
  };

  const totalHours = weeklyTimeEntries.reduce((sum, entry) => sum + entry.hours, 0);
  const hoursByUser = new Map<string, number>();
  const hoursByActivity = new Map<string, number>();
  for (const entry of weeklyTimeEntries) {
    const user = formatUserName(entry.user);
    hoursByUser.set(user, (hoursByUser.get(user) ?? 0) + entry.hours);
    hoursByActivity.set(entry.activity.name, (hoursByActivity.get(entry.activity.name) ?? 0) + entry.hours);
  }
  const hourLines = [
    `- 合計: ${totalHours.toFixed(2)}h`,
    '- ユーザー別:',
    ...(hoursByUser.size ? Array.from(hoursByUser.entries()).map(([name, hours]) => `  - ${name}: ${hours.toFixed(2)}h`) : ['  - なし']),
    '- 作業分類別:',
    ...(hoursByActivity.size ? Array.from(hoursByActivity.entries()).map(([name, hours]) => `  - ${name}: ${hours.toFixed(2)}h`) : ['  - なし']),
  ];

  const memberLines = scope !== 'project'
    ? []
    : members.length
    ? members.map((member) => {
      const name = member.user ? formatUserName(member.user) : `グループ: ${member.group?.name ?? '不明'}`;
      const roles = member.memberRoles.map((row) => row.role.name).join(', ') || 'ロールなし';
      return `- ${name} / ${roles}`;
    })
    : ['- メンバーなし'];

  const issueLines = issues.length
    ? issues.map((issue) => {
      const categories = [
        issue.createdAt >= periodStartDate && issue.createdAt <= periodEndDate ? '作成' : '',
        issue.updatedAt >= periodStartDate && issue.updatedAt <= periodEndDate ? '更新' : '',
        issue.dueDate && issue.dueDate >= periodStartDate && issue.dueDate <= periodEndDate ? '期日' : '',
      ].filter(Boolean).join(', ');
      const assignee = issue.assignee
        ? formatUserName(issue.assignee)
        : issue.assigneeGroup
          ? `グループ: ${issue.assigneeGroup.name}`
          : '未担当';
      const recentJournals = issue.journals
        .slice()
        .reverse()
        .map((journal) => {
          const actor = formatUserName(journal.user);
          const details = journal.details.length
            ? journal.details.map((detail) => {
              const label = detail.property === 'cf'
                ? (changeLabels.get(detail.propKey) ?? detail.propKey)
                : (WEEKLY_REPORT_FIELD_LABELS[detail.propKey] ?? detail.propKey);
              const oldValue = formatWeeklyReportChangeValue(detail.propKey, detail.oldValue, changeLabels);
              const newValue = formatWeeklyReportChangeValue(detail.propKey, detail.newValue, changeLabels);
              return `${actor} が ${label} を ${oldValue} から ${newValue} に変更`;
            }).join('; ')
            : '変更詳細なし';
          return [
            `    - ${formatDateTime(journal.createdAt)} 実行者: ${actor}`,
            `      コメント: ${truncateText(journal.notes, config.AI_WEEKLY_REPORT_MAX_COMMENT_CHARS)}`,
            `      変更: ${details}`,
          ].join('\n');
        });
      const timeEntries = issue.timeEntries.map((entry) => (
        `    - ${formatDate(entry.spentOn)} ${formatUserName(entry.user)} ${entry.activity.name} ${entry.hours}h: ${truncateText(entry.comments, 300)}`
      ));
      const customFieldLines = (customValuesByIssue.get(issue.id) ?? []).map((customValue) => (
        `    - ${customValue.customField.name} (${customValue.customField.fieldFormat}): ${formatCustomValue(customValue.value, customValue.customField.fieldFormat)}`
      ));
      const relations = [
        ...issue.relationsFrom.map((relation) => (
          `${relation.relationType} -> #${relation.issueTo.number} ${relation.issueTo.subject} (${relation.issueTo.status.name})${relation.delay ? ` / 遅延: ${relation.delay}日` : ''}`
        )),
        ...issue.relationsTo.map((relation) => (
          `${relation.relationType} <- #${relation.issueFrom.number} ${relation.issueFrom.subject} (${relation.issueFrom.status.name})${relation.delay ? ` / 遅延: ${relation.delay}日` : ''}`
        )),
      ];

      return [
        `## #${issue.number} ${issue.subject}`,
        `- 該当カテゴリ: ${categories || 'なし'}`,
        `- 作業分類: ${issue.tracker.name}`,
        `- ステータス: ${issue.status.name} / 完了扱い: ${issue.status.isClosed ? 'はい' : 'いいえ'}`,
        `- 優先度: ${priorityLabel(issue.priority)}`,
        `- 担当者: ${assignee}`,
        `- 作成者: ${formatUserName(issue.author)}`,
        `- カテゴリ: ${issue.category?.name ?? '未設定'}`,
        `- 対象バージョン: ${issue.version?.name ?? '未設定'}`,
        `- 親チケット: ${issue.parent ? `#${issue.parent.number} ${issue.parent.subject}` : 'なし'}`,
        `- 子チケット: ${issue.children.length ? issue.children.map((child) => `#${child.number} ${child.subject} (${child.status.name})`).join(', ') : 'なし'}`,
        `- 開始日: ${formatDate(issue.startDate)}`,
        `- 期日: ${formatDate(issue.dueDate)}`,
        `- 予定工数: ${issue.estimatedHours ?? '未設定'}`,
        `- 進捗率: ${issue.doneRatio}%`,
        `- 終了日: ${formatDate(issue.closedOn)}`,
        `- 作成日時: ${formatDateTime(issue.createdAt)}`,
        `- 更新日時: ${formatDateTime(issue.updatedAt)}`,
        '- 説明:',
        truncateText(issue.description, config.AI_WEEKLY_REPORT_MAX_DESCRIPTION_CHARS),
        '- カスタムフィールド:',
        customFieldLines.length ? customFieldLines.join('\n') : '    - なし',
        '- 関連チケット:',
        relations.length ? relations.map((relation) => `    - ${relation}`).join('\n') : '    - なし',
        '- 直近1週間の履歴:',
        recentJournals.length ? recentJournals.join('\n') : '    - なし',
        '- 直近1週間の作業時間:',
        timeEntries.length ? timeEntries.join('\n') : '    - なし',
      ].join('\n');
    })
    : ['対象チケットなし'];

  const omittedCount = Math.max(0, issueCount - issues.length);
  const inputLines = [
    '# 週次レポート対象期間',
    `- 開始: ${formatDateTime(periodStartDate)}`,
    `- 終了: ${formatDateTime(periodEndDate)}`,
    '',
    '# プロジェクト',
    `- タイトル: ${project.name}`,
    `- 識別子: ${project.identifier}`,
    `- 公開: ${project.isPublic ? 'はい' : 'いいえ'}`,
    `- ステータス: ${project.status}`,
    `- 作成日時: ${formatDateTime(project.createdAt)}`,
    `- 更新日時: ${formatDateTime(project.updatedAt)}`,
    `- メンバー数: ${project._count.members}`,
    `- 全チケット数: ${project._count.issues}`,
    `- 文書数: ${project._count.documents}`,
    `- ニュース数: ${project._count.news}`,
    `- 工数入力数: ${project._count.timeEntries}`,
    '- 概要:',
    compactText(project.description),
    '',
    '# メンバー',
    ...memberLines,
    '',
    '# 対象チケット',
    '- 条件: 直近1週間に作成されたチケット、更新のあったチケット、または期日が直近1週間に含まれるチケット',
    `- 取得件数: ${issues.length} / ${issueCount}`,
    omittedCount ? `- 環境変数の上限により ${omittedCount} 件を省略` : '',
    '',
    '# 直近1週間の工数集計',
    ...hourLines,
    '',
    ...issueLines,
  ];
  const input = (scope === 'assigned'
    ? inputLines.filter((_, index) => index !== 19)
    : inputLines
  ).filter((line) => line !== '').join('\n');

  return {
    input: limitWeeklyReportInputChars(input),
    issueCount,
    issueLimit,
    periodStart: periodStartDate.toISOString(),
    periodEnd: periodEndDate.toISOString(),
    scope,
  };
}

async function buildProjectBottleneckDetectionInput(
  projectId: string,
  scope: BottleneckDetectionScope,
  userId: string,
): Promise<{
  input: string;
  overdueOpenIssueCount: number;
  lateClosedIssueCount: number;
  overdueOpenIssueLimit: number;
  lateClosedIssueLimit: number;
  scope: BottleneckDetectionScope;
}> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const overdueOpenIssueLimit = config.AI_BOTTLENECK_DETECTION_OPEN_ISSUE_LIMIT;
  const lateClosedIssueLimit = config.AI_BOTTLENECK_DETECTION_CLOSED_ISSUE_LIMIT;
  const groupIds = scope === 'assigned' ? await getUserGroupIds(userId) : [];
  const assignedIssueWhere = scope === 'assigned'
    ? {
      OR: [
        { assigneeId: userId },
        ...(groupIds.length ? [{ assigneeGroupId: { in: groupIds } }] : []),
      ],
    }
    : {};
  const overdueOpenWhere = {
    projectId,
    dueDate: { lt: todayStart },
    status: { isClosed: false },
    ...assignedIssueWhere,
  };
  const assignedLateClosedSql = scope === 'assigned'
    ? Prisma.sql`
      AND (
        i.assignee_id = ${userId}
        ${groupIds.length ? Prisma.sql`OR i.assignee_group_id IN (${Prisma.join(groupIds)})` : Prisma.empty}
      )
    `
    : Prisma.empty;

  const issueSelect = {
    number: true,
    subject: true,
    description: true,
    priority: true,
    startDate: true,
    dueDate: true,
    estimatedHours: true,
    doneRatio: true,
    closedOn: true,
    createdAt: true,
    updatedAt: true,
    tracker: { select: { name: true } },
    status: { select: { name: true, isClosed: true } },
    author: { select: { login: true, firstname: true, lastname: true } },
    assignee: { select: { login: true, firstname: true, lastname: true } },
    assigneeGroup: { select: { name: true } },
    category: { select: { name: true } },
    version: { select: { name: true } },
    journals: {
      where: { private: false, notes: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: config.AI_BOTTLENECK_DETECTION_MAX_COMMENTS,
      select: {
        notes: true,
        createdAt: true,
        user: { select: { login: true, firstname: true, lastname: true } },
      },
    },
    timeEntries: {
      select: { hours: true },
    },
  } as const;

  const [project, members, overdueOpenIssueCount, overdueOpenIssues, lateClosedIssueRows] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        name: true,
        identifier: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { members: true, issues: true } },
      },
    }),
    scope === 'project'
      ? prisma.member.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
        select: {
          user: { select: { login: true, firstname: true, lastname: true } },
          group: { select: { name: true } },
          memberRoles: {
            select: { role: { select: { name: true } } },
            orderBy: { role: { position: 'asc' } },
          },
        },
      })
      : Promise.resolve([]),
    prisma.issue.count({ where: overdueOpenWhere }),
    prisma.issue.findMany({
      where: overdueOpenWhere,
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { updatedAt: 'asc' }],
      take: overdueOpenIssueLimit,
      select: issueSelect,
    }),
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT i.id
      FROM issues i
      INNER JOIN issue_statuses s ON s.id = i.status_id
      WHERE i.project_id = ${projectId}
        AND i.due_date IS NOT NULL
        AND i.closed_on IS NOT NULL
        AND s.is_closed = true
        AND DATE(i.closed_on) > DATE(i.due_date)
        ${assignedLateClosedSql}
      ORDER BY i.closed_on DESC, i.due_date DESC
    `,
  ]);
  const lateClosedIssueIds = lateClosedIssueRows.map((row) => row.id);
  const lateClosedIssueCount = lateClosedIssueIds.length;
  const lateClosedIssues = lateClosedIssueIds.length
    ? await prisma.issue.findMany({
      where: { id: { in: lateClosedIssueIds.slice(0, lateClosedIssueLimit) } },
      orderBy: [{ closedOn: 'desc' }, { dueDate: 'desc' }],
      select: issueSelect,
    })
    : [];

  const dayDiff = (from: Date | null | undefined, to: Date | null | undefined): string => {
    if (!from || !to) return '不明';
    return `${Math.max(0, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)))}日`;
  };
  const assigneeName = (issue: {
    assignee: { login: string; firstname: string; lastname: string } | null;
    assigneeGroup: { name: string } | null;
  }) => issue.assignee
    ? formatUserName(issue.assignee)
    : issue.assigneeGroup
      ? `グループ: ${issue.assigneeGroup.name}`
      : '未担当';
  const totalHours = (issue: { timeEntries: Array<{ hours: number }> }) => (
    issue.timeEntries.reduce((sum, entry) => sum + entry.hours, 0)
  );
  const issueKey = (issue: {
    assignee: { login: string; firstname: string; lastname: string } | null;
    assigneeGroup: { name: string } | null;
    tracker: { name: string };
    category: { name: string } | null;
  }) => ({
    assignee: assigneeName(issue),
    tracker: issue.tracker.name,
    category: issue.category?.name ?? '未設定',
  });
  const addCount = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  const summaryMaps = {
    assignee: new Map<string, number>(),
    tracker: new Map<string, number>(),
    category: new Map<string, number>(),
  };
  for (const issue of [...overdueOpenIssues, ...lateClosedIssues]) {
    const key = issueKey(issue);
    addCount(summaryMaps.assignee, key.assignee);
    addCount(summaryMaps.tracker, key.tracker);
    addCount(summaryMaps.category, key.category);
  }
  const topLines = (title: string, map: Map<string, number>) => [
    `- ${title}:`,
    ...(map.size
      ? Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => `  - ${name}: ${count}件`)
      : ['  - なし']),
  ];
  const memberLines = scope !== 'project'
    ? []
    : members.length
    ? members.map((member) => {
      const name = member.user ? formatUserName(member.user) : `グループ: ${member.group?.name ?? '不明'}`;
      const roles = member.memberRoles.map((row) => row.role.name).join(', ') || 'ロールなし';
      return `- ${name} / ${roles}`;
    })
    : ['- メンバーなし'];
  const issueLines = (
    issues: typeof overdueOpenIssues,
    kind: 'open' | 'closed',
  ) => issues.length
    ? issues.map((issue) => {
      const journals = issue.journals
        .slice()
        .reverse()
        .map((journal) => (
          `    - ${formatDate(journal.createdAt)} ${formatUserName(journal.user)}: ${truncateText(journal.notes, config.AI_BOTTLENECK_DETECTION_MAX_COMMENT_CHARS)}`
        ));
      const delay = kind === 'open'
        ? dayDiff(issue.dueDate, now)
        : dayDiff(issue.dueDate, issue.closedOn);
      return [
        `## #${issue.number} ${issue.subject}`,
        `- 種別: ${kind === 'open' ? '未完了・期日超過中' : '期日超過後に完了'}`,
        `- 遅延日数: ${delay}`,
        `- 作業分類: ${issue.tracker.name}`,
        `- ステータス: ${issue.status.name} / 完了扱い: ${issue.status.isClosed ? 'はい' : 'いいえ'}`,
        `- 優先度: ${priorityLabel(issue.priority)}`,
        `- 担当者: ${assigneeName(issue)}`,
        `- 作成者: ${formatUserName(issue.author)}`,
        `- カテゴリ: ${issue.category?.name ?? '未設定'}`,
        `- 対象バージョン: ${issue.version?.name ?? '未設定'}`,
        `- 開始日: ${formatDate(issue.startDate)}`,
        `- 期日: ${formatDate(issue.dueDate)}`,
        `- 完了日: ${formatDate(issue.closedOn)}`,
        `- 予定工数: ${issue.estimatedHours ?? '未設定'}`,
        `- 実績工数合計: ${totalHours(issue).toFixed(2)}h`,
        `- 進捗率: ${issue.doneRatio}%`,
        `- 作成日時: ${formatDateTime(issue.createdAt)}`,
        `- 更新日時: ${formatDateTime(issue.updatedAt)}`,
        '- 説明:',
        truncateText(issue.description, config.AI_BOTTLENECK_DETECTION_MAX_DESCRIPTION_CHARS),
        '- 直近コメント:',
        journals.length ? journals.join('\n') : '    - なし',
      ].join('\n');
    })
    : ['対象チケットなし'];

  const omittedOpenCount = Math.max(0, overdueOpenIssueCount - overdueOpenIssues.length);
  const omittedClosedCount = Math.max(0, lateClosedIssueCount - lateClosedIssues.length);
  const inputLines = [
    '# ボトルネック検知対象',
    `- 実行日時: ${formatDateTime(now)}`,
    '- 条件:',
    '  - 未完了で期日を過ぎているチケット',
    '  - 過去に期日を過ぎてから完了したチケット',
    '',
    '# プロジェクト',
    `- タイトル: ${project.name}`,
    `- 識別子: ${project.identifier}`,
    `- 作成日時: ${formatDateTime(project.createdAt)}`,
    `- 更新日時: ${formatDateTime(project.updatedAt)}`,
    `- メンバー数: ${project._count.members}`,
    `- 全チケット数: ${project._count.issues}`,
    '- 概要:',
    compactText(project.description),
    '',
    '# メンバー',
    ...memberLines,
    '',
    '# 集計',
    `- 未完了・期日超過中: ${overdueOpenIssues.length} / ${overdueOpenIssueCount}`,
    omittedOpenCount ? `- 未完了・期日超過中の省略件数: ${omittedOpenCount}` : '',
    `- 期日超過後に完了: ${lateClosedIssues.length} / ${lateClosedIssueCount}`,
    omittedClosedCount ? `- 期日超過後に完了の省略件数: ${omittedClosedCount}` : '',
    ...topLines('担当者別の対象件数', summaryMaps.assignee),
    ...topLines('作業分類別の対象件数', summaryMaps.tracker),
    ...topLines('カテゴリ別の対象件数', summaryMaps.category),
    '',
    '# 未完了・期日超過中チケット',
    ...issueLines(overdueOpenIssues, 'open'),
    '',
    '# 期日超過後に完了したチケット',
    ...issueLines(lateClosedIssues, 'closed'),
  ];
  const input = (scope === 'assigned'
    ? inputLines.filter((_, index) => index !== 16)
    : inputLines
  ).filter((line) => line !== '').join('\n');

  return {
    input: limitBottleneckDetectionInputChars(input),
    overdueOpenIssueCount,
    lateClosedIssueCount,
    overdueOpenIssueLimit,
    lateClosedIssueLimit,
    scope,
  };
}

async function buildProjectTaskInstructionInput(projectId: string, scope: TaskInstructionScope, userId: string): Promise<{
  input: string;
  issueCount: number;
  issueLimit: number;
  scope: TaskInstructionScope;
}> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const dueSoonEnd = new Date(todayStart);
  dueSoonEnd.setDate(dueSoonEnd.getDate() + 14);
  const staleBefore = new Date(now);
  staleBefore.setDate(staleBefore.getDate() - 14);
  const issueLimit = config.AI_TASK_INSTRUCTION_ISSUE_LIMIT;

  const groupIds = scope === 'assigned' ? await getUserGroupIds(userId) : [];
  const issueWhere = {
    projectId,
    status: { isClosed: false },
    ...(scope === 'assigned'
      ? {
        OR: [
          { assigneeId: userId },
          ...(groupIds.length ? [{ assigneeGroupId: { in: groupIds } }] : []),
        ],
      }
      : {}),
  };
  const issueSelect = {
    number: true,
    subject: true,
    description: true,
    priority: true,
    startDate: true,
    dueDate: true,
    estimatedHours: true,
    doneRatio: true,
    createdAt: true,
    updatedAt: true,
    tracker: { select: { name: true } },
    status: { select: { name: true } },
    author: { select: { login: true, firstname: true, lastname: true } },
    assignee: { select: { login: true, firstname: true, lastname: true } },
    assigneeGroup: { select: { name: true } },
    category: { select: { name: true } },
    version: { select: { name: true } },
    parent: { select: { number: true, subject: true } },
    children: { select: { number: true, subject: true, status: { select: { name: true, isClosed: true } } } },
    journals: {
      where: { private: false, notes: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: config.AI_TASK_INSTRUCTION_MAX_COMMENTS,
      select: {
        notes: true,
        createdAt: true,
        user: { select: { login: true, firstname: true, lastname: true } },
      },
    },
    timeEntries: {
      select: { hours: true },
    },
  } as const;

  const [project, members, issueCount, issues] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: {
        name: true,
        identifier: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { members: true, issues: true } },
      },
    }),
    scope === 'project'
      ? prisma.member.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
        select: {
          user: { select: { login: true, firstname: true, lastname: true } },
          group: { select: { name: true } },
          memberRoles: {
            select: { role: { select: { name: true } } },
            orderBy: { role: { position: 'asc' } },
          },
        },
      })
      : Promise.resolve([]),
    prisma.issue.count({ where: issueWhere }),
    prisma.issue.findMany({
      where: issueWhere,
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }, { updatedAt: 'asc' }],
      take: issueLimit,
      select: issueSelect,
    }),
  ]);

  const assigneeName = (issue: {
    assignee: { login: string; firstname: string; lastname: string } | null;
    assigneeGroup: { name: string } | null;
  }) => issue.assignee
    ? formatUserName(issue.assignee)
    : issue.assigneeGroup
      ? `グループ: ${issue.assigneeGroup.name}`
      : '未担当';
  const totalHours = (issue: { timeEntries: Array<{ hours: number }> }) => (
    issue.timeEntries.reduce((sum, entry) => sum + entry.hours, 0)
  );
  const daysFromNow = (value: Date | null | undefined): string => {
    if (!value) return '不明';
    const diff = Math.ceil((value.getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));
    if (diff < 0) return `${Math.abs(diff)}日超過`;
    if (diff === 0) return '今日';
    return `あと${diff}日`;
  };
  const staleDays = (value: Date): number => Math.max(0, Math.floor((now.getTime() - value.getTime()) / (24 * 60 * 60 * 1000)));
  const addCount = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  const summaryMaps = {
    assignee: new Map<string, number>(),
    status: new Map<string, number>(),
    tracker: new Map<string, number>(),
  };
  let overdueCount = 0;
  let dueSoonCount = 0;
  let staleCount = 0;
  for (const issue of issues) {
    addCount(summaryMaps.assignee, assigneeName(issue));
    addCount(summaryMaps.status, issue.status.name);
    addCount(summaryMaps.tracker, issue.tracker.name);
    if (issue.dueDate && issue.dueDate < todayStart) overdueCount += 1;
    if (issue.dueDate && issue.dueDate >= todayStart && issue.dueDate <= dueSoonEnd) dueSoonCount += 1;
    if (issue.updatedAt < staleBefore) staleCount += 1;
  }
  const topLines = (title: string, map: Map<string, number>) => [
    `- ${title}:`,
    ...(map.size
      ? Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => `  - ${name}: ${count}件`)
      : ['  - なし']),
  ];
  const memberLines = scope === 'assigned'
    ? []
    : members.length
    ? members.map((member) => {
      const name = member.user ? formatUserName(member.user) : `グループ: ${member.group?.name ?? '不明'}`;
      const roles = member.memberRoles.map((row) => row.role.name).join(', ') || 'ロールなし';
      return `- ${name} / ${roles}`;
    })
    : ['- メンバーなし'];
  const issueLines = issues.length
    ? issues.map((issue) => {
      const markers = [
        issue.dueDate && issue.dueDate < todayStart ? '期日超過' : '',
        issue.dueDate && issue.dueDate >= todayStart && issue.dueDate <= dueSoonEnd ? '期日間近' : '',
        issue.updatedAt < staleBefore ? '更新停滞' : '',
        issue.doneRatio === 0 ? '未着手' : '',
      ].filter(Boolean);
      const comments = issue.journals
        .slice()
        .reverse()
        .map((journal) => (
          `    - ${formatDate(journal.createdAt)} ${formatUserName(journal.user)}: ${truncateText(journal.notes, config.AI_TASK_INSTRUCTION_MAX_COMMENT_CHARS)}`
        ));
      return [
        `## #${issue.number} ${issue.subject}`,
        `- 注目フラグ: ${markers.length ? markers.join(', ') : 'なし'}`,
        `- 作業分類: ${issue.tracker.name}`,
        `- ステータス: ${issue.status.name}`,
        `- 優先度: ${priorityLabel(issue.priority)}`,
        `- 担当者: ${assigneeName(issue)}`,
        `- 作成者: ${formatUserName(issue.author)}`,
        `- カテゴリ: ${issue.category?.name ?? '未設定'}`,
        `- 対象バージョン: ${issue.version?.name ?? '未設定'}`,
        `- 親チケット: ${issue.parent ? `#${issue.parent.number} ${issue.parent.subject}` : 'なし'}`,
        `- 子チケット: ${issue.children.length ? issue.children.map((child) => `#${child.number} ${child.subject} (${child.status.name})`).join(', ') : 'なし'}`,
        `- 開始日: ${formatDate(issue.startDate)}`,
        `- 期日: ${formatDate(issue.dueDate)} (${daysFromNow(issue.dueDate)})`,
        `- 予定工数: ${issue.estimatedHours ?? '未設定'}`,
        `- 実績工数合計: ${totalHours(issue).toFixed(2)}h`,
        `- 進捗率: ${issue.doneRatio}%`,
        `- 作成日時: ${formatDateTime(issue.createdAt)}`,
        `- 更新日時: ${formatDateTime(issue.updatedAt)} (${staleDays(issue.updatedAt)}日前)`,
        '- 説明:',
        truncateText(issue.description, config.AI_TASK_INSTRUCTION_MAX_DESCRIPTION_CHARS),
        '- 直近コメント:',
        comments.length ? comments.join('\n') : '    - なし',
      ].join('\n');
    })
    : ['未完了チケットなし'];

  const omittedCount = Math.max(0, issueCount - issues.length);
  const inputLines = [
    '# タスク指示対象',
    `- 実行日時: ${formatDateTime(now)}`,
    '- 目的: プロジェクト内の未完了チケット状況から、次に実行すべきタスク指示を出す',
    '',
    '# プロジェクト',
    `- タイトル: ${project.name}`,
    `- 識別子: ${project.identifier}`,
    `- 作成日時: ${formatDateTime(project.createdAt)}`,
    `- 更新日時: ${formatDateTime(project.updatedAt)}`,
    `- メンバー数: ${project._count.members}`,
    `- 全チケット数: ${project._count.issues}`,
    '- 概要:',
    compactText(project.description),
    '',
    '# メンバー',
    ...memberLines,
    '',
    '# 未完了チケット集計',
    `- 取得件数: ${issues.length} / ${issueCount}`,
    omittedCount ? `- 省略件数: ${omittedCount}` : '',
    `- 期日超過: ${overdueCount}件`,
    `- 14日以内に期日到来: ${dueSoonCount}件`,
    `- 14日以上更新なし: ${staleCount}件`,
    ...topLines('担当者別', summaryMaps.assignee),
    ...topLines('ステータス別', summaryMaps.status),
    ...topLines('作業分類別', summaryMaps.tracker),
    '',
    '# 未完了チケット詳細',
    ...issueLines,
  ];
  const input = (scope === 'assigned'
    ? inputLines.filter((_, index) => index !== 14)
    : inputLines
  ).filter((line) => line !== '').join('\n');

  return { input: limitTaskInstructionInputChars(input), issueCount, issueLimit, scope };
}

router.get(
  '/',
  authenticate,
  catchAsync(async (req, res) => {
    const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);
    const statusRaw = req.query.status;
    const statusFilter =
      statusRaw !== undefined && statusRaw !== ''
        ? Number(statusRaw)
        : undefined;

    const and: Array<Record<string, unknown>> = [];
    if (statusFilter !== undefined && !Number.isNaN(statusFilter)) {
      and.push({ status: projectStatusFilter(statusFilter) });
    }

    if (!req.user!.admin) {
      const groupIds = await getUserGroupIds(req.user!.userId);
      and.push({
        OR: [
          { isPublic: true },
          {
            members: {
              some: {
                OR: [{ userId: req.user!.userId }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
              },
            },
          },
        ],
      });
    }

    const where = and.length ? { AND: and } : {};

    const [total, rows] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: perPage,
        select: {
          id: true,
          name: true,
          identifier: true,
          description: true,
          isPublic: true,
          status: true,
          parentId: true,
          createdByUserId: true,
          bookmarked: true,
          createdAt: true,
          updatedAt: true,
          enabledModules: { select: { name: true } },
          _count: {
            select: { projectTrackers: true, members: true },
          },
        },
      }),
    ]);

    return sendPaginated(res, rows.map(withNormalizedProjectStatus), {
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage) || 1,
    });
  }),
);

router.get(
  '/atom',
  authenticate,
  catchAsync(async (req, res) => {
    const feedUser = req.user!;

    const limitRaw = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 20;
    const statusRaw = req.query.status;
    const statusFilter =
      statusRaw !== undefined && statusRaw !== ''
        ? Number(statusRaw)
        : undefined;

    const and: Array<Record<string, unknown>> = [];
    if (statusFilter !== undefined && !Number.isNaN(statusFilter)) {
      and.push({ status: projectStatusFilter(statusFilter) });
    }

    if (!feedUser.admin) {
      const groupIds = await getUserGroupIds(feedUser.userId);
      and.push({
        OR: [
          { isPublic: true },
          {
            members: {
              some: {
                OR: [{ userId: feedUser.userId }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
              },
            },
          },
        ],
      });
    }
    const where = and.length ? { AND: and } : {};

    const rows = await prisma.project.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        name: true,
        identifier: true,
        description: true,
        updatedAt: true,
      },
    });

    const host = `${req.protocol}://${req.get('host')}`;
    const projectsUrl = `${host}/projects`;
    const feedUrl = `${host}${req.originalUrl}`;
    const updatedAt = rows[0]?.updatedAt ?? new Date();
    const feedId = `${host}/`;

    const entries = rows
      .map((row) => {
        const entryUrl = `${host}/projects/${row.identifier}`;
        const title = `${row.name} - プロジェクト: ${row.name}`;
        return [
          '  <entry>',
          `    <id>${escapeXml(entryUrl)}</id>`,
          `    <title>${escapeXml(title)}</title>`,
          `    <link rel="alternate" href="${escapeXml(entryUrl)}" />`,
          `    <updated>${row.updatedAt.toISOString()}</updated>`,
          '    <content type="html">',
          `${escapeXml(row.description ?? '')}`,
          '    </content>',
          '  </entry>',
        ].join('\n');
      })
      .join('\n');

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<feed xmlns="http://www.w3.org/2005/Atom">',
      `  <id>${escapeXml(feedId)}</id>`,
      '  <title>TaskNova: 最近のプロジェクト</title>',
      `  <updated>${updatedAt.toISOString()}</updated>`,
      `  <link rel="self" href="${escapeXml(feedUrl)}" />`,
      `  <link rel="alternate" href="${escapeXml(projectsUrl)}" />`,
      `  <icon>${escapeXml(`${host}/favicon.ico`)}</icon>`,
      '  <author>',
      '    <name>TaskNova</name>',
      '  </author>',
      '  <generator uri="https://www.redmine.org/">TaskNova</generator>',
      entries,
      '</feed>',
      '',
    ].join('\n');

    const accept = String(req.headers.accept ?? '').toLowerCase();
    const prefersHtml = accept.includes('text/html');
    if (prefersHtml) {
      const html = [
        '<!doctype html>',
        '<html lang="ja">',
        '<head>',
        '  <meta charset="utf-8" />',
        '  <meta name="viewport" content="width=device-width, initial-scale=1" />',
        '  <title>Projects Atom</title>',
        '  <style>',
        '    :root { color-scheme: dark; }',
        '    body { margin: 0; background: #000; color: #e2e8f0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }',
        '    pre { margin: 0; padding: 12px 14px; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.45; }',
        '  </style>',
        '</head>',
        '<body>',
        `  <pre>${escapeXml(xml)}</pre>`,
        '</body>',
        '</html>',
      ].join('\n');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }

    res.setHeader('Content-Type', 'application/atom+xml; charset=utf-8');
    return res.status(200).send(xml);
  }),
);

router.get(
  '/:id/custom_fields',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, project);
    if (!canManage) throw AppError.forbidden('プロジェクトを管理する権限がありません');

    const fields = await prisma.customField.findMany({
      where: { type: 'IssueCustomField', isForAll: false },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: {
        enumerations: { orderBy: { position: 'asc' } },
        customFieldTrackers: { include: { tracker: { select: { id: true, name: true } } } },
        projectCustomFields: { include: { project: { select: { id: true, name: true, identifier: true } } } },
      },
    });

    return sendSuccess(res, fields.map((field) => ({
      ...field,
      trackerIds: field.customFieldTrackers.map((row) => row.trackerId),
      projectIds: field.projectCustomFields.map((row) => row.projectId),
    })));
  }),
);

router.get(
  '/:id/issue_categories',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const ok = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
    if (!ok) throw AppError.forbidden();
    assertProjectReadable(project);

    const categories = await prisma.issueCategory.findMany({
      where: { projectId: project.id },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        projectId: true,
        assigneeId: true,
      },
    });

    return sendSuccess(res, categories);
  }),
);

router.post(
  '/:id/ai/progress-summary',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    assertProjectReadable(project);
    const canUseAiActions = await userIsProjectMember(req.user?.userId, project.id);
    if (!canUseAiActions) throw AppError.forbidden();

    const { scope } = progressSummaryBodySchema.parse(req.body ?? {});
    const { input, issueCount, issueLimit } = await buildProjectProgressSummaryInput(project.id, scope, req.user!.userId);
    const summary = await createOpenAiProjectProgressSummary(input);

    return sendSuccess(res, {
      summary,
      issueCount,
      issueLimit,
      scope,
    });
  }),
);

router.post(
  '/:id/ai/weekly-report',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    assertProjectReadable(project);
    const canUseAiActions = await userIsProjectMember(req.user?.userId, project.id);
    if (!canUseAiActions) throw AppError.forbidden();
    const issueTrackingEnabled = await prisma.enabledModule.count({
      where: { projectId: project.id, name: 'issue_tracking' },
    });
    if (!issueTrackingEnabled) throw AppError.forbidden('このプロジェクトではチケットトラッキングが無効です');

    const { scope, periodStart: requestedPeriodStart, periodEnd: requestedPeriodEnd } = weeklyReportBodySchema.parse(req.body ?? {});
    const { input, issueCount, issueLimit, periodStart, periodEnd } = await buildProjectWeeklyReportInput(
      project.id,
      scope,
      req.user!.userId,
      requestedPeriodStart,
      requestedPeriodEnd,
    );
    const report = await createOpenAiProjectWeeklyReport(input);

    return sendSuccess(res, {
      report,
      issueCount,
      issueLimit,
      periodStart,
      periodEnd,
      scope,
    });
  }),
);

router.post(
  '/:id/ai/bottleneck-detection',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    assertProjectReadable(project);
    const canUseAiActions = await userIsProjectMember(req.user?.userId, project.id);
    if (!canUseAiActions) throw AppError.forbidden();
    const issueTrackingEnabled = await prisma.enabledModule.count({
      where: { projectId: project.id, name: 'issue_tracking' },
    });
    if (!issueTrackingEnabled) throw AppError.forbidden('このプロジェクトではチケットトラッキングが無効です');

    const { scope } = bottleneckDetectionBodySchema.parse(req.body ?? {});
    const {
      input,
      overdueOpenIssueCount,
      lateClosedIssueCount,
      overdueOpenIssueLimit,
      lateClosedIssueLimit,
    } = await buildProjectBottleneckDetectionInput(project.id, scope, req.user!.userId);
    const report = await createOpenAiProjectBottleneckDetection(input);

    return sendSuccess(res, {
      report,
      overdueOpenIssueCount,
      lateClosedIssueCount,
      overdueOpenIssueLimit,
      lateClosedIssueLimit,
      scope,
    });
  }),
);

router.post(
  '/:id/ai/task-instruction',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    assertProjectReadable(project);
    const canUseAiActions = await userIsProjectMember(req.user?.userId, project.id);
    if (!canUseAiActions) throw AppError.forbidden();
    const issueTrackingEnabled = await prisma.enabledModule.count({
      where: { projectId: project.id, name: 'issue_tracking' },
    });
    if (!issueTrackingEnabled) throw AppError.forbidden('このプロジェクトではチケットトラッキングが無効です');

    const { scope } = taskInstructionBodySchema.parse(req.body ?? {});
    const { input, issueCount, issueLimit } = await buildProjectTaskInstructionInput(project.id, scope, req.user!.userId);
    const instructions = await createOpenAiProjectTaskInstruction(input);

    return sendSuccess(res, {
      instructions,
      issueCount,
      issueLimit,
      scope,
    });
  }),
);

router.get(
  '/:id',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: {
        OR: [{ id: req.params.id }, { identifier: req.params.id }],
      },
      select: {
        id: true,
        name: true,
        identifier: true,
        description: true,
        isPublic: true,
        status: true,
        parentId: true,
        createdByUserId: true,
        bookmarked: true,
        createdAt: true,
        updatedAt: true,
        enabledModules: { select: { name: true } },
        projectTrackers: { include: { tracker: { include: { standardFields: true } } } },
        projectCustomFields: {
          include: {
            customField: {
              select: { id: true, name: true, fieldFormat: true, isForAll: true, position: true },
            },
          },
        },
        _count: {
          select: { projectTrackers: true, members: true },
        },
      },
    });
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const ok = await userCanAccessProject(req.user?.userId, req.user?.admin, project);
    if (!ok) throw AppError.forbidden();

    const permissionSet = await getUserProjectPermissionSet(req.user?.userId, req.user?.admin, project.id);
    const canUseAiActions = await userIsProjectMember(req.user?.userId, project.id);
    const permissions = {
      canCreateIssue: Boolean(req.user?.admin || permissionSet?.has('add_issues')),
      canEditIssue: await hasAnyProjectPermission(req.user?.userId, req.user?.admin, project.id, [
        'edit_issues',
      ]),
      canDeleteIssue: await hasAnyProjectPermission(req.user?.userId, req.user?.admin, project.id, [
        'edit_issues',
      ]),
      canAddIssueNotes: await hasAnyProjectPermission(req.user?.userId, req.user?.admin, project.id, [
        'view_issues',
        'add_issue_notes',
        'edit_issue_notes',
        'edit_own_issue_notes',
        'edit_issues',
      ]),
      canManageProject: await userCanManageProject(req.user?.userId, req.user?.admin, project),
      canViewTimeEntries: await hasAnyProjectPermission(req.user?.userId, req.user?.admin, project.id, [
        'view_time_entries',
      ]),
      canLogTime: await hasAnyProjectPermission(req.user?.userId, req.user?.admin, project.id, [
        'log_time',
      ]),
      canEditTimeEntries: await hasAnyProjectPermission(req.user?.userId, req.user?.admin, project.id, [
        'edit_time_entries',
      ]),
      canDeleteTimeEntries: await hasAnyProjectPermission(req.user?.userId, req.user?.admin, project.id, [
        'delete_time_entries',
      ]),
      canUseAiActions,
    };

    return sendSuccess(res, { ...withNormalizedProjectStatus(project), permissions });
  }),
);

router.post(
  '/',
  authenticate,
  requireAdmin,
  catchAsync(async (req, res) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }
    const body = parsed.data;
    const modules = body.enabledModules?.length ? body.enabledModules : [...DEFAULT_ENABLED_MODULES];

    if (body.parentId) {
      const parent = await prisma.project.findUnique({ where: { id: body.parentId } });
      if (!parent) throw AppError.badRequest('親プロジェクトが存在しません');
    }

    const existing = await prisma.project.findUnique({
      where: { identifier: body.identifier },
    });
    if (existing) throw AppError.conflict('identifier が既に使用されています');

    const validCustomFieldIds = body.customFieldIds
      ? await validateIssueProjectCustomFieldIds(body.customFieldIds)
      : [];

    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          name: body.name,
          identifier: body.identifier,
          description: body.description ?? null,
          isPublic: body.isPublic ?? true,
          parentId: body.parentId ?? null,
          createdByUserId: req.user!.userId,
        },
      });

      await tx.enabledModule.createMany({
        data: modules.map((name) => ({ projectId: p.id, name })),
        skipDuplicates: true,
      });

      if (body.trackerIds?.length) {
        await tx.projectTracker.createMany({
          data: body.trackerIds.map((trackerId) => ({ projectId: p.id, trackerId })),
          skipDuplicates: true,
        });
      }

      if (validCustomFieldIds.length) {
        await tx.projectCustomField.createMany({
          data: validCustomFieldIds.map((customFieldId) => ({ projectId: p.id, customFieldId })),
          skipDuplicates: true,
        });
      }

      return tx.project.findUniqueOrThrow({
        where: { id: p.id },
        include: {
          enabledModules: true,
          projectTrackers: { include: { tracker: { include: { standardFields: true } } } },
          projectCustomFields: { include: { customField: true } },
        },
      });
    });

    return sendSuccess(res, project, 201);
  }),
);

router.put(
  '/:id',
  authenticate,
  catchAsync(async (req, res) => {
    const current = await resolveProjectRef(req.params.id);
    if (!current) throw AppError.notFound('プロジェクトが見つかりません');

    // 権限チェック
    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, current);
    if (!canManage) throw AppError.forbidden('このプロジェクトを編集する権限がありません');

    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.badRequest(parsed.error.flatten().formErrors.join('; ') || '入力が不正です');
    }
    const body = parsed.data;

    if (normalizeProjectStatus(current.status) !== PROJECT_STATUS_ACTIVE) {
      const keys = Object.keys(body);
      const isReactivationOnly = keys.length === 1 && body.status === PROJECT_STATUS_ACTIVE;
      if (!isReactivationOnly) {
        throw AppError.forbidden('有効ではないプロジェクトは再開・解除以外の更新はできません');
      }
    }

    if (body.identifier && body.identifier !== current.identifier) {
      const taken = await prisma.project.findUnique({ where: { identifier: body.identifier } });
      if (taken) throw AppError.conflict('identifier が既に使用されています');
    }

    if (body.parentId) {
      if (body.parentId === current.id) {
        throw AppError.badRequest('自身を親にできません');
      }
      const parent = await prisma.project.findUnique({ where: { id: body.parentId } });
      if (!parent) throw AppError.badRequest('親プロジェクトが存在しません');
    }

    const validCustomFieldIds = body.customFieldIds
      ? await validateIssueProjectCustomFieldIds(body.customFieldIds)
      : [];

    const updated = await prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id: current.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.identifier !== undefined && { identifier: body.identifier }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.isPublic !== undefined && { isPublic: body.isPublic }),
          ...(body.parentId !== undefined && { parentId: body.parentId }),
          ...(body.status !== undefined && { status: body.status }),
        },
      });

      if (body.enabledModules) {
        await tx.enabledModule.deleteMany({ where: { projectId: current.id } });
        if (body.enabledModules.length) {
          await tx.enabledModule.createMany({
            data: body.enabledModules.map((name) => ({ projectId: current.id, name })),
          });
        }
      }

      if (body.trackerIds) {
        await tx.projectTracker.deleteMany({ where: { projectId: current.id } });
        if (body.trackerIds.length) {
          await tx.projectTracker.createMany({
            data: body.trackerIds.map((trackerId) => ({
              projectId: current.id,
              trackerId,
            })),
          });
        }
      }

      if (body.customFieldIds) {
        await tx.projectCustomField.deleteMany({ where: { projectId: current.id } });
        if (validCustomFieldIds.length) {
          await tx.projectCustomField.createMany({
            data: validCustomFieldIds.map((customFieldId) => ({ projectId: current.id, customFieldId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.project.findUniqueOrThrow({
        where: { id: current.id },
        include: {
          enabledModules: true,
          projectTrackers: { include: { tracker: { include: { standardFields: true } } } },
          projectCustomFields: { include: { customField: true } },
        },
      });
    });

    return sendSuccess(res, updated);
  }),
);

router.delete(
  '/:id',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    // 権限チェック
    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, project);
    if (!canManage) throw AppError.forbidden('このプロジェクトを削除する権限がありません');

    await prisma.project.delete({ where: { id: project.id } });
    return sendSuccess(res, { deleted: true });
  }),
);

router.post(
  '/:id/archive',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, project);
    if (!canManage) throw AppError.forbidden();

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { status: 5 },
    });
    return sendSuccess(res, updated);
  }),
);

router.post(
  '/:id/unarchive',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, project);
    if (!canManage) throw AppError.forbidden();

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { status: 1 },
    });
    return sendSuccess(res, updated);
  }),
);

router.post(
  '/:id/close',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, project);
    if (!canManage) throw AppError.forbidden();

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { status: 9 },
    });
    return sendSuccess(res, updated);
  }),
);

router.post(
  '/:id/reopen',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, project);
    if (!canManage) throw AppError.forbidden();

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { status: 1 },
    });
    return sendSuccess(res, updated);
  }),
);

router.post(
  '/:id/bookmark',
  authenticate,
  catchAsync(async (req, res) => {
    const project = await resolveProjectRef(req.params.id);
    if (!project) throw AppError.notFound('プロジェクトが見つかりません');

    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, project);
    if (!canManage) throw AppError.forbidden();

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { bookmarked: !project.bookmarked },
    });
    return sendSuccess(res, updated);
  }),
);

router.post(
  '/:id/copy',
  authenticate,
  catchAsync(async (req, res) => {
    const src = await prisma.project.findFirst({
      where: {
        OR: [{ id: req.params.id }, { identifier: req.params.id }],
      },
      include: {
        enabledModules: true,
        projectTrackers: true,
      },
    });
    if (!src) throw AppError.notFound('プロジェクトが見つかりません');

    const canManage = await userCanManageProject(req.user?.userId, req.user?.admin, src);
    if (!canManage) throw AppError.forbidden();

    const newIdentifier = `${src.identifier}-copy-${Date.now()}`.replace(/-+/g, '-');
    const copy = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          name: `${src.name} (copy)`,
          identifier: newIdentifier,
          description: src.description,
          homepage: src.homepage,
          isPublic: src.isPublic,
          parentId: null,
          status: 1,
          bookmarked: false,
        },
      });

      if (src.enabledModules.length) {
        await tx.enabledModule.createMany({
          data: src.enabledModules.map((m) => ({ projectId: p.id, name: m.name })),
        });
      } else {
        await tx.enabledModule.createMany({
          data: DEFAULT_ENABLED_MODULES.map((name) => ({ projectId: p.id, name })),
        });
      }

      if (src.projectTrackers.length) {
        await tx.projectTracker.createMany({
          data: src.projectTrackers.map((pt) => ({
            projectId: p.id,
            trackerId: pt.trackerId,
          })),
        });
      }

      return tx.project.findUniqueOrThrow({
        where: { id: p.id },
        include: {
          enabledModules: true,
          projectTrackers: { include: { tracker: { include: { standardFields: true } } } },
        },
      });
    });

    return sendSuccess(res, copy, 201);
  }),
);

export default router;
