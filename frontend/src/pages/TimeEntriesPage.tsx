import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { format, parseISO } from 'date-fns';
import { Pencil, Trash2 } from 'lucide-react';
import {
  useProject,
  useTimeEntries,
  useCreateTimeEntry,
  useUpdateTimeEntry,
  useDeleteTimeEntry,
  useEnumerations,
  useProjectIssues,
  useMembers,
} from '../api/hooks';
import type { Issue, TimeEntry } from '../types';
import { useAuthStore } from '../stores/auth';

function parseHmToHours(value: string): number | null {
  const trimmed = value.trim();
  const match = /^(\d+):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const total = hours + minutes / 60;
  if (!Number.isFinite(total) || total <= 0) return null;
  return total;
}

function formatHoursToHm(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type SpentOnOperator =
  | '*'
  | '><'
  | 't'
  | 'w'
  | 'lw'
  | 'l2w'
  | 'm'
  | 'lm'

type TimeEntrySortKey = 'spentOn' | 'user' | 'activity' | 'issue' | 'hours' | 'comments';
type SortDirection = 'asc' | 'desc';

function formatDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(d, diff);
}

export default function TimeEntriesPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const currentUser = useAuthStore((s) => s.user);
  const { data: projectRaw } = useProject(identifier ?? '');
  const project = projectRaw?.data;

  const today = format(new Date(), 'yyyy-MM-dd');
  const [spentOnOperator, setSpentOnOperator] = useState<SpentOnOperator>('><');
  const [spentOnFrom, setSpentOnFrom] = useState('');
  const [spentOnTo, setSpentOnTo] = useState('');
  const [filterUserId, setFilterUserId] = useState('');
  const [filterUserQuery, setFilterUserQuery] = useState('');
  const [filterActivityId, setFilterActivityId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [sortKey, setSortKey] = useState<TimeEntrySortKey>('spentOn');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const spentOnRange = useMemo((): { from?: string; to?: string } => {
    const now = new Date();
    switch (spentOnOperator) {
      case '*':
        return {};
      case '><':
        return spentOnFrom || spentOnTo ? { from: spentOnFrom || undefined, to: spentOnTo || undefined } : {};
      case 't':
        return { from: today, to: today };
      case 'w': {
        const s = startOfWeekMonday(now);
        const e = addDays(s, 6);
        return { from: formatDateKey(s), to: formatDateKey(e) };
      }
      case 'lw': {
        const thisWeek = startOfWeekMonday(now);
        const s = addDays(thisWeek, -7);
        const e = addDays(thisWeek, -1);
        return { from: formatDateKey(s), to: formatDateKey(e) };
      }
      case 'l2w':
        return { from: formatDateKey(addDays(now, -13)), to: formatDateKey(now) };
      case 'm': {
        const s = new Date(now.getFullYear(), now.getMonth(), 1);
        const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return { from: formatDateKey(s), to: formatDateKey(e) };
      }
      case 'lm': {
        const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const e = new Date(now.getFullYear(), now.getMonth(), 0);
        return { from: formatDateKey(s), to: formatDateKey(e) };
      }
      default:
        return {};
    }
  }, [spentOnOperator, spentOnFrom, spentOnTo, today]);

  const params = useMemo(
    () =>
      project
        ? {
            project_id: project.id,
            ...(spentOnRange.from ? { from: spentOnRange.from } : {}),
            ...(spentOnRange.to ? { to: spentOnRange.to } : {}),
            ...(filterUserId ? { user_id: filterUserId } : {}),
            ...(filterActivityId ? { activity_id: filterActivityId } : {}),
          }
        : undefined,
    [project, spentOnRange.from, spentOnRange.to, filterUserId, filterActivityId],
  );

  const { data: entriesRaw, isLoading } = useTimeEntries(params);
  const entries = useMemo<TimeEntry[]>(() => entriesRaw?.data ?? [], [entriesRaw]);
  const sortedEntries = useMemo<TimeEntry[]>(() => {
    const direction = sortDirection === 'asc' ? 1 : -1;

    const getComparable = (entry: TimeEntry): string | number => {
      switch (sortKey) {
        case 'spentOn':
          return entry.spentOn ? Date.parse(entry.spentOn) : Number.NEGATIVE_INFINITY;
        case 'user':
          return entry.user
            ? `${entry.user.lastname ?? ''} ${entry.user.firstname ?? ''} ${entry.user.login ?? ''}`.trim().toLowerCase()
            : (entry.userId ?? '').toLowerCase();
        case 'activity':
          return (entry.activity?.name ?? entry.activityId ?? '').toLowerCase();
        case 'issue':
          return entry.issue
            ? `${String(entry.issue.number ?? '')} ${(entry.issue.subject ?? '').toLowerCase()}`
            : '';
        case 'hours':
          return Number(entry.hours) || 0;
        case 'comments':
          return (entry.comments ?? '').toLowerCase();
        default:
          return '';
      }
    };

    return [...entries].sort((a, b) => {
      const av = getComparable(a);
      const bv = getComparable(b);
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * direction;
      }
      return String(av).localeCompare(String(bv), 'ja') * direction;
    });
  }, [entries, sortKey, sortDirection]);

  const { data: activitiesRaw } = useEnumerations('TimeEntryActivity');
  const activities = useMemo(() => activitiesRaw?.data ?? [], [activitiesRaw]);
  const availableActivities = useMemo(
    () => activities.filter((a) => a.active !== false),
    [activities],
  );
  const projectIssuesQuery = useProjectIssues(project?.id ?? '', { perPage: 1000 }, { enabled: !!project?.id });
  const membersQuery = useMembers(project?.id ?? '');
  const projectIssues = useMemo<Issue[]>(
    () => (projectIssuesQuery.data?.data ?? []) as Issue[],
    [projectIssuesQuery.data],
  );
  const memberUsers = useMemo(
    () => (membersQuery.data?.data ?? []).map((m) => m.user).filter((u): u is NonNullable<typeof u> => !!u),
    [membersQuery.data],
  );
  const selectedFilterUser = useMemo(
    () => memberUsers.find((u) => u.id === filterUserId) ?? null,
    [memberUsers, filterUserId],
  );
  const filteredFilterUsers = useMemo(() => {
    const q = filterUserQuery.trim().toLowerCase();
    if (!q || filterUserId) return [];
    return memberUsers
      .filter((u) => {
        const name = `${u.lastname ?? ''} ${u.firstname ?? ''}`.trim().toLowerCase();
        const login = (u.login ?? '').toLowerCase();
        return name.includes(q) || login.includes(q);
      })
      .slice(0, 8);
  }, [filterUserQuery, filterUserId, memberUsers]);

  const createEntry = useCreateTimeEntry();
  const updateEntry = useUpdateTimeEntry();
  const deleteEntry = useDeleteTimeEntry();

  const totalHours = useMemo(() => entries.reduce((s, e) => s + (Number(e.hours) || 0), 0), [entries]);

  const [form, setForm] = useState({
    hours: '',
    activityId: '',
    spentOn: today,
    comments: '',
    issueId: '',
    userId: '',
  });
  const [issueQuery, setIssueQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [editTarget, setEditTarget] = useState<TimeEntry | null>(null);
  const [editIssueQuery, setEditIssueQuery] = useState('');
  const [editForm, setEditForm] = useState({
    hours: '',
    activityId: '',
    spentOn: today,
    comments: '',
    issueId: '',
  });
  const [editError, setEditError] = useState('');

  const filteredIssues = useMemo(() => {
    const q = issueQuery.trim().toLowerCase();
    if (!q || form.issueId) return [];
    return projectIssues
      .filter((iss) => {
        const number = String(iss.number ?? '');
        const subject = (iss.subject ?? '').toLowerCase();
        return number.includes(q) || subject.includes(q);
      })
      .slice(0, 8);
  }, [issueQuery, projectIssues, form.issueId]);

  const filteredEditIssues = useMemo(() => {
    const q = editIssueQuery.trim().toLowerCase();
    if (!q || editForm.issueId) return [];
    return projectIssues
      .filter((iss) => {
        const number = String(iss.number ?? '');
        const subject = (iss.subject ?? '').toLowerCase();
        return number.includes(q) || subject.includes(q);
      })
      .slice(0, 8);
  }, [editIssueQuery, projectIssues, editForm.issueId]);

  useEffect(() => {
    if (!memberUsers.length || !currentUser?.id) return;
    setForm((prev) => (prev.userId ? prev : { ...prev, userId: currentUser.id }));
  }, [memberUsers, currentUser?.id]);

  const submitLog = async (continuous: boolean) => {
    setFormError('');
    if (!project) return;
    if (!isUuid(project.id)) {
      setFormError('プロジェクトIDが不正です。ページを再読み込みしてください');
      return;
    }
    const hours = parseHmToHours(form.hours);
    if (!form.activityId) {
      setFormError(`${t('timeEntries.activity')} を選択してください`);
      return;
    }
    const selectedActivity = availableActivities.find((a) => a.id === form.activityId);
    if (!selectedActivity) {
      setFormError(`${t('timeEntries.activity')} の選択が不正です`);
      return;
    }
    if (!form.userId) {
      setFormError('ユーザーを選択してください');
      return;
    }
    if (!isUuid(form.userId)) {
      setFormError('ユーザーIDが不正です。ユーザーを選び直してください');
      return;
    }
    if (form.issueId === '' && issueQuery.trim()) {
      setFormError('候補からチケットを選択してください');
      return;
    }
    if (form.issueId && !isUuid(form.issueId)) {
      setFormError('チケットIDが不正です。候補から再選択してください');
      return;
    }
    if (hours == null) {
      setFormError(`${t('timeEntries.hours')} は h:mm 形式で入力してください（例: 1:30）`);
      return;
    }
    if (form.comments.length > 255) {
      setFormError(`${t('timeEntries.comment')} は255文字以内で入力してください`);
      return;
    }
    try {
      await createEntry.mutateAsync({
        projectId: project.id,
        userId: form.userId,
        activityId: selectedActivity.id,
        hours,
        spentOn: form.spentOn,
        comments: form.comments || null,
        issueId: form.issueId.trim() || null,
      });
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setFormError(message || t('app.error'));
      return;
    }
    setFormError('');
    if (continuous) {
      setForm((prev) => ({ ...prev, hours: '', comments: '' }));
      return;
    }
    setModalOpen(false);
    setIssueQuery('');
    setForm({ hours: '', activityId: '', spentOn: today, comments: '', issueId: '', userId: currentUser?.id ?? '' });
  };

  const openEdit = (row: TimeEntry) => {
    setEditTarget(row);
    setEditError('');
    setEditIssueQuery(row.issue ? `#${row.issue.number ?? ''} ${row.issue.subject ?? ''}`.trim() : '');
    setEditForm({
      hours: formatHoursToHm(Number(row.hours) || 0),
      activityId: row.activityId,
      spentOn: row.spentOn ? format(parseISO(row.spentOn), 'yyyy-MM-dd') : today,
      comments: row.comments ?? '',
      issueId: row.issueId ?? '',
    });
  };

  const submitEdit = async () => {
    if (!editTarget) return;
    setEditError('');
    const parsedHours = parseHmToHours(editForm.hours);
    if (!editForm.activityId) {
      setEditError(`${t('timeEntries.activity')} を選択してください`);
      return;
    }
    if (editForm.issueId === '' && editIssueQuery.trim()) {
      setEditError('候補からチケットを選択してください');
      return;
    }
    if (editForm.issueId && !isUuid(editForm.issueId)) {
      setEditError('チケットIDが不正です。候補から再選択してください');
      return;
    }
    if (parsedHours == null) {
      setEditError(`${t('timeEntries.hours')} は h:mm 形式で入力してください（例: 1:30）`);
      return;
    }
    if (editForm.comments.length > 255) {
      setEditError(`${t('timeEntries.comment')} は255文字以内で入力してください`);
      return;
    }
    try {
      await updateEntry.mutateAsync({
        id: editTarget.id,
        activityId: editForm.activityId,
        hours: parsedHours,
        spentOn: editForm.spentOn,
        comments: editForm.comments || null,
        issueId: editForm.issueId || null,
      });
      setEditTarget(null);
      setEditIssueQuery('');
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setEditError(message || t('app.error'));
    }
  };

  const handleDelete = async (row: TimeEntry) => {
    if (!window.confirm('この工数を削除しますか？')) return;
    await deleteEntry.mutateAsync(row.id);
  };

  const toggleSort = (key: TimeEntrySortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

  const sortIndicator = (key: TimeEntrySortKey): string => {
    if (sortKey !== key) return '';
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  return (
    <div className="space-y-6">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('timeEntries.title')}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {t('timeEntries.report')}: <span className="font-semibold text-primary-700">{formatHoursToHm(totalHours)}</span>{' '}
            {t('timeEntries.hours')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          {t('timeEntries.new')}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">{t('timeEntries.spentOn')}</span>
          <select
            value={spentOnOperator}
            onChange={(e) => setSpentOnOperator(e.target.value as SpentOnOperator)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="*">すべて</option>
            <option value="><">次の範囲内</option>
            <option value="t">今日</option>
            <option value="w">今週</option>
            <option value="lw">先週</option>
            <option value="l2w">直近2週間</option>
            <option value="m">今月</option>
            <option value="lm">先月</option>
          </select>
        </label>
        {spentOnOperator === '><' && (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">開始</span>
              <input
                type="date"
                value={spentOnFrom}
                onChange={(e) => setSpentOnFrom(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">終了</span>
              <input
                type="date"
                value={spentOnTo}
                onChange={(e) => setSpentOnTo(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </label>
          </>
        )}
        <label className="text-sm relative min-w-[14rem]">
          <span className="mb-1 block text-gray-600">{t('issues.author')}</span>
          <input
            value={
              selectedFilterUser
                ? `${selectedFilterUser.lastname ?? ''} ${selectedFilterUser.firstname ?? ''}`.trim() || selectedFilterUser.login
                : filterUserQuery
            }
            onChange={(e) => {
              setFilterUserQuery(e.target.value);
              setFilterUserId('');
            }}
            placeholder="－"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
          {filteredFilterUsers.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-44 w-full overflow-auto rounded border border-gray-200 bg-white shadow">
              {filteredFilterUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setFilterUserId(u.id);
                    setFilterUserQuery(`${u.lastname ?? ''} ${u.firstname ?? ''}`.trim() || u.login);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  {`${u.lastname ?? ''} ${u.firstname ?? ''}`.trim() || u.login}
                </button>
              ))}
            </div>
          )}
        </label>
        <label className="text-sm min-w-[12rem]">
          <span className="mb-1 block text-gray-600">{t('timeEntries.activity')}</span>
          <select
            value={filterActivityId}
            onChange={(e) => setFilterActivityId(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">－</option>
            {availableActivities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">
                <button type="button" onClick={() => toggleSort('spentOn')} className="inline-flex items-center hover:text-gray-900">
                  {t('timeEntries.spentOn')}
                  {sortIndicator('spentOn')}
                </button>
              </th>
              <th className="px-4 py-3 font-medium">
                <button type="button" onClick={() => toggleSort('user')} className="inline-flex items-center hover:text-gray-900">
                  {t('issues.author')}
                  {sortIndicator('user')}
                </button>
              </th>
              <th className="px-4 py-3 font-medium">
                <button type="button" onClick={() => toggleSort('activity')} className="inline-flex items-center hover:text-gray-900">
                  {t('timeEntries.activity')}
                  {sortIndicator('activity')}
                </button>
              </th>
              <th className="px-4 py-3 font-medium">
                <button type="button" onClick={() => toggleSort('issue')} className="inline-flex items-center hover:text-gray-900">
                  {t('issues.title')}
                  {sortIndicator('issue')}
                </button>
              </th>
              <th className="px-4 py-3 font-medium">
                <button type="button" onClick={() => toggleSort('hours')} className="inline-flex items-center hover:text-gray-900">
                  {t('timeEntries.hours')}
                  {sortIndicator('hours')}
                </button>
              </th>
              <th className="px-4 py-3 font-medium">
                <button type="button" onClick={() => toggleSort('comments')} className="inline-flex items-center hover:text-gray-900">
                  {t('timeEntries.comment')}
                  {sortIndicator('comments')}
                </button>
              </th>
              <th className="px-4 py-3 text-center font-medium">{t('app.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  {t('app.loading')}
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  {t('app.noData')}
                </td>
              </tr>
            ) : (
              sortedEntries.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {row.spentOn ? format(parseISO(row.spentOn), 'yyyy-MM-dd') : '—'}
                  </td>
                  <td className="px-4 py-2">
                    {row.user ? `${row.user.lastname} ${row.user.firstname}`.trim() || row.user.login : row.userId}
                  </td>
                  <td className="px-4 py-2">{row.activity?.name ?? row.activityId}</td>
                  <td className="px-4 py-2">
                    {row.issue
                      ? (
                        <Link
                          to={`/projects/${identifier}/issues/${row.issue.id}`}
                          className="text-primary-600 hover:underline"
                        >
                          {`#${row.issue.number ?? ''} ${row.issue.subject ?? ''}`.trim()}
                        </Link>
                      )
                      : '—'}
                  </td>
                  <td className="px-4 py-2">{formatHoursToHm(Number(row.hours))}</td>
                  <td className="px-4 py-2 text-gray-600 max-w-xs truncate" title={row.comments ?? ''}>
                    {row.comments ?? '—'}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded p-1 text-blue-600 hover:bg-blue-50"
                        title={t('app.edit')}
                        aria-label={t('app.edit')}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(row)}
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                        title={t('app.delete')}
                        aria-label={t('app.delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('timeEntries.new')}</DialogTitle>
            <form className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-gray-700">チケット</span>
                <input
                  value={issueQuery}
                  onChange={(e) => {
                    setIssueQuery(e.target.value);
                    setForm((f) => ({ ...f, issueId: '' }));
                  }}
                  placeholder="チケット番号・題名で検索"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
                {filteredIssues.length > 0 && (
                  <div className="mt-1 max-h-44 overflow-auto rounded border border-gray-200 bg-white">
                    {filteredIssues.map((iss) => (
                      <button
                        key={iss.id}
                        type="button"
                        onClick={() => {
                          setForm((f) => ({ ...f, issueId: iss.id }));
                          setIssueQuery(`#${iss.number} ${iss.subject}`);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        #{iss.number} {iss.subject}
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">ユーザー *</span>
                <select
                  required
                  value={form.userId}
                  onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {memberUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {`${u.lastname} ${u.firstname}`.trim() || u.login}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-gray-700">{t('timeEntries.spentOn')} *</span>
                  <input
                    required
                    type="date"
                    value={form.spentOn}
                    onChange={(e) => setForm((f) => ({ ...f, spentOn: e.target.value }))}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700">{t('timeEntries.hours')} *</span>
                  <input
                    required
                    value={form.hours}
                    onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                    placeholder="h:mm"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-gray-700">{t('timeEntries.comment')}</span>
                <textarea
                  value={form.comments}
                  onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}
                  maxLength={255}
                  rows={3}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">{t('timeEntries.activity')} *</span>
                <select
                  required
                  value={form.activityId}
                  onChange={(e) => setForm((f) => ({ ...f, activityId: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">--- 選んでください ---</option>
                  {availableActivities.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.name}
                    </option>
                  ))}
                </select>
              </label>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              {createEntry.isError && <p className="text-sm text-red-600">{t('app.error')}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => void submitLog(false)}
                  disabled={createEntry.isPending}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  作成
                </button>
                <button
                  type="button"
                  onClick={() => void submitLog(true)}
                  disabled={createEntry.isPending}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  連続作成
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                  キャンセル
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog open={!!editTarget} onClose={() => setEditTarget(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('app.edit')}</DialogTitle>
            <form className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-gray-700">チケット</span>
                <input
                  value={editIssueQuery}
                  onChange={(e) => {
                    setEditIssueQuery(e.target.value);
                    setEditForm((f) => ({ ...f, issueId: '' }));
                  }}
                  placeholder="チケット番号・題名で検索"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
                {filteredEditIssues.length > 0 && (
                  <div className="mt-1 max-h-44 overflow-auto rounded border border-gray-200 bg-white">
                    {filteredEditIssues.map((iss) => (
                      <button
                        key={iss.id}
                        type="button"
                        onClick={() => {
                          setEditForm((f) => ({ ...f, issueId: iss.id }));
                          setEditIssueQuery(`#${iss.number} ${iss.subject}`);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        #{iss.number} {iss.subject}
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-gray-700">{t('timeEntries.spentOn')} *</span>
                  <input
                    required
                    type="date"
                    value={editForm.spentOn}
                    onChange={(e) => setEditForm((f) => ({ ...f, spentOn: e.target.value }))}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700">{t('timeEntries.hours')} *</span>
                  <input
                    required
                    value={editForm.hours}
                    onChange={(e) => setEditForm((f) => ({ ...f, hours: e.target.value }))}
                    placeholder="h:mm"
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-gray-700">{t('timeEntries.comment')}</span>
                <textarea
                  value={editForm.comments}
                  onChange={(e) => setEditForm((f) => ({ ...f, comments: e.target.value }))}
                  maxLength={255}
                  rows={3}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">{t('timeEntries.activity')} *</span>
                <select
                  required
                  value={editForm.activityId}
                  onChange={(e) => setEditForm((f) => ({ ...f, activityId: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">--- 選んでください ---</option>
                  {availableActivities.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.name}
                    </option>
                  ))}
                </select>
              </label>
              {editError && <p className="text-sm text-red-600">{editError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
                >
                  {t('app.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void submitEdit()}
                  disabled={updateEntry.isPending}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {t('app.save')}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
