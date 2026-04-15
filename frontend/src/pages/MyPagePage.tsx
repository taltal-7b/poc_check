import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight } from 'lucide-react';
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

function priorityClass(p: number): string {
  const map: Record<number, string> = {
    1: 'text-slate-500',
    2: '',
    3: 'text-amber-700 font-medium',
    4: 'text-orange-700 font-semibold',
    5: 'text-red-700 font-bold',
  };
  return map[p] ?? '';
}

export default function MyPagePage() {
  const { t } = useTranslation();
  const { data: meRaw } = useMe();
  const me = unwrap<User>(meRaw);

  const assignedQ = useIssues(
    me ? { assignee: me.id, closed: 'false', per_page: 50 } : undefined,
    { enabled: !!me },
  );
  const reportedQ = useIssues(
    me ? { author: me.id, closed: 'true', per_page: 50 } : undefined,
    { enabled: !!me },
  );

  const assigned = useMemo(() => unwrapList<Issue>(assignedQ.data), [assignedQ.data]);
  const reported = useMemo(() => unwrapList<Issue>(reportedQ.data), [reportedQ.data]);

  const [collAssigned, setCollAssigned] = useState(false);
  const [collReported, setCollReported] = useState(false);

  const projectLink = (i: Issue) =>
    i.project?.identifier ? `/projects/${i.project.identifier}/issues/${i.id}` : `/issues/${i.id}`;

  const IssueTable = ({ issues }: { issues: Issue[] }) => (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-100 text-left text-xs text-slate-600">
            <th className="px-3 py-1.5 font-medium w-16">#</th>
            <th className="px-3 py-1.5 font-medium">{t('nav.projects')}</th>
            <th className="px-3 py-1.5 font-medium">{t('issues.tracker')}</th>
            <th className="px-3 py-1.5 font-medium">{t('issues.subject')}</th>
            <th className="px-3 py-1.5 font-medium">{t('issues.status')}</th>
            <th className="px-3 py-1.5 font-medium">{t('issues.priority')}</th>
            <th className="px-3 py-1.5 font-medium">{t('issues.dueDate')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {issues.map((issue, idx) => (
            <tr key={issue.id} className={`${idx % 2 === 1 ? 'bg-slate-50/50' : ''} hover:bg-slate-100/60 ${priorityClass(issue.priority)}`}>
              <td className="px-3 py-1.5">
                <Link to={projectLink(issue)} className="text-primary-600 hover:underline">
                  {(issue as Issue & { number?: number }).number ?? '—'}
                </Link>
              </td>
              <td className="px-3 py-1.5 text-slate-600">
                {issue.project?.identifier ? (
                  <Link to={`/projects/${issue.project.identifier}`} className="hover:underline">
                    {issue.project.name ?? issue.project.identifier}
                  </Link>
                ) : '—'}
              </td>
              <td className="px-3 py-1.5 text-slate-600">{issue.tracker?.name ?? '—'}</td>
              <td className="px-3 py-1.5">
                <Link to={projectLink(issue)} className="text-primary-600 hover:underline">
                  {issue.subject}
                </Link>
              </td>
              <td className="px-3 py-1.5 text-slate-600">{issue.status?.name ?? '—'}</td>
              <td className="px-3 py-1.5">{t(`issues.priorities.${issue.priority}` as const)}</td>
              <td className="px-3 py-1.5 text-slate-500 text-xs">
                {issue.dueDate ? format(parseISO(issue.dueDate), 'yyyy-MM-dd') : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {issues.length === 0 && (
        <p className="px-3 py-4 text-center text-sm text-slate-400">{t('app.noData')}</p>
      )}
    </div>
  );

  const SectionHeader = ({
    label,
    count,
    collapsed,
    onToggle,
  }: { label: string; count: number; collapsed: boolean; onToggle: () => void }) => (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1 rounded-t bg-slate-200/60 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
    >
      {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
      {label}
      <span className="ml-1 text-xs font-normal text-slate-500">({count})</span>
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('myPage.title')}</h1>
        {me && (
          <p className="text-sm text-slate-500">
            {me.lastname} {me.firstname} ({me.login})
          </p>
        )}
      </div>

      {/* Assigned to me */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <SectionHeader
          label={t('myPage.assignedToMe')}
          count={assigned.length}
          collapsed={collAssigned}
          onToggle={() => setCollAssigned((v) => !v)}
        />
        {!collAssigned && <IssueTable issues={assigned} />}
      </section>

      {/* Reported by me */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <SectionHeader
          label={t('myPage.reportedByMe')}
          count={reported.length}
          collapsed={collReported}
          onToggle={() => setCollReported((v) => !v)}
        />
        {!collReported && <IssueTable issues={reported} />}
      </section>
    </div>
  );
}
