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
import { ChevronLeft, ChevronRight, CircleArrowLeft, CircleArrowRight, Diamond } from 'lucide-react';
import { useAllProjectIssues, useStatuses } from '../api/hooks';
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

function addDayEntry(map: Map<string, DayEntry[]>, date: Date, entry: DayEntry) {
  const key = format(date, 'yyyy-MM-dd');
  if (!map.has(key)) map.set(key, []);
  map.get(key)!.push(entry);
}

function formatDateLabel(value: string | null | undefined) {
  const date = parseDateOnly(value);
  return date ? format(date, 'yyyy/MM/dd') : '-';
}

function userName(user: Issue['assignee']) {
  if (!user) return '-';
  const fullName = [user.lastname, user.firstname].filter(Boolean).join(' ').trim();
  return fullName || user.login || '-';
}

function assigneeName(issue: Issue) {
  if (issue.assigneeGroup) return issue.assigneeGroup.name;
  return userName(issue.assignee);
}

function priorityLabel(priority: number | null | undefined) {
  switch (priority) {
    case 1:
      return '低め';
    case 2:
      return '通常';
    case 3:
      return '高め';
    case 4:
      return '急いで';
    case 5:
      return '今すぐ';
    default:
      return '-';
  }
}

function entryTypeOrder(type: DayEntry['type']) {
  if (type === 'start') return 0;
  if (type === 'both') return 1;
  return 2;
}

function iconForType(type: DayEntry['type']) {
  if (type === 'start') return <CircleArrowRight size={15} strokeWidth={2.4} />;
  if (type === 'end') return <CircleArrowLeft size={15} strokeWidth={2.4} />;
  return <Diamond size={14} strokeWidth={2.2} />;
}

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

  const issuesRaw = useAllProjectIssues(identifier ?? '');
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
      const start = parseDateOnly(issue.startDate);
      const due = parseDateOnly(issue.dueDate);
      if (!start && !due) continue;

      if (start && due && isSameDay(start, due)) {
        addDayEntry(map, start, { issue, type: 'both' });
        continue;
      }

      if (start) addDayEntry(map, start, { issue, type: 'start' });
      if (due) addDayEntry(map, due, { issue, type: 'end' });
    }

    for (const entries of map.values()) {
      entries.sort(
        (a, b) =>
          entryTypeOrder(a.type) - entryTypeOrder(b.type) ||
          (a.issue.number ?? 0) - (b.issue.number ?? 0) ||
          a.issue.subject.localeCompare(b.issue.subject, 'ja'),
      );
    }
    return map;
  }, [issues]);

  const weekdayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

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

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 text-center text-xs font-semibold border-b border-gray-200">
          {weekdayNames.map((name, idx) => {
            let cls = 'py-2 bg-gray-50 text-gray-600';
            if (idx === 0) cls = 'py-2 bg-red-50 text-red-500 rounded-tl-lg';
            if (idx === 6) cls = 'py-2 bg-blue-50 text-blue-500 rounded-tr-lg';
            return (
              <div key={name} className={cls}>
                {name}
              </div>
            );
          })}
        </div>

        {weeks.map((week, wi) => {
          const maxEntries = Math.max(
            0,
            ...week.map((day) => dayMap.get(format(day, 'yyyy-MM-dd'))?.length ?? 0),
          );
          const rowMinHeight = Math.max(110, 36 + maxEntries * 52);

          return (
            <div key={wi} className="relative grid grid-cols-7" style={{ minHeight: rowMinHeight }}>
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
                    className={`relative z-0 border-b border-r border-gray-100 p-1.5 hover:z-30 ${cellBg} ${
                      isTo ? 'ring-2 ring-inset ring-primary-300 !bg-primary-50/50' : ''
                    }`}
                    style={{ minHeight: rowMinHeight }}
                  >
                    <div className="relative z-0 mb-1">
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
                      <ul className="relative z-10 space-y-1">
                        {entries.map((entry) => (
                          <li key={`${entry.issue.id}-${entry.type}`} className="group relative z-20 hover:z-40">
                            <Link
                              to={`/projects/${identifier}/issues/${entry.issue.id}`}
                              className="flex min-h-[42px] items-start gap-1 rounded border border-yellow-200 bg-yellow-50 px-1.5 py-1 text-[11px] leading-tight text-slate-900 shadow-sm hover:border-yellow-300 hover:bg-yellow-100"
                              aria-label={`#${entry.issue.number} ${entry.issue.subject}`}
                            >
                              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-slate-700">
                                {iconForType(entry.type)}
                              </span>
                              <span className="min-w-0 text-primary-700 hover:underline">
                                <span>{entry.issue.tracker?.name ?? 'チケット'} #{entry.issue.number}:</span>
                                {' '}
                                <span className="font-medium">{entry.issue.subject}</span>
                              </span>
                            </Link>
                            <div className="pointer-events-none absolute left-0 top-full z-[100] mt-1 hidden w-64 border border-slate-500 bg-white p-2 text-xs leading-tight text-slate-900 shadow-lg group-hover:block">
                              <div className="mb-2 text-primary-700">
                                {entry.issue.tracker?.name ?? 'チケット'} #{entry.issue.number}: {entry.issue.subject}
                              </div>
                              <dl className="space-y-0.5">
                                <div className="flex gap-1">
                                  <dt className="shrink-0">プロジェクト:</dt>
                                  <dd className="min-w-0 truncate">{entry.issue.project?.name ?? identifier}</dd>
                                </div>
                                <div className="flex gap-1">
                                  <dt className="shrink-0">ステータス:</dt>
                                  <dd>{entry.issue.status?.name ?? '-'}</dd>
                                </div>
                                <div className="flex gap-1">
                                  <dt className="shrink-0">開始日:</dt>
                                  <dd>{formatDateLabel(entry.issue.startDate)}</dd>
                                </div>
                                <div className="flex gap-1">
                                  <dt className="shrink-0">期日:</dt>
                                  <dd>{formatDateLabel(entry.issue.dueDate)}</dd>
                                </div>
                                <div className="flex gap-1">
                                  <dt className="shrink-0">担当者:</dt>
                                  <dd className="min-w-0 truncate">{assigneeName(entry.issue)}</dd>
                                </div>
                                <div className="flex gap-1">
                                  <dt className="shrink-0">優先度:</dt>
                                  <dd>{priorityLabel(entry.issue.priority)}</dd>
                                </div>
                              </dl>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
