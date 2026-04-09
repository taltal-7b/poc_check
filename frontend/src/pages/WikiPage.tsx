import { useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { Book, History, Lock, LockOpen, Pencil } from 'lucide-react';
import { useProject, useWikiPage, useWikiPages } from '../api/hooks';
import api from '../api/client';
import type { WikiPage as WikiPageType } from '../types';

function unwrap<T>(raw: unknown): T | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object' && raw !== null && 'data' in raw && !Array.isArray(raw)) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

function buildTree(pages: WikiPageType[]): { name: string; full: string; children: { name: string; full: string }[] }[] {
  const roots = new Map<string, { name: string; full: string; children: { name: string; full: string }[] }>();
  const sorted = [...pages].sort((a, b) => a.title.localeCompare(b.title));
  for (const p of sorted) {
    const parts = p.title.split('/');
    if (parts.length === 1) {
      if (!roots.has(p.title)) roots.set(p.title, { name: p.title, full: p.title, children: [] });
    } else {
      const rootName = parts[0];
      if (!roots.has(rootName)) roots.set(rootName, { name: rootName, full: rootName, children: [] });
      roots.get(rootName)!.children.push({ name: parts.slice(1).join('/'), full: p.title });
    }
  }
  return Array.from(roots.values());
}

export default function WikiPage() {
  const { t } = useTranslation();
  const { identifier, title: titleParam } = useParams<{ identifier: string; title?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: projectRaw } = useProject(identifier ?? '');
  const project =
    projectRaw && typeof projectRaw === 'object' && 'id' in projectRaw
      ? (projectRaw as { id: string; identifier?: string })
      : null;
  const projectId = project?.id ?? '';

  const pagesRaw = useWikiPages(projectId);
  const pages = useMemo(() => unwrapList<WikiPageType>(pagesRaw.data), [pagesRaw.data]);

  const decodedTitle = titleParam ? decodeURIComponent(titleParam) : '';
  const pageQuery = useWikiPage(projectId, decodedTitle);
  const wikiPage = unwrap<WikiPageType>(pageQuery.data);

  const html = useMemo(() => {
    const md = wikiPage?.content?.text ?? '';
    if (!md) return '';
    const raw = marked.parse(md, { async: false }) as string;
    return sanitizeHtml(raw);
  }, [wikiPage?.content?.text]);

  const toggleProtect = useMutation({
    mutationFn: async () => {
      if (!projectId || !decodedTitle || !wikiPage) return;
      await api.put(`/projects/${projectId}/wiki/${encodeURIComponent(decodedTitle)}`, {
        text: wikiPage.content?.text ?? '',
        protected: !wikiPage.protected,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wiki', projectId, decodedTitle] });
      qc.invalidateQueries({ queryKey: ['wiki', projectId] });
    },
  });

  const tree = useMemo(() => buildTree(pages), [pages]);

  const base = `/projects/${identifier}/wiki`;

  if (!identifier) {
    return <p className="text-gray-500">{t('app.noData')}</p>;
  }

  return (
    <div className="space-y-6">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <div className="flex flex-col lg:flex-row gap-6">
      <aside className="lg:w-64 shrink-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm h-fit">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Book size={16} />
          {t('wiki.title')}
        </h2>
        <nav className="space-y-1 text-sm">
          <Link to={base} className="block py-1 text-primary-700 hover:underline">
            Index
          </Link>
          {tree.map((node) => (
            <div key={node.full} className="pl-2 border-l border-gray-100">
              <Link to={`${base}/${encodeURIComponent(node.full)}`} className="block py-1 text-gray-800 hover:text-primary-700">
                {node.name}
              </Link>
              {node.children.map((c) => (
                <Link
                  key={c.full}
                  to={`${base}/${encodeURIComponent(c.full)}`}
                  className="block py-0.5 pl-2 text-gray-600 hover:text-primary-700 text-xs"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        {!decodedTitle ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-2xl font-bold text-gray-900">{t('wiki.title')}</h1>
              <Link
                to={`${base}/new/edit`}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
              >
                {t('wiki.newPage')}
              </Link>
            </div>
            <ul className="divide-y divide-gray-100">
              {pages.length === 0 ? (
                <li className="py-6 text-center text-gray-500">{t('app.noData')}</li>
              ) : (
                pages.map((p) => (
                  <li key={p.id}>
                    <Link to={`${base}/${encodeURIComponent(p.title)}`} className="block py-3 hover:bg-gray-50 px-2 rounded">
                      <span className="font-medium text-primary-700">{p.title}</span>
                      {p.protected && (
                        <span className="ml-2 text-xs text-amber-600">
                          <Lock size={12} className="inline" />
                        </span>
                      )}
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3 bg-gray-50">
              <h1 className="text-xl font-bold text-gray-900 flex-1 min-w-[12rem]">{decodedTitle}</h1>
              <button
                type="button"
                onClick={() => navigate(`${base}/${encodeURIComponent(decodedTitle)}/edit`)}
                className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                <Pencil size={14} />
                {t('wiki.editPage')}
              </button>
              <button
                type="button"
                onClick={() => navigate(`${base}/${encodeURIComponent(decodedTitle)}/history`)}
                className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                <History size={14} />
                {t('wiki.history')}
              </button>
              <button
                type="button"
                disabled={toggleProtect.isPending || !wikiPage}
                onClick={() => toggleProtect.mutate()}
                className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {wikiPage?.protected ? <LockOpen size={14} /> : <Lock size={14} />}
                {wikiPage?.protected ? t('wiki.unprotect') : t('wiki.protect')}
              </button>
            </div>
            {pageQuery.isLoading ? (
              <div className="p-8 text-center text-gray-500">{t('app.loading')}</div>
            ) : pageQuery.isError || !wikiPage ? (
              <div className="p-8 text-center text-gray-500">{t('app.error')}</div>
            ) : (
              <article
                className="p-6 text-sm text-gray-800 max-w-none space-y-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_pre]:bg-gray-100 [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_a]:text-primary-700 [&_ul]:list-disc [&_ul]:pl-5"
                dangerouslySetInnerHTML={{ __html: html || `<p>${t('app.noData')}</p>` }}
              />
            )}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
