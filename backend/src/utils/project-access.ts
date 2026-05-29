import { prisma } from './db';
import { AppError } from './errors';
import { getUserGroupIds, hasAnyProjectPermission } from './project-permissions';

const PROJECT_STATUS_ARCHIVED = 5;

export type ProjectAccessUser = {
  userId: string;
  admin: boolean;
} | undefined;

type ProjectViewOptions = {
  allowPublic?: boolean;
};

export async function resolveProjectRef(ref: string | undefined) {
  if (!ref) return null;
  return prisma.project.findFirst({
    where: { OR: [{ id: ref }, { identifier: ref }] },
    select: { id: true, identifier: true, status: true, isPublic: true, createdByUserId: true },
  });
}

export async function userCanViewProject(
  user: ProjectAccessUser,
  project: { id: string; isPublic: boolean; status?: number },
  permissions: string[],
  options?: ProjectViewOptions,
): Promise<boolean> {
  if (project.status === PROJECT_STATUS_ARCHIVED) return false;
  if (user?.admin) return true;
  if (options?.allowPublic !== false && project.isPublic) return true;
  if (!user?.userId) return false;
  return hasAnyProjectPermission(user.userId, user.admin, project.id, permissions);
}

export async function requireProjectView(
  user: ProjectAccessUser,
  projectIdOrRef: string | undefined,
  permissions: string[],
  options?: ProjectViewOptions,
) {
  const project = await resolveProjectRef(projectIdOrRef);
  if (!project) throw AppError.notFound('Project not found');
  const can = await userCanViewProject(user, project, permissions, options);
  if (!can) throw AppError.forbidden();
  return project;
}

export async function readableProjectIds(
  user: ProjectAccessUser,
  permissions: string[],
  options?: ProjectViewOptions,
) {
  if (user?.admin) {
    const rows = await prisma.project.findMany({
      where: { status: { not: PROJECT_STATUS_ARCHIVED } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  if (!user?.userId) {
    if (options?.allowPublic === false) return [];
    const rows = await prisma.project.findMany({
      where: { isPublic: true, status: { not: PROJECT_STATUS_ARCHIVED } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  const groupIds = await getUserGroupIds(user.userId);
  const candidates = await prisma.project.findMany({
    where: {
      OR: [
        { isPublic: true },
        {
          members: {
            some: {
              OR: [
                { userId: user.userId },
                ...(groupIds.length ? [{ groupId: { in: groupIds } }] : []),
              ],
            },
          },
        },
      ],
    },
    select: { id: true, isPublic: true, status: true },
  });

  const ids: string[] = [];
  for (const project of candidates) {
    if (await userCanViewProject(user, project, permissions, options)) {
      ids.push(project.id);
    }
  }
  return ids;
}

export async function readableProjectWhere(
  user: ProjectAccessUser,
  permissions: string[],
  options?: ProjectViewOptions,
) {
  const ids = await readableProjectIds(user, permissions, options);
  if (ids === null) return {};
  if (!ids.length) return { id: { in: [] } };
  return { id: { in: ids } };
}

export async function userCanAccessAttachment(
  user: ProjectAccessUser,
  attachment: {
    id?: string;
    authorId: string;
    issueId?: string | null;
    documentId?: string | null;
    journalId?: string | null;
    containerType?: string | null;
    containerId?: string | null;
  },
): Promise<boolean> {
  if (user?.admin) return true;

  if (attachment.issueId) {
    const issue = await prisma.issue.findUnique({
      where: { id: attachment.issueId },
      select: { project: { select: { id: true, isPublic: true, status: true } } },
    });
    return issue ? userCanViewProject(user, issue.project, ['view_issues']) : false;
  }

  if (attachment.documentId) {
    const document = await prisma.document.findUnique({
      where: { id: attachment.documentId },
      select: { project: { select: { id: true, isPublic: true, status: true } } },
    });
    return document ? userCanViewProject(user, document.project, ['view_documents']) : false;
  }

  if (attachment.journalId) {
    const journal = await prisma.journal.findUnique({
      where: { id: attachment.journalId },
      select: { issue: { select: { project: { select: { id: true, isPublic: true, status: true } } } } },
    });
    return journal ? userCanViewProject(user, journal.issue.project, ['view_issues']) : false;
  }

  if (attachment.containerType && attachment.containerId) {
    if (attachment.containerType === 'News') {
      const news = await prisma.news.findUnique({
        where: { id: attachment.containerId },
        select: { project: { select: { id: true, isPublic: true, status: true } } },
      });
      return news ? userCanViewProject(user, news.project, ['view_news']) : false;
    }

    if (attachment.containerType === 'WikiPage') {
      const page = await prisma.wikiPage.findUnique({
        where: { id: attachment.containerId },
        select: { wiki: { select: { project: { select: { id: true, isPublic: true, status: true } } } } },
      });
      return page ? userCanViewProject(user, page.wiki.project, ['view_wiki_pages']) : false;
    }

    if (attachment.containerType === 'Message') {
      const message = await prisma.message.findUnique({
        where: { id: attachment.containerId },
        select: { board: { select: { project: { select: { id: true, isPublic: true, status: true } } } } },
      });
      return message ? userCanViewProject(user, message.board.project, ['view_messages']) : false;
    }
  }

  if (attachment.id) {
    const issueCustomValue = await prisma.customValue.findFirst({
      where: {
        customizedType: 'Issue',
        customField: {
          type: 'IssueCustomField',
          fieldFormat: 'attachment',
        },
        OR: [
          { value: attachment.id },
          { value: { contains: attachment.id } },
        ],
      },
      select: {
        customizedId: true,
      },
    });
    if (issueCustomValue) {
      const issue = await prisma.issue.findUnique({
        where: { id: issueCustomValue.customizedId },
        select: { project: { select: { id: true, isPublic: true, status: true } } },
      });
      return issue ? userCanViewProject(user, issue.project, ['view_issues']) : false;
    }
  }

  return Boolean(user?.userId && attachment.authorId === user.userId);
}
