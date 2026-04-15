import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateIssue, useUploadAttachments, useEnumerations, useProject, useStatuses, useTrackers, useUsers, useProjectIssues } from '../api/hooks';
import RichTextEditor from '../components/RichTextEditor';
import type { Issue } from '../types';

function RequiredMark() {
  return <span className="ml-0.5 text-red-500">*</span>;
}

export default function IssueNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { identifier } = useParams<{ identifier: string }>();
  const id = identifier ?? '';

  const projectQuery = useProject(id);
  const project = projectQuery.data?.data;

  const trackersQuery = useTrackers();
  const statusesQuery = useStatuses();
  const usersQuery = useUsers({ limit: 500 });
  const categoriesQuery = useEnumerations('IssueCategory');
  const projectIssuesQuery = useProjectIssues(project?.id ?? '', { perPage: 1000 }, { enabled: !!project?.id });

  const createMutation = useCreateIssue();
  const uploadMutation = useUploadAttachments();

  const trackers = trackersQuery.data?.data ?? [];
  const statuses = statusesQuery.data?.data ?? [];
  const users = usersQuery.data?.data ?? [];
  const categories = categoriesQuery.data?.data ?? [];
  const projectIssues = (projectIssuesQuery.data?.data ?? []) as Issue[];

  const [trackerId, setTrackerId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priority, setPriority] = useState(2);
  const [assigneeId, setAssigneeId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [doneRatio, setDoneRatio] = useState(0);
  const [repository, setRepository] = useState('');
  const [parentId, setParentId] = useState('');
  const [attachFiles, setAttachFiles] = useState<File[]>([]);

  useEffect(() => {
    if (trackers.length && !trackerId) setTrackerId(trackers[0].id);
  }, [trackers, trackerId]);

  useEffect(() => {
    if (statuses.length && !statusId) setStatusId(statuses[0].id);
  }, [statuses, statusId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    createMutation.mutate(
      {
        projectId: project.id,
        trackerId,
        subject: subject.trim(),
        description: description.trim() || null,
        statusId,
        priority,
        assigneeId: assigneeId || null,
        categoryId: categoryId || null,
        versionId: null,
        parentId: parentId || null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        estimatedHours: estimatedHours === '' ? null : Number(estimatedHours),
        doneRatio,
        repository: repository.trim() || null,
      },
      {
        onSuccess: async (res) => {
          const issue = res.data;
          if (issue?.id && attachFiles.length > 0) {
            try {
              await uploadMutation.mutateAsync({ files: attachFiles, issueId: issue.id });
            } catch {
              // navigate even if upload fails
            }
          }
          if (issue?.id) navigate(`/projects/${project.identifier}/issues/${issue.id}`);
        },
      },
    );
  };

  const isPending = createMutation.isPending || uploadMutation.isPending;

  if (projectQuery.isLoading || !project) {
    return (
      <div className="px-4 py-8">
        <p className="text-slate-500">{t('app.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-slate-900">{t('issues.new')}</h1>
      <p className="mb-6 text-sm text-slate-500">
        {project.name} <span className="font-mono">({project.identifier})</span>
      </p>
      <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('issues.tracker')}<RequiredMark />
          </label>
          <select
            value={trackerId}
            onChange={(e) => setTrackerId(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {trackers.map((tr) => (
              <option key={tr.id} value={tr.id}>{tr.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('issues.subject')}<RequiredMark />
          </label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('issues.description')}</label>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            rows={8}
            placeholder={t('issues.description')}
            files={attachFiles}
            onFilesChange={setAttachFiles}
            showAttachments={true}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('issues.status')}<RequiredMark />
          </label>
          <select
            value={statusId}
            onChange={(e) => setStatusId(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('issues.priority')}<RequiredMark />
          </label>
          <select
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{t(`issues.priorities.${n}` as const)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('issues.assignee')}</label>
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.lastname} {u.firstname} ({u.login})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('issues.category')}</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('issues.parent')}</label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {projectIssues.map((iss) => (
              <option key={iss.id} value={iss.id}>
                #{iss.number} {iss.subject}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('issues.startDate')}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('issues.dueDate')}</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('issues.estimatedHours')}</label>
          <input
            type="number"
            step="0.25"
            min={0}
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block flex justify-between text-sm font-medium text-slate-700">
            <span>{t('issues.doneRatio')}</span>
            <span>{doneRatio}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={doneRatio}
            onChange={(e) => setDoneRatio(Number(e.target.value))}
            className="w-full accent-primary-600"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('issues.repository')}</label>
          <input
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            placeholder="https://github.com/..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {createMutation.isError && <p className="text-sm text-red-600">{t('app.error')}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {isPending ? t('app.loading') : t('app.create')}
        </button>
      </form>
    </div>
  );
}
