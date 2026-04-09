import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import {
  addMonths,
  differenceInCalendarDays,
  eachMonthOfInterval,
  format,
  max,
  min,
  parseISO,
  startOfMonth,
} from 'date-fns';
import { useProject, useProjectIssues, useTrackers, useStatuses } from '../api/hooks';
import type { Issue, Tracker, IssueStatus } from '../types';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

const trackerColors = ['bg-blue-500', 'bg-violet-500', 'bg-teal-500', 'bg-orange-500', 'bg-pink-500', 'bg-cyan-500'];
const statusColors = ['bg-slate-400', 'bg-amber-500', 'bg-emerald-500', 'bg-rose-500', 'bg-indigo-500'];

export default function GanttPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();

  const { data: projectRaw } = useProject(identifier ?? '');
  const project =
    projectRaw && typeof projectRaw === 'object' && 'id' in projectRaw ? (projectRaw as { id: string }) : null;
  const projectId = project?.id ?? '';

  const issuesRaw = useProjectIssues(projectId);
  const trackersRaw = useTrackers();
  const statusesRaw = useStatuses();

  const issues = useMemo(() => unwrapList<Issue>(issuesRaw.data), [issuesRaw.data]);
  const trackers = useMemo(() => unwrapList<Tracker>(trackersRaw.data), [trackersRaw.data]);
  const statuses = useMemo(() => unwrapList<IssueStatus>(statusesRaw.data), [statusesRaw.data]);

  const ganttIssues = useMemo(
    () => issues.filter((i) => i.startDate && i.dueDate),
    [issues],
  );

  const [colorMode, setColorMode] = useState<'tracker' | 'status'>('tracker');

  const trackerMap = useMemo(() => {
    const m = new Map<string, string>();
    trackers.forEach((tr, idx) => m.set(tr.id, trackerColors[idx % trackerColors.length]));
    return m;
  }, [trackers]);

  const statusMap = useMemo(() => {
    const m = new Map<string, string>();
    statuses.forEach((s, idx) => m.set(s.id, statusColors[idx % statusColors.length]));
    return m;
  }, [statuses]);

  const barColor = (i: Issue) => {
    if (colorMode === 'status') return statusMap.get(i.statusId) ?? 'bg-gray-400';
    return trackerMap.get(i.trackerId) ?? 'bg-primary-600';
  };

  const range = useMemo(() => {
    if (ganttIssues.length === 0) return null;
    const starts = ganttIssues.map((i) => parseISO(i.startDate!));
    const ends = ganttIssues.map((i) => parseISO(i.dueDate!));
    const from = min(starts);
    const to = max(ends);
    return { from: startOfMonth(from), to: startOfMonth(addMonths(to, 1)) };
  }, [ganttIssues]);

  const months = useMemo(() => {
    if (!range) return [];
    return eachMonthOfInterval({ start: range.from, end: range.to });
  }, [range]);

  const totalDays = range ? Math.max(1, differenceInCalendarDays(range.to, range.from)) : 1;

  const barStyle = (i: Issue) => {
    if (!range || !i.startDate || !i.dueDate) return { left: '0%', width: '0%' };
    const s = parseISO(i.startDate);
    const e = parseISO(i.dueDate);
    const left = (differenceInCalendarDays(s, range.from) / totalDays) * 100;
    const width = (Math.max(1, differenceInCalendarDays(e, s)) / totalDays) * 100;
    return { left: `${Math.max(0, left)}%`, width: `${Math.min(100 - left, width)}%` };
  };

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-4">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">{t('gantt.title')}</h1>
        <div className="flex rounded-lg border border-gray-200 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setColorMode('tracker')}
            className={`px-2 py-1 rounded ${colorMode === 'tracker' ? 'bg-primary-600 text-white' : 'text-gray-600'}`}
          >
            {t('issues.tracker')}
          </button>
          <button
            type="button"
            onClick={() => setColorMode('status')}
            className={`px-2 py-1 rounded ${colorMode === 'status' ? 'bg-primary-600 text-white' : 'text-gray-600'}`}
          >
            {t('issues.status')}
          </button>
        </div>
      </div>

      {!range ? (
        <p className="text-gray-500">{t('app.noData')}</p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-x-auto">
          <div className="min-w-[720px] p-4">
            <div className="flex border-b border-gray-200 pb-2 mb-2">
              <div className="w-48 shrink-0 text-xs font-medium text-gray-500">{t('issues.subject')}</div>
              <div className="flex-1 flex">
                {months.map((m) => (
                  <div key={m.toISOString()} className="flex-1 text-center text-xs text-gray-600 border-l border-gray-100 first:border-l-0">
                    {format(m, 'MMM yyyy')}
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {ganttIssues.map((i) => (
                <div key={i.id} className="flex items-center min-h-8">
                  <div className="w-48 shrink-0 pr-2 text-xs truncate">
                    <Link to={`/projects/${identifier}/issues/${i.id}`} className="text-primary-700 hover:underline">
                      {i.subject}
                    </Link>
                  </div>
                  <div className="flex-1 relative h-6 bg-gray-50 rounded">
                    <div
                      className={`absolute top-1 h-4 rounded ${barColor(i)} opacity-90`}
                      style={barStyle(i)}
                      title={`${i.startDate} → ${i.dueDate}`}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-gray-500">
              {colorMode === 'tracker' ? t('issues.tracker') : t('issues.status')} — legend:{' '}
              {colorMode === 'tracker'
                ? trackers.map((tr) => (
                    <span key={tr.id} className="inline-flex items-center gap-1 ml-2">
                      <span className={`inline-block w-3 h-3 rounded ${trackerMap.get(tr.id)}`} />
                      {tr.name}
                    </span>
                  ))
                : statuses.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1 ml-2">
                      <span className={`inline-block w-3 h-3 rounded ${statusMap.get(s.id)}`} />
                      {s.name}
                    </span>
                  ))}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
