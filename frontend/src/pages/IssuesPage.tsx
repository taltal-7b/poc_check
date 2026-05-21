import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Edit3, Rss, Search, Trash2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useBulkDeleteIssues, useBulkUpdateIssues, useIssues, useProjectIssues, useStatuses, useTrackers, useMembers, useProject } from '../api/hooks';
import { useAuthStore } from '../stores/auth';
import ProjectSubNav from '../components/ProjectSubNav';
import AppSelect from '../components/AppSelect';
import ProgressRangeInput from '../components/ProgressRangeInput';
import { openAuthenticatedAtom } from '../utils/atom';
import type { Issue } from '../types';

const PER_PAGE = 10;
const EMPTY_MARK = '\uFF0D';
type IssueSortKey =
  | 'number'
  | 'tracker'
  | 'subject'
  | 'parent'
  | 'parentNumber'
  | 'status'
  | 'assignee'
  | 'priority'
  | 'createdAt'
  | 'dueDate'
  | 'updatedAt';

function isIssueSortKey(value: string | null): value is IssueSortKey {
  return value === 'number'
    || value === 'tracker'
    || value === 'subject'
    || value === 'parent'
    || value === 'parentNumber'
    || value === 'status'
    || value === 'assignee'
    || value === 'priority'
    || value === 'createdAt'
    || value === 'dueDate'
    || value === 'updatedAt';
}

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

function shortDate(value: string | null | undefined) {
  if (!value) return EMPTY_MARK;
  try {
    return format(parseISO(value), 'M/d');
  } catch {
    return EMPTY_MARK;
  }
}


