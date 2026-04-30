import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { Search } from 'lucide-react';
import { useSearch } from '../api/hooks';
import type { SearchResultItem, SearchResultType } from '../types';

const SEARCH_TYPES = ['issues', 'wiki', 'news', 'documents', 'messages'] as const;

const TYPE_LABELS: Record<SearchResultType, string> = {
  issues: 'チケット',
  wiki: 'Wiki',
  news: 'ニュース',
  documents: '文書',
  messages: 'フォーラム',
};

function formatDate(value?: string | null) {
  if (!value) return '';
  try {
    return format(parseISO(value), 'yyyy-MM-dd HH:mm');
  } catch {
    return '';
  }
}

function subtypeLabel(item: SearchResultItem) {
  if (item.subtype === 'issue_comment') return 'コメント';
  if (item.subtype === 'news_comment') return 'コメント';
  if (item.subtype === 'reply') return '返信';
  return TYPE_LABELS[item.type];
}

export default function SearchPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const q = (searchParams.get('q') ?? '').trim();

  const { data: response, isLoading, isFetching, isError } = useSearch({
    q,
    types: SEARCH_TYPES.join(','),
  });

  const grouped = response?.data.results ?? {};
  const total = response?.data.total ?? 0;
  const flatResults = useMemo(
    () =>
      SEARCH_TYPES.flatMap((type) =>
        (grouped[type] ?? []).map((item) => ({
          ...item,
          groupType: type,
        })),
      ),
    [grouped],
  );
  const loading = isLoading || isFetching;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('search.title')}</h1>
          {q && (
            <p className="mt-1 text-sm text-gray-600">
              「{q}」の検索結果{!loading && `: ${total}件`}
            </p>
          )}
        </div>
      </div>

      {!q && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
          右上の検索ボックスにキーワードを入力してください。
        </div>
      )}

      {q && loading && <p className="text-sm text-gray-500">{t('app.loading')}</p>}
      {q && isError && <p className="text-sm text-red-600">{t('app.error')}</p>}

      {q && !loading && !isError && total === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-600">
          {t('search.noResults')}
        </div>
      )}

      {q && !loading && !isError && total > 0 && (
        <div className="space-y-8">
          {SEARCH_TYPES.map((type) => {
            const list = grouped[type] ?? [];
            if (!list.length) return null;
            return (
              <section key={type} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">{TYPE_LABELS[type]}</h2>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{list.length}</span>
                </div>
                <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white">
                  {list.map((item) => {
                    const date = formatDate(item.updatedAt ?? item.createdAt);
                    return (
                      <li key={`${item.type}-${item.id}`} className="p-4">
                        <div className="flex items-start gap-3">
                          <Search size={16} className="mt-1 shrink-0 text-gray-400" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link to={item.href} className="font-medium text-primary-700 hover:underline">
                                {item.title}
                              </Link>
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                                {subtypeLabel(item)}
                              </span>
                            </div>
                            {item.excerpt && <p className="mt-1 text-sm text-gray-700">{item.excerpt}</p>}
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                              <span>{item.project.name}</span>
                              {date && <span>{date}</span>}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {flatResults.length > 0 && <div className="sr-only">{flatResults.length} results</div>}
    </div>
  );
}
