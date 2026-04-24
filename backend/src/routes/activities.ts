import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { sendPaginated, parsePagination } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { Prisma } from '@prisma/client';
import { getUserGroupIds, hasAnyProjectPermission } from '../utils/project-permissions';

const router = Router();

async function getVisibleProjectIds(userId: string | undefined, isAdmin: boolean | undefined) {
  if (isAdmin) return null as string[] | null;
  if (!userId) return [];

  const groupIds = await getUserGroupIds(userId);
  const projects = await prisma.project.findMany({
    where: {
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
        if (groupIds.length > 0) {
          const groupAssignedIssues = await prisma.issue.findMany({
            where: {
              assigneeGroupId: { in: groupIds },
              ...(requestedProjectId
                ? { projectId: requestedProjectId }
                : visibleProjectIds !== null
                  ? { projectId: { in: visibleProjectIds } }
                  : {}),
            },
            select: { id: true },
          });
          const issueIds = groupAssignedIssues.map((issue) => issue.id);
          where.OR = [
            { userId },
            ...(issueIds.length > 0 ? [{ actType: 'issue', actId: { in: issueIds } }] : []),
          ];
        } else {
          where.userId = userId;
        }
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

      const [total, rows] = await Promise.all([
        prisma.activity.count({ where }),
        prisma.activity.findMany({
          where,
          skip,
          take: perPage,
          orderBy: { createdAt: 'desc' },
          include: {
            project: { select: { id: true, name: true, identifier: true } },
          },
        }),
      ]);

      return sendPaginated(res, rows, {
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
