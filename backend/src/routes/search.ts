import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const router = Router();

const typeEnum = z.enum(['issues', 'news', 'documents', 'wiki', 'messages']);

function parseTypes(raw: string | undefined): z.infer<typeof typeEnum>[] {
  if (!raw || !raw.trim()) {
    return ['issues', 'news', 'documents', 'wiki', 'messages'];
  }
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((t) => typeEnum.parse(t));
}

async function assertProjectAccess(userId: string, projectId: string, isAdmin: boolean) {
  if (isAdmin) return;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw AppError.notFound('プロジェクトが見つかりません');
  if (project.isPublic) return;
  const member = await prisma.member.findFirst({ where: { projectId, userId } });
  if (!member) throw AppError.forbidden('このプロジェクトにアクセスできません');
}

function projectReadableFilter(userId: string, isAdmin: boolean): Prisma.ProjectWhereInput | undefined {
  if (isAdmin) return undefined;
  return {
    OR: [{ isPublic: true }, { members: { some: { userId } } }],
  };
}

router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      if (!q) {
        throw AppError.badRequest('検索語 q が必要です');
      }

      const scopeRaw = typeof req.query.scope === 'string' ? req.query.scope.trim() : 'all';
      let types: z.infer<typeof typeEnum>[];
      try {
        types = parseTypes(typeof req.query.types === 'string' ? req.query.types : undefined);
      } catch {
        throw AppError.badRequest('types が無効です');
      }

      const userId = req.user!.userId;
      const isAdmin = req.user!.admin;

      if (scopeRaw !== 'all') {
        await assertProjectAccess(userId, scopeRaw, isAdmin);
      }

      const contains = { contains: q, mode: 'insensitive' as const };
      const readable = projectReadableFilter(userId, isAdmin);

      const result: Record<string, unknown[]> = {
        issues: [],
        news: [],
        documents: [],
        wiki: [],
        messages: [],
      };

      const projectScope =
        scopeRaw === 'all'
          ? undefined
          : { projectId: scopeRaw };

      if (types.includes('issues')) {
        const where: Prisma.IssueWhereInput = {
          AND: [
            { OR: [{ subject: contains }, { description: contains }] },
            projectScope ? { projectId: scopeRaw } : {},
            readable ? { project: readable } : {},
          ],
        };
        result.issues = await prisma.issue.findMany({
          where,
          take: 50,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            subject: true,
            description: true,
            projectId: true,
            project: { select: { id: true, name: true, identifier: true } },
            updatedAt: true,
          },
        });
      }

      if (types.includes('news')) {
        const where: Prisma.NewsWhereInput = {
          AND: [
            {
              OR: [{ title: contains }, { summary: contains }, { description: contains }],
            },
            projectScope ? { projectId: scopeRaw } : {},
            readable ? { project: readable } : {},
          ],
        };
        result.news = await prisma.news.findMany({
          where,
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            summary: true,
            description: true,
            projectId: true,
            project: { select: { id: true, name: true, identifier: true } },
            createdAt: true,
          },
        });
      }

      if (types.includes('documents')) {
        const where: Prisma.DocumentWhereInput = {
          AND: [
            { OR: [{ title: contains }, { description: contains }] },
            projectScope ? { projectId: scopeRaw } : {},
            readable ? { project: readable } : {},
          ],
        };
        result.documents = await prisma.document.findMany({
          where,
          take: 50,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            projectId: true,
            project: { select: { id: true, name: true, identifier: true } },
            updatedAt: true,
          },
        });
      }

      if (types.includes('wiki')) {
        const where: Prisma.WikiPageWhereInput = {
          AND: [
            {
              OR: [
                { title: contains },
                { content: { text: contains } },
              ],
            },
            projectScope
              ? { wiki: { projectId: scopeRaw } }
              : readable
                ? { wiki: { project: readable } }
                : {},
          ],
        };
        result.wiki = await prisma.wikiPage.findMany({
          where,
          take: 50,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            title: true,
            wikiId: true,
            wiki: {
              select: {
                projectId: true,
                project: { select: { id: true, name: true, identifier: true } },
              },
            },
            content: { select: { text: true, updatedAt: true } },
            updatedAt: true,
          },
        });
      }

      if (types.includes('messages')) {
        const where: Prisma.MessageWhereInput = {
          AND: [
            {
              OR: [{ subject: contains }, { content: contains }],
            },
            projectScope
              ? { board: { projectId: scopeRaw } }
              : readable
                ? { board: { project: readable } }
                : {},
          ],
        };
        result.messages = await prisma.message.findMany({
          where,
          take: 50,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            subject: true,
            content: true,
            boardId: true,
            board: {
              select: {
                id: true,
                name: true,
                projectId: true,
                project: { select: { id: true, name: true, identifier: true } },
              },
            },
            createdAt: true,
          },
        });
      }

      const grouped: Record<string, unknown[]> = {};
      for (const t of types) {
        grouped[t] = result[t] as unknown[];
      }

      return sendSuccess(res, { q, scope: scopeRaw, types, results: grouped });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
