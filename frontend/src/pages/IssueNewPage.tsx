import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateIssue, useUploadAttachments, useEnumerations, useProject, useStatuses, useMembers, useProjectIssues, useIssueCustomFields } from '../api/hooks';
import { useAuthStore } from '../stores/auth';
import AppSelect from '../components/AppSelect';
import ProjectSubNav from '../components/ProjectSubNav';
import RichTextEditor from '../components/RichTextEditor';
import IssueCustomFieldInputs from '../components/IssueCustomFieldInputs';
import ProgressRangeInput from '../components/ProgressRangeInput';
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
  const [customFields, setCustomFields] = useState<Record<string, string | string[]>>({});
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [customFieldAttachments, setCustomFieldAttachments] = useState<Array<{ value: string; label: string }>>([]);
  const canCreateIssue = Boolean(project?.permissions?.canCreateIssue);
  const customFieldsQuery = useIssueCustomFields(project?.id ?? '', trackerId);

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

  const customFieldReferenceOptions = useMemo(() => ({
    users: members
      .filter((member) => member.user)
      .map((member) => ({
        value: member.user!.id,
        label: `${`${member.user!.lastname} ${member.user!.firstname}`.trim() || member.user!.login} (${member.user!.login})`,
      })),
    issues: projectIssues.map((iss) => ({ value: iss.id, label: `#${iss.number} ${iss.subject}` })),
    attachments: customFieldAttachments,
  }), [members, projectIssues, customFieldAttachments]);

  const uploadCustomFieldFiles = async (files: File[], fieldId: string) => {
    const res = await uploadMutation.mutateAsync({ files, description: `custom-field:${fieldId}` });
    const uploaded = ((res.data?.attachments ?? []) as Array<{ id?: string; filename?: string }>).flatMap((attachment) =>
      attachment.id ? [{ value: attachment.id, label: attachment.filename ?? attachment.id }] : [],
    );
    setCustomFieldAttachments((prev) => {
      const seen = new Set(prev.map((item) => item.value));
      return [...prev, ...uploaded.filter((item) => !seen.has(item.value))];
    });
    return uploaded;
  };

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

  useEffect(() => {
    const fields = customFieldsQuery.data?.data ?? [];
    setCustomFields((prev) => {
      const next: Record<string, string | string[]> = {};
      for (const field of fields) {
        if (prev[field.id] !== undefined) next[field.id] = prev[field.id];
        else if (field.multiple) next[field.id] = [];
        else next[field.id] = field.defaultValue ?? '';
      }
      return next;
    });
  }, [customFieldsQuery.data]);

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
        parentId: parentId || null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        estimatedHours: estimatedHours === '' ? null : Number(estimatedHours),
        doneRatio,
        repository: repository.trim() || null,
        customFields,
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
      <div className="space-y-6">
        {id && <ProjectSubNav identifier={id} />}
        <div className="mx-auto max-w-3xl px-4 py-8">
          <p className="text-slate-500">{t('app.loading')}</p>
        </div>
      </div>
    );
  }

  if (!canCreateIssue) {
    return <Navigate to={`/projects/${project.identifier}/issues`} replace />;
  }

  return (
    <div className="space-y-6">
      <ProjectSubNav identifier={project.identifier} />
      <div className="mx-auto max-w-3xl px-4 py-2">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">{t('issues.new')}</h1>
        <p className="mb-6 text-sm text-slate-500">
          {project.name} <span className="font-mono">({project.identifier})</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('issues.tracker')}<RequiredMark />
          </label>
          <AppSelect
            value={trackerId}
            onChange={setTrackerId}
            options={trackers.length === 0 ? [{ value: '', label: '-' }] : trackers.map((tr) => ({ value: tr.id, label: tr.name }))}
            ariaLabel={t('issues.tracker')}
            disabled={!canCreateIssue || trackers.length === 0}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
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
          <AppSelect
            value={statusId}
            onChange={setStatusId}
            options={statuses.map((item) => ({ value: item.id, label: item.name }))}
            ariaLabel={t('issues.status')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('issues.priority')}<RequiredMark />
          </label>
          <AppSelect
            value={String(priority)}
            onChange={(value) => setPriority(Number(value))}
            options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: t(`issues.priorities.${n}` as const) }))}
            ariaLabel={t('issues.priority')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('issues.assignee')}</label>
          <AppSelect
            value={assigneeValue}
            onChange={setAssigneeValue}
            options={[{ value: '', label: '-' }, ...assigneeOptions]}
            ariaLabel={t('issues.assignee')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('issues.category')}</label>
          <AppSelect
            value={categoryId}
            onChange={setCategoryId}
            options={[{ value: '', label: '-' }, ...categories.map((item) => ({ value: item.id, label: item.name }))]}
            ariaLabel={t('issues.category')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('issues.parent')}</label>
          <AppSelect
            value={parentId}
            onChange={setParentId}
            options={[{ value: '', label: '-' }, ...projectIssues.map((item) => ({ value: item.id, label: `#${item.number} ${item.subject}` }))]}
            ariaLabel={t('issues.parent')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
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
          </label>
          <ProgressRangeInput
            value={doneRatio}
            onChange={(value) => setDoneRatio(Number(value))}
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
        <IssueCustomFieldInputs
          fields={customFieldsQuery.data?.data ?? []}
          values={customFields}
          onChange={(fieldId, value) => setCustomFields((prev) => ({ ...prev, [fieldId]: value }))}
          referenceOptions={customFieldReferenceOptions}
          onUploadFiles={uploadCustomFieldFiles}
        />
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
    </div>
  );
}

