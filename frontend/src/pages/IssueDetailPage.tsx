import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { format } from 'date-fns';
import { ja, enUS } from 'date-fns/locale';
import { Pencil, Paperclip, X as XIcon, FileIcon, Download, Trash2 } from 'lucide-react';
import { useIssue, useUpdateIssue, useUploadAttachments, useDeleteAttachment, useTrackers, useStatuses, useMembers } from '../api/hooks';
import { useAuthStore } from '../stores/auth';
import type { Issue, Journal, User, Attachment } from '../types';

type IssueWithExtras = Issue & {
  watchers?: { user: User }[];
  relations?: { relationType?: string; issue: Issue }[];
  attachments?: (Attachment & { diskFilename?: string })[];
};

interface EditForm {
  subject: string;
  description: string;
  trackerId: string;
  statusId: string;
  priority: string;
  assigneeId: string;
  startDate: string;
  dueDate: string;
  estimatedHours: string;
  doneRatio: string;
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

export default function IssueDetailPage() {
  const { t, i18n } = useTranslation();
  const { identifier, issueId } = useParams<{ identifier?: string; issueId?: string }>();
  const id = issueId ?? '';
  const { data, isLoading, isError } = useIssue(id);
  const updateMutation = useUpdateIssue();
  const uploadMutation = useUploadAttachments();
  const deleteMutation = useDeleteAttachment();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const issue = data?.data as IssueWithExtras | undefined;

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({
    subject: '', description: '', trackerId: '', statusId: '',
    priority: '2', assigneeId: '', startDate: '', dueDate: '',
    estimatedHours: '', doneRatio: '0',
  });
  const [note, setNote] = useState('');
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [descHtml, setDescHtml] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filename: string } | null>(null);

  const locale = i18n.language?.startsWith('ja') ? ja : enUS;
  const projectSlug = identifier ?? issue?.project?.identifier ?? '';

  const trackersQuery = useTrackers();
  const statusesQuery = useStatuses();
  const membersQuery = useMembers(issue?.project?.id ?? '');
  const trackers = trackersQuery.data?.data ?? [];
  const statuses = statusesQuery.data?.data ?? [];
  const members = membersQuery.data?.data ?? [];

  useEffect(() => {
    const raw = issue?.description;
    if (!raw) { setDescHtml(''); return; }
    const parsed = marked.parse(raw);
    Promise.resolve(parsed).then((html) => setDescHtml(sanitizeHtml(String(html))));
  }, [issue?.description]);

  const journals: Journal[] = useMemo(() => issue?.journals ?? [], [issue?.journals]);

  const enterEdit = () => {
    if (!issue) return;
    setForm({
      subject: issue.subject,
      description: issue.description ?? '',
      trackerId: issue.trackerId,
      statusId: issue.statusId,
      priority: String(issue.priority),
      assigneeId: issue.assigneeId ?? '',
      startDate: toDateStr(issue.startDate),
      dueDate: toDateStr(issue.dueDate),
      estimatedHours: issue.estimatedHours != null ? String(issue.estimatedHours) : '',
      doneRatio: String(issue.doneRatio),
    });
    setIsEditing(true);
  };

  const cancelEdit = () => setIsEditing(false);

  const saveEdit = () => {
    if (!issue || !form.subject.trim()) return;
    updateMutation.mutate(
      {
        id: issue.id,
        subject: form.subject.trim(),
        description: form.description,
        trackerId: form.trackerId,
        statusId: form.statusId,
        priority: Number(form.priority),
        assigneeId: form.assigneeId || null,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
        doneRatio: Number(form.doneRatio),
      },
      { onSuccess: () => setIsEditing(false) },
    );
  };

  const setField = (key: keyof EditForm, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const addFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    setAttachFiles((prev) => [...prev, ...Array.from(newFiles)]);
  };

  const removeFile = (idx: number) => {
    setAttachFiles((prev) => prev.filter((_, i) => i !== idx));
  };

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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  if (isLoading) return <div className="px-4 py-8"><p className="text-slate-500">{t('app.loading')}</p></div>;
  if (isError || !issue) return <div className="px-4 py-8"><p className="text-red-600">{t('app.error')}</p></div>;

