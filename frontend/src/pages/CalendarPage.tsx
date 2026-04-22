import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useProjectIssues, useStatuses } from '../api/hooks';
import type { Issue, IssueStatus } from '../types';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

function parseDateOnly(s: string | null | undefined): Date | null {
  if (!s) return null;
  try {
    return startOfDay(parseISO(s.length >= 10 ? s.slice(0, 10) : s));
  } catch {
    return null;
  }
}

type DayEntry = {
  issue: Issue;
  type: 'start' | 'end' | 'both';
};

export default function CalendarPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const locale = ja;

  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));

  const statusesQuery = useStatuses();
  const allStatuses = useMemo(() => unwrapList<IssueStatus>(statusesQuery.data), [statusesQuery.data]);

  const [checkedStatusIds, setCheckedStatusIds] = useState<Set<string> | null>(null);

  const effectiveChecked = useMemo(() => {
    if (checkedStatusIds !== null) return checkedStatusIds;
    return new Set(allStatuses.filter((s) => !s.isClosed).map((s) => s.id));
  }, [checkedStatusIds, allStatuses]);

  const toggleStatus = (id: string) => {
    setCheckedStatusIds((prev) => {
      const base = prev ?? new Set(allStatuses.filter((s) => !s.isClosed).map((s) => s.id));
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const issuesRaw = useProjectIssues(identifier ?? '', { per_page: 200, page: 1 });
  const allIssues = useMemo(() => unwrapList<Issue>(issuesRaw.data), [issuesRaw.data]);

  const issues = useMemo(
    () => allIssues.filter((i) => effectiveChecked.has(i.statusId)),
    [allIssues, effectiveChecked],
  );

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const weeks: Date[][] = [];
  for (let i = 0; i < calDays.length; i += 7) {
    weeks.push(calDays.slice(i, i + 7));
  }

  const today = startOfDay(new Date());

  const dayMap = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    for (const issue of issues) {
      const s = parseDateOnly(issue.startDate);
      const d = parseDateOnly(issue.dueDate);
      if (!s && !d) continue;

      if (s && d && isSameDay(s, d)) {
        const key = format(s, 'yyyy-MM-dd');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ issue, type: 'both' });
      } else {
        if (s) {
          const key = format(s, 'yyyy-MM-dd');
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push({ issue, type: 'start' });
        }
        if (d) {
          const key = format(d, 'yyyy-MM-dd');
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push({ issue, type: 'end' });
        }
      }
    }
    return map;
  }, [issues]);

  const weekdayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

  const iconForType = (type: DayEntry['type']) => {
    if (type === 'start') return '⊙';
    if (type === 'end') return '⊘';
    return '◇';
  };

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-4">
      {identifier && <ProjectSubNav identifier={identifier} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{t('calendar.title')}</h1>

        <div className="flex items-center gap-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {allStatuses.map((s) => (
              <label key={s.id} className="flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={effectiveChecked.has(s.id)}
                  onChange={() => toggleStatus(s.id)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-gray-700">{s.name}</span>
              </label>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCursor(subMonths(cursor, 1))}
              className="p-2 rounded border border-gray-200 hover:bg-gray-50"
              aria-label="prev"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-medium w-32 text-center">
              {format(cursor, 'yyyy年M月', { locale })}
            </span>
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
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Weekday header */}
        <div className="grid grid-cols-7 text-center text-xs font-semibold border-b border-gray-200">
          {weekdayNames.map((name, idx) => {
            let cls = 'py-2 bg-gray-50 text-gray-600';
            if (idx === 0) cls = 'py-2 bg-red-50 text-red-500';
            if (idx === 6) cls = 'py-2 bg-blue-50 text-blue-500';
            return (
              <div key={name} className={cls}>
                {name}
              </div>
            );
          })}
        </div>

        {/* Calendar weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const isCurrentMonth = isSameMonth(day, cursor);
              const isTo = isSameDay(day, today);
              const dow = getDay(day);
              const entries = dayMap.get(key) ?? [];

              let cellBg = 'bg-white';
              if (dow === 0) cellBg = isCurrentMonth ? 'bg-red-50/40' : 'bg-red-50/20';
              else if (dow === 6) cellBg = isCurrentMonth ? 'bg-blue-50/40' : 'bg-blue-50/20';
              else if (!isCurrentMonth) cellBg = 'bg-gray-50/60';

              return (
                <div
                  key={key}
                  className={`border-b border-r border-gray-100 p-1.5 min-h-[110px] ${cellBg} ${isTo ? 'ring-2 ring-inset ring-primary-300 !bg-primary-50/50' : ''}`}
                >
                  <div className="mb-1">
                    <span
                      className={
                        isTo
                          ? 'inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-600 text-white text-xs font-bold'
                          : `text-sm font-medium ${
                              !isCurrentMonth
                                ? 'text-gray-400'
                                : dow === 0
                                  ? 'text-red-500'
                                  : dow === 6
                                    ? 'text-blue-500'
                                    : 'text-gray-700'
                            }`
                      }
                    >
                      {format(day, 'd')}
                    </span>
                  </div>

                  {entries.length > 0 && (
                    <ul className="space-y-0.5">
                      {entries.map((entry) => (
                        <li key={`${entry.issue.id}-${entry.type}`}>
                          <Link
                            to={`/projects/${identifier}/issues/${entry.issue.id}`}
                            className="group flex items-start gap-1 rounded px-1 py-0.5 text-[11px] leading-tight hover:bg-amber-50 transition-colors"
                            title={`#${entry.issue.number} ${entry.issue.subject} (${entry.issue.tracker?.name ?? ''})`}
                          >
                            <span className="shrink-0 text-gray-400 mt-px">{iconForType(entry.type)}</span>
                            <span className="text-primary-700 group-hover:underline min-w-0">
                              <span className="text-gray-500">{entry.issue.project?.name ?? identifier}</span>
                              {' - '}
                              <span className="text-gray-400">{entry.issue.tracker?.name}</span>
                              {' '}
                              <span className="font-medium">#{entry.issue.number}: {entry.issue.subject}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="text-xs text-gray-500 space-y-0.5 px-1">
        <div>⊙ この日に開始するチケット</div>
        <div>⊘ この日に終了するチケット</div>
        <div>◇ この日に開始・終了するチケット</div>
      </div>
    </div>
  );
}
