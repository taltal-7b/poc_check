import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import { format, parseISO } from 'date-fns';
import {
  Activity as ActivityIcon,
  CalendarRange,
  FileEdit,
  MessageCircle,
  Newspaper,
  RotateCcw,
  Ticket,
} from 'lucide-react';
import { useProject, useActivities, useAllProjects } from '../api/hooks';
import AppSelect from '../components/AppSelect';
import type { Activity as ActivityRow } from '../types';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

function typeIcon(actType: string) {
  const t = actType.toLowerCase();
  if (t.includes('issue')) return Ticket;
  if (t.includes('wiki')) return FileEdit;
  if (t.includes('news')) return Newspaper;
  if (t.includes('message') || t.includes('forum')) return MessageCircle;
  return ActivityIcon;
}

function activityTypeLabel(actType: string): string {
  const key = actType.trim().toLowerCase();
  const directMap: Record<string, string> = {
    issue: 'チケット',
    issue_create: 'チケット - 新規作成',
    issue_update: 'チケット - 更新',
    issue_comment: 'チケット - 新しいコメント',
    issue_delete: 'チケット - 削除',
    wiki: 'Wiki',
    wiki_create: 'Wiki - 新規作成',
    wiki_edit: 'Wiki - 更新',
    wiki_delete: 'Wiki - 削除',
    news: 'ニュース',
    news_create: 'ニュース - 新規作成',
    news_update: 'ニュース - 更新',
    news_comment: 'ニュース - 新しいコメント',
    news_delete: 'ニュース - 削除',
    message: 'トピック/コメント',
    message_create: 'トピック/コメント - 新規投稿',
    message_update: 'トピック/コメント - 更新',
    message_delete: 'トピック/コメント - 削除',
    board: 'フォーラム',
    board_create: 'フォーラム - 新規作成',
    board_update: 'フォーラム - 更新',
    board_delete: 'フォーラム - 削除',
    document: '文書',
    document_create: '文書 - 新規作成',
    document_update: '文書 - 更新',
    document_delete: '文書 - 削除',
    file: 'ファイル',
    file_add: 'ファイル - 追加',
    file_delete: 'ファイル - 削除',
    version: 'バージョン',
    version_create: 'バージョン - 新規作成',
    version_update: 'バージョン - 更新',
    version_delete: 'バージョン - 削除',
    time_entry: '工数',
    time_entry_create: '工数 - 新規登録',
    time_entry_update: '工数 - 更新',
    time_entry_delete: '工数 - 削除',
    changeset: '変更セット',
  };
  if (directMap[key]) return directMap[key];

  if (key.startsWith('issue_')) return 'チケット関連';
  if (key.startsWith('wiki_')) return 'Wiki関連';
  if (key.startsWith('news_')) return 'ニュース関連';
  if (key.startsWith('message_')) return 'トピック/コメント関連';
  if (key.startsWith('board_')) return 'フォーラム関連';
  if (key.startsWith('document_')) return '文書関連';
  if (key.startsWith('time_entry_')) return '工数関連';
  if (key.startsWith('version_')) return 'バージョン関連';
  if (key.startsWith('file_')) return 'ファイル関連';

  return 'その他';
}

type ActivityDateOperator = '*' | '><' | 't' | 'w' | 'lw' | 'l2w' | 'm' | 'lm';

const ACTIVITY_TYPE_GROUPS = [
  { value: '', label: 'すべて' },
  { value: 'issue', label: 'チケット' },
  { value: 'wiki', label: 'Wiki' },
  { value: 'board', label: 'フォーラム' },
  { value: 'message', label: 'トピック/コメント' },
  { value: 'news', label: 'ニュース' },
  { value: 'document', label: '文書' },
  { value: 'file', label: 'ファイル' },
  { value: 'version', label: 'バージョン' },
  { value: 'time_entry', label: '工数' },
];

function formatDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeekMonday(date: Date): Date {
  const next = new Date(date);
  const day = next.getDay();
  return addDays(next, day === 0 ? -6 : 1 - day);
}

