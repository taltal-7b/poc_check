import { useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { renderMarkdown } from '../components/RichTextEditor';
import { Book, History, Lock, LockOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useProject, useWikiPage, useWikiPages, useMembers } from '../api/hooks';
import api from '../api/client';
import { useAuthStore } from '../stores/auth';
import type { WikiPage as WikiPageType } from '../types';

function unwrap<T>(raw: unknown): T | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object' && raw !== null && 'data' in raw && !Array.isArray(raw)) {
    return (raw as { data: T }).data;
  }
  return raw as T;
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

function parsePermissions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export default function WikiPage() {
  const { t } = useTranslation();
  const { identifier, title: titleParam } = useParams<{ identifier: string; title?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const { data: projectRaw } = useProject(identifier ?? '');
  const project = projectRaw?.data ?? null;
  const projectId = project?.id ?? '';
  const membersQuery = useMembers(projectId);
  const members = membersQuery.data?.data ?? [];

  const pagesRaw = useWikiPages(projectId);
  const pages = useMemo(() => pagesRaw.data?.data?.pages ?? [], [pagesRaw.data]);

  const decodedTitle = titleParam ? decodeURIComponent(titleParam) : '';
  const pageQuery = useWikiPage(projectId, decodedTitle);
  const wikiPage = unwrap<WikiPageType>(pageQuery.data);

  const html = useMemo(() => {
    const md = wikiPage?.content?.text ?? '';
    if (!md) return '';
    return renderMarkdown(md);
  }, [wikiPage?.content?.text]);

  const [wikiActionsOpen, setWikiActionsOpen] = useState(false);
  const [deleteWikiOpen, setDeleteWikiOpen] = useState(false);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  const toggleProtect = useMutation({
    mutationFn: async () => {
      if (!projectId || !decodedTitle || !wikiPage) return;
      await api.post(`/projects/${projectId}/wiki/${encodeURIComponent(decodedTitle)}/protect`, {
        protected: !wikiPage.protected,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wiki', projectId, decodedTitle] });
      qc.invalidateQueries({ queryKey: ['wiki', projectId] });
    },
  });

  const deleteWikiPage = useMutation({
    mutationFn: async () => {
      if (!projectId || !decodedTitle) return;
      await api.delete(`/projects/${projectId}/wiki/${encodeURIComponent(decodedTitle)}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wiki', projectId] });
      setDeleteWikiOpen(false);
      setDeleteErrorMessage(null);
      navigate(base);
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error?.message || t('app.error');
      setDeleteErrorMessage(msg);
    },
  });

  const tree = useMemo(() => buildTree(pages), [pages]);
  const canEditWiki = useMemo(() => {
    if (currentUser?.admin) return true;
    if (!currentUser?.id) return false;
    const meMember = members.find((m) => m.userId === currentUser.id);
    if (!meMember) return false;
    const perms = new Set<string>();
    for (const mr of meMember.memberRoles ?? []) {
      for (const p of parsePermissions(mr.role?.permissions)) perms.add(p);
    }
    return perms.has('edit_wiki_pages');
  }, [members, currentUser]);

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
              {canEditWiki && (
                <Link
                  to={`${base}/new/edit`}
                  className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
                >
                  {t('wiki.newPage')}
                </Link>
              )}
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
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3 bg-gray-50">
              <h1 className="text-xl font-bold text-gray-900 min-w-0 flex-1 basis-full sm:basis-auto sm:min-w-[12rem]">
                {decodedTitle}
              </h1>
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                {canEditWiki && wikiPage && !wikiPage.protected && (
                  <button
                    type="button"
                    onClick={() => navigate(`${base}/${encodeURIComponent(decodedTitle)}/edit`)}
                    className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    <Pencil size={14} />
                    {t('wiki.editPage')}
                  </button>
                )}
                <a
                  href={`/api/v1/projects/${projectId}/wiki/${encodeURIComponent(decodedTitle)}/export/pdf`}
                  download
                  className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  {t('wiki.export')}
                </a>
                <div className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={wikiActionsOpen}
                  onClick={() => setWikiActionsOpen((o) => !o)}
                  className="inline-flex h-[34px] min-w-[34px] items-center justify-center rounded border border-gray-300 bg-white px-2 text-gray-700 hover:bg-gray-50"
                  title={t('wiki.moreActions')}
                >
                  <MoreHorizontal className="h-5 w-5" aria-hidden />
                  <span className="sr-only">{t('wiki.moreActions')}</span>
                </button>
                {wikiActionsOpen && (
                  <>
                    <button
                      type="button"
                      aria-label="メニューを閉じる"
                      className="fixed inset-0 z-40 cursor-default bg-transparent"
                      onClick={() => setWikiActionsOpen(false)}
                    />
                    <ul
                      role="menu"
                      className="absolute right-0 z-50 mt-1 min-w-[11rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                    >
                      <li role="none">
                        <button
                          type="button"
                          role="menuitem"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50"
                          onClick={() => {
                            setWikiActionsOpen(false);
                            navigate(`${base}/${encodeURIComponent(decodedTitle)}/history`);
                          }}
                        >
                          <History className="h-4 w-4 shrink-0" />
                          {t('wiki.history')}
                        </button>
                      </li>
                      {wikiPage?.canManageProtection && (
                        <li role="none">
                          <button
                            type="button"
                            role="menuitem"
                            disabled={toggleProtect.isPending || !wikiPage}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                            onClick={() => {
                              setWikiActionsOpen(false);
                              toggleProtect.mutate();
                            }}
                          >
                            {wikiPage?.protected ? (
                              <LockOpen className="h-4 w-4 shrink-0" />
                            ) : (
                              <Lock className="h-4 w-4 shrink-0" />
                            )}
                            {wikiPage?.protected ? t('wiki.unprotect') : t('wiki.protect')}
                          </button>
                        </li>
                      )}
                      {canEditWiki && wikiPage && !wikiPage.protected && (
                        <li role="none">
                          <button
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                            onClick={() => {
                              setWikiActionsOpen(false);
                              setDeleteErrorMessage(null);
                              setDeleteWikiOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 shrink-0" />
                            {t('app.delete')}
                          </button>
                        </li>
                      )}
                    </ul>
                  </>
                )}
                </div>
              </div>
            </div>
            {pageQuery.isLoading ? (
              <div className="p-8 text-center text-gray-500">{t('app.loading')}</div>
            ) : pageQuery.isError || !wikiPage ? (
              <div className="p-8 text-center text-gray-500">{t('app.error')}</div>
            ) : (
              <>
                <article
                  className="p-6 text-sm text-gray-800 max-w-none space-y-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_pre]:bg-gray-100 [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_a]:text-primary-700 [&_ul]:list-disc [&_ul]:pl-5"
                  dangerouslySetInnerHTML={{ __html: html || `<p>${t('app.noData')}</p>` }}
                />
                {(wikiPage.attachments?.length ?? 0) > 0 && (
                  <section className="border-t border-gray-100 px-6 py-4">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{t('settings.attachments')}</h2>
                    <ul className="space-y-1 text-sm">
                      {wikiPage.attachments!.map((att) => (
                        <li key={att.id}>
                          <a
                            href={`/api/v1/attachments/${att.id}/download`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary-700 hover:underline"
                          >
                            {att.filename}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>

      <Dialog
        open={deleteWikiOpen}
        onClose={() => {
          setDeleteErrorMessage(null);
          setDeleteWikiOpen(false);
        }}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('wiki.deletePage')}</DialogTitle>
            <p className="mt-3 text-sm text-gray-700">
              {t('wiki.deletePageConfirm', { title: decodedTitle || '—' })}
            </p>
            {deleteErrorMessage && (
              <p className="mt-2 text-sm text-red-600">{deleteErrorMessage}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteErrorMessage(null);
                  setDeleteWikiOpen(false);
                }}
                className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                {t('app.cancel')}
              </button>
              <button
                type="button"
                disabled={deleteWikiPage.isPending || !decodedTitle}
                onClick={() => {
                  setDeleteErrorMessage(null);
                  deleteWikiPage.mutate();
                }}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t('app.delete')}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
