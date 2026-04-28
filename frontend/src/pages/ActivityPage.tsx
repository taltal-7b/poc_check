import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import { format, parseISO } from 'date-fns';
import {
  Activity as ActivityIcon,
  FileEdit,
  GitBranch,
  MessageCircle,
  Newspaper,
  Ticket,
} from 'lucide-react';
import { useProject, useActivities } from '../api/hooks';
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
  if (t.includes('version')) return GitBranch;
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
    message: 'メッセージ',
    message_create: 'メッセージ - 新規投稿',
    message_update: 'メッセージ - 更新',
    message_delete: 'メッセージ - 削除',
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
  if (key.startsWith('message_')) return 'メッセージ関連';
  if (key.startsWith('board_')) return 'フォーラム関連';
  if (key.startsWith('document_')) return '文書関連';
  if (key.startsWith('time_entry_')) return '工数関連';
  if (key.startsWith('version_')) return 'バージョン関連';
  if (key.startsWith('file_')) return 'ファイル関連';

  return 'その他';
}

export default function ActivityPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier?: string }>();

  const { data: projectRaw } = useProject(identifier ?? '');
  const project =
    identifier && projectRaw && typeof projectRaw === 'object' && 'id' in projectRaw
      ? (projectRaw as { id: string })
      : null;

  const [actType, setActType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params = useMemo(() => {
    const p: Record<string, unknown> = {};
    if (project) p.project_id = project.id;
    if (actType) p.type = actType;
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [project, actType, from, to]);

  const { data: raw, isLoading } = useActivities(params);
  const rows = useMemo(() => unwrapList<ActivityRow>(raw), [raw]);

  const types = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.actType));
    return Array.from(s).sort();
  }, [rows]);

  return (
    <div className="space-y-6">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <h1 className="text-2xl font-bold text-gray-900">{t('activity.title')}</h1>

      <div className="flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">Type</span>
          <select value={actType} onChange={(e) => setActType(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm min-w-[10rem]">
            <option value="">All</option>
            {types.map((x) => (
              <option key={x} value={x}>
                {activityTypeLabel(x)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">{t('issues.startDate')}</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">{t('issues.dueDate')}</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </label>
      </div>

      {isLoading ? (
        <p className="text-gray-500">{t('app.loading')}</p>
      ) : rows.length === 0 ? (
        <p className="text-gray-500">{t('app.noData')}</p>
      ) : (
        <ul className="relative border-l-2 border-gray-200 ml-3 space-y-6 pl-8 py-2">
          {rows.map((r) => {
            const Icon = typeIcon(r.actType);
            return (
              <li key={r.id} className="relative">
                <span className="absolute -left-[2.125rem] top-0 flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 border-2 border-white shadow-sm">
                  <Icon size={16} />
                </span>
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="font-medium text-gray-900">{r.title}</p>
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
