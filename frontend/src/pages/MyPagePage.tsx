import { useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react';
import { useMe, useAllIssues, useMyProjects, useMyWatchers } from '../api/hooks';
import type { Issue, MyParticipatingProject, MyWatcherItem, User } from '../types';
import { formatEstimatedEffort } from '../utils/estimatedEffort';

const EMPTY_MARK = '—';

const ISSUE_SORT_KEYS = [
  'number',
  'tracker',
  'subject',
  'parentNumber',
  'status',
  'assignee',
  'priority',
  'estimatedHours',
  'spentHours',
  'createdAt',
  'dueDate',
  'updatedAt',
] as const;

type IssueSortKey = (typeof ISSUE_SORT_KEYS)[number];
type SortOrder = 'asc' | 'desc';
type IssueSortState = { key: IssueSortKey; order: SortOrder };

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

function priorityBadge(p: number) {
  const map: Record<number, string> = {
    1: 'bg-slate-100 text-slate-600 ring-slate-200',
    2: 'bg-sky-50 text-sky-700 ring-sky-200',
    3: 'bg-amber-50 text-amber-700 ring-amber-200',
    4: 'bg-orange-50 text-orange-700 ring-orange-200',
    5: 'bg-red-50 text-red-700 ring-red-200',
  };
  return map[p] ?? map[2];
}

function shortDate(value: string | null | undefined) {
  if (!value) return EMPTY_MARK;
  try {
    return format(parseISO(value), 'M/d');
  } catch {
    return EMPTY_MARK;
  }
}

function formatHours(value: number | null | undefined) {
  return typeof value === 'number' ? formatEstimatedEffort(value, 'hours') : EMPTY_MARK;
}

function assigneeName(issue: Issue) {
  if (issue.assignee) {
    return `${issue.assignee.lastname ?? ''} ${issue.assignee.firstname ?? ''}`.trim() || issue.assignee.login;
  }
  if (issue.assigneeGroup) return `[グループ] ${issue.assigneeGroup.name}`;
  return EMPTY_MARK;
}

function issueSortValue(issue: Issue, key: IssueSortKey): string | number {
  switch (key) {
    case 'number':
      return issue.number ?? 0;
    case 'tracker':
      return issue.tracker?.name ?? '';
    case 'subject':
      return issue.subject ?? '';
    case 'parentNumber':
      return issue.parent?.number ?? 0;
    case 'status':
      return issue.status?.name ?? '';
    case 'assignee':
      return assigneeName(issue);
    case 'priority':
      return issue.priority ?? 0;
    case 'estimatedHours':
      return issue.estimatedHours ?? -1;
    case 'spentHours':
      return issue.spentHours ?? 0;
    case 'createdAt':
    case 'dueDate':
    case 'updatedAt': {
      const value = issue[key];
      return value ? Date.parse(value) || 0 : 0;
    }
    default:
      return '';
  }
}

function sortIssues(issues: Issue[], sort: IssueSortState) {
  const direction = sort.order === 'asc' ? 1 : -1;
  return [...issues].sort((a, b) => {
    const av = issueSortValue(a, sort.key);
    const bv = issueSortValue(b, sort.key);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * direction;
    return String(av).localeCompare(String(bv), 'ja') * direction;
  });
}

function watcherTypeLabel(type: MyWatcherItem['watchableType']): string {
  const labels: Record<MyWatcherItem['watchableType'], string> = {
    Issue: 'チケット',
    Board: 'フォーラム',
    Message: 'トピック',
    WikiPage: 'Wiki',
  };
  return labels[type];
}

export default function MyPagePage() {
  const { t } = useTranslation();
  const { data: meRaw } = useMe();
  const me = unwrap<User>(meRaw);

  const assignedParams = useMemo(() => (me ? { assignee: me.id, closed: 'false' } : undefined), [me]);
  const reportedParams = useMemo(() => (me ? { author: me.id, closed: 'false' } : undefined), [me]);
  const assignedQ = useAllIssues(assignedParams, { enabled: !!me });
  const reportedQ = useAllIssues(reportedParams, { enabled: !!me });
  const watchersQ = useMyWatchers();
  const projectsQ = useMyProjects();

  const assigned = useMemo(() => unwrapList<Issue>(assignedQ.data), [assignedQ.data]);
  const reported = useMemo(() => unwrapList<Issue>(reportedQ.data), [reportedQ.data]);
  const watchers = useMemo(() => unwrapList<MyWatcherItem>(watchersQ.data), [watchersQ.data]);
  const projects = useMemo(() => unwrapList<MyParticipatingProject>(projectsQ.data), [projectsQ.data]);

  const [collProjects, setCollProjects] = useState(false);
  const [collAssigned, setCollAssigned] = useState(false);
  const [collReported, setCollReported] = useState(false);
  const [collWatchers, setCollWatchers] = useState(false);
  const [assignedSort, setAssignedSort] = useState<IssueSortState>({ key: 'updatedAt', order: 'desc' });
  const [reportedSort, setReportedSort] = useState<IssueSortState>({ key: 'updatedAt', order: 'desc' });
  const sortedAssigned = useMemo(() => sortIssues(assigned, assignedSort), [assigned, assignedSort]);
  const sortedReported = useMemo(() => sortIssues(reported, reportedSort), [reported, reportedSort]);

  const projectLink = (i: Issue) =>
    i.project?.identifier ? `/projects/${i.project.identifier}/issues/${i.id}` : `/issues/${i.id}`;

  const toggleIssueSort = (
    current: IssueSortState,
    setSort: Dispatch<SetStateAction<IssueSortState>>,
    key: IssueSortKey,
  ) => {
    setSort({ key, order: current.key === key && current.order === 'asc' ? 'desc' : 'asc' });
  };

  const IssueTable = ({
    issues,
    sort,
    onSort,
  }: {
    issues: Issue[];
    sort: IssueSortState;
    onSort: (key: IssueSortKey) => void;
  }) => {
    const sortableHeader = (key: IssueSortKey, label: ReactNode, className: string) => (
      <th className={className}>
        <button
          type="button"
          onClick={() => onSort(key)}
          className="inline-flex items-center gap-1 text-left hover:text-primary-700"
        >
          {label}
          {sort.key === key ? (
            sort.order === 'asc'
              ? <ArrowUp className="h-3 w-3" aria-hidden />
              : <ArrowDown className="h-3 w-3" aria-hidden />
          ) : null}
        </button>
      </th>
    );

    return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead>
          <tr className="bg-slate-100 text-left text-xs text-slate-600">
            {sortableHeader('number', 'No', 'w-16 px-2 py-3 font-semibold text-slate-700')}
            {sortableHeader('tracker', t('issues.tracker'), 'w-24 px-2 py-3 font-semibold text-slate-700')}
            {sortableHeader('subject', t('issues.subjectColumn'), 'min-w-64 px-2 py-3 font-semibold text-slate-700')}
            {sortableHeader('parentNumber', t('issues.parent'), 'w-28 px-2 py-3 font-semibold text-slate-700')}
            {sortableHeader('status', t('issues.status'), 'w-24 px-2 py-3 font-semibold text-slate-700')}
            {sortableHeader('assignee', t('issues.assignee'), 'w-32 px-2 py-3 font-semibold text-slate-700')}
            {sortableHeader('priority', t('issues.priority'), 'w-24 px-2 py-3 font-semibold text-slate-700')}
            {sortableHeader('estimatedHours', t('issues.estimatedHours'), 'w-24 px-2 py-3 font-semibold text-slate-700')}
            {sortableHeader('spentHours', '実績工数', 'w-24 px-2 py-3 font-semibold text-slate-700')}
            {sortableHeader('createdAt', '登録日', 'w-20 px-2 py-3 font-semibold text-slate-700')}
            {sortableHeader('dueDate', t('issues.dueDate'), 'w-20 px-2 py-3 font-semibold text-slate-700')}
            {sortableHeader('updatedAt', '更新日', 'w-20 px-2 py-3 font-semibold text-slate-700')}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {issues.map((issue, idx) => {
            const parentLabel = issue.parent
              ? `${issue.parent.number ? `#${issue.parent.number} ` : ''}${issue.parent.subject}`.trim()
              : EMPTY_MARK;
            return (
            <tr key={issue.id} className={`${idx % 2 === 1 ? 'bg-slate-50/50' : ''} hover:bg-slate-100/60`}>
              <td className="whitespace-nowrap px-2 py-2 font-mono text-xs">
                <Link to={projectLink(issue)} className="text-primary-600 hover:underline">
                  #{issue.number ?? EMPTY_MARK}
                </Link>
              </td>
              <td className="max-w-28 truncate px-2 py-2 text-slate-700" title={issue.tracker?.name ?? undefined}>
                {issue.tracker?.name ?? EMPTY_MARK}
              </td>
              <td className="min-w-64 px-2 py-2">
                <Link to={projectLink(issue)} className="font-medium text-slate-900 hover:text-primary-700" title={issue.project?.name ?? undefined}>
                  {issue.subject}
                </Link>
              </td>
              <td className="max-w-32 truncate px-2 py-2 text-xs text-slate-600" title={parentLabel !== EMPTY_MARK ? parentLabel : undefined}>
                {issue.parent ? (
                  <Link to={projectLink({ ...issue, id: issue.parent.id } as Issue)} className="hover:text-primary-700 hover:underline">
                    #{issue.parent.number ?? EMPTY_MARK}
                  </Link>
                ) : EMPTY_MARK}
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-slate-700">{issue.status?.name ?? EMPTY_MARK}</td>
              <td className="max-w-32 truncate px-2 py-2 text-slate-700" title={assigneeName(issue)}>
                {assigneeName(issue)}
              </td>
              <td className="whitespace-nowrap px-2 py-2">
                <span className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${priorityBadge(issue.priority)}`}>
                  {t(`issues.priorities.${issue.priority}` as const)}
                </span>
              </td>
              <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-600">{formatHours(issue.estimatedHours)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-600">{formatHours(issue.spentHours ?? 0)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-500">{shortDate(issue.createdAt)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-500">{shortDate(issue.dueDate)}</td>
              <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-500">{shortDate(issue.updatedAt)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
      {issues.length === 0 && (
        <p className="px-3 py-4 text-center text-sm text-slate-400">{t('app.noData')}</p>
      )}
    </div>
    );
  };

  const WatcherTable = ({ items }: { items: MyWatcherItem[] }) => (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-100 text-left text-xs text-slate-600">
            <th className="px-3 py-1.5 font-medium w-28">種類</th>
            <th className="px-3 py-1.5 font-medium">{t('nav.projects')}</th>
            <th className="px-3 py-1.5 font-medium">タイトル</th>
            <th className="px-3 py-1.5 font-medium">内容</th>
            <th className="px-3 py-1.5 font-medium whitespace-nowrap">更新日</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item, idx) => (
            <tr key={item.id} className={`${idx % 2 === 1 ? 'bg-slate-50/50' : ''} hover:bg-slate-100/60`}>
              <td className="px-3 py-1.5 text-slate-600">{watcherTypeLabel(item.watchableType)}</td>
              <td className="px-3 py-1.5 text-slate-600">
                <Link to={`/projects/${item.project.identifier}`} className="hover:underline">
                  {item.project.name ?? item.project.identifier}
                </Link>
              </td>
              <td className="px-3 py-1.5">
                <Link to={item.url} className="text-primary-600 hover:underline">
                  {item.title}
                </Link>
              </td>
              <td className="max-w-md truncate px-3 py-1.5 text-slate-500">
                {item.subtitle?.trim() || '-'}
              </td>
              <td className="px-3 py-1.5 text-xs text-slate-500 whitespace-nowrap">
                {item.updatedAt ? format(parseISO(item.updatedAt), 'yyyy-MM-dd HH:mm') : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
        <p className="px-3 py-4 text-center text-sm text-slate-400">{t('app.noData')}</p>
      )}
    </div>
  );

  const ProjectTable = ({ items }: { items: MyParticipatingProject[] }) => (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-100 text-left text-xs text-slate-600">
            <th className="px-3 py-1.5 font-medium">{t('nav.projects')}</th>
            <th className="px-3 py-1.5 font-medium">{t('projects.description')}</th>
            <th className="px-3 py-1.5 font-medium">子プロジェクト</th>
            <th className="px-3 py-1.5 font-medium">{t('members.roles')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((project, idx) => (
            <tr key={project.projectId} className={`${idx % 2 === 1 ? 'bg-slate-50/50' : ''} hover:bg-slate-100/60`}>
              <td className="px-3 py-1.5 text-slate-600">
                <Link to={`/projects/${project.projectIdentifier}`} className="text-primary-600 hover:underline">
                  {project.projectName}
                </Link>
              </td>
              <td className="px-3 py-1.5 text-slate-600">{project.description?.trim() || '—'}</td>
              <td className="px-3 py-1.5 text-slate-600">{project.childProjectNames.join(', ') || '—'}</td>
              <td className="px-3 py-1.5 text-slate-600">{project.roles.join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && (
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

      {/* Participating projects */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <SectionHeader
          label="参加しているプロジェクト"
          count={projects.length}
          collapsed={collProjects}
          onToggle={() => setCollProjects((v) => !v)}
        />
        {!collProjects && (
          projectsQ.isLoading ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">{t('app.loading')}</p>
          ) : (
            <ProjectTable items={projects} />
          )
        )}
      </section>

      {/* Assigned to me */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <SectionHeader
          label={t('myPage.assignedToMe')}
          count={assigned.length}
          collapsed={collAssigned}
          onToggle={() => setCollAssigned((v) => !v)}
        />
        {!collAssigned && (
          <IssueTable
            issues={sortedAssigned}
            sort={assignedSort}
            onSort={(key) => toggleIssueSort(assignedSort, setAssignedSort, key)}
          />
        )}
      </section>

      {/* Watched content */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <SectionHeader
          label="ウォッチしているコンテンツ"
          count={watchers.length}
          collapsed={collWatchers}
          onToggle={() => setCollWatchers((v) => !v)}
        />
        {!collWatchers && (
          watchersQ.isLoading ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">{t('app.loading')}</p>
          ) : (
            <WatcherTable items={watchers} />
          )
        )}
      </section>

      {/* Reported by me */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <SectionHeader
          label={t('myPage.reportedByMe')}
          count={reported.length}
          collapsed={collReported}
          onToggle={() => setCollReported((v) => !v)}
        />
        {!collReported && (
          <IssueTable
            issues={sortedReported}
            sort={reportedSort}
            onSort={(key) => toggleIssueSort(reportedSort, setReportedSort, key)}
          />
        )}
      </section>
    </div>
  );
}
