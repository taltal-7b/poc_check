import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
      <h1 className="text-2xl font-bold text-gray-900">{t('activity.title')}</h1>

      <div className="flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">Type</span>
          <select value={actType} onChange={(e) => setActType(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm min-w-[10rem]">
            <option value="">All</option>
            {types.map((x) => (
              <option key={x} value={x}>
                {x}
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
                    <span>{r.actType}</span>
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
