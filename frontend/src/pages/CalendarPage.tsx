import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useProject, useProjectIssues } from '../api/hooks';
import type { Issue } from '../types';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

export default function CalendarPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const { data: projectRaw } = useProject(identifier ?? '');
  const project =
    projectRaw && typeof projectRaw === 'object' && 'id' in projectRaw ? (projectRaw as { id: string }) : null;
  const projectId = project?.id ?? '';

  const issuesRaw = useProjectIssues(projectId);
  const issues = useMemo(() => unwrapList<Issue>(issuesRaw.data), [issuesRaw.data]);

  const byDue = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const i of issues) {
      if (!i.dueDate) continue;
      const key = format(parseISO(i.dueDate), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(i);
    }
    return map;
  }, [issues]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const padBefore = monthStart.getDay();
  const today = new Date();

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('calendar.title')}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCursor(subMonths(cursor, 1))}
            className="p-2 rounded border border-gray-200 hover:bg-gray-50"
            aria-label="prev"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium w-36 text-center">{format(cursor, 'MMMM yyyy')}</span>
          <button
            type="button"
            onClick={() => setCursor(addMonths(cursor, 1))}
            className="p-2 rounded border border-gray-200 hover:bg-gray-50"
            aria-label="next"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden relative">
        <div className="grid grid-cols-7 text-center text-xs font-medium text-gray-500 border-b border-gray-100 bg-gray-50 py-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-fr min-h-[420px]">
          {Array.from({ length: padBefore }).map((_, i) => (
            <div key={`pad-${i}`} className="border-b border-r border-gray-100 bg-gray-50/50" />
          ))}
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const list = byDue.get(key) ?? [];
            const isToday = isSameDay(day, today);
            return (
              <div
                key={key}
                className={`border-b border-r border-gray-100 p-1 min-h-[72px] ${isToday ? 'bg-primary-50 ring-1 ring-inset ring-primary-200' : ''}`}
              >
                <div className={`text-xs font-medium mb-1 ${isToday ? 'text-primary-800' : 'text-gray-600'}`}>
                  {format(day, 'd')}
                </div>
                <ul className="space-y-0.5">
                  {list.map((issue) => (
                    <li key={issue.id}>
                      <Link
                        to={`/projects/${identifier}/issues/${issue.id}`}
                        className="block text-[10px] leading-tight truncate text-primary-700 hover:underline"
                        onMouseEnter={(e) =>
                          setTip({
                            text: issue.subject,
                            x: e.clientX,
                            y: e.clientY,
                          })
                        }
                        onMouseLeave={() => setTip(null)}
                      >
                        {issue.subject}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        {tip && (
          <div
            className="fixed z-50 pointer-events-none rounded bg-gray-900 text-white text-xs px-2 py-1 max-w-xs shadow-lg"
            style={{ left: tip.x + 8, top: tip.y + 8 }}
          >
            {tip.text}
          </div>
        )}
      </div>
    </div>
  );
}
