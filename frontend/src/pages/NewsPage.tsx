import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useProject, useNewsList, useProjectNews } from '../api/hooks';
import api from '../api/client';
import type { News, Comment } from '../types';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

export default function NewsPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier?: string }>();
  const qc = useQueryClient();

  const { data: projectRaw } = useProject(identifier ?? '');
  const project =
    identifier && projectRaw && typeof projectRaw === 'object' && 'id' in projectRaw
      ? (projectRaw as { id: string })
      : null;

  const globalList = useNewsList({});
  const projectList = useProjectNews(project?.id ?? '');

  const rawData =
    identifier && project ? projectList.data : !identifier ? globalList.data : undefined;
  const isLoading =
    identifier && project ? projectList.isLoading : !identifier ? globalList.isLoading : !!identifier;

  const items = useMemo(() => unwrapList<News>(rawData), [rawData]);

  const [openId, setOpenId] = useState<string | null>(null);

  const addComment = useMutation({
    mutationFn: async ({ newsId, content }: { newsId: string; content: string }) => {
      await api.post(`/news/${newsId}/comments`, { content });
    },
    onSuccess: () => {
      if (identifier && project) qc.invalidateQueries({ queryKey: ['news', project.id] });
      else qc.invalidateQueries({ queryKey: ['news'] });
    },
  });

  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  const authorName = (author?: { firstname: string; lastname: string; login: string }) =>
    author ? `${author.lastname} ${author.firstname}`.trim() || author.login : '—';

  return (
    <div className="space-y-6">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <h1 className="text-2xl font-bold text-gray-900">{t('news.title')}</h1>

      {isLoading ? (
        <p className="text-gray-500">{t('app.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-gray-500">{t('app.noData')}</p>
      ) : (
        <ul className="space-y-4">
          {items.map((n) => {
            const expanded = openId === n.id;
            return (
              <li key={n.id} className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenId(expanded ? null : n.id)}
                  className="w-full text-left px-5 py-4 flex items-start justify-between gap-4 hover:bg-gray-50"
                >
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">{n.title}</h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {authorName(n.author)} · {n.createdAt ? format(parseISO(n.createdAt), 'yyyy-MM-dd HH:mm') : '—'}
                    </p>
                    {n.summary && <p className="mt-2 text-sm text-gray-600 line-clamp-2">{n.summary}</p>}
                  </div>
                  {expanded ? <ChevronUp className="shrink-0 text-gray-400" size={20} /> : <ChevronDown className="shrink-0 text-gray-400" size={20} />}
                </button>
                {expanded && (
                  <div className="px-5 pb-5 border-t border-gray-100 bg-gray-50/50">
                    <div className="pt-4 text-sm text-gray-800 whitespace-pre-wrap">{n.description ?? n.summary ?? ''}</div>
                    <div className="mt-6">
                      <h3 className="text-sm font-semibold text-gray-700">{t('news.comments')}</h3>
                      <ul className="mt-2 space-y-2">
                        {(n.comments ?? []).map((c: Comment) => (
                          <li key={c.id} className="rounded border border-gray-200 bg-white px-3 py-2 text-sm">
                            <span className="text-gray-500 text-xs">
                              {authorName(c.author)} · {c.createdAt ? format(parseISO(c.createdAt), 'yyyy-MM-dd HH:mm') : ''}
                            </span>
                            <p className="mt-1 text-gray-800">{c.content}</p>
                          </li>
                        ))}
                      </ul>
                      <form
                        className="mt-3 flex flex-col gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const text = (commentDraft[n.id] ?? '').trim();
                          if (!text) return;
                          addComment.mutate({ newsId: n.id, content: text });
                          setCommentDraft((d) => ({ ...d, [n.id]: '' }));
                        }}
                      >
                        <textarea
                          value={commentDraft[n.id] ?? ''}
                          onChange={(e) => setCommentDraft((d) => ({ ...d, [n.id]: e.target.value }))}
                          rows={2}
                          className="rounded border border-gray-300 px-3 py-2 text-sm"
                          placeholder={t('news.addComment')}
                        />
                        <button
                          type="submit"
                          disabled={addComment.isPending}
                          className="self-start rounded bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                          {t('news.addComment')}
                        </button>
                      </form>
                    </div>
                    {identifier && (
                      <Link to={`/projects/${identifier}/issues`} className="mt-4 inline-block text-sm text-primary-700 hover:underline">
                        {t('issues.title')}
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
