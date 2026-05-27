import { Prisma } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../utils/db';
import { logger } from '../utils/logger';
import { sendMailBestEffort } from './mail-service';

type NotificationAction = 'created' | 'updated' | 'commented' | 'member_added';
type IssueUpdateNotificationAction = Extract<NotificationAction, 'updated' | 'commented'>;

const ISSUE_UPDATE_NOTIFICATION_DELAY_MS = 5 * 60 * 1000;
const ISSUE_UPDATE_QUEUE_SETTING_PREFIX = 'issue_update_notification_queue_';
const ISSUE_UPDATE_QUEUE_LOCK_MS = 10 * 60 * 1000;
const issueUpdateTimers = new Map<string, ReturnType<typeof setTimeout>>();

type IssueUpdateQueuePayload = {
  issueId: string;
  firstQueuedAt: string;
  sendAfter: string;
  actorIds: string[];
  actions: IssueUpdateNotificationAction[];
  lockedUntil?: string;
};

type RecipientUser = {
  id: string;
  login: string;
  firstname: string;
  lastname: string;
  mail: string;
  status: number;
  userPreference: { others: Prisma.JsonValue } | null;
};

const userSelect = {
  id: true,
  login: true,
  firstname: true,
  lastname: true,
  mail: true,
  status: true,
  userPreference: { select: { others: true } },
} satisfies Prisma.UserSelect;

function actionLabel(action: NotificationAction): string {
  const labels: Record<NotificationAction, string> = {
    created: '新規作成',
    updated: '更新',
    commented: '新しいコメント',
    member_added: 'メンバー追加',
  };
  return labels[action];
}

function issueUpdateSummaryLabel(actions: Set<IssueUpdateNotificationAction>): string {
  if (actions.has('commented') && actions.has('updated')) return 'updated/commented';
  return actions.has('commented') ? 'commented' : 'updated';
}

function baseUrl(): string {
  return config.FRONTEND_URL.replace(/\/+$/, '');
}

