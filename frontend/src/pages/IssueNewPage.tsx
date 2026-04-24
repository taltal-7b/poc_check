import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateIssue, useUploadAttachments, useEnumerations, useProject, useStatuses, useMembers, useProjectIssues } from '../api/hooks';
import { useAuthStore } from '../stores/auth';
import RichTextEditor from '../components/RichTextEditor';
import type { Issue } from '../types';

function RequiredMark() {
  return <span className="ml-0.5 text-red-500">*</span>;
}

function parseAssigneeValue(value: string) {
  if (value.startsWith('user:')) return { assigneeId: value.slice(5), assigneeGroupId: null };
  if (value.startsWith('group:')) return { assigneeId: null, assigneeGroupId: value.slice(6) };
  return { assigneeId: null, assigneeGroupId: null };
}

export default function IssueNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { identifier } = useParams<{ identifier: string }>();
  const id = identifier ?? '';
  const currentUser = useAuthStore((s) => s.user);

  const projectQuery = useProject(id, {
    enabled: Boolean(id && currentUser?.id),
    cacheScope: currentUser?.id ?? 'signed-out',
  });
  const project = projectQuery.data?.data;

  const statusesQuery = useStatuses();
  const membersQuery = useMembers(project?.id ?? '');
  const categoriesQuery = useEnumerations('IssueCategory');
  const projectIssuesQuery = useProjectIssues(project?.id ?? '', { perPage: 1000 }, { enabled: !!project?.id });

  const createMutation = useCreateIssue();
  const uploadMutation = useUploadAttachments();

  const trackers = useMemo(
    () =>
      (project?.projectTrackers ?? [])
        .map((pt) => pt.tracker)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [project?.projectTrackers],
  );
  const statuses = statusesQuery.data?.data ?? [];
  const members = membersQuery.data?.data ?? [];
  const categories = categoriesQuery.data?.data ?? [];
  const projectIssues = (projectIssuesQuery.data?.data ?? []) as Issue[];

  const [trackerId, setTrackerId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priority, setPriority] = useState(2);
  const [assigneeValue, setAssigneeValue] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [doneRatio, setDoneRatio] = useState(0);
  const [repository, setRepository] = useState('');
  const [parentId, setParentId] = useState('');
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const canCreateIssue = Boolean(project?.permissions?.canCreateIssue);

  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>();
    return members.flatMap((member) => {
      if (member.user) {
        const value = `user:${member.user.id}`;
        if (seen.has(value)) return [];
        seen.add(value);
        const name = `${member.user.lastname} ${member.user.firstname}`.trim() || member.user.login;
        return [{ value, label: `${name} (${member.user.login})` }];
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

  const dateValidationError = useMemo(() => {
    if (!startDate || !dueDate) return '';
    if (dueDate < startDate) return t('issues.dateOrderError');
    return '';
  }, [startDate, dueDate, t]);

  useEffect(() => {
    if (!trackers.length) {
      setTrackerId('');
      return;
    }
    if (!trackers.some((tr) => tr.id === trackerId)) {
      setTrackerId(trackers[0].id);
    }
  }, [trackers, trackerId]);

  useEffect(() => {
    if (statuses.length && !statusId) setStatusId(statuses[0].id);
  }, [statuses, statusId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    const latest = await projectQuery.refetch();
    const latestCanCreate = Boolean(latest.data?.data?.permissions?.canCreateIssue);
    if (!latestCanCreate) return;
    if (dateValidationError) return;
    const assignee = parseAssigneeValue(assigneeValue);
    createMutation.mutate(
      {
        projectId: project.id,
        trackerId,
        subject: subject.trim(),
        description: description.trim() || null,
        statusId,
        priority,
        assigneeId: assignee.assigneeId,
        assigneeGroupId: assignee.assigneeGroupId,
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

  if (projectQuery.isLoading || !currentUser?.id || !project) {
    return (
      <div className="px-4 py-8">
        <p className="text-slate-500">{t('app.loading')}</p>
      </div>
    );
  }

  if (!canCreateIssue) {
    return <Navigate to={`/projects/${project.identifier}/issues`} replace />;
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
            disabled={!canCreateIssue || trackers.length === 0}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {trackers.length === 0 && <option value="">—</option>}
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
            value={assigneeValue}
            onChange={(e) => setAssigneeValue(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">—</option>
            {assigneeOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
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
        {dateValidationError && <p className="text-sm text-red-600">{dateValidationError}</p>}
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
          disabled={isPending || !!dateValidationError || !canCreateIssue || !trackerId}
          className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
        >
          {isPending ? t('app.loading') : t('app.create')}
        </button>
      </form>
    </div>
  );
}
