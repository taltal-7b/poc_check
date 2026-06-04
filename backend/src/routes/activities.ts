import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { sendPaginated, parsePagination } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { Prisma } from '@prisma/client';
import { getUserGroupIds, hasAnyProjectPermission } from '../utils/project-permissions';

const router = Router();

const PROJECT_STATUS_ARCHIVED = 5;
const LEGACY_PROJECT_STATUS_ARCHIVED = 2;

type ActivityWithProject = Prisma.ActivityGetPayload<{
  include: {
    project: { select: { id: true; name: true; identifier: true } };
  };
}>;

function projectUrl(row: ActivityWithProject, suffix = '') {
  const identifier = row.project?.identifier;
  if (!identifier) return null;
  return `/projects/${identifier}${suffix}`;
}

async function findRootTopicId(boardId: string, messageId: string): Promise<string | null> {
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

async function resolveActivityUrl(row: ActivityWithProject): Promise<string | null> {
  const actType = row.actType.toLowerCase();
  const isDelete = actType.endsWith('_delete');

  if (actType.startsWith('issue')) {
    return isDelete ? projectUrl(row, '/issues') : projectUrl(row, `/issues/${row.actId}`);
  }

  if (actType.startsWith('time_entry')) return projectUrl(row, '/time_entries');
  if (actType.startsWith('file')) return projectUrl(row, '/files');

  if (actType.startsWith('news')) {
    return isDelete ? projectUrl(row, '/news') : projectUrl(row, `/news/${row.actId}`);
  }

  if (actType.startsWith('document')) {
    return isDelete ? projectUrl(row, '/documents') : projectUrl(row, `/documents/${row.actId}`);
  }

  if (actType.startsWith('wiki')) {
    if (isDelete) return projectUrl(row, '/wiki');
    const page = await prisma.wikiPage.findUnique({
      where: { id: row.actId },
      select: { title: true },
    });
    const title = page?.title ?? row.title;
    return title ? projectUrl(row, `/wiki/${encodeURIComponent(title)}`) : projectUrl(row, '/wiki');
  }

  if (actType.startsWith('board')) {
    return isDelete ? projectUrl(row, '/forums') : projectUrl(row, `/forums/${row.actId}`);
  }

  if (actType.startsWith('message')) {
    if (isDelete) return projectUrl(row, '/forums');
    const message = await prisma.message.findUnique({
      where: { id: row.actId },
      select: { id: true, boardId: true, parentId: true },
    });
    if (!message) return projectUrl(row, '/forums');
    const topicId = message.parentId ? await findRootTopicId(message.boardId, message.id) : message.id;
    return topicId ? projectUrl(row, `/forums/${message.boardId}/topics/${topicId}`) : projectUrl(row, `/forums/${message.boardId}`);
  }

  return projectUrl(row);
}

async function getVisibleProjectIds(userId: string | undefined, isAdmin: boolean | undefined) {
  if (isAdmin) {
    const rows = await prisma.project.findMany({
      where: { status: { notIn: [PROJECT_STATUS_ARCHIVED, LEGACY_PROJECT_STATUS_ARCHIVED] } },
      select: { id: true },
    });
    return rows.map((project) => project.id);
  }
  if (!userId) return [];

  const groupIds = await getUserGroupIds(userId);
  const projects = await prisma.project.findMany({
    where: {
      status: { notIn: [PROJECT_STATUS_ARCHIVED, LEGACY_PROJECT_STATUS_ARCHIVED] },
      OR: [
        { isPublic: true },
        {
          members: {
            some: {
              OR: [{ userId }, ...(groupIds.length ? [{ groupId: { in: groupIds } }] : [])],
            },
          },
        },
      ],
    },
    select: { id: true, isPublic: true },
  });

  const visible: string[] = [];
  for (const project of projects) {
    if (project.isPublic || (await hasAnyProjectPermission(userId, isAdmin, project.id, ['view_issues']))) {
      visible.push(project.id);
    }
  }
  return visible;
}

function isIssueActivity(row: { actType: string }) {
  return row.actType.toLowerCase().startsWith('issue');
}

async function removeDeletedIssueActivities(rows: ActivityWithProject[]) {
  const issueIds = Array.from(new Set(rows.filter(isIssueActivity).map((row) => row.actId)));
  if (!issueIds.length) return rows;

  const existingIssues = await prisma.issue.findMany({
    where: { id: { in: issueIds } },
    select: { id: true },
  });
  const existingIssueIds = new Set(existingIssues.map((issue) => issue.id));
  return rows.filter((row) => !isIssueActivity(row) || existingIssueIds.has(row.actId));
}

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, perPage, skip } = parsePagination(req.query as Record<string, unknown>);
      const where: Prisma.ActivityWhereInput = {};
      const visibleProjectIds = await getVisibleProjectIds(req.user?.userId, req.user?.admin);

      const projectId = req.query.project_id;
      const requestedProjectId = typeof projectId === 'string' && projectId.length > 0 ? projectId : undefined;
      if (typeof projectId === 'string' && projectId.length > 0) {
        where.projectId = projectId;
      }
      if (visibleProjectIds !== null) {
        if (requestedProjectId) {
          if (!visibleProjectIds.includes(requestedProjectId)) {
            return sendPaginated(res, [], {
              total: 0,
              page,
              perPage,
              totalPages: 1,
            });
          }
          where.projectId = requestedProjectId;
        } else {
          if (!visibleProjectIds.length) {
            return sendPaginated(res, [], {
              total: 0,
              page,
              perPage,
              totalPages: 1,
            });
          }
          where.projectId = { in: visibleProjectIds };
        }
      }

      const userId = req.query.user_id;
      if (typeof userId === 'string' && userId.length > 0) {
        const groupIds = await getUserGroupIds(userId);
        const assignedIssues = await prisma.issue.findMany({
          where: {
            OR: [
              { assigneeId: userId },
              ...(groupIds.length > 0 ? [{ assigneeGroupId: { in: groupIds } }] : []),
            ],
            ...(requestedProjectId
              ? { projectId: requestedProjectId }
              : visibleProjectIds !== null
                ? { projectId: { in: visibleProjectIds } }
                : {}),
          },
          select: { id: true },
        });
        const issueIds = assignedIssues.map((issue) => issue.id);
        where.OR = [
          { userId },
          ...(issueIds.length > 0
            ? [{ actType: { in: ['issue', 'issue_update', 'issue_comment'] }, actId: { in: issueIds } }]
            : []),
        ];
      }

      const type = req.query.type;
      if (typeof type === 'string' && type.length > 0) {
        where.actType = type;
      }
      const typeGroup = req.query.type_group;
      if (typeof typeGroup === 'string' && typeGroup.length > 0) {
        where.actType = { startsWith: typeGroup };
      }

      const from = req.query.from;
      const to = req.query.to;
      if (typeof from === 'string' && from.length > 0) {
        where.createdAt = { ...(where.createdAt as object), gte: new Date(from) };
      }
      if (typeof to === 'string' && to.length > 0) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        where.createdAt = { ...(where.createdAt as Prisma.DateTimeFilter), lte: end };
      }

      const total = await prisma.activity.count({ where });
      const rows: ActivityWithProject[] = [];
      let offset = skip;
      const batchSize = Math.max(perPage * 2, perPage);
      while (rows.length < perPage && offset < total) {
        const batch = await prisma.activity.findMany({
          where,
          skip: offset,
          take: batchSize,
          orderBy: { createdAt: 'desc' },
          include: {
            project: { select: { id: true, name: true, identifier: true } },
          },
        });
        if (!batch.length) break;
        rows.push(...(await removeDeletedIssueActivities(batch)));
        offset += batch.length;
      }
      rows.length = Math.min(rows.length, perPage);

      const userIds = Array.from(new Set(rows.map((row) => row.userId).filter((id): id is string => Boolean(id))));
      const users = userIds.length
        ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, login: true, firstname: true, lastname: true },
        })
        : [];
      const userMap = new Map(users.map((user) => [user.id, user]));
      const enrichedRows = await Promise.all(
        rows.map(async (row) => ({
          ...row,
          user: row.userId ? userMap.get(row.userId) ?? null : null,
          url: await resolveActivityUrl(row),
        })),
      );

      return sendPaginated(res, enrichedRows, {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage) || 1,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