function absoluteUrl(path: string): string {
  return `${baseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

function displayName(user: { login: string; firstname: string; lastname: string }): string {
  return `${user.lastname} ${user.firstname}`.trim() || user.login;
}

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

async function usersByIds(userIds: Iterable<string>): Promise<RecipientUser[]> {
  const ids = Array.from(new Set(Array.from(userIds).filter(Boolean)));
  if (!ids.length) return [];
  const users = await prisma.user.findMany({
    where: { id: { in: ids }, status: 1 },
    select: userSelect,
  });
  return users.filter(wantsMail);
}

async function watcherUserIds(watchableType: string, watchableId: string): Promise<string[]> {
  const rows = await prisma.watcher.findMany({
    where: { watchableType, watchableId },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

async function groupUserIds(groupId: string | null | undefined): Promise<string[]> {
  if (!groupId) return [];
  const rows = await prisma.groupUser.findMany({
    where: { groupId },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

async function projectMemberUserIds(projectId: string): Promise<string[]> {
  const members = await prisma.member.findMany({
    where: { projectId },
    select: {
      userId: true,
      group: {
        select: {
          groupUsers: { select: { userId: true } },
        },
      },
    },
  });
  const ids = new Set<string>();
  for (const member of members) {
    if (member.userId) ids.add(member.userId);
    for (const groupUser of member.group?.groupUsers ?? []) ids.add(groupUser.userId);
  }
  return Array.from(ids);
}

async function sendNotification(params: {
  userIds: Iterable<string>;
  subject: string;
  lines: string[];
}): Promise<void> {
  const recipients = await usersByIds(params.userIds);
  if (!recipients.length) return;
  await sendMailBestEffort({
    to: recipients.map((user) => user.mail),
    subject: params.subject,
    text: params.lines.filter((line) => line !== undefined).join('\n'),
  });
}

function issueUpdateQueueSettingName(issueId: string): string {
  return `${ISSUE_UPDATE_QUEUE_SETTING_PREFIX}${issueId}`;
}

function newIssueUpdateQueueSettingName(issueId: string): string {
  return `${issueUpdateQueueSettingName(issueId)}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function parseIssueUpdateQueuePayload(value: string): IssueUpdateQueuePayload | null {
  try {
    const parsed = JSON.parse(value) as Partial<IssueUpdateQueuePayload>;
    if (
      typeof parsed.issueId !== 'string' ||
      typeof parsed.firstQueuedAt !== 'string' ||
      typeof parsed.sendAfter !== 'string' ||
      !Array.isArray(parsed.actorIds) ||
      !Array.isArray(parsed.actions)
    ) {
      return null;
    }
    const actions = parsed.actions.filter((action): action is IssueUpdateNotificationAction => (
      action === 'updated' || action === 'commented'
    ));
    return {
      issueId: parsed.issueId,
      firstQueuedAt: parsed.firstQueuedAt,
      sendAfter: parsed.sendAfter,
      actorIds: parsed.actorIds.filter((id): id is string => typeof id === 'string'),
      actions,
      lockedUntil: typeof parsed.lockedUntil === 'string' ? parsed.lockedUntil : undefined,
    };
  } catch {
    return null;
  }
}

function journalDetailLine(detail: { propKey: string; oldValue: string | null; newValue: string | null }): string {
  const before = detail.oldValue ?? '-';
  const after = detail.newValue ?? '-';
  return `  - ${detail.propKey}: ${before} -> ${after}`;
}

async function sendQueuedIssueUpdateNotification(
  issueId: string,
  firstQueuedAt: Date,
  actorIds: Set<string>,
  actions: Set<IssueUpdateNotificationAction>,
): Promise<void> {
  const since = new Date(firstQueuedAt.getTime() - 10_000);
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: {
      project: { select: { name: true, identifier: true } },
      author: { select: { id: true, login: true, firstname: true, lastname: true } },
      assigneeGroup: { select: { groupUsers: { select: { userId: true } } } },
      watchers: { select: { userId: true } },
      journals: {
        where: {
          private: false,
          OR: [
            { createdAt: { gte: since } },
            { updatedAt: { gte: since } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: {
          notes: true,
          createdAt: true,
          user: { select: { login: true, firstname: true, lastname: true } },
          details: { select: { propKey: true, oldValue: true, newValue: true } },
        },
      },
    },
  });
  if (!issue) return;

  const actors = await prisma.user.findMany({
    where: { id: { in: Array.from(actorIds) } },
    select: { login: true, firstname: true, lastname: true },
  });
  const userIds = new Set<string>([
    issue.authorId,
    ...(issue.assigneeId ? [issue.assigneeId] : []),
    ...issue.watchers.map((watcher) => watcher.userId),
    ...(issue.assigneeGroup?.groupUsers.map((groupUser) => groupUser.userId) ?? []),
  ]);
  const projectName = issue.project?.name ?? 'Project';
  const url = absoluteUrl(`/projects/${issue.project?.identifier ?? issue.projectId}/issues/${issue.id}`);
  const label = issueUpdateSummaryLabel(actions);
  const actorNames = actors.map(displayName).join(', ') || '-';
  const changeLines = issue.journals.flatMap((journal) => {
    const header = `- ${journal.createdAt.toISOString()} ${displayName(journal.user)}`;
    const details = journal.details.map(journalDetailLine);
    const notes = journal.notes?.trim() ? [`  Comment: ${journal.notes.trim()}`] : [];
    return [header, ...details, ...notes];
  });

  await sendNotification({
    userIds,
    subject: `TaskNova: [${projectName}] Issue - ${label}`,
    lines: [
      `Issue #${issue.number} "${issue.subject}" was updated. Recent changes are summarized below.`,
      `Project: ${projectName}`,
      `Actors: ${actorNames}`,
      `URL: ${url}`,
      '',
      'Recent changes:',
      ...(changeLines.length ? changeLines : ['- See the issue page for details.']),
    ],
  });
}

export function scheduleIssueUpdateNotification(
  issueId: string,
  actorId: string,
  action: IssueUpdateNotificationAction,
): void {
  queueIssueUpdateNotification(issueId, actorId, action).catch((error) => {
    logger.warn('Issue update notification queue failed', {
      issueId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

async function queueIssueUpdateNotification(
  issueId: string,
  actorId: string,
  action: IssueUpdateNotificationAction,
): Promise<void> {
  const name = issueUpdateQueueSettingName(issueId);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const now = new Date();
    const sendAfter = new Date(now.getTime() + ISSUE_UPDATE_NOTIFICATION_DELAY_MS);
    const existing = await prisma.setting.findUnique({ where: { name } });
    const existingPayload = existing ? parseIssueUpdateQueuePayload(existing.value) : null;
    const lockedUntil = existingPayload?.lockedUntil ? new Date(existingPayload.lockedUntil) : null;
    const locked = Boolean(lockedUntil && !Number.isNaN(lockedUntil.getTime()) && lockedUntil.getTime() > now.getTime());
    const actorIds = new Set(locked ? [] : existingPayload?.actorIds ?? []);
    const actions = new Set<IssueUpdateNotificationAction>(locked ? [] : existingPayload?.actions ?? []);
    actorIds.add(actorId);
    actions.add(action);

    const queueName = locked ? newIssueUpdateQueueSettingName(issueId) : name;
    const payload: IssueUpdateQueuePayload = {
      issueId,
      firstQueuedAt: locked ? now.toISOString() : existingPayload?.firstQueuedAt ?? now.toISOString(),
      sendAfter: sendAfter.toISOString(),
      actorIds: Array.from(actorIds),
      actions: Array.from(actions),
    };
    const value = JSON.stringify(payload);

    if (!existing || locked) {
      try {
        await prisma.setting.create({ data: { name: queueName, value } });
        armIssueUpdateTimer(queueName, sendAfter);
        return;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }

    const updated = await prisma.setting.updateMany({
      where: { name, value: existing.value },
      data: { value },
    });
    if (updated.count === 1) {
      armIssueUpdateTimer(name, sendAfter);
      return;
    }
  }
  throw new Error('Failed to update issue notification queue after retries');
}

function armIssueUpdateTimer(name: string, sendAfter: Date): void {
  const current = issueUpdateTimers.get(name);
  if (current) clearTimeout(current);
  const delay = Math.max(0, sendAfter.getTime() - Date.now());
  const timer = setTimeout(() => {
    issueUpdateTimers.delete(name);
    processQueuedIssueUpdateNotification(name).catch((error) => {
      logger.warn('Issue update notification failed', {
        queueName: name,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, delay);
  if (typeof (timer as { unref?: () => void }).unref === 'function') {
    (timer as { unref: () => void }).unref();
  }
  issueUpdateTimers.set(name, timer);
}

async function processQueuedIssueUpdateNotification(name: string): Promise<void> {
  const row = await prisma.setting.findUnique({ where: { name } });
  if (!row) return;
  const payload = parseIssueUpdateQueuePayload(row.value);
  if (!payload) {
    await prisma.setting.deleteMany({ where: { name } });
    return;
  }

  const sendAfter = new Date(payload.sendAfter);
  if (Number.isNaN(sendAfter.getTime())) {
    await prisma.setting.deleteMany({ where: { name } });
    return;
  }
  const lockedUntil = payload.lockedUntil ? new Date(payload.lockedUntil) : null;
  if (lockedUntil && !Number.isNaN(lockedUntil.getTime()) && lockedUntil.getTime() > Date.now()) {
    return;
  }
  if (sendAfter.getTime() > Date.now()) {
    armIssueUpdateTimer(name, sendAfter);
    return;
  }
  const firstQueuedAt = new Date(payload.firstQueuedAt);
  if (Number.isNaN(firstQueuedAt.getTime())) {
    await prisma.setting.deleteMany({ where: { name } });
    return;
  }

  const lockedPayload: IssueUpdateQueuePayload = {
    ...payload,
    lockedUntil: new Date(Date.now() + ISSUE_UPDATE_QUEUE_LOCK_MS).toISOString(),
  };
  const lockedValue = JSON.stringify(lockedPayload);
  const locked = await prisma.setting.updateMany({
    where: { name, value: row.value },
    data: { value: lockedValue },
  });
  if (locked.count !== 1) return;

  await sendQueuedIssueUpdateNotification(
    payload.issueId,
    firstQueuedAt,
    new Set(payload.actorIds),
    new Set(payload.actions),
  );
  await prisma.setting.deleteMany({ where: { name, value: lockedValue } });
}

export async function processDueIssueUpdateNotifications(date = new Date()): Promise<void> {
  const rows = await prisma.setting.findMany({
    where: { name: { startsWith: ISSUE_UPDATE_QUEUE_SETTING_PREFIX } },
    select: { name: true, value: true },
  });
  for (const row of rows) {
    const payload = parseIssueUpdateQueuePayload(row.value);
    if (!payload) {
      await prisma.setting.deleteMany({ where: { name: row.name } });
      continue;
    }
    const sendAfter = new Date(payload.sendAfter);
    if (Number.isNaN(sendAfter.getTime())) {
      await prisma.setting.deleteMany({ where: { name: row.name } });
      continue;
    }
    if (sendAfter.getTime() <= date.getTime()) {
      try {
        await processQueuedIssueUpdateNotification(row.name);
      } catch (error) {
        logger.warn('Queued issue update notification processing failed', {
          issueId: payload.issueId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      armIssueUpdateTimer(row.name, sendAfter);
    }
  }
}

export async function notifyIssueEvent(
  issueId: string,
  actorId: string,
  action: Extract<NotificationAction, 'created' | 'updated' | 'commented'>,
): Promise<void> {
  const issue = await prisma.issue.findUnique({
    where: { id: issueId },
    include: {
      project: { select: { name: true, identifier: true } },
      author: { select: { id: true, login: true, firstname: true, lastname: true } },
      assigneeGroup: { select: { groupUsers: { select: { userId: true } } } },
      watchers: { select: { userId: true } },
    },
  });
  if (!issue) return;

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { login: true, firstname: true, lastname: true },
  });
  const userIds = new Set<string>([
    issue.authorId,
    ...(issue.assigneeId ? [issue.assigneeId] : []),
    ...issue.watchers.map((watcher) => watcher.userId),
    ...(issue.assigneeGroup?.groupUsers.map((groupUser) => groupUser.userId) ?? []),
  ]);
  const projectName = issue.project?.name ?? 'プロジェクト';
  const url = absoluteUrl(`/projects/${issue.project?.identifier ?? issue.projectId}/issues/${issue.id}`);

  await sendNotification({
    userIds,
    subject: `TaskNova: [${projectName}] チケット - ${actionLabel(action)}`,
    lines: [
      `チケット #${issue.number}「${issue.subject}」が${actionLabel(action)}されました。`,
      `プロジェクト: ${projectName}`,
      `操作ユーザー: ${actor ? displayName(actor) : '-'}`,
      `URL: ${url}`,
      '',
      issue.description ?? '',
    ],
  });
}

export async function notifyBoardEvent(
  boardId: string,
  actorId: string,
  action: Extract<NotificationAction, 'created' | 'updated'>,
): Promise<void> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: { project: { select: { name: true, identifier: true } } },
  });
  if (!board) return;
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { login: true, firstname: true, lastname: true },
  });
  const userIds = new Set<string>([
    ...(board.createdByUserId ? [board.createdByUserId] : []),
    ...(await watcherUserIds('Board', board.id)),
  ]);
  const projectName = board.project?.name ?? 'プロジェクト';
  const url = absoluteUrl(`/projects/${board.project?.identifier ?? board.projectId}/forums/${board.id}`);

  await sendNotification({
    userIds,
    subject: `TaskNova: [${projectName}] フォーラム - ${actionLabel(action)}`,
    lines: [
      `フォーラム「${board.name}」が${actionLabel(action)}されました。`,
      `プロジェクト: ${projectName}`,
      `操作ユーザー: ${actor ? displayName(actor) : '-'}`,
      `URL: ${url}`,
      '',
      board.description ?? '',
    ],
  });
}

async function messageAncestorAuthorIds(boardId: string, messageId: string): Promise<string[]> {
  const ids: string[] = [];
  let currentId: string | null = messageId;
  while (currentId) {
    const row: { authorId: string; parentId: string | null } | null = await prisma.message.findFirst({
      where: { id: currentId, boardId },
      select: { authorId: true, parentId: true },
    });
    if (!row) break;
    ids.push(row.authorId);
    currentId = row.parentId;
  }
  return ids;
}

async function messageRootId(boardId: string, messageId: string): Promise<string | null> {
  let currentId: string | null = messageId;
  while (currentId) {
    const row: { id: string; parentId: string | null } | null = await prisma.message.findFirst({
      where: { id: currentId, boardId },
      select: { id: true, parentId: true },
    });
    if (!row) return null;
    if (!row.parentId) return row.id;
    currentId = row.parentId;
  }
  return null;
}

export async function notifyMessageEvent(
  messageId: string,
  actorId: string,
  action: Extract<NotificationAction, 'created' | 'updated' | 'commented'>,
): Promise<void> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      board: {
        include: {
          project: { select: { name: true, identifier: true } },
        },
      },
      author: { select: { id: true, login: true, firstname: true, lastname: true } },
    },
  });
  if (!message) return;
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { login: true, firstname: true, lastname: true },
  });
  const ancestorAuthorIds = message.parentId
    ? await messageAncestorAuthorIds(message.boardId, message.parentId)
    : [];
  const rootId = message.parentId ? await messageRootId(message.boardId, message.parentId) : message.id;
  const userIds = new Set<string>([
    message.authorId,
    ...(message.board.createdByUserId ? [message.board.createdByUserId] : []),
    ...ancestorAuthorIds,
    ...(await watcherUserIds('Board', message.boardId)),
    ...(await watcherUserIds('Message', message.id)),
    ...(rootId && rootId !== message.id ? await watcherUserIds('Message', rootId) : []),
  ]);
  const projectName = message.board.project?.name ?? 'プロジェクト';
  const url = absoluteUrl(
    `/projects/${message.board.project?.identifier ?? message.board.projectId}/forums/${message.boardId}/topics/${rootId ?? message.parentId ?? message.id}`,
  );

  await sendNotification({
    userIds,
    subject: `TaskNova: [${projectName}] フォーラム - ${actionLabel(action)}`,
    lines: [
      `フォーラムトピック「${message.subject}」が${actionLabel(action)}されました。`,
      `プロジェクト: ${projectName}`,
      `操作ユーザー: ${actor ? displayName(actor) : '-'}`,
      `URL: ${url}`,
      '',
      message.content ?? '',
    ],
  });
}

export async function notifyWikiPageEvent(
  pageId: string,
  actorId: string,
  action: Extract<NotificationAction, 'created' | 'updated'>,
): Promise<void> {
  const page = await prisma.wikiPage.findUnique({
    where: { id: pageId },
    include: {
      wiki: { include: { project: { select: { id: true, name: true, identifier: true } } } },
      content: { include: { versions: { select: { authorId: true } } } },
    },
  });
  if (!page) return;
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { login: true, firstname: true, lastname: true },
  });
  const userIds = new Set<string>([
    ...(page.content ? [page.content.authorId] : []),
    ...(page.content?.versions.map((version) => version.authorId) ?? []),
    ...(await watcherUserIds('WikiPage', page.id)),
  ]);
  const project = page.wiki.project;
  const url = absoluteUrl(`/projects/${project.identifier}/wiki/${encodeURIComponent(page.title)}`);

  await sendNotification({
    userIds,
    subject: `TaskNova: [${project.name}] Wiki - ${actionLabel(action)}`,
    lines: [
      `Wikiページ「${page.title}」が${actionLabel(action)}されました。`,
      `プロジェクト: ${project.name}`,
      `操作ユーザー: ${actor ? displayName(actor) : '-'}`,
      `URL: ${url}`,
      '',
      page.content?.comments ?? '',
    ],
  });
}