  const watchers = issue.watchers ?? [];
  const relations = issue.relations ?? [];
  const assigneeName = issue.assignee
    ? `${issue.assignee.firstname} ${issue.assignee.lastname}`.trim() || issue.assignee.login
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
        {isAuthenticated && !isEditing && (
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
                  return <option key={u.id} value={u.id}>{`${u.firstname} ${u.lastname}`.trim() || u.login}</option>;
                })}
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
              ].map((row, idx, arr) => (
                <div key={row.label}
                  className={`flex items-center gap-3 px-5 py-3 ${idx < arr.length - (arr.length % 2 === 0 ? 2 : 1) ? 'sm:border-b sm:border-slate-100' : ''} ${idx % 2 === 0 ? 'sm:border-r sm:border-slate-100' : ''}`}>
                  <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">{row.label}</dt>
                  <dd className="min-w-0 flex-1 text-sm">{row.value}</dd>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 px-5 py-2 text-xs text-slate-400">
              {t('issues.author')}: {issue.author ? <Link to={`/users/${issue.author.id}`} className="text-primary-600 hover:underline">{`${issue.author.firstname} ${issue.author.lastname}`.trim() || issue.author.login}</Link> : '—'}
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
          <textarea value={form.description} onChange={(e) => setField('description', e.target.value)}
            rows={8} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500" />
        ) : (
          <div
            className="prose prose-slate max-w-none rounded-xl border border-slate-200 bg-white p-6 shadow-sm prose-headings:font-semibold prose-a:text-primary-600"
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
                  {u.firstname} {u.lastname}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Relations */}
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

      {/* Activity */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">{t('activity.title')}</h2>
        {journals.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">{t('app.noData')}</p>
        ) : (
          <ul className="mt-4 space-y-4">
            {journals.map((j) => {
              const hasNotes = j.notes && j.notes.trim();
              const imgs = (j.attachments ?? []).filter((a) => a.contentType?.startsWith('image/'));
              const nonImgs = (j.attachments ?? []).filter((a) => !a.contentType?.startsWith('image/'));
              if (!hasNotes && imgs.length === 0 && nonImgs.length === 0) return null;
              return (
                <li key={j.id} className="border-b border-slate-100 pb-4 last:border-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {j.user ? `${j.user.firstname} ${j.user.lastname}`.trim() || j.user.login : '—'}
                    </span>
                    <time dateTime={j.createdAt}>{format(new Date(j.createdAt), 'PPpp', { locale })}</time>
                  </div>
                  {hasNotes && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{j.notes}</p>}
                  {imgs.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-3">
                      {imgs.map((att) => (
                        <div key={att.id} className="group/img relative">
                          <a href={`/uploads/${att.diskFilename}`} target="_blank" rel="noreferrer"
                            className="block overflow-hidden rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                            <img src={`/uploads/${att.diskFilename}`} alt={att.filename}
                              className="h-32 w-auto max-w-[200px] object-cover" loading="lazy" />
                            <span className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-xs text-white truncate">
                              {att.filename}
                            </span>
                          </a>
                          {isAuthenticated && (
                            <button type="button"
                              onClick={() => setDeleteTarget({ id: att.id, filename: att.filename })}
                              className="absolute -right-2 -top-2 hidden rounded-full bg-white p-1 shadow-md ring-1 ring-slate-200 hover:bg-red-50 hover:text-red-600 group-hover/img:block">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {nonImgs.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {nonImgs.map((att) => (
                        <li key={att.id} className="flex items-center gap-2 text-sm">
                          <FileIcon className="h-4 w-4 shrink-0 text-slate-400" />
                          <a href={`/api/v1/attachments/${att.id}/download`} target="_blank" rel="noreferrer"
                            className="text-primary-600 hover:underline truncate">{att.filename}</a>
                          <span className="shrink-0 text-xs text-slate-400">{(att.filesize / 1024).toFixed(0)} KB</span>
                          {isAuthenticated && (
                            <button type="button" onClick={() => setDeleteTarget({ id: att.id, filename: att.filename })}
                              className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" />
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
      {isAuthenticated && !isEditing && (
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('issues.addComment')}</h2>
          <form onSubmit={submitComment} className="space-y-3">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder={t('issues.addComment')} />

            {/* File attachment area */}
            <div>
              <input ref={fileInputRef} type="file" multiple onChange={(e) => addFiles(e.target.files)}
                className="hidden" id="comment-file-input" />
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50">
                <Paperclip className="h-4 w-4" />
                {t('settings.attachments')}
              </button>
              {attachFiles.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {attachFiles.map((f, idx) => (
                    <li key={`${f.name}-${idx}`} className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-1.5 text-sm">
                      <FileIcon className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate text-slate-700">{f.name}</span>
                      <span className="shrink-0 text-xs text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                      <button type="button" onClick={() => removeFile(idx)}
                        className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-red-600">
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button type="submit"
              disabled={(updateMutation.isPending || uploadMutation.isPending) || (!note.trim() && attachFiles.length === 0)}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
              {(updateMutation.isPending || uploadMutation.isPending) ? t('app.loading') : t('app.save')}
            </button>
          </form>
        </section>
      )}

      {/* Delete confirmation modal */}
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
    </div>
  );
}
