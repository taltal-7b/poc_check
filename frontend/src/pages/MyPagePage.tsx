import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { useMe, useIssues } from '../api/hooks';
import type { Issue, User } from '../types';

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

const WATCHED_SNAPSHOT_KEY = 'tasknova_watched_issues_snapshot';

type WatchedSnapshot = { id: string; subject: string; projectIdentifier?: string };

type BlockId = 'assigned' | 'reported' | 'watched' | 'calendar';

export default function MyPagePage() {
  const { t } = useTranslation();
  const { data: meRaw } = useMe();
  const me = unwrap<User>(meRaw);

  const assignedQ = useIssues(me ? { assignee_id: me.id } : undefined);
  const reportedQ = useIssues(me ? { author_id: me.id } : undefined);

  const assigned = useMemo(() => unwrapList<Issue>(assignedQ.data), [assignedQ.data]);
  const reported = useMemo(() => unwrapList<Issue>(reportedQ.data), [reportedQ.data]);

  const [watchedSnap, setWatchedSnap] = useState<WatchedSnapshot[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WATCHED_SNAPSHOT_KEY);
      setWatchedSnap(raw ? JSON.parse(raw) : []);
    } catch {
      setWatchedSnap([]);
    }
  }, []);

  const [visible, setVisible] = useState<Record<BlockId, boolean>>({
    assigned: true,
    reported: true,
    watched: true,
    calendar: true,
  });

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const padBefore = monthStart.getDay();
  const today = new Date();

  const calendarIssues = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of assigned) {
      if (!i.dueDate) continue;
      const d = parseISO(i.dueDate);
      if (d < monthStart || d > monthEnd) continue;
      const key = format(d, 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    }
    return map;
  }, [assigned, monthStart, monthEnd]);

  const toggleBlock = (id: BlockId) => setVisible((v) => ({ ...v, [id]: !v[id] }));

  const blocks: { id: BlockId; label: string }[] = [
    { id: 'assigned', label: t('issues.assignee') },
    { id: 'reported', label: t('issues.author') },
    { id: 'watched', label: 'Watched' },
    { id: 'calendar', label: t('calendar.title') },
  ];

  const projectLink = (i: Issue) =>
    i.project?.identifier ? `/projects/${i.project.identifier}/issues/${i.id}` : `/issues/${i.id}`;

  const watchedLink = (w: WatchedSnapshot) =>
    w.projectIdentifier ? `/projects/${w.projectIdentifier}/issues/${w.id}` : `/issues/${w.id}`;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('myPage.title')}</h1>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <LayoutGrid size={18} />
          <span>{t('myPage.customize')}</span>
        </div>
      </div>

      <section className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Blocks</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {blocks.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => toggleBlock(b.id)}
              className={`rounded-lg border px-3 py-2 text-sm text-left transition ${
                visible[b.id] ? 'border-primary-500 bg-primary-50 text-primary-900' : 'border-gray-200 bg-white text-gray-600'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </section>

      {visible.assigned && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">{t('issues.assignee')}</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">{t('issues.subject')}</th>
                  <th className="px-4 py-2 font-medium">{t('issues.status')}</th>
                  <th className="px-4 py-2 font-medium">{t('issues.dueDate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {assigned.map((i) => (
                  <tr key={i.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{i.id.slice(0, 8)}</td>
                    <td className="px-4 py-2">
                      <Link to={projectLink(i)} className="text-primary-700 hover:underline">
                        {i.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{i.status?.name ?? '—'}</td>
                    <td className="px-4 py-2">{i.dueDate ? format(parseISO(i.dueDate), 'yyyy-MM-dd') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {assigned.length === 0 && <p className="p-4 text-center text-gray-500 text-sm">{t('app.noData')}</p>}
          </div>
        </section>
      )}

      {visible.reported && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">{t('issues.author')}</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">{t('issues.subject')}</th>
                  <th className="px-4 py-2 font-medium">{t('issues.status')}</th>
                  <th className="px-4 py-2 font-medium">{t('issues.dueDate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reported.map((i) => (
                  <tr key={i.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{i.id.slice(0, 8)}</td>
                    <td className="px-4 py-2">
                      <Link to={projectLink(i)} className="text-primary-700 hover:underline">
                        {i.subject}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{i.status?.name ?? '—'}</td>
                    <td className="px-4 py-2">{i.dueDate ? format(parseISO(i.dueDate), 'yyyy-MM-dd') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {reported.length === 0 && <p className="p-4 text-center text-gray-500 text-sm">{t('app.noData')}</p>}
          </div>
        </section>
      )}

      {visible.watched && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Recently watched</h2>
          <ul className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {watchedSnap.length === 0 ? (
              <li className="p-4 text-sm text-gray-500">{t('app.noData')}</li>
            ) : (
              watchedSnap.map((w) => (
                <li key={w.id} className="px-4 py-3">
                  <Link to={watchedLink(w)} className="text-primary-700 hover:underline font-medium">
                    {w.subject}
                  </Link>
                </li>
              ))
            )}
          </ul>
        </section>
      )}

      {visible.calendar && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">{t('calendar.title')}</h2>
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setCursor(subMonths(cursor, 1))} className="p-1 rounded border border-gray-200">
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-medium">{format(cursor, 'MMMM yyyy')}</span>
            <button type="button" onClick={() => setCursor(addMonths(cursor, 1))} className="p-1 rounded border border-gray-200">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="grid grid-cols-7 text-center text-[10px] text-gray-500 border-b py-1 bg-gray-50">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 text-[10px]">
              {Array.from({ length: padBefore }).map((_, i) => (
                <div key={`p-${i}`} className="h-14 border-b border-r border-gray-100 bg-gray-50/30" />
              ))}
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const list = calendarIssues.get(key) ?? [];
                const isToday = isSameDay(day, today);
                return (
                  <div
                    key={key}
                    className={`h-14 border-b border-r border-gray-100 p-0.5 ${isToday ? 'bg-primary-50' : ''}`}
                  >
                    <span className={isToday ? 'text-primary-800 font-semibold' : 'text-gray-600'}>{format(day, 'd')}</span>
                    <ul className="mt-0.5 space-y-0.5">
                      {list.slice(0, 2).map((i) => (
                        <li key={i.id} className="truncate text-primary-700">
                          <Link to={projectLink(i)}>{i.subject}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
