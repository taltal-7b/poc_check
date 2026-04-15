import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { renderMarkdown } from '../components/RichTextEditor';
import { format } from 'date-fns';
import { ja, enUS } from 'date-fns/locale';
import { Pencil, FileIcon, Download, Trash2, Check, X } from 'lucide-react';
import RichTextEditor from '../components/RichTextEditor';
import { useIssue, useUpdateIssue, useUploadAttachments, useDeleteAttachment, useUpdateJournal, useDeleteJournal, useTrackers, useStatuses, useMembers, useProjectIssues } from '../api/hooks';
import { useAuthStore } from '../stores/auth';
import type { Issue, Journal, JournalDetail, User, Attachment } from '../types';

type IssueWithExtras = Issue & {
  watchers?: { user: User }[];
  relations?: { relationType?: string; issue: Issue }[];
  attachments?: (Attachment & { diskFilename?: string })[];
  parent?: { id: string; subject: string };
  children?: { id: string; number: number; subject: string }[];
};

interface EditForm {
  subject: string;
  description: string;
  trackerId: string;
  statusId: string;
  priority: string;
  assigneeId: string;
  parentId: string;
  startDate: string;
  dueDate: string;
  estimatedHours: string;
  doneRatio: string;
  repository: string;
}

function priorityBadgeClass(p: number) {
  const map: Record<number, string> = {
    1: 'bg-slate-100 text-slate-800',
    2: 'bg-sky-100 text-sky-900',
    3: 'bg-amber-100 text-amber-900',
    4: 'bg-orange-100 text-orange-900',
    5: 'bg-red-100 text-red-900',
  };
  return map[p] ?? 'bg-slate-100 text-slate-800';
}

function toDateStr(d: string | null): string {
  if (!d) return '';
  try { return format(new Date(d), 'yyyy-MM-dd'); } catch { return ''; }
}

function displayDate(d: string | null): string {
  if (!d) return '—';
  try { return format(new Date(d), 'yyyy-MM-dd'); } catch { return d; }
}