export default function IssuesPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    statusId: '',
    priority: '',
    assignee: '',
    doneRatio: '',
  });
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.user);

  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1);
  const trackerId = searchParams.get('trackerId') || '';
  const statusId = searchParams.get('statusId') || '';
  const priority = searchParams.get('priority') || '';
  const assignee = searchParams.get('assignee') || '';
  const parentNumber = searchParams.get('parent') || '';
  const sortParam = searchParams.get('sort');
  const sort: IssueSortKey = isIssueSortKey(sortParam) ? sortParam : 'updatedAt';
  const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';

  const queryParams = useMemo(
    () => {
      const trimmedAssignee = assignee.trim();
      return {
        page,
        perPage: PER_PAGE,
        ...(trackerId ? { tracker: trackerId } : {}),
        ...(statusId ? { status: statusId } : {}),
        ...(priority ? { priority: Number(priority) } : {}),
        ...(parentNumber ? { parent: parentNumber } : {}),
        sort,
        order,
        ...(trimmedAssignee.startsWith('group:')
          ? { assignee_group: trimmedAssignee.slice(6) }
          : trimmedAssignee.startsWith('user:')
            ? { assignee: trimmedAssignee.slice(5) }
            : trimmedAssignee ? { assignee: trimmedAssignee } : {}),
      };
    },
    [page, trackerId, statusId, priority, assignee, parentNumber, sort, order],
  );

  const atomUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (trackerId) params.set('tracker', trackerId);
    if (statusId) params.set('status', statusId);
    if (priority) params.set('priority', priority);
    if (parentNumber) params.set('parent', parentNumber);
    if (assignee.trim().startsWith('group:')) params.set('assignee_group', assignee.trim().slice(6));
    else if (assignee.trim().startsWith('user:')) params.set('assignee', assignee.trim().slice(5));
    else if (assignee.trim()) params.set('assignee', assignee.trim());
    params.set('limit', '100');
    const qs = params.toString();
    const base = identifier
      ? `/api/v1/projects/${identifier}/issues/atom`
      : '/api/v1/issues/atom';
    return `${base}${qs ? `?${qs}` : ''}`;
  }, [identifier, trackerId, statusId, priority, assignee, parentNumber]);

  const openAtom = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    await openAuthenticatedAtom(atomUrl);
  };

  const globalQuery = useIssues(queryParams, { enabled: !identifier });
  const projectQuery = useProjectIssues(identifier ?? '', queryParams, { enabled: !!identifier });
  const parentCandidateParams = useMemo(() => {
    const q = parentSearch.trim().replace(/^#/, '');
    return {
      page: 1,
      per_page: 20,
      sort: 'updatedAt',
      order: 'desc',
      ...(q ? { q } : {}),
    };
  }, [parentSearch]);
  const globalParentCandidates = useIssues(parentCandidateParams, { enabled: parentPickerOpen && !identifier });
  const projectParentCandidates = useProjectIssues(identifier ?? '', parentCandidateParams, {
    enabled: parentPickerOpen && !!identifier,
  });

  const active = identifier ? projectQuery : globalQuery;
  const { data, isLoading, isError } = active;
  const projectDetailQuery = useProject(identifier ?? '', {
    enabled: Boolean(identifier && isAuthenticated && currentUser?.id),
    refetchOnMount: 'always',
    cacheScope: currentUser?.id ?? 'signed-out',
  });
  const canCreateIssue = identifier ? Boolean(projectDetailQuery.data?.data.permissions?.canCreateIssue) : false;
  const canBulkEdit = identifier ? Boolean(projectDetailQuery.data?.data.permissions?.canEditIssue) : isAuthenticated;
  const canBulkDelete = canBulkEdit;
  const canShowProjectCreateButton =
    Boolean(identifier) &&
    isAuthenticated &&
    Boolean(currentUser?.id) &&
    projectDetailQuery.isSuccess &&
    canCreateIssue;

  const issues: Issue[] = data?.data ?? [];
  const parentCandidates = (identifier ? projectParentCandidates.data : globalParentCandidates.data)?.data ?? [];
  const pagination = data?.pagination;
  const selectedCount = selectedIds.size;
  const selectedVisibleCount = issues.filter((issue) => selectedIds.has(issue.id)).length;
  const allVisibleSelected = issues.length > 0 && selectedVisibleCount === issues.length;
  const bulkUpdate = useBulkUpdateIssues();
  const bulkDelete = useBulkDeleteIssues();

  const trackersQuery = useTrackers();
  const statusesQuery = useStatuses();
  const trackers = trackersQuery.data?.data ?? [];
  const statuses = statusesQuery.data?.data ?? [];

  const membersQuery = useMembers(identifier ?? '');
  const members = identifier ? (membersQuery.data?.data ?? []) : [];
  const trackerOptions = useMemo(
    () => [{ value: '', label: EMPTY_MARK }, ...trackers.map((tr) => ({ value: tr.id, label: tr.name }))],
    [trackers],
  );
  const statusOptions = useMemo(
    () => [{ value: '', label: EMPTY_MARK }, ...statuses.map((s) => ({ value: s.id, label: s.name }))],
    [statuses],
  );
  const priorityOptions = useMemo(
    () => [
      { value: '', label: EMPTY_MARK },
      ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: t(`issues.priorities.${n}` as const) })),
    ],
    [t],
  );
  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>();
    const currentUserValue = currentUser?.id ? `user:${currentUser.id}` : '';
    const options = members.flatMap((member) => {
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
    const orderedOptions = currentUserValue && seen.has(currentUserValue)
      ? [{ value: currentUserValue, label: '自分' }, ...options.filter((option) => option.value !== currentUserValue)]
      : options;
    return [{ value: '', label: EMPTY_MARK }, ...orderedOptions];
  }, [members, currentUser?.id]);
  const bulkAssigneeOptions = useMemo(
    () => [
      { value: '', label: EMPTY_MARK },
      { value: 'none', label: '未割り当て' },
      ...assigneeOptions.filter((option) => option.value),
    ],
    [assigneeOptions],
  );

  useEffect(() => {
    setSelectedIds((prev) => {
      const visibleIds = new Set(issues.map((issue) => issue.id));
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [issues]);

  useEffect(() => {
    if (!parentNumber) return;
    setParentSearch((current) => current || `#${parentNumber}`);
  }, [parentNumber]);

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

  const toggleSort = (key: IssueSortKey) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const nextOrder = sort === key && order === 'asc' ? 'desc' : 'asc';
      next.set('sort', key);
      next.set('order', nextOrder);
      next.set('page', '1');
      return next;
    });
  };

  const selectParentIssue = (issue: Issue) => {
    setFilter('parent', String(issue.number));
    setParentSearch(`#${issue.number} ${issue.subject}`);
    setParentPickerOpen(false);
  };

  const issueDepthById = useMemo(() => {
    if (sort !== 'parent') return new Map<string, number>();
    const byId = new Map(issues.map((issue) => [issue.id, issue]));
    const depths = new Map<string, number>();
    const depthOf = (issue: Issue, seen = new Set<string>()): number => {
      if (typeof issue.treeDepth === 'number') {
        depths.set(issue.id, issue.treeDepth);
        return issue.treeDepth;
      }
      const cached = depths.get(issue.id);
      if (cached !== undefined) return cached;
      if (!issue.parentId || seen.has(issue.id)) {
        depths.set(issue.id, 0);
        return 0;
      }
      const parent = byId.get(issue.parentId);
      if (!parent) {
        depths.set(issue.id, 0);
        return 0;
      }
      seen.add(issue.id);
      const depth = Math.min(depthOf(parent, seen) + 1, 6);
      depths.set(issue.id, depth);
      return depth;
    };
    for (const issue of issues) depthOf(issue);
    return depths;
  }, [issues, sort]);

  const clearParentIssue = () => {
    setFilter('parent', '');
    setParentSearch('');
    setParentPickerOpen(false);
  };

  const sortIndicator = (key: IssueSortKey) => {
    if (sort !== key) return null;
    return order === 'asc'
      ? <ArrowUp className="h-3.5 w-3.5" aria-hidden />
      : <ArrowDown className="h-3.5 w-3.5" aria-hidden />;
  };

  const sortableHeader = (key: IssueSortKey, label: React.ReactNode) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className="inline-flex items-center gap-1 hover:text-primary-700"
    >
      {label}
      {sortIndicator(key)}
    </button>
  );

  const newIssueTo = identifier ? `/projects/${identifier}/issues/new` : '/projects';
  const toggleIssueSelection = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleVisibleSelection = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const issue of issues) {
        if (checked) next.add(issue.id);
        else next.delete(issue.id);
      }
      return next;
    });
  };

  const resetBulkForm = () => {
    setBulkForm({ statusId: '', priority: '', assignee: '', doneRatio: '' });
    setBulkError('');
  };

  const submitBulkEdit = async () => {
    const changes: Record<string, unknown> = {};
    if (bulkForm.statusId) changes.statusId = bulkForm.statusId;
    if (bulkForm.priority) changes.priority = Number(bulkForm.priority);
    if (bulkForm.doneRatio) {
      const doneRatio = Number(bulkForm.doneRatio);
      if (!Number.isInteger(doneRatio) || doneRatio < 0 || doneRatio > 100 || doneRatio % 10 !== 0) {
        setBulkError('進捗率は0から100の10%刻みで指定してください。');
        return;
      }
      changes.doneRatio = doneRatio;
    }
    if (bulkForm.assignee) {
      if (bulkForm.assignee === 'none') {
        changes.assigneeId = null;
        changes.assigneeGroupId = null;
      } else if (bulkForm.assignee.startsWith('group:')) {
        changes.assigneeGroupId = bulkForm.assignee.slice(6);
      } else if (bulkForm.assignee.startsWith('user:')) {
        changes.assigneeId = bulkForm.assignee.slice(5);
      }
    }
    if (Object.keys(changes).length === 0) {
      setBulkError('変更する項目を選択してください。');
      return;
    }
    try {
      await bulkUpdate.mutateAsync({ ids: Array.from(selectedIds), changes });
      setSelectedIds(new Set());
      setBulkEditOpen(false);
      resetBulkForm();
    } catch {
      setBulkError(t('app.error'));
    }
  };

  const submitBulkDelete = async () => {
    try {
      await bulkDelete.mutateAsync(Array.from(selectedIds));
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    } catch {
      // The dialog renders the mutation error state.
    }
  };

  return (
    <div className="space-y-6">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <div className="mx-auto max-w-7xl space-y-6">
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

        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 lg:grid-cols-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t('issues.tracker')}</label>
          <AppSelect
            value={trackerId}
            onChange={(value) => setFilter('trackerId', value)}
            options={trackerOptions}
            ariaLabel={t('issues.tracker')}
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t('issues.status')}</label>
          <AppSelect
            value={statusId}
            onChange={(value) => setFilter('statusId', value)}
            options={statusOptions}
            ariaLabel={t('issues.status')}
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t('issues.priority')}</label>
          <AppSelect
            value={priority}
            onChange={(value) => setFilter('priority', value)}
            options={priorityOptions}
            ariaLabel={t('issues.priority')}
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
          />
        </div>
        <div className="md:col-span-2 lg:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-500">{t('issues.assignee')}</label>
          <AppSelect
            value={assignee}
            onChange={(value) => setFilter('assignee', value)}
            options={assigneeOptions}
            ariaLabel={t('issues.assignee')}
            className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">{t('issues.parent')}</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <input
              value={parentSearch}
              onFocus={() => setParentPickerOpen(true)}
              onBlur={() => window.setTimeout(() => setParentPickerOpen(false), 120)}
              onChange={(event) => {
                setParentSearch(event.target.value);
                if (parentNumber) setFilter('parent', '');
                setParentPickerOpen(true);
              }}
              placeholder="No・題名で検索"
              aria-label={`${t('issues.parent')}を検索`}
              className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-9 text-sm"
            />
            {(parentSearch || parentNumber) && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearParentIssue}
                aria-label={`${t('issues.parent')}を解除`}
                className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
            {parentPickerOpen && (
              <div className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {parentCandidates.length > 0 ? parentCandidates.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectParentIssue(issue)}
                    className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <span className="font-mono text-xs text-slate-500">#{issue.number}</span>{' '}
                    <span>{issue.subject}</span>
                  </button>
                )) : (
                  <p className="px-3 py-2 text-sm text-slate-500">候補がありません</p>
                )}
              </div>
            )}
          </div>
        </div>
        </div>

        {isLoading && <p className="text-slate-500">{t('app.loading')}</p>}
        {isError && <p className="text-red-600">{t('app.error')}</p>}

        {isAuthenticated && issues.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              {selectedCount > 0 ? `${selectedCount}件選択中` : 'チケットを選択して一括操作できます'}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canBulkEdit || selectedCount === 0}
                onClick={() => {
                  resetBulkForm();
                  setBulkEditOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Edit3 className="h-4 w-4" />
                一括編集
              </button>
              <button
                type="button"
                disabled={!canBulkDelete || selectedCount === 0}
                onClick={() => setBulkDeleteOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                一括削除
              </button>
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto overflow-y-hidden">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {isAuthenticated && (
                  <th className="w-10 px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(event) => toggleVisibleSelection(event.target.checked)}
                      aria-label="表示中のチケットをすべて選択"
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                  </th>
                )}
                <th className="w-16 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('number', 'No')}</th>
                <th className="w-24 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('tracker', t('issues.tracker'))}</th>
                <th className="min-w-64 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('subject', t('issues.subjectColumn'))}</th>
                <th className="w-28 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('parentNumber', t('issues.parent'))}</th>
                <th className="w-24 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('status', t('issues.status'))}</th>
                <th className="w-32 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('assignee', t('issues.assignee'))}</th>
                <th className="w-24 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('priority', t('issues.priority'))}</th>
                <th className="w-20 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('createdAt', '登録日')}</th>
                <th className="w-20 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('dueDate', t('issues.dueDate'))}</th>
                <th className="w-20 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('updatedAt', '更新日')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {issues.map((issue) => {
                const to =
                  identifier && issue.id
                    ? `/projects/${identifier}/issues/${issue.id}`
                    : `/issues/${issue.id}`;
                const parentLabel = issue.parent
                  ? `${issue.parent.number ? `#${issue.parent.number} ` : ''}${issue.parent.subject}`.trim()
                  : EMPTY_MARK;
                const depth = issueDepthById.get(issue.id) ?? 0;
                return (
                  <tr key={issue.id} className="hover:bg-slate-50/80">
                    {isAuthenticated && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(issue.id)}
                          onChange={(event) => toggleIssueSelection(issue.id, event.target.checked)}
                          aria-label={`#${issue.number}を選択`}
                          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                    )}
                    <td className="w-16 whitespace-nowrap px-2 py-2 font-mono text-xs text-slate-600">
                      <Link to={to} className="text-primary-600 hover:underline">
                        #{issue.number || EMPTY_MARK}
                      </Link>
                    </td>
                    <td className="max-w-28 truncate px-2 py-2 text-slate-700" title={issue.tracker?.name ?? undefined}>{issue.tracker?.name ?? EMPTY_MARK}</td>
                    <td className="min-w-64 px-2 py-2">
                      <Link
                        to={to}
                        className="flex items-center font-medium text-slate-900 hover:text-primary-700"
                        style={{ paddingLeft: sort === 'parent' ? depth * 18 : 0 }}
                      >
                        {sort === 'parent' && depth > 0 && <span className="mr-1 text-slate-400">&gt;</span>}
                        {issue.subject}
                      </Link>
                    </td>
                    <td className="max-w-32 truncate px-2 py-2 text-xs text-slate-600" title={parentLabel !== EMPTY_MARK ? parentLabel : undefined}>
                      {issue.parent ? (
                        <Link to={identifier ? `/projects/${identifier}/issues/${issue.parent.id}` : `/issues/${issue.parent.id}`} className="hover:text-primary-700 hover:underline">
                          {parentLabel}
                        </Link>
                      ) : EMPTY_MARK}
                    </td>
                    <td className="max-w-28 truncate px-2 py-2 text-slate-700" title={issue.status?.name ?? undefined}>{issue.status?.name ?? EMPTY_MARK}</td>
                    <td className="max-w-36 truncate px-2 py-2 text-slate-700">
                      {issue.assignee
                        ? `${issue.assignee.lastname} ${issue.assignee.firstname}`.trim() || issue.assignee.login
                        : issue.assigneeGroup
                          ? `[グループ] ${issue.assigneeGroup.name}`
                        : EMPTY_MARK}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <span
                        className={`inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${priorityBadge(issue.priority)}`}
                      >
                        {t(`issues.priorities.${issue.priority}` as 'issues.priorities.1')}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-500">{shortDate(issue.createdAt)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-500">{shortDate(issue.dueDate)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-xs text-slate-500">{shortDate(issue.updatedAt)}</td>
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
            onClick={openAtom}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Rss className="h-4 w-4" />
            Atom
          </a>
        </div>
      </div>

      <Dialog open={bulkEditOpen} onClose={() => setBulkEditOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-slate-900">一括編集</DialogTitle>
            <p className="mt-1 text-sm text-slate-600">{selectedCount}件のチケットを更新します。</p>
            <div className="mt-5 grid gap-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">{t('issues.status')}</label>
                <AppSelect
                  value={bulkForm.statusId}
                  onChange={(value) => setBulkForm((form) => ({ ...form, statusId: value }))}
                  options={statusOptions}
                  ariaLabel={t('issues.status')}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">{t('issues.priority')}</label>
                <AppSelect
                  value={bulkForm.priority}
                  onChange={(value) => setBulkForm((form) => ({ ...form, priority: value }))}
                  options={priorityOptions}
                  ariaLabel={t('issues.priority')}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                />
              </div>
              {identifier && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">{t('issues.assignee')}</label>
                  <AppSelect
                    value={bulkForm.assignee}
                    onChange={(value) => setBulkForm((form) => ({ ...form, assignee: value }))}
                    options={bulkAssigneeOptions}
                    ariaLabel={t('issues.assignee')}
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  />
                </div>
              )}
              <div>
                <label className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                  <input
                    type="checkbox"
                    checked={bulkForm.doneRatio !== ''}
                    onChange={(event) => setBulkForm((form) => ({ ...form, doneRatio: event.target.checked ? '0' : '' }))}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  {t('issues.doneRatio')}
                </label>
                <ProgressRangeInput
                  value={bulkForm.doneRatio}
                  onChange={(value) => setBulkForm((form) => ({ ...form, doneRatio: value }))}
                  disabled={bulkForm.doneRatio === ''}
                />
              </div>
            </div>
            {(bulkError || bulkUpdate.isError) && (
              <p className="mt-4 text-sm text-red-600">{bulkError || t('app.error')}</p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkEditOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('app.cancel')}
              </button>
              <button
                type="button"
                onClick={submitBulkEdit}
                disabled={bulkUpdate.isPending}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:opacity-50"
              >
                {bulkUpdate.isPending ? t('app.loading') : t('app.save')}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog open={bulkDeleteOpen} onClose={() => setBulkDeleteOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-slate-900">一括削除</DialogTitle>
            <p className="mt-2 text-sm text-slate-600">{selectedCount}件のチケットを削除します。よろしいですか？</p>
            {bulkDelete.isError && <p className="mt-4 text-sm text-red-600">{t('app.error')}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('app.cancel')}
              </button>
              <button
                type="button"
                onClick={submitBulkDelete}
                disabled={bulkDelete.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDelete.isPending ? t('app.loading') : t('app.delete')}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
