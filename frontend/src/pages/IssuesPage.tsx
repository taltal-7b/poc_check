import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Bookmark, ChevronDown, ChevronRight, Edit3, Rss, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  useBulkDeleteIssues,
  useBulkUpdateIssues,
  useCreateSavedQuery,
  useDeleteSavedQuery,
  useIssues,
  useProjectIssues,
  useSavedQueries,
  useStatuses,
  useTrackers,
  useMembers,
  useProject,
} from '../api/hooks';
import { useAuthStore } from '../stores/auth';
import ProjectSubNav from '../components/ProjectSubNav';
import AppSelect from '../components/AppSelect';
import ProgressRangeInput from '../components/ProgressRangeInput';
import { openAuthenticatedAtom } from '../utils/atom';
import { formatEstimatedEffort } from '../utils/estimatedEffort';
import type { Issue, Query as SavedQuery } from '../types';

const PER_PAGE = 10;
const EMPTY_MARK = '\uFF0D';

const ISSUE_SORT_KEYS = [
  'number',
  'tracker',
  'subject',
  'parent',
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
type IssueSavedFilters = {
  trackerId?: string;
  statusId?: string;
  priority?: string;
  assignee?: string;
  q?: string;
};

const ISSUE_SORT_KEY_SET = new Set<string>(ISSUE_SORT_KEYS);

function isIssueSortKey(value: string | null): value is IssueSortKey {
  return value !== null && ISSUE_SORT_KEY_SET.has(value);
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

function formatHours(value: number | null | undefined) {
  return typeof value === 'number' ? formatEstimatedEffort(value, 'hours') : EMPTY_MARK;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function issueQueryProjectId(query: SavedQuery): string | null {
  return query.projectId ?? query.project?.id ?? null;
}

export default function IssuesPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
  const [expandedIssueIds, setExpandedIssueIds] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [saveQueryOpen, setSaveQueryOpen] = useState(false);
  const [savedQueryId, setSavedQueryId] = useState('');
  const [queryName, setQueryName] = useState('');
  const [queryError, setQueryError] = useState('');
  const [issueNameSearch, setIssueNameSearch] = useState('');
  const [bulkParentSearch, setBulkParentSearch] = useState('');
  const [bulkParentPickerOpen, setBulkParentPickerOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    statusId: '',
    priority: '',
    dueDate: '',
    dueDateEnabled: false,
    assignee: '',
    parentId: '',
    doneRatio: '',
  });
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.user);

  const page = Math.max(1, Number(searchParams.get('page') || '1') || 1);
  const trackerId = searchParams.get('trackerId') || '';
  const statusId = searchParams.get('statusId') || '';
  const priority = searchParams.get('priority') || '';
  const assignee = searchParams.get('assignee') || '';
  const issueName = searchParams.get('q') || '';
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
        ...(issueName ? { q: issueName } : {}),
        sort,
        order,
        ...(trimmedAssignee.startsWith('group:')
          ? { assignee_group: trimmedAssignee.slice(6) }
          : trimmedAssignee.startsWith('user:')
            ? { assignee: trimmedAssignee.slice(5) }
            : trimmedAssignee ? { assignee: trimmedAssignee } : {}),
      };
    },
    [page, trackerId, statusId, priority, assignee, issueName, sort, order],
  );

  const atomUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (trackerId) params.set('tracker', trackerId);
    if (statusId) params.set('status', statusId);
    if (priority) params.set('priority', priority);
    if (issueName) params.set('q', issueName);
    if (assignee.trim().startsWith('group:')) params.set('assignee_group', assignee.trim().slice(6));
    else if (assignee.trim().startsWith('user:')) params.set('assignee', assignee.trim().slice(5));
    else if (assignee.trim()) params.set('assignee', assignee.trim());
    params.set('limit', '100');
    const qs = params.toString();
    const base = identifier
      ? `/api/v1/projects/${identifier}/issues/atom`
      : '/api/v1/issues/atom';
    return `${base}${qs ? `?${qs}` : ''}`;
  }, [identifier, trackerId, statusId, priority, assignee, issueName]);

  const openAtom = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    await openAuthenticatedAtom(atomUrl);
  };

  const globalQuery = useIssues(queryParams, { enabled: !identifier });
  const projectQuery = useProjectIssues(identifier ?? '', queryParams, { enabled: !!identifier });
  const active = identifier ? projectQuery : globalQuery;
  const { data, isLoading, isError } = active;
  const projectDetailQuery = useProject(identifier ?? '', {
    enabled: Boolean(identifier && isAuthenticated && currentUser?.id),
    refetchOnMount: 'always',
    cacheScope: currentUser?.id ?? 'signed-out',
  });
  const currentProjectId = identifier ? projectDetailQuery.data?.data.id ?? '' : '';
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
  const pagination = data?.pagination;
  const activeFilterCount = [trackerId, statusId, priority, assignee, issueName].filter(Boolean).length;
  const issueChildrenByParent = useMemo(() => {
    const issueIds = new Set(issues.map((issue) => issue.id));
    const map = new Map<string, Issue[]>();
    for (const issue of issues) {
      if (!issue.parentId || !issueIds.has(issue.parentId)) continue;
      const children = map.get(issue.parentId) ?? [];
      children.push(issue);
      map.set(issue.parentId, children);
    }
    return map;
  }, [issues]);
  const visibleIssueRows = useMemo(() => {
    if (sort !== 'parent') {
      return issues.map((issue) => ({ issue, depth: 0 }));
    }

    const issueIds = new Set(issues.map((issue) => issue.id));
    const rows: { issue: Issue; depth: number }[] = [];
    const appendedIds = new Set<string>();
    const appendIssue = (issue: Issue, depth: number, ancestors: Set<string>) => {
      if (appendedIds.has(issue.id)) return;
      appendedIds.add(issue.id);
      rows.push({ issue, depth });
      if (!expandedIssueIds.has(issue.id) || ancestors.has(issue.id)) return;
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(issue.id);
      for (const child of issueChildrenByParent.get(issue.id) ?? []) {
        appendIssue(child, Math.min(depth + 1, 6), nextAncestors);
      }
    };

    for (const issue of issues) {
      if (issue.parentId && issueIds.has(issue.parentId)) continue;
      appendIssue(issue, 0, new Set());
    }
    for (const issue of issues) {
      appendIssue(issue, 0, new Set());
    }
    return rows;
  }, [expandedIssueIds, issueChildrenByParent, issues, sort]);
  const visibleIssues = useMemo(() => visibleIssueRows.map((row) => row.issue), [visibleIssueRows]);
  const selectedCount = selectedIds.size;
  const selectedVisibleCount = visibleIssues.filter((issue) => selectedIds.has(issue.id)).length;
  const allVisibleSelected = visibleIssues.length > 0 && selectedVisibleCount === visibleIssues.length;
  const selectedIssues = useMemo(
    () => issues.filter((issue) => selectedIds.has(issue.id)),
    [issues, selectedIds],
  );
  const selectedIncludesParentIssue = selectedIssues.some(
    (issue) => (issue.childIssueCount ?? issue.children?.length ?? 0) > 0,
  );
  const bulkParentCandidateParams = useMemo(() => {
    const q = bulkParentSearch.trim().replace(/^#/, '');
    return {
      page: 1,
      per_page: 20,
      sort: 'updatedAt',
      order: 'desc',
      ...(q ? { q } : {}),
    };
  }, [bulkParentSearch]);
  const globalBulkParentCandidates = useIssues(bulkParentCandidateParams, {
    enabled: bulkParentPickerOpen && !identifier && !selectedIncludesParentIssue,
  });
  const projectBulkParentCandidates = useProjectIssues(identifier ?? '', bulkParentCandidateParams, {
    enabled: bulkParentPickerOpen && !!identifier && !selectedIncludesParentIssue,
  });
  const bulkParentCandidates = ((identifier ? projectBulkParentCandidates.data : globalBulkParentCandidates.data)?.data ?? [])
    .filter((issue) => !selectedIds.has(issue.id));
  const bulkParentEditDisabled = !identifier || selectedIncludesParentIssue;
  const bulkUpdate = useBulkUpdateIssues();
  const bulkDelete = useBulkDeleteIssues();
  const savedQueriesQuery = useSavedQueries({ enabled: isAuthenticated });
  const createSavedQuery = useCreateSavedQuery();
  const deleteSavedQuery = useDeleteSavedQuery();

  const trackersQuery = useTrackers();
  const statusesQuery = useStatuses();
  const trackers = trackersQuery.data?.data ?? [];
  const statuses = statusesQuery.data?.data ?? [];
  const savedIssueQueries = useMemo(() => {
    const projectId = identifier ? currentProjectId : null;
    return (savedQueriesQuery.data?.data ?? []).filter((query) => (
      query.type === 'IssueQuery' &&
      issueQueryProjectId(query) === projectId
    ));
  }, [currentProjectId, identifier, savedQueriesQuery.data?.data]);
  const savedQueryOptions = useMemo(
    () => [
      { value: '', label: '保存した検索条件' },
      ...savedIssueQueries.map((query) => ({ value: query.id, label: query.name })),
    ],
    [savedIssueQueries],
  );

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
      if (!(member.memberRoles ?? []).some((memberRole) => memberRole.role?.assignable)) return [];
      if (member.user) {
        if (member.user.status !== 1) return [];
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
    setIssueNameSearch(issueName);
  }, [issueName]);

  const setFilter = (key: string, value: string) => {
    setSavedQueryId('');
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

  const submitIssueNameSearch = () => {
    setFilter('q', issueNameSearch.trim());
  };

  const currentSavedFilters = (): IssueSavedFilters => ({
    ...(trackerId ? { trackerId } : {}),
    ...(statusId ? { statusId } : {}),
    ...(priority ? { priority } : {}),
    ...(assignee ? { assignee } : {}),
    ...(issueName ? { q: issueName } : {}),
  });

  const applySavedQuery = (id: string) => {
    setSavedQueryId(id);
    const query = savedIssueQueries.find((item) => item.id === id);
    if (!query) return;
    const filters = query.filters as IssueSavedFilters;
    const sortCriteria = Array.isArray(query.sortCriteria) ? query.sortCriteria : [];
    const nextSort = isIssueSortKey(String(sortCriteria[0] ?? '')) ? String(sortCriteria[0]) as IssueSortKey : 'updatedAt';
    const nextOrder = String(sortCriteria[1] ?? '') === 'asc' ? 'asc' : 'desc';
    const next = new URLSearchParams();
    const nextTrackerId = stringValue(filters.trackerId);
    const nextStatusId = stringValue(filters.statusId);
    const nextPriority = stringValue(filters.priority);
    const nextAssignee = stringValue(filters.assignee);
    const nextIssueName = stringValue(filters.q);
    if (nextTrackerId) next.set('trackerId', nextTrackerId);
    if (nextStatusId) next.set('statusId', nextStatusId);
    if (nextPriority) next.set('priority', nextPriority);
    if (nextAssignee) next.set('assignee', nextAssignee);
    if (nextIssueName) next.set('q', nextIssueName);
    next.set('sort', nextSort);
    next.set('order', nextOrder);
    next.set('page', '1');
    setSearchParams(next);
    setIssueNameSearch(nextIssueName);
    setFiltersOpen(true);
  };

  const openSaveQuery = () => {
    setQueryName('');
    setQueryError('');
    setSaveQueryOpen(true);
  };

  const submitSaveQuery = async () => {
    const name = queryName.trim();
    if (!name) {
      setQueryError('名称を入力してください');
      return;
    }
    if (identifier && !currentProjectId) {
      setQueryError('プロジェクト情報の読み込み後に保存してください');
      return;
    }
    try {
      const created = await createSavedQuery.mutateAsync({
        name,
        type: 'IssueQuery',
        visibility: 0,
        projectId: identifier ? currentProjectId : null,
        filters: currentSavedFilters(),
        columns: [],
        sortCriteria: [sort, order],
      });
      setSavedQueryId(created.data.id);
      setSaveQueryOpen(false);
      setQueryName('');
      setQueryError('');
    } catch {
      setQueryError(t('app.error'));
    }
  };

  const removeSavedQuery = async () => {
    if (!savedQueryId) return;
    try {
      await deleteSavedQuery.mutateAsync(savedQueryId);
      setSavedQueryId('');
    } catch {
      setQueryError(t('app.error'));
    }
  };

  const toggleSort = (key: IssueSortKey) => {
    setSavedQueryId('');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const nextOrder = sort === key && order === 'asc' ? 'desc' : 'asc';
      next.set('sort', key);
      next.set('order', nextOrder);
      next.set('page', '1');
      return next;
    });
  };

  const toggleIssueExpanded = (issueId: string) => {
    setExpandedIssueIds((current) => {
      const next = new Set(current);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  };

  const selectBulkParentIssue = (issue: Issue) => {
    setBulkForm((form) => ({ ...form, parentId: issue.id }));
    setBulkParentSearch(`#${issue.number} ${issue.subject}`);
    setBulkParentPickerOpen(false);
  };

  const clearBulkParentIssue = () => {
    setBulkForm((form) => ({ ...form, parentId: '' }));
    setBulkParentSearch('');
    setBulkParentPickerOpen(false);
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
      for (const issue of visibleIssues) {
        if (checked) next.add(issue.id);
        else next.delete(issue.id);
      }
      return next;
    });
  };

  const toggleBulkSelectionMode = () => {
    if (bulkSelectionMode) setSelectedIds(new Set());
    setBulkSelectionMode((current) => !current);
  };

  const resetBulkForm = () => {
    setBulkForm({
      statusId: '',
      priority: '',
      dueDate: '',
      dueDateEnabled: false,
      assignee: '',
      parentId: '',
      doneRatio: '',
    });
    setBulkParentSearch('');
    setBulkParentPickerOpen(false);
    setBulkError('');
  };

  const submitBulkEdit = async () => {
    const changes: Record<string, unknown> = {};
    if (bulkForm.statusId) changes.statusId = bulkForm.statusId;
    if (bulkForm.priority) changes.priority = Number(bulkForm.priority);
    if (bulkForm.dueDateEnabled) changes.dueDate = bulkForm.dueDate || null;
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
    if (bulkForm.parentId) {
      if (bulkParentEditDisabled) {
        setBulkError(
          selectedIncludesParentIssue
            ? '子チケットを持つチケットは親チケットを一括変更できません。'
            : '親チケットはプロジェクト内のチケット一覧でのみ一括変更できます。',
        );
        return;
      }
      if (bulkForm.parentId === 'pending') {
        setBulkError('親チケットは候補から選択してください。');
        return;
      }
      changes.parentId = bulkForm.parentId === 'none' ? null : bulkForm.parentId;
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
      <div className="mx-auto w-full space-y-6">
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

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left lg:hidden"
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <SlidersHorizontal className="h-4 w-4 text-slate-500" aria-hidden />
              フィルタ
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                  {activeFilterCount}件適用中
                </span>
              )}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-500 transition ${filtersOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
        <div className={`${filtersOpen ? 'grid' : 'hidden'} gap-3 border-t border-slate-100 p-4 md:grid-cols-2 lg:grid lg:grid-cols-6 lg:border-t-0`}>
        {isAuthenticated && (
          <div className="md:col-span-2 lg:col-span-6">
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-500">保存した検索条件</label>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                  <AppSelect
                    value={savedQueryId}
                    onChange={applySavedQuery}
                    options={savedQueryOptions}
                    ariaLabel="保存した検索条件"
                    className="w-full min-w-[14rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto sm:min-w-[18rem] sm:max-w-md"
                  />
                  {savedQueriesQuery.isLoading && <span className="text-xs text-slate-500">{t('app.loading')}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openSaveQuery}
                  disabled={identifier ? !currentProjectId : false}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Bookmark className="h-4 w-4" aria-hidden />
                  現在の条件を保存
                </button>
                <button
                  type="button"
                  onClick={() => void removeSavedQuery()}
                  disabled={!savedQueryId || deleteSavedQuery.isPending}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  削除
                </button>
              </div>
            </div>
          </div>
        )}
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
          <label className="mb-1 block text-xs font-medium text-slate-500">チケット名</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <input
              value={issueNameSearch}
              onBlur={submitIssueNameSearch}
              onChange={(event) => {
                setIssueNameSearch(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitIssueNameSearch();
              }}
              placeholder="チケット名"
              aria-label="チケット名"
              className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-9 text-sm"
            />
            {(issueNameSearch || issueName) && (
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setIssueNameSearch('');
                  setFilter('q', '');
                }}
                className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
        </div>
        </div>

        {isLoading && <p className="text-slate-500">{t('app.loading')}</p>}
        {isError && <p className="text-red-600">{t('app.error')}</p>}

        {isAuthenticated && issues.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              {bulkSelectionMode
                ? selectedCount > 0
                  ? `${selectedCount}件選択中`
                  : 'チケットを選択してください'
                : '一括編集を押すとチケットを選択できます'}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!canBulkEdit}
                onClick={toggleBulkSelectionMode}
                className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                  bulkSelectionMode
                    ? 'border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Edit3 className="h-4 w-4" />
                {bulkSelectionMode ? '一括編集を終了' : '一括編集'}
              </button>
              {bulkSelectionMode && (
                <>
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
                </>
              )}
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto overflow-y-hidden">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {isAuthenticated && bulkSelectionMode && (
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
                <th className="w-24 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('estimatedHours', t('issues.estimatedHours'))}</th>
                <th className="w-24 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('spentHours', '実績工数')}</th>
                <th className="w-20 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('createdAt', '登録日')}</th>
                <th className="w-20 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('dueDate', t('issues.dueDate'))}</th>
                <th className="w-20 px-2 py-3 text-left font-semibold text-slate-700">{sortableHeader('updatedAt', '更新日')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleIssueRows.map(({ issue, depth }) => {
                const to =
                  identifier && issue.id
                    ? `/projects/${identifier}/issues/${issue.id}`
                    : `/issues/${issue.id}`;
                const parentLabel = issue.parent
                  ? `${issue.parent.number ? `#${issue.parent.number} ` : ''}${issue.parent.subject}`.trim()
                  : EMPTY_MARK;
                const children = issueChildrenByParent.get(issue.id) ?? [];
                const hasChildren = sort === 'parent' && children.length > 0;
                const expanded = expandedIssueIds.has(issue.id);
                return (
                  <tr key={issue.id} className="hover:bg-slate-50/80">
                    {isAuthenticated && bulkSelectionMode && (
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
                      <div className="flex items-center" style={{ paddingLeft: depth * 18 }}>
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={() => toggleIssueExpanded(issue.id)}
                            aria-label={`#${issue.number}の子チケットを${expanded ? '折りたたむ' : '展開'}`}
                            className="mr-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4" aria-hidden />
                            ) : (
                              <ChevronRight className="h-4 w-4" aria-hidden />
                            )}
                          </button>
                        ) : (
                          <span className="mr-1 h-5 w-5 shrink-0" aria-hidden />
                        )}
                        <Link
                          to={to}
                          className="min-w-0 truncate font-medium text-slate-900 hover:text-primary-700"
                        >
                          {issue.subject}
                        </Link>
                      </div>
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
          <DialogPanel className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
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
              <div>
                <label className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                  <input
                    type="checkbox"
                    checked={bulkForm.dueDateEnabled}
                    onChange={(event) => {
                      setBulkForm((form) => ({
                        ...form,
                        dueDateEnabled: event.target.checked,
                        dueDate: event.target.checked ? form.dueDate : '',
                      }));
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  {t('issues.dueDate')}
                </label>
                <input
                  type="date"
                  value={bulkForm.dueDate}
                  disabled={!bulkForm.dueDateEnabled}
                  onChange={(event) => setBulkForm((form) => ({ ...form, dueDate: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
                />
                <p className="mt-1 text-xs text-slate-500">
                  {bulkForm.dueDateEnabled ? '空欄で保存すると期日を解除します。' : 'チェックを入れると期日を一括変更できます。'}
                </p>
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
              <div className={bulkParentEditDisabled ? 'opacity-50' : undefined}>
                <label className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                  <input
                    type="checkbox"
                    checked={bulkForm.parentId !== ''}
                    disabled={bulkParentEditDisabled}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setBulkForm((form) => ({ ...form, parentId: 'none' }));
                        setBulkParentSearch('');
                      } else {
                        clearBulkParentIssue();
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 disabled:cursor-not-allowed"
                  />
                  {t('issues.parent')}
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
                  <input
                    value={bulkParentSearch}
                    disabled={bulkParentEditDisabled || bulkForm.parentId === ''}
                    onFocus={() => setBulkParentPickerOpen(true)}
                    onBlur={() => window.setTimeout(() => setBulkParentPickerOpen(false), 120)}
                    onChange={(event) => {
                      setBulkParentSearch(event.target.value);
                      setBulkForm((form) => ({ ...form, parentId: event.target.value.trim() ? 'pending' : 'none' }));
                      setBulkParentPickerOpen(true);
                    }}
                    placeholder={bulkForm.parentId === '' ? '変更しない' : 'No・題名で検索'}
                    className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-9 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
                  {bulkForm.parentId !== '' && bulkParentSearch && !bulkParentEditDisabled && (
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setBulkForm((form) => ({ ...form, parentId: 'none' }));
                        setBulkParentSearch('');
                      }}
                      className="absolute right-2 top-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                  {bulkParentPickerOpen && bulkForm.parentId !== '' && !bulkParentEditDisabled && (
                    <div className="absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                      {bulkParentCandidates.length > 0 ? bulkParentCandidates.map((issue) => (
                        <button
                          key={issue.id}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectBulkParentIssue(issue)}
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
                <p className="mt-1 text-xs text-slate-500">
                  {selectedIncludesParentIssue
                    ? '子チケットを持つチケットが含まれているため編集できません。'
                    : !identifier
                      ? 'プロジェクト内のチケット一覧でのみ変更できます。'
                      : bulkForm.parentId === 'none'
                        ? '保存すると親チケットを解除します。'
                        : 'チェックを入れると親チケットを一括変更できます。'}
                </p>
              </div>
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

      <Dialog open={saveQueryOpen} onClose={() => setSaveQueryOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-slate-900">検索条件を保存</DialogTitle>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">名称</label>
                <input
                  value={queryName}
                  onChange={(event) => {
                    setQueryName(event.target.value);
                    setQueryError('');
                  }}
                  maxLength={255}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
                <div>現在のフィルタ、チケット名、並び順を保存します。</div>
                <div className="mt-1">保存先: {identifier ? 'このプロジェクト' : '全体のチケット一覧'}</div>
              </div>
              {queryError && <p className="text-sm text-red-600">{queryError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSaveQueryOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {t('app.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void submitSaveQuery()}
                  disabled={createSavedQuery.isPending}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:opacity-50"
                >
                  {createSavedQuery.isPending ? t('app.loading') : t('app.save')}
                </button>
              </div>
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
