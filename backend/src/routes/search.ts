import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../utils/db';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { authenticate } from '../middleware/auth';

const router = Router();

const typeEnum = z.enum(['issues', 'news', 'documents', 'wiki', 'messages']);
type SearchType = z.infer<typeof typeEnum>;

type SearchResult = {
  id: string;
  type: SearchType;
  subtype?: string;
  title: string;
  excerpt: string;
  href: string;
  project: { id: string; name: string; identifier: string };
  createdAt?: Date;
  updatedAt?: Date | null;
};

function parseTypes(raw: string | undefined): SearchType[] {
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
  if (!project) throw AppError.notFound('Project not found');
  if (project.isPublic) return;
  const member = await prisma.member.findFirst({ where: { projectId, userId } });
  if (!member) throw AppError.forbidden('You cannot access this project');
}

function projectReadableFilter(userId: string, isAdmin: boolean): Prisma.ProjectWhereInput | undefined {
  if (isAdmin) return undefined;
  return {
    OR: [{ isPublic: true }, { members: { some: { userId } } }],
  };
}

function excerpt(value: string | null | undefined, q: string): string {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  const start = idx > 60 ? idx - 60 : 0;
  const end = Math.min(text.length, start + 220);
  return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`;
}

function projectScope(scope: string): Prisma.IssueWhereInput {
  return scope === 'all' ? {} : { projectId: scope };
}

function sortByDateDesc(a: SearchResult, b: SearchResult) {
  const ad = (a.updatedAt ?? a.createdAt)?.getTime() ?? 0;
  const bd = (b.updatedAt ?? b.createdAt)?.getTime() ?? 0;
  return bd - ad;
}

router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      throw AppError.badRequest('Search query is required');
    }

    const scopeRaw = typeof req.query.scope === 'string' ? req.query.scope.trim() : 'all';
    let types: SearchType[];
    try {
      types = parseTypes(typeof req.query.types === 'string' ? req.query.types : undefined);
    } catch {
      throw AppError.badRequest('Invalid search types');
    }

    const userId = req.user!.userId;
    const isAdmin = req.user!.admin;
    if (scopeRaw !== 'all') {
      await assertProjectAccess(userId, scopeRaw, isAdmin);
    }

    const contains = { contains: q, mode: 'insensitive' as const };
    const readable = projectReadableFilter(userId, isAdmin);
    const scopedProject = scopeRaw === 'all' ? {} : { projectId: scopeRaw };
    const grouped: Record<SearchType, SearchResult[]> = {
      issues: [],
      news: [],
      documents: [],
      wiki: [],
      messages: [],
    };

    if (types.includes('issues')) {
      const issueWhere: Prisma.IssueWhereInput = {
        AND: [
          { OR: [{ subject: contains }, { description: contains }] },
          projectScope(scopeRaw),
          readable ? { project: readable } : {},
        ],
      };
      const issues = await prisma.issue.findMany({
        where: issueWhere,
        take: 50,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          number: true,
          subject: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          project: { select: { id: true, name: true, identifier: true } },
        },
      });
      grouped.issues.push(
        ...issues.map((issue) => ({
          id: issue.id,
          type: 'issues' as const,
          subtype: 'issue',
          title: `#${issue.number} ${issue.subject}`,
          excerpt: excerpt(issue.description, q),
          href: `/projects/${issue.project.identifier}/issues/${issue.id}`,
          project: issue.project,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
        })),
      );

      const journals = await prisma.journal.findMany({
        where: {
          AND: [
            { private: false },
            { notes: contains },
            {
              issue: {
                AND: [
                  scopedProject,
                  readable ? { project: readable } : {},
                ],
              },
            },
          ],
        },
        take: 50,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          notes: true,
          createdAt: true,
          issue: {
            select: {
              id: true,
              number: true,
              subject: true,
              project: { select: { id: true, name: true, identifier: true } },
            },
          },
        },
      });
      grouped.issues.push(
        ...journals.map((journal) => ({
          id: journal.id,
          type: 'issues' as const,
          subtype: 'issue_comment',
          title: `#${journal.issue.number} ${journal.issue.subject} - コメント`,
          excerpt: excerpt(journal.notes, q),
          href: `/projects/${journal.issue.project.identifier}/issues/${journal.issue.id}`,
          project: journal.issue.project,
          createdAt: journal.createdAt,
          updatedAt: journal.createdAt,
        })),
      );
      grouped.issues.sort(sortByDateDesc);
    }

    if (types.includes('news')) {
      const news = await prisma.news.findMany({
        where: {
          AND: [
            { OR: [{ title: contains }, { summary: contains }, { description: contains }] },
            scopedProject,
            readable ? { project: readable } : {},
          ],
        },
        take: 50,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          summary: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          project: { select: { id: true, name: true, identifier: true } },
        },
      });
      grouped.news.push(
        ...news.map((item) => ({
          id: item.id,
          type: 'news' as const,
          subtype: 'news',
          title: item.title,
          excerpt: excerpt(item.summary || item.description, q),
          href: `/projects/${item.project.identifier}/news/${item.id}`,
          project: item.project,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
      );

      const comments = await prisma.comment.findMany({
        where: {
          AND: [
            { content: contains },
            {
              news: {
                AND: [
                  scopedProject,
                  readable ? { project: readable } : {},
                ],
              },
            },
          ],
        },
        take: 50,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          content: true,
          createdAt: true,
          news: {
            select: {
              id: true,
              title: true,
              project: { select: { id: true, name: true, identifier: true } },
            },
          },
        },
      });
      grouped.news.push(
        ...comments.map((comment) => ({
          id: comment.id,
          type: 'news' as const,
          subtype: 'news_comment',
          title: `${comment.news.title} - コメント`,
          excerpt: excerpt(comment.content, q),
          href: `/projects/${comment.news.project.identifier}/news/${comment.news.id}`,
          project: comment.news.project,
          createdAt: comment.createdAt,
          updatedAt: comment.createdAt,
        })),
      );
      grouped.news.sort(sortByDateDesc);
    }

    if (types.includes('documents')) {
      const documents = await prisma.document.findMany({
        where: {
          AND: [
            { OR: [{ title: contains }, { description: contains }] },
            scopedProject,
            readable ? { project: readable } : {},
          ],
        },
        take: 50,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          createdAt: true,
          updatedAt: true,
          project: { select: { id: true, name: true, identifier: true } },
        },
      });
      grouped.documents = documents.map((doc) => ({
        id: doc.id,
        type: 'documents',
        subtype: 'document',
        title: doc.title,
        excerpt: excerpt(doc.description, q),
        href: `/projects/${doc.project.identifier}/documents/${doc.id}`,
        project: doc.project,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      }));
    }

    if (types.includes('wiki')) {
      const pages = await prisma.wikiPage.findMany({
        where: {
          AND: [
            { OR: [{ title: contains }, { content: { text: contains } }, { content: { comments: contains } }] },
            scopeRaw === 'all'
              ? readable
                ? { wiki: { project: readable } }
                : {}
              : { wiki: { projectId: scopeRaw } },
          ],
        },
        take: 50,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          wiki: {
            select: {
              project: { select: { id: true, name: true, identifier: true } },
            },
          },
          content: { select: { text: true, comments: true, updatedAt: true } },
        },
      });
      grouped.wiki = pages.map((page) => ({
        id: page.id,
        type: 'wiki',
        subtype: 'wiki_page',
        title: page.title,
        excerpt: excerpt(page.content?.text || page.content?.comments, q),
        href: `/projects/${page.wiki.project.identifier}/wiki/${encodeURIComponent(page.title)}`,
        project: page.wiki.project,
        createdAt: page.createdAt,
        updatedAt: page.content?.updatedAt ?? page.updatedAt,
      }));
    }

    if (types.includes('messages')) {
      const messages = await prisma.message.findMany({
        where: {
          AND: [
            { OR: [{ subject: contains }, { content: contains }] },
            scopeRaw === 'all'
              ? readable
                ? { board: { project: readable } }
                : {}
              : { board: { projectId: scopeRaw } },
          ],
        },
        take: 50,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          parentId: true,
          subject: true,
          content: true,
          createdAt: true,
          updatedAt: true,
          board: {
            select: {
              id: true,
              name: true,
              project: { select: { id: true, name: true, identifier: true } },
            },
          },
        },
      });
      grouped.messages = messages.map((message) => {
        const topicId = message.parentId ?? message.id;
        return {
          id: message.id,
          type: 'messages',
          subtype: message.parentId ? 'reply' : 'topic',
          title: message.parentId ? `${message.subject} - 返信` : message.subject,
          excerpt: excerpt(message.content, q),
          href: `/projects/${message.board.project.identifier}/forums/${message.board.id}/topics/${topicId}`,
          project: message.board.project,
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,
        };
      });
    }

    const results = Object.fromEntries(types.map((type) => [type, grouped[type]])) as Partial<Record<SearchType, SearchResult[]>>;
    const total = Object.values(results).reduce((sum, items) => sum + (items?.length ?? 0), 0);

    return sendSuccess(res, { q, scope: scopeRaw, types, total, results });
  } catch (err) {
    next(err);
  }
});

export default router;
