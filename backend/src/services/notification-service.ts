import { Prisma } from '@prisma/client';
import { config } from '../config';
import { prisma } from '../utils/db';
import { sendMailBestEffort } from './mail-service';

type NotificationAction = 'created' | 'updated' | 'commented' | 'member_added';

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

