import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { useSearch } from '../api/hooks';

type ResultItem = {
  id?: string;
  title?: string;
  subject?: string;
  name?: string;
  excerpt?: string;
  summary?: string;
  description?: string;
  project?: { name?: string; identifier?: string };
  projectId?: string;
  createdAt?: string;
  updatedAt?: string;
};

function unwrapRecord(raw: unknown): Record<string, unknown[]> {
  if (raw == null) return {};
  if (typeof raw === 'object' && raw !== null && 'data' in raw && typeof (raw as { data: unknown }).data === 'object') {
    return ((raw as { data: Record<string, unknown[]> }).data ?? {}) as Record<string, unknown[]>;
  }
  return raw as Record<string, unknown[]>;
}

function asList(v: unknown): ResultItem[] {
  if (!Array.isArray(v)) return [];
  return v as ResultItem[];
}

function titleOf(r: ResultItem) {
  return r.title ?? r.subject ?? r.name ?? '—';
}

function excerptOf(r: ResultItem) {
  const t = r.excerpt ?? r.summary ?? r.description ?? '';
  return t.length > 200 ? `${t.slice(0, 200)}…` : t;
}

export default function SearchPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();

  const { data: raw, isLoading, isFetching } = useSearch({
    q,
    types: 'issues,wiki,news,documents,messages',
  });

  const grouped = useMemo(() => {
    const rec = unwrapRecord(raw);
    return {
      issues: asList(rec.issues ?? rec.issue),
      wiki: asList(rec.wiki ?? rec.wiki_pages),
      news: asList(rec.news),
      documents: asList(rec.documents ?? rec.document),
      messages: asList(rec.messages ?? rec.message),
    };
  }, [raw]);

  const sections: { key: keyof typeof grouped; label: string }[] = [
    { key: 'issues', label: t('issues.title') },
    { key: 'wiki', label: t('wiki.title') },
    { key: 'news', label: t('news.title') },
    { key: 'documents', label: t('documents.title') },
    { key: 'messages', label: t('forums.title') },
  ];

  const loading = isLoading || isFetching;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">{t('search.title')}</h1>
      {!q ? (
        <p className="text-gray-500">{t('search.placeholder')}</p>
      ) : loading ? (
        <p className="text-gray-500">{t('app.loading')}</p>
      ) : (
        sections.map(({ key, label }) => {
          const list = grouped[key];
          if (!list.length) return null;
          return (
            <section key={key}>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">{label}</h2>
              <ul className="space-y-3">
                {list.map((item, idx) => {
                  const pid = item.project?.identifier;
                  const href =
                    key === 'issues' && item.id && pid
                      ? `/projects/${pid}/issues/${item.id}`
                      : key === 'wiki' && item.title && pid
                        ? `/projects/${pid}/wiki/${encodeURIComponent(item.title)}`
                        : key === 'news' && pid
                          ? `/projects/${pid}/news`
                          : '#';
                  const date = item.updatedAt ?? item.createdAt;
                  return (
                    <li key={item.id ?? idx} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      {href !== '#' ? (
                        <Link to={href} className="font-medium text-primary-700 hover:underline">
                          {titleOf(item)}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-900">{titleOf(item)}</span>
                      )}
                      {excerptOf(item) && <p className="mt-1 text-sm text-gray-600">{excerptOf(item)}</p>}
                      <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-2">
                        {item.project?.name && <span>{item.project.name}</span>}
                        {date && <span>{format(parseISO(date), 'yyyy-MM-dd')}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
      {q && !loading && sections.every(({ key }) => grouped[key].length === 0) && (
        <p className="text-gray-500">{t('search.noResults')}</p>
      )}
    </div>
  );
}
