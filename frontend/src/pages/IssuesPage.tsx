import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Rss } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import { useIssues, useProjectIssues, useStatuses, useTrackers, useMembers, useProject } from '../api/hooks';
import { useAuthStore } from '../stores/auth';
import ProjectSubNav from '../components/ProjectSubNav';
import type { Issue } from '../types';

const PER_PAGE = 10;
const EMPTY_MARK = '\uFF0D';

function priorityBadge(p: number) {
  const map: Record<number, string> = {
    1: 'bg-slate-100 text-slate-700 ring-slate-500/20',
    2: 'bg-sky-100 text-sky-800 ring-sky-600/20',
    3: 'bg-amber-100 text-amber-900 ring-amber-600/20',
    4: 'bg-orange-100 text-orange-900 ring-orange-600/20',
    5: 'bg-red-100 text-red-800 ring-red-600/20',
  };
  return map[p] ?? 'bg-slate-100 text-slate-700 ring-slate-500/20';
}


export default function IssuesPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.user);
  const locale = ja;

  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1);
  const trackerId = searchParams.get('trackerId') || '';
  const statusId = searchParams.get('statusId') || '';
  const priority = searchParams.get('priority') || '';
  const assignee = searchParams.get('assignee') || '';

  const queryParams = useMemo(
    () => {
      const trimmedAssignee = assignee.trim();
      return {
        page,
        perPage: PER_PAGE,
        ...(trackerId ? { tracker: trackerId } : {}),
        ...(statusId ? { status: statusId } : {}),
        ...(priority ? { priority: Number(priority) } : {}),
        ...(trimmedAssignee.startsWith('group:')
          ? { assignee_group: trimmedAssignee.slice(6) }
          : trimmedAssignee.startsWith('user:')
            ? { assignee: trimmedAssignee.slice(5) }
            : trimmedAssignee ? { assignee: trimmedAssignee } : {}),
      };
    },
    [page, trackerId, statusId, priority, assignee],
  );

  const atomUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (trackerId) params.set('tracker', trackerId);
    if (statusId) params.set('status', statusId);
    if (priority) params.set('priority', priority);
    if (assignee.trim().startsWith('group:')) params.set('assignee_group', assignee.trim().slice(6));
    else if (assignee.trim().startsWith('user:')) params.set('assignee', assignee.trim().slice(5));
    else if (assignee.trim()) params.set('assignee', assignee.trim());
    params.set('limit', '100');
    const qs = params.toString();
    const base = identifier
      ? `/api/v1/projects/${identifier}/issues/atom`
      : '/api/v1/issues/atom';
    return `${base}${qs ? `?${qs}` : ''}`;
  }, [identifier, trackerId, statusId, priority, assignee]);

  const globalQuery = useIssues(queryParams, { enabled: !identifier });
  const projectQuery = useProjectIssues(identifier ?? '', queryParams, { enabled: !!identifier });

  const active = identifier ? projectQuery : globalQuery;
  const { data, isLoading, isError } = active;
  const projectDetailQuery = useProject(identifier ?? '', {
    enabled: Boolean(identifier && isAuthenticated && currentUser?.id),
    refetchOnMount: 'always',
    cacheScope: currentUser?.id ?? 'signed-out',
  });
  const canCreateIssue = identifier ? Boolean(projectDetailQuery.data?.data.permissions?.canCreateIssue) : false;
  const canShowProjectCreateButton =
    Boolean(identifier) &&
    isAuthenticated &&
    Boolean(currentUser?.id) &&
    projectDetailQuery.isSuccess &&
    canCreateIssue;

  const issues: Issue[] = data?.data ?? [];
  const pagination = data?.pagination;

  const trackersQuery = useTrackers();
  const statusesQuery = useStatuses();
  const trackers = trackersQuery.data?.data ?? [];
  const statuses = statusesQuery.data?.data ?? [];

  const membersQuery = useMembers(identifier ?? '');
  const members = identifier ? (membersQuery.data?.data ?? []) : [];
  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>();
    return members.flatMap((member) => {
      if (member.user) {
        const value = `user:${member.user.id}`;
        if (seen.has(value)) return [];
        seen.add(value);
        const label = member.user.firstname && member.user.lastname
          ? `${member.user.lastname} ${member.user.firstname}`
          : member.user.login;
        return [{ value, label }];
      }
      if (member.group) {
        const value = `group:${member.group.id}`;
        if (seen.has(value)) return [];
        seen.add(value);
        return [{ value, label: `[グループ] ${member.group.name}` }];
      }
      return [];
    });
  }, [members]);

  const setFilter = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      next.set('page', '1');
      return next;
    });
  };

  const setPage = (p: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(p));
      return next;
    });
  };

  const newIssueTo = identifier ? `/projects/${identifier}/issues/new` : '/projects';

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('issues.title')}</h1>
        {(canShowProjectCreateButton || (!identifier && isAuthenticated)) && (
          <Link
            to={newIssueTo}
            className="inline-flex justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700"
          >
            {identifier ? t('issues.new') : t('projects.title')}
          </Link>
        )}
      </div>

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t('issues.tracker')}</label>
          <select
            value={trackerId}
            onChange={(e) => setFilter('trackerId', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">{EMPTY_MARK}</option>
            {trackers.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t('issues.status')}</label>
          <select
            value={statusId}
            onChange={(e) => setFilter('statusId', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">{EMPTY_MARK}</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t('issues.priority')}</label>
          <select
            value={priority}
            onChange={(e) => setFilter('priority', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">{EMPTY_MARK}</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={String(n)}>
                {t(`issues.priorities.${n}` as const)}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 lg:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-500">{t('issues.assignee')}</label>
          <select
            value={assignee}
            onChange={(e) => setFilter('assignee', e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
          >
            <option value="">{EMPTY_MARK}</option>
            {assigneeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && <p className="text-slate-500">{t('app.loading')}</p>}
      {isError && <p className="text-red-600">{t('app.error')}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-3 text-left font-semibold text-slate-700">{t('issues.number')}</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-700">{t('issues.tracker')}</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-700">{t('issues.subject')}</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-700">{t('issues.status')}</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-700">{t('issues.priority')}</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-700">{t('issues.assignee')}</th>
                <th className="px-3 py-3 text-left font-semibold text-slate-700" title="updatedAt">
                  <Clock className="h-4 w-4 text-slate-500" aria-hidden />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {issues.map((issue) => {
                const to =
                  identifier && issue.id
                    ? `/projects/${identifier}/issues/${issue.id}`
                    : `/issues/${issue.id}`;
                return (
                  <tr key={issue.id} className="hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-sm text-slate-600">
                      <Link to={to} className="text-primary-600 hover:underline">
                        #{issue.number || EMPTY_MARK}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{issue.tracker?.name ?? EMPTY_MARK}</td>
                    <td className="max-w-xs px-3 py-2">
                      <Link to={to} className="font-medium text-slate-900 hover:text-primary-700">
                        {issue.subject}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{issue.status?.name ?? EMPTY_MARK}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${priorityBadge(issue.priority)}`}
                      >
                        {t(`issues.priorities.${issue.priority}` as 'issues.priorities.1')}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {issue.assignee
                        ? `${issue.assignee.lastname} ${issue.assignee.firstname}`.trim() || issue.assignee.login
                        : issue.assigneeGroup
                          ? `[グループ] ${issue.assigneeGroup.name}`
                        : EMPTY_MARK}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                      {formatDistanceToNow(new Date(issue.updatedAt), { addSuffix: true, locale })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {issues.length === 0 && !isLoading && (
          <p className="p-6 text-center text-slate-500">{t('app.noData')}</p>
        )}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            {t('app.back')}
          </button>
          <span className="text-sm text-slate-600">
            {pagination.page} / {pagination.totalPages}
          </span>
          <button
            type="button"
            disabled={page >= pagination.totalPages}
            onClick={() => setPage(page + 1)}
            className="rounded-lg border border-slate-300 px-3 py-1 text-sm disabled:opacity-40"
          >
            {t('forums.next')}
          </button>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <a
          href={atomUrl}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Rss className="h-4 w-4" />
          Atom
        </a>
      </div>
    </div>
  );
}