export async function notifyNewsEvent(
  newsId: string,
  actorId: string,
  action: Extract<NotificationAction, 'created' | 'updated' | 'commented'>,
): Promise<void> {
  const news = await prisma.news.findUnique({
    where: { id: newsId },
    include: {
      project: { select: { name: true, identifier: true } },
      comments: { select: { authorId: true } },
    },
  });
  if (!news) return;
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { login: true, firstname: true, lastname: true },
  });
  const userIds = new Set<string>([
    news.authorId,
    ...news.comments.map((comment) => comment.authorId),
    ...(await watcherUserIds('News', news.id)),
  ]);
  const projectName = news.project?.name ?? 'プロジェクト';
  const url = absoluteUrl(`/projects/${news.project?.identifier ?? news.projectId}/news/${news.id}`);

  await sendNotification({
    userIds,
    subject: `TaskNova: [${projectName}] ニュース - ${actionLabel(action)}`,
    lines: [
      `ニュース「${news.title}」が${actionLabel(action)}されました。`,
      `プロジェクト: ${projectName}`,
      `操作ユーザー: ${actor ? displayName(actor) : '-'}`,
      `URL: ${url}`,
      '',
      news.summary ?? news.description ?? '',
    ],
  });
}

export async function notifyProjectMemberAdded(params: {
  projectId: string;
  actorId: string;
  userId?: string | null;
  groupId?: string | null;
}): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { id: true, name: true, identifier: true },
  });
  if (!project) return;
  const actor = await prisma.user.findUnique({
    where: { id: params.actorId },
    select: { login: true, firstname: true, lastname: true },
  });
  const addedUserIds = new Set<string>([
    ...(params.userId ? [params.userId] : []),
    ...(await groupUserIds(params.groupId)),
  ]);
  const userIds = new Set<string>([
    ...(await projectMemberUserIds(project.id)),
    ...addedUserIds,
  ]);
  const url = absoluteUrl(`/projects/${project.identifier}/members`);

  await sendNotification({
    userIds,
    subject: `TaskNova: [${project.name}] プロジェクト - ${actionLabel('member_added')}`,
    lines: [
      `プロジェクト「${project.name}」にメンバーが追加されました。`,
      `操作ユーザー: ${actor ? displayName(actor) : '-'}`,
      `URL: ${url}`,
    ],
  });
}