function parsePermissions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export default function IssueDetailPage() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ identifier?: string; issueId?: string }>();
  const { identifier, issueId } = params;
  const id = issueId ?? '';

  // URLパラメータデバッグ
  useEffect(() => {
    console.log('IssueDetailPage params:', { identifier, issueId, id });
  }, [identifier, issueId, id]);

  const { data, isLoading, isError, error } = useIssue(id);
  const updateMutation = useUpdateIssue();
  const uploadMutation = useUploadAttachments();
  const deleteMutation = useDeleteAttachment();
  const journalUpdateMutation = useUpdateJournal();
  const journalDeleteMutation = useDeleteJournal();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.user);

  const issue = data?.data as IssueWithExtras | undefined;

  // デバッグログ
  useEffect(() => {
    console.log('IssueDetailPage:', { id, isLoading, isError, error, issueExists: !!issue });
  }, [id, isLoading, isError, error, issue]);

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({
    subject: '', description: '', trackerId: '', statusId: '',
    priority: '2', assigneeId: '', parentId: '', startDate: '', dueDate: '',
    estimatedHours: '', doneRatio: '0', repository: '',
  });
  const [note, setNote] = useState('');
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [descHtml, setDescHtml] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filename: string } | null>(null);
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [editingJournalNote, setEditingJournalNote] = useState('');
  const [deleteJournalTarget, setDeleteJournalTarget] = useState<{ id: string; userName: string } | null>(null);

  const locale = i18n.language?.startsWith('ja') ? ja : enUS;
  const projectSlug = identifier ?? issue?.project?.identifier ?? '';

  const trackersQuery = useTrackers();
  const statusesQuery = useStatuses();
  const membersQuery = useMembers(issue?.project?.id ?? '');
  const projectIssuesQuery = useProjectIssues(issue?.project?.id ?? '', { perPage: 1000 }, { enabled: !!issue?.project?.id });
  const trackers = trackersQuery.data?.data ?? [];
  const statuses = statusesQuery.data?.data ?? [];
  const members = membersQuery.data?.data ?? [];
  const projectIssues = (projectIssuesQuery.data?.data ?? []).filter((iss) => iss.id !== id);

  const trackerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    trackers.forEach((tr) => map.set(tr.id, tr.name));
    return map;
  }, [trackers]);

  const statusNameMap = useMemo(() => {
    const map = new Map<string, string>();
    statuses.forEach((st) => map.set(st.id, st.name));
    return map;
  }, [statuses]);

  const assigneeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m) => {
      if (!m.user) return;
      const label = `${m.user.lastname} ${m.user.firstname}`.trim() || m.user.login;
      map.set(m.user.id, label);
    });
    return map;
  }, [members]);

  const issueNameMap = useMemo(() => {
    const map = new Map<string, string>();
    projectIssues.forEach((iss) => {
      map.set(iss.id, `#${iss.number} ${iss.subject}`);
    });
    if (issue) {
      map.set(issue.id, `#${issue.number} ${issue.subject}`);
    }
    return map;
  }, [projectIssues, issue]);

  const permissionSet = useMemo(() => {
    const set = new Set<string>();
    if (!currentUser?.id) return set;
    const meMember = members.find((m) => m.userId === currentUser.id);
    if (!meMember) return set;
    for (const mr of meMember.memberRoles ?? []) {
      for (const p of parsePermissions(mr.role?.permissions)) set.add(p);
    }
    return set;
  }, [members, currentUser?.id]);

  const canEditIssue = useMemo(() => {
    if (!isAuthenticated || !issue) return false;
    if (currentUser?.admin) return true;
    if (permissionSet.has('edit_issues')) return true;
    return permissionSet.has('edit_own_issues') && issue.authorId === currentUser?.id;
  }, [isAuthenticated, currentUser, permissionSet, issue]);

  const canComment = useMemo(() => {
    if (!isAuthenticated) return false;
    if (currentUser?.admin) return true;
    return (
      permissionSet.has('view_issues') ||
      permissionSet.has('add_issue_notes') ||
      permissionSet.has('edit_issue_notes') ||
      permissionSet.has('edit_own_issue_notes') ||
      permissionSet.has('edit_issues')
    );
  }, [isAuthenticated, currentUser, permissionSet]);

  useEffect(() => {
    const raw = issue?.description;
    if (!raw) { setDescHtml(''); return; }
    setDescHtml(renderMarkdown(raw));
  }, [issue?.description]);

  const journals: Journal[] = useMemo(() => issue?.journals ?? [], [issue?.journals]);

  if (isLoading) return <div className="mx-auto max-w-5xl px-4 py-8 text-center">{t('app.loading')}</div>;
  if (isError || !issue) {
    console.error('IssueDetailPage error:', { isError, isLoading, issue, data, error });
    return <div className="mx-auto max-w-5xl px-4 py-8 text-center text-red-600">{t('app.error')}</div>;
  }

  const enterEdit = () => {
    if (!issue) return;
    if (!canEditIssue) return;
    setForm({
      subject: issue.subject,
      description: issue.description ?? '',
      trackerId: issue.trackerId,
      statusId: issue.statusId,
      priority: String(issue.priority),
      assigneeId: issue.assigneeId ?? '',
      parentId: issue.parentId ?? '',
      startDate: toDateStr(issue.startDate),
      dueDate: toDateStr(issue.dueDate),
      estimatedHours: issue.estimatedHours != null ? String(issue.estimatedHours) : '',
      doneRatio: String(issue.doneRatio),
      repository: (issue as Issue & { repository?: string }).repository ?? '',
    });
    setIsEditing(true);
  };

  const cancelEdit = () => setIsEditing(false);

  const saveEdit = () => {
    if (!issue || !form.subject.trim()) return;
    if (!canEditIssue) return;
    updateMutation.mutate(
      {
        id: issue.id,
        subject: form.subject.trim(),
        description: form.description,
        trackerId: form.trackerId,
        statusId: form.statusId,
        priority: Number(form.priority),
        assigneeId: form.assigneeId || null,
        parentId: form.parentId || null,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
        doneRatio: Number(form.doneRatio),
        repository: form.repository.trim() || null,
      },
      { onSuccess: () => setIsEditing(false) },
    );
  };

  const setField = (key: keyof EditForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submitComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!issue || (!note.trim() && attachFiles.length === 0)) return;

    let journalId: string | undefined;

    if (note.trim() || attachFiles.length > 0) {
      const commentText = note.trim() || (attachFiles.length > 0 ? ' ' : '');
      if (commentText) {
        const result = await updateMutation.mutateAsync({ id: issue.id, notes: commentText });
        journalId = (result?.data as Record<string, unknown>)?.journalId as string | undefined;
      }
    }

    if (attachFiles.length > 0) {
      await uploadMutation.mutateAsync({
        files: attachFiles,
        issueId: issue.id,
        journalId,
      });
    }
    setNote('');
    setAttachFiles([]);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const propKeyLabel = (key: string): string => {
    const map: Record<string, string> = {
      subject: t('issues.subject'),
      description: t('issues.description'),
      trackerId: t('issues.tracker'),
      statusId: t('issues.status'),
      priority: t('issues.priority'),
      assigneeId: t('issues.assignee'),
      categoryId: t('issues.category'),
      versionId: t('issues.version'),
      parentId: t('issues.parent'),
      startDate: t('issues.startDate'),
      dueDate: t('issues.dueDate'),
      estimatedHours: t('issues.estimatedHours'),
      doneRatio: t('issues.doneRatio'),
      projectId: t('projects.title'),
      repository: t('issues.repository'),
    };
    return map[key] ?? key;
  };

  const formatDetailValue = (detail: JournalDetail): string => {
    if (!detail.newValue) return '';
    if (detail.propKey === 'priority' && detail.newValue) {
      return t(`issues.priorities.${detail.newValue}` as 'issues.priorities.1') || detail.newValue;
    }
    if (detail.propKey === 'trackerId') return trackerNameMap.get(detail.newValue) ?? detail.newValue;
    if (detail.propKey === 'statusId') return statusNameMap.get(detail.newValue) ?? detail.newValue;
    if (detail.propKey === 'assigneeId') return assigneeNameMap.get(detail.newValue) ?? detail.newValue;
    if (detail.propKey === 'parentId') return issueNameMap.get(detail.newValue) ?? detail.newValue;
    if (detail.propKey === 'projectId') return issue?.project?.name ?? detail.newValue;
    if (detail.propKey === 'doneRatio' && detail.newValue) return `${detail.newValue}%`;
    if (detail.propKey === 'description') return '（変更あり）';
    return detail.newValue;
  };

  const formatDetailOldValue = (detail: JournalDetail): string => {
    if (!detail.oldValue) return '';
    if (detail.propKey === 'priority' && detail.oldValue) {
      return t(`issues.priorities.${detail.oldValue}` as 'issues.priorities.1') || detail.oldValue;
    }
    if (detail.propKey === 'trackerId') return trackerNameMap.get(detail.oldValue) ?? detail.oldValue;
    if (detail.propKey === 'statusId') return statusNameMap.get(detail.oldValue) ?? detail.oldValue;
    if (detail.propKey === 'assigneeId') return assigneeNameMap.get(detail.oldValue) ?? detail.oldValue;
    if (detail.propKey === 'parentId') return issueNameMap.get(detail.oldValue) ?? detail.oldValue;
    if (detail.propKey === 'projectId') return issue?.project?.name ?? detail.oldValue;
    if (detail.propKey === 'doneRatio' && detail.oldValue) return `${detail.oldValue}%`;
    if (detail.propKey === 'description') return '（変更あり）';
    return detail.oldValue;
  };

  const renderDetail = (detail: JournalDetail) => {
    const label = propKeyLabel(detail.propKey);
    if (detail.oldValue && detail.newValue) {
      return <span><strong>{label}</strong> を <del className="text-red-500">{formatDetailOldValue(detail)}</del> から <ins className="text-green-600 no-underline">{formatDetailValue(detail)}</ins> に変更</span>;
    }
    if (detail.newValue) {
      return <span><strong>{label}</strong> を <ins className="text-green-600 no-underline">{formatDetailValue(detail)}</ins> に設定</span>;
    }
    if (detail.oldValue) {
      return <span><strong>{label}</strong>（<del className="text-red-500">{formatDetailOldValue(detail)}</del>）を削除</span>;
    }
    return <span><strong>{label}</strong> を変更</span>;
  };

  const startEditJournal = (j: Journal) => {
    setEditingJournalId(j.id);
    setEditingJournalNote(j.notes ?? '');
  };
  const cancelEditJournal = () => { setEditingJournalId(null); setEditingJournalNote(''); };
  const saveEditJournal = () => {
    if (!editingJournalId || !editingJournalNote.trim()) return;
    journalUpdateMutation.mutate(
      { id: editingJournalId, notes: editingJournalNote.trim() },
      { onSuccess: () => cancelEditJournal() },
    );
  };
  const confirmDeleteJournal = () => {
    if (!deleteJournalTarget) return;
    journalDeleteMutation.mutate(deleteJournalTarget.id, {
      onSuccess: () => setDeleteJournalTarget(null),
    });
  };

  if (isLoading) return <div className="px-4 py-8"><p className="text-slate-500">{t('app.loading')}</p></div>;
  if (isError || !issue) return <div className="px-4 py-8"><p className="text-red-600">{t('app.error')}</p></div>;

  const watchers = issue.watchers ?? [];
  const relations = issue.relations ?? [];
  const assigneeName = issue.assignee
    ? `${issue.assignee.lastname} ${issue.assignee.firstname}`.trim() || issue.assignee.login
    : '—';

  const selectCls = 'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500';
  const inputCls = selectCls;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Breadcrumb */}
      <div className="mb-4 text-sm text-slate-500">
        {(projectSlug || issue.project) && (
          <Link to={`/projects/${projectSlug || issue.project?.identifier}/issues`} className="text-primary-600 hover:underline">
            {issue.project?.name ?? projectSlug}
          </Link>
        )}
        <span className="mx-1.5">/</span>
        <span className="text-slate-400">#{issue.number}</span>
      </div>

      {/* Header: subject + edit button */}
      <div className="mb-6 flex items-start justify-between gap-4">
        {isEditing ? (
          <input type="text" value={form.subject} onChange={(e) => setField('subject', e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xl font-bold shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            autoFocus />
        ) : (
          <h1 className="text-2xl font-bold text-slate-900">
            <span className="mr-2 text-slate-400">#{issue.number}</span>
            {issue.subject}
          </h1>
        )}
        {canEditIssue && !isEditing && (
          <button type="button" onClick={enterEdit}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            <Pencil className="h-4 w-4" />
            {t('app.edit')}
          </button>
        )}
      </div>

      {/* Properties */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        {isEditing ? (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.tracker')}</label>
              <select value={form.trackerId} onChange={(e) => setField('trackerId', e.target.value)} className={selectCls}>
                {trackers.map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.status')}</label>
              <select value={form.statusId} onChange={(e) => setField('statusId', e.target.value)} className={selectCls}>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.priority')}</label>
              <select value={form.priority} onChange={(e) => setField('priority', e.target.value)} className={selectCls}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{t(`issues.priorities.${n}` as 'issues.priorities.1')}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.assignee')}</label>
              <select value={form.assigneeId} onChange={(e) => setField('assigneeId', e.target.value)} className={selectCls}>
                <option value="">—</option>
                {members.map((m) => {
                  const u = m.user;
                  if (!u) return null;
                  return <option key={u.id} value={u.id}>{`${u.lastname} ${u.firstname}`.trim() || u.login}</option>;
                })}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.parent')}</label>
              <select value={form.parentId} onChange={(e) => setField('parentId', e.target.value)} className={selectCls}>
                <option value="">—</option>
                {(projectIssues ?? []).map((iss) => (
                  <option key={iss.id} value={iss.id}>
                    #{(iss as Issue).number} {iss.subject}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.startDate')}</label>
              <input type="date" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.dueDate')}</label>
              <input type="date" value={form.dueDate} onChange={(e) => setField('dueDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.estimatedHours')}</label>
              <input type="number" step="0.5" min="0" value={form.estimatedHours}
                onChange={(e) => setField('estimatedHours', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.doneRatio')}</label>
              <div className="flex items-center gap-3">
                <input type="range" min="0" max="100" step="10" value={form.doneRatio}
                  onChange={(e) => setField('doneRatio', e.target.value)} className="flex-1" />
                <span className="w-12 text-right text-sm font-semibold text-slate-900">{form.doneRatio}%</span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.repository')}</label>
              <input type="text" value={form.repository}
                onChange={(e) => setField('repository', e.target.value)} placeholder="https://github.com/..." className={inputCls} />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">
              {[
                { label: t('issues.tracker'), value: <span className="font-medium text-slate-900">{issue.tracker?.name ?? '—'}</span> },
                { label: t('issues.status'), value: <span className="font-medium text-slate-900">{issue.status?.name ?? '—'}</span> },
                { label: t('issues.priority'), value: (
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${priorityBadgeClass(issue.priority)}`}>
                    {t(`issues.priorities.${issue.priority}` as 'issues.priorities.1')}
                  </span>
                ) },
                { label: t('issues.assignee'), value: issue.assignee
                  ? <Link to={`/users/${issue.assignee.id}`} className="font-medium text-primary-600 hover:underline">{assigneeName}</Link>
                  : <span className="font-medium text-slate-900">—</span> },
                { label: t('issues.startDate'), value: <span className="text-slate-900">{displayDate(issue.startDate)}</span> },
                { label: t('issues.dueDate'), value: <span className="text-slate-900">{displayDate(issue.dueDate)}</span> },
                { label: t('issues.estimatedHours'), value: <span className="text-slate-900">{issue.estimatedHours != null ? `${issue.estimatedHours}h` : '—'}</span> },
                { label: t('issues.doneRatio'), value: (
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${issue.doneRatio}%` }} />
                    </div>
                    <span className="text-sm font-medium text-slate-900">{issue.doneRatio}%</span>
                  </div>
                ) },
                ...((issue as Issue & { repository?: string }).repository ? [{
                  label: t('issues.repository'),
                  value: (() => {
                    const repo = (issue as Issue & { repository?: string }).repository!;
                    const isGitHub = /github\.com/i.test(repo);
                    return (
                      <span className="inline-flex items-center gap-1.5">
                        {isGitHub && (
                          <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-slate-700" fill="currentColor">
                            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                          </svg>
                        )}
                        <a href={repo} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline break-all">{repo}</a>
                      </span>
                    );
                  })(),
                }] : []),
              ].map((row, idx, arr) => (
                <div key={row.label}
                  className={`flex items-center gap-3 px-5 py-3 ${idx < arr.length - (arr.length % 2 === 0 ? 2 : 1) ? 'sm:border-b sm:border-slate-100' : ''} ${idx % 2 === 0 ? 'sm:border-r sm:border-slate-100' : ''}`}>
                  <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">{row.label}</dt>
                  <dd className="min-w-0 flex-1 text-sm">{row.value}</dd>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 px-5 py-2 text-xs text-slate-400">
              {t('issues.author')}: {issue.author ? <Link to={`/users/${issue.author.id}`} className="text-primary-600 hover:underline">{`${issue.author.lastname} ${issue.author.firstname}`.trim() || issue.author.login}</Link> : '—'}
              <span className="mx-2">|</span>
              {t('app.create')}: {format(new Date(issue.createdAt), 'yyyy-MM-dd HH:mm', { locale })}
              <span className="mx-2">|</span>
              {t('app.edit')}: {format(new Date(issue.updatedAt), 'yyyy-MM-dd HH:mm', { locale })}
            </div>
          </>
        )}
      </div>

      {/* Description */}
      <div className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{t('issues.description')}</h2>
        {isEditing ? (
          <RichTextEditor
            value={form.description}
            onChange={(v) => setField('description', v)}
            rows={8}
            showAttachments={false}
          />
        ) : (
          <div
            className="rte-preview rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            dangerouslySetInnerHTML={{ __html: descHtml || `<p class="text-slate-400">${t('app.noData')}</p>` }}
          />
        )}
      </div>

      {/* Edit action bar */}
      {isEditing && (
        <div className="mb-6 flex items-center gap-3">
          <button type="button" onClick={saveEdit} disabled={updateMutation.isPending || !form.subject.trim()}
            className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">
            {updateMutation.isPending ? t('app.loading') : t('app.save')}
          </button>
          <button type="button" onClick={cancelEdit}
            className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
            {t('app.cancel')}
          </button>
        </div>
      )}

      {/* Watchers */}
      {watchers.length > 0 && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{t('issues.watchers')}</h2>
          <div className="flex flex-wrap gap-2">
            {watchers.map((w) => {
              const u = w.user ?? (w as unknown as User);
              return (
                <span key={u.id} className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {u.lastname} {u.firstname}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Parent issue and children */}
      <div className="mb-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        {issue.parent && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{t('issues.parent')}</h2>
            <Link
              to={projectSlug || issue.project?.identifier
                ? `/projects/${projectSlug || issue.project?.identifier}/issues/${issue.parent.id}`
                : `/issues/${issue.parent.id}`}
              className="text-primary-600 hover:underline block truncate">
              {issue.parent.subject}
            </Link>
          </div>
        )}
        {issue.children && issue.children.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{t('issues.children')}</h2>
            <ul className="space-y-1">
              {issue.children.map((child) => (
                <li key={child.id}>
                  <Link
                    to={projectSlug || issue.project?.identifier
                      ? `/projects/${projectSlug || issue.project?.identifier}/issues/${child.id}`
                      : `/issues/${child.id}`}
                    className="text-primary-600 hover:underline text-sm">
                    #{child.number} {child.subject}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {relations.length > 0 && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{t('issues.relations')}</h2>
          <ul className="space-y-1">
            {relations.map((r, idx) => (
              <li key={`${r.issue.id}-${idx}`}>
                <Link
                  to={projectSlug || r.issue.project?.identifier
                    ? `/projects/${projectSlug || r.issue.project?.identifier}/issues/${r.issue.id}`
                    : `/issues/${r.issue.id}`}
                  className="text-sm text-primary-600 hover:underline">
                  {r.relationType ? `${r.relationType}: ` : ''}#{(r.issue as Issue).number || '?'} {r.issue.subject}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Activity (attribute changes only) */}
      {(() => {
        const activityJournals = journals.filter((j, jIdx) => {
          const details = (j.details ?? []).filter((d) => !(jIdx === 0 && !d.oldValue));
          return details.length > 0 && !(jIdx === 0 && details.every((d) => !d.oldValue));
        });
        if (!activityJournals.length) return null;
        return (
          <section className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{t('activity.title')}</h2>
            <ul className="mt-1.5 divide-y divide-slate-100">
              {activityJournals.map((j) => {
                const details = (j.details ?? []).filter((d) => d.oldValue || d.newValue);
                const userName = j.user ? `${j.user.lastname} ${j.user.firstname}`.trim() || j.user.login : '—';
                return (
                  <li key={j.id} className="py-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 leading-tight">
                      <span className="font-medium text-slate-600">{userName}</span>
                      <span>·</span>
                      <time dateTime={j.createdAt}>{format(new Date(j.createdAt), 'yyyy-MM-dd HH:mm', { locale })}</time>
                    </div>
                    <ul className="mt-0.5">
                      {details.map((d) => (
                        <li key={d.id} className="flex items-start gap-1 text-[11px] leading-snug text-slate-500">
                          <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                          {renderDetail(d)}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })()}

      {/* Comments */}
      {(() => {
        const commentJournals = journals.filter((j) => {
          const hasNotes = j.notes && j.notes.trim();
          const imgs = (j.attachments ?? []).filter((a) => a.contentType?.startsWith('image/'));
          const nonImgs = (j.attachments ?? []).filter((a) => !a.contentType?.startsWith('image/'));
          return hasNotes || imgs.length > 0 || nonImgs.length > 0;
        });
        return (
          <section className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{t('issues.addComment').replace('を追加', '')}</h2>
            {commentJournals.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">{t('app.noData')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {commentJournals.map((j) => {
                  const hasNotes = j.notes && j.notes.trim();
                  const imgs = (j.attachments ?? []).filter((a) => a.contentType?.startsWith('image/'));
                  const nonImgs = (j.attachments ?? []).filter((a) => !a.contentType?.startsWith('image/'));
                  const userName = j.user ? `${j.user.lastname} ${j.user.firstname}`.trim() || j.user.login : '—';
                  const canEdit = isAuthenticated && (j.userId === currentUser?.id || currentUser?.admin);
                  const isEdited = j.updatedAt && j.createdAt !== j.updatedAt;

                  return (
                    <li key={j.id} className="py-2">
                      {/* Header row: user/time + edit/delete */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 leading-tight">
                          <span className="font-medium text-slate-600">{userName}</span>
                          <span>·</span>
                          <time dateTime={j.createdAt}>{format(new Date(j.createdAt), 'yyyy-MM-dd HH:mm', { locale })}</time>
                          {isEdited && <span className="text-slate-400">{t('activity.edited')}</span>}
                        </div>
                        {canEdit && hasNotes && editingJournalId !== j.id && (
                          <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => startEditJournal(j)}
                              title={t('app.edit')}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button type="button"
                              onClick={() => setDeleteJournalTarget({ id: j.id, userName })}
                              title={t('app.delete')}
                              className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Comment body */}
                      {hasNotes && (
                        editingJournalId === j.id ? (
                          <div className="mt-1.5 space-y-1.5">
                            <RichTextEditor
                              value={editingJournalNote}
                              onChange={setEditingJournalNote}
                              rows={3}
                              showAttachments={false}
                            />
                            <div className="flex items-center gap-1.5">
                              <button type="button" onClick={saveEditJournal}
                                disabled={journalUpdateMutation.isPending || !editingJournalNote.trim()}
                                className="inline-flex items-center gap-0.5 rounded bg-primary-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
                                <Check className="h-3 w-3" /> {t('app.save')}
                              </button>
                              <button type="button" onClick={cancelEditJournal}
                                className="inline-flex items-center gap-0.5 rounded border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100">
                                <X className="h-3 w-3" /> {t('app.cancel')}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="rte-preview mt-1 text-xs text-slate-700 leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(j.notes!) }}
                          />
                        )
                      )}

                      {/* Attachment thumbnails */}
                      {imgs.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-2">
                          {imgs.map((att) => (
                            <div key={att.id} className="group/img relative">
                              <a href={`/uploads/${att.diskFilename}`} target="_blank" rel="noreferrer"
                                className="block overflow-hidden rounded border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                                <img src={`/uploads/${att.diskFilename}`} alt={att.filename}
                                  className="h-20 w-auto max-w-[140px] object-cover" loading="lazy" />
                                <span className="absolute inset-x-0 bottom-0 bg-black/50 px-1.5 py-0.5 text-[10px] text-white truncate">
                                  {att.filename}
                                </span>
                              </a>
                              {isAuthenticated && (
                                <button type="button"
                                  onClick={() => setDeleteTarget({ id: att.id, filename: att.filename })}
                                  className="absolute -right-1.5 -top-1.5 hidden rounded-full bg-white p-0.5 shadow ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600 group-hover/img:block">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {nonImgs.length > 0 && (
                        <ul className="mt-1 space-y-0">
                          {nonImgs.map((att) => (
                            <li key={att.id} className="flex items-center gap-1.5 text-xs">
                              <FileIcon className="h-3 w-3 shrink-0 text-slate-400" />
                              <a href={`/api/v1/attachments/${att.id}/download`} target="_blank" rel="noreferrer"
                                className="text-primary-600 hover:underline truncate text-[11px]">{att.filename}</a>
                              <span className="shrink-0 text-[10px] text-slate-400">{(att.filesize / 1024).toFixed(0)} KB</span>
                              {isAuthenticated && (
                                <button type="button" onClick={() => setDeleteTarget({ id: att.id, filename: att.filename })}
                                  className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })()}

      {/* Attachments */}
      {(issue.attachments?.length ?? 0) > 0 && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{t('settings.attachments')}</h2>
          <ul className="space-y-2">
            {issue.attachments!.map((att) => (
              <li key={att.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                <FileIcon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{att.filename}</span>
                <span className="shrink-0 text-xs text-slate-400">{(att.filesize / 1024).toFixed(0)} KB</span>
                <a href={`/api/v1/attachments/${att.id}/download`} target="_blank" rel="noreferrer"
                  className="shrink-0 rounded p-1 text-primary-600 hover:bg-primary-50">
                  <Download className="h-4 w-4" />
                </a>
                {isAuthenticated && (
                  <button type="button" onClick={() => setDeleteTarget({ id: att.id, filename: att.filename })}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Add comment with file attachment */}
      {canComment && !isEditing && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('issues.addComment')}</h2>
          <form onSubmit={submitComment} className="space-y-3">
            <RichTextEditor
              value={note}
              onChange={setNote}
              rows={4}
              placeholder={t('issues.addComment')}
              files={attachFiles}
              onFilesChange={setAttachFiles}
              showAttachments={true}
            />

            <button type="submit"
              disabled={(updateMutation.isPending || uploadMutation.isPending) || (!note.trim() && attachFiles.length === 0)}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              {(updateMutation.isPending || uploadMutation.isPending) ? t('app.loading') : '送信'}
            </button>
          </form>
        </section>
      )}

      {/* Delete attachment confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteTarget(null)}>
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{t('app.confirm')}</h3>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium text-slate-800">{deleteTarget.filename}</span>
              {' '}{t('app.delete')}{i18n.language?.startsWith('ja') ? 'しますか？' : '?'}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {t('app.cancel')}
              </button>
              <button type="button" onClick={confirmDelete} disabled={deleteMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {deleteMutation.isPending ? t('app.loading') : t('app.delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete comment confirmation modal */}
      {deleteJournalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteJournalTarget(null)}>
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{t('app.confirm')}</h3>
            <p className="mt-2 text-sm text-slate-600">
              このコメントを削除しますか？
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteJournalTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                いいえ
              </button>
              <button type="button" onClick={confirmDeleteJournal} disabled={journalDeleteMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {journalDeleteMutation.isPending ? t('app.loading') : 'はい'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