export default function ActivityPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier?: string }>();

  const { data: projectRaw } = useProject(identifier ?? '');
  const { data: projectsRaw } = useAllProjects({ enabled: !identifier });
  const project = identifier ? projectRaw?.data ?? null : null;
  const projectOptions = useMemo(
    () => [
      { value: '', label: 'すべて' },
      ...(projectsRaw?.data ?? []).map((row) => ({
        value: row.id,
        label: `${row.name} (${row.identifier})`,
      })),
    ],
    [projectsRaw?.data],
  );

  const today = formatDateKey(new Date());
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [actTypeGroup, setActTypeGroup] = useState('');
  const [dateOperator, setDateOperator] = useState<ActivityDateOperator>('*');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const createdAtRange = useMemo((): { from?: string; to?: string } => {
    const now = new Date();
    switch (dateOperator) {
      case '*':
        return {};
      case '><':
        return {
          ...(customFrom ? { from: customFrom } : {}),
          ...(customTo ? { to: customTo } : {}),
        };
      case 't':
        return { from: today, to: today };
      case 'w': {
        const start = startOfWeekMonday(now);
        return { from: formatDateKey(start), to: formatDateKey(addDays(start, 6)) };
      }
      case 'lw': {
        const thisWeek = startOfWeekMonday(now);
        return { from: formatDateKey(addDays(thisWeek, -7)), to: formatDateKey(addDays(thisWeek, -1)) };
      }
      case 'l2w':
        return { from: formatDateKey(addDays(now, -13)), to: today };
      case 'm':
        return {
          from: formatDateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
          to: formatDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
        };
      case 'lm':
        return {
          from: formatDateKey(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
          to: formatDateKey(new Date(now.getFullYear(), now.getMonth(), 0)),
        };
      default:
        return {};
    }
  }, [customFrom, customTo, dateOperator, today]);

  const params = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (project?.id) p.project_id = project.id;
    if (!project?.id && selectedProjectId) p.project_id = selectedProjectId;
    if (actTypeGroup) p.type_group = actTypeGroup;
    if (createdAtRange.from) p.from = createdAtRange.from;
    if (createdAtRange.to) p.to = createdAtRange.to;
    return p;
  }, [project?.id, selectedProjectId, actTypeGroup, createdAtRange.from, createdAtRange.to]);

  const { data: raw, isLoading } = useActivities(params);
  const rows = useMemo(() => unwrapList<ActivityRow>(raw), [raw]);
  const hasActiveFilters = selectedProjectId !== '' || actTypeGroup !== '' || dateOperator !== '*';

  const resetFilters = () => {
    setSelectedProjectId('');
    setActTypeGroup('');
    setDateOperator('*');
    setCustomFrom('');
    setCustomTo('');
  };

  return (
    <div className="space-y-6">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <h1 className="text-2xl font-bold text-gray-900">{t('activity.title')}</h1>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {!identifier && (
          <label className="min-w-[16rem] text-sm">
            <span className="mb-1 block text-gray-600">対象プロジェクト</span>
            <AppSelect
              value={selectedProjectId}
              onChange={setSelectedProjectId}
              options={projectOptions}
              ariaLabel="対象プロジェクト"
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </label>
        )}
        <label className="min-w-[12rem] text-sm">
          <span className="mb-1 block text-gray-600">種別</span>
          <AppSelect
            value={actTypeGroup}
            onChange={setActTypeGroup}
            options={ACTIVITY_TYPE_GROUPS}
            ariaLabel="種別"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="min-w-[11rem] text-sm">
          <span className="mb-1 block text-gray-600">期間</span>
          <AppSelect
            value={dateOperator}
            onChange={(value) => setDateOperator(value as ActivityDateOperator)}
            options={[
              { value: '*', label: 'すべて' },
              { value: 't', label: '今日' },
              { value: 'w', label: '今週' },
              { value: 'lw', label: '先週' },
              { value: 'l2w', label: '直近2週間' },
              { value: 'm', label: '今月' },
              { value: 'lm', label: '先月' },
              { value: '><', label: '日付を指定' },
            ]}
            ariaLabel="期間"
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        {dateOperator === '><' && (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">開始</span>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">終了</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
          </>
        )}
        <button
          type="button"
          onClick={resetFilters}
          disabled={!hasActiveFilters}
          className="inline-flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
        >
          <RotateCcw size={15} aria-hidden />
          リセット
        </button>
        <p className="inline-flex items-center gap-1.5 pb-1 text-sm text-gray-500">
          <CalendarRange size={15} aria-hidden />
          {createdAtRange.from || createdAtRange.to
            ? `${createdAtRange.from ?? '指定なし'} - ${createdAtRange.to ?? '指定なし'}`
            : '全期間'}
        </p>
      </div>

      {isLoading ? (
        <p className="text-gray-500">{t('app.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">{t('app.noData')}</p>
      ) : (
        <ul className="relative border-l-2 border-gray-200 ml-3 space-y-6 pl-8 py-2">
          {rows.map((r) => {
            const Icon = typeIcon(r.actType);
            const activityUrl =
              r.url ??
              (r.actType.toLowerCase().startsWith('issue') && r.project?.identifier
                ? `/projects/${r.project.identifier}/issues/${r.actId}`
                : null);
            return (
              <li key={r.id} className="relative">
                <span className="absolute -left-[2.125rem] top-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 border-2 border-white shadow-sm">
                  <Icon size={16} />
                </span>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="font-medium text-gray-900">
                    {activityUrl ? (
                      <Link to={activityUrl} className="text-primary-700 hover:underline">
                        {r.title}
                      </Link>
                    ) : (
                      r.title
                    )}
                  </p>
                  {r.description && <p className="text-sm text-gray-600 mt-1">{r.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    {r.project && r.project.identifier && (
                      <Link to={`/projects/${r.project.identifier}`} className="text-primary-700 hover:underline">
                        {r.project.name}
                      </Link>
                    )}
                    <span>{activityTypeLabel(r.actType)}</span>
                    <span>{r.createdAt ? format(parseISO(r.createdAt), 'yyyy-MM-dd HH:mm') : ''}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
