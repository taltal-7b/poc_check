import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateIssue, useUploadAttachments, useProject, useStatuses, useMembers, useProjectIssues, useIssueCustomFields, useProjectIssueCategories } from '../api/hooks';
import { useAuthStore } from '../stores/auth';
import AppSelect from '../components/AppSelect';
import ProjectSubNav from '../components/ProjectSubNav';
import RichTextEditor from '../components/RichTextEditor';
import IssueCustomFieldInputs from '../components/IssueCustomFieldInputs';
import ProgressRangeInput from '../components/ProgressRangeInput';
import type { CustomField, Issue } from '../types';
import {
  convertEstimatedEffortInput,
  estimatedEffortUnitLabel,
  parseEstimatedEffort,
  type EstimatedEffortUnit,
} from '../utils/estimatedEffort';

function RequiredMark() {
  return <span className="ml-0.5 text-red-500">*</span>;
}

const STANDARD_FIELD_LABELS = {
  description: '説明',
  assignee: '担当者',
  category: 'カテゴリ',
  parent: '親チケット',
  startDate: '開始日',
  dueDate: '期日',
  estimatedHours: '予定工数',
  doneRatio: '進捗率',
  repository: 'リポジトリ',
} as const;

type StandardFieldKey = keyof typeof STANDARD_FIELD_LABELS;

function isStandardFieldEnabled(tracker: { standardFields?: Array<{ fieldKey: string; enabled: boolean }> } | undefined, key: StandardFieldKey) {
  return tracker?.standardFields?.find((field) => field.fieldKey === key)?.enabled ?? true;
}

function isStandardFieldRequired(tracker: { standardFields?: Array<{ fieldKey: string; enabled: boolean; required: boolean }> } | undefined, key: StandardFieldKey) {
  const setting = tracker?.standardFields?.find((field) => field.fieldKey === key);
  return (setting?.enabled ?? true) && (setting?.required ?? false);
}

function parseAssigneeValue(value: string) {
  if (value.startsWith('user:')) return { assigneeId: value.slice(5), assigneeGroupId: null };
  if (value.startsWith('group:')) return { assigneeId: null, assigneeGroupId: value.slice(6) };
  return { assigneeId: null, assigneeGroupId: null };
}

function customFieldOptions(field: CustomField): string[] {
  const raw = field.possibleValues;
  const values = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === 'string'
      ? raw.split(/\r?\n|\|/).map((v) => v.trim()).filter(Boolean)
      : [];
  if (field.fieldFormat === 'key_value') {
    return values.map((entry) => entry.match(/^([^=:\s]+)\s*[=:]\s*(.+)$/)?.[1] ?? entry);
  }
  return values;
}

function customFieldValues(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
  if (value === undefined || value === '') return [];
  return [String(value).trim()].filter(Boolean);
}

function validateCustomFieldValues(fields: CustomField[], values: Record<string, string | string[]>): string | null {
  for (const field of fields) {
    const submitted = customFieldValues(values[field.id]);
    if (field.isRequired && submitted.length === 0) return `${field.name} を入力してください`;

    const options = customFieldOptions(field);
    if ((field.fieldFormat === 'list' || field.fieldFormat === 'key_value') && options.length) {
      const invalid = submitted.find((value) => !options.includes(value));
      if (invalid) return `${field.name} の値が候補に含まれていません`;
    }

    for (const value of submitted) {
      if (field.fieldFormat === 'int' && !/^-?\d+$/.test(value)) return `${field.name} は整数で入力してください`;
      if (field.fieldFormat === 'float' && !Number.isFinite(Number(value))) return `${field.name} は数値で入力してください`;
      if (field.fieldFormat === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) {
        return `${field.name} は日付で入力してください`;
      }
      if (
        field.fieldFormat === 'progress' &&
        (!/^\d+$/.test(value) || Number(value) < 0 || Number(value) > 100 || Number(value) % 10 !== 0)
      ) {
        return `${field.name} は 0 から 100 の10%区切りで入力してください`;
      }
      if (field.fieldFormat === 'link') {
        try {
          new URL(value);
        } catch {
          return `${field.name} はURLで入力してください`;
        }
      }
    }
  }
  return null;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function todayDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const categoriesQuery = useProjectIssueCategories(project?.id ?? '', { enabled: !!project?.id });
  const projectIssuesQuery = useProjectIssues(project?.id ?? '', { perPage: 1000 }, { enabled: !!project?.id });

  const createMutation = useCreateIssue();
  const uploadMutation = useUploadAttachments();

  const [trackerId, setTrackerId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [statusId, setStatusId] = useState('');
  const [priority, setPriority] = useState(2);
  const [assigneeValue, setAssigneeValue] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [startDate, setStartDate] = useState(() => todayDateString());
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [estimatedHoursUnit, setEstimatedHoursUnit] = useState<EstimatedEffortUnit>('hours');
  const [doneRatio, setDoneRatio] = useState(0);
  const [repository, setRepository] = useState('');
  const [parentId, setParentId] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, string | string[]>>({});
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [customFieldAttachments, setCustomFieldAttachments] = useState<Array<{ value: string; label: string }>>([]);
  const [formError, setFormError] = useState('');
  const [successIssue, setSuccessIssue] = useState<{ id: string; number: number } | null>(null);
  const didDefaultAssignee = useRef(false);
  const previousTrackerIdRef = useRef<string | null>(null);
  const canCreateIssue = Boolean(project?.permissions?.canCreateIssue);

  const trackers = useMemo(
    () =>
      (project?.projectTrackers ?? [])
        .map((pt) => pt.tracker)
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [project?.projectTrackers],
  );
  const currentTracker = useMemo(() => trackers.find((tr) => tr.id === trackerId), [trackers, trackerId]);
  const fieldEnabled = (key: StandardFieldKey) => isStandardFieldEnabled(currentTracker, key);
  const fieldRequired = (key: StandardFieldKey) => isStandardFieldRequired(currentTracker, key);
  const statuses = statusesQuery.data?.data ?? [];
  const members = membersQuery.data?.data ?? [];
  const categories = categoriesQuery.data?.data ?? [];
  const projectIssues = (projectIssuesQuery.data?.data ?? []) as Issue[];

  const customFieldsQuery = useIssueCustomFields(project?.id ?? '', trackerId);

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
    if (!currentUserValue || !seen.has(currentUserValue)) return options;
    return [{ value: currentUserValue, label: '自分' }, ...options.filter((option) => option.value !== currentUserValue)];
  }, [members, currentUser?.id]);

  const customFieldUserOptions = useMemo(() => {
    const options = members
      .filter((member) => member.user)
      .map((member) => ({
        value: member.user!.id,
        label: `${`${member.user!.lastname} ${member.user!.firstname}`.trim() || member.user!.login} (${member.user!.login})`,
      }));
    if (!currentUser?.id || !options.some((option) => option.value === currentUser.id)) return options;
    return [{ value: currentUser.id, label: '自分' }, ...options.filter((option) => option.value !== currentUser.id)];
  }, [members, currentUser?.id]);

  const customFieldReferenceOptions = useMemo(() => ({
    users: customFieldUserOptions,
    issues: projectIssues.map((iss) => ({ value: iss.id, label: `#${iss.number} ${iss.subject}` })),
    attachments: customFieldAttachments,
  }), [customFieldUserOptions, projectIssues, customFieldAttachments]);

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
    if (!statuses.length) {
      setStatusId('');
      previousTrackerIdRef.current = trackerId || null;
      return;
    }
    const trackerChanged = previousTrackerIdRef.current !== trackerId;
    previousTrackerIdRef.current = trackerId || null;
    const defaultStatusId = currentTracker?.defaultStatusId;
    const nextStatusId =
      defaultStatusId && statuses.some((status) => status.id === defaultStatusId)
        ? defaultStatusId
        : statuses[0].id;
    if (!statusId || trackerChanged) setStatusId(nextStatusId);
  }, [currentTracker?.defaultStatusId, statuses, statusId, trackerId]);

  useEffect(() => {
    if (didDefaultAssignee.current || assigneeValue || !currentUser?.id) return;
    const selfValue = `user:${currentUser.id}`;
    if (assigneeOptions.some((option) => option.value === selfValue)) {
      didDefaultAssignee.current = true;
      setAssigneeValue(selfValue);
    }
  }, [assigneeOptions, assigneeValue, currentUser?.id]);

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

  const resetForNextIssue = () => {
    setSubject('');
    setDescription('');
    setDueDate('');
    setEstimatedHours('');
    setEstimatedHoursUnit('hours');
    setDoneRatio(0);
    setRepository('');
    setParentId('');
    setAttachFiles([]);
    setCustomFieldAttachments([]);
    setStartDate(todayDateString());
    setCustomFields(() => {
      const next: Record<string, string | string[]> = {};
      for (const field of customFieldsQuery.data?.data ?? []) {
        if (field.multiple) next[field.id] = [];
        else next[field.id] = field.defaultValue ?? '';
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSuccessIssue(null);
    if (!project) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const shouldContinue = submitter?.value === 'continue';
    const latest = await projectQuery.refetch();
    const latestCanCreate = Boolean(latest.data?.data?.permissions?.canCreateIssue);
    if (!latestCanCreate) return;
    if (dateValidationError) return;
    const parsedEstimatedHours = parseEstimatedEffort(estimatedHours, estimatedHoursUnit);
    if (estimatedHours.trim() && parsedEstimatedHours == null) {
      setFormError(`${t('issues.estimatedHours')} は h:mm または数値で入力してください`);
      return;
    }
    const assignee = parseAssigneeValue(assigneeValue);
    const requiredValues: Record<StandardFieldKey, boolean> = {
      description: description.trim().length > 0,
      assignee: Boolean(assignee.assigneeId || assignee.assigneeGroupId),
      category: Boolean(categoryId),
      parent: Boolean(parentId),
      startDate: Boolean(startDate),
      dueDate: Boolean(dueDate),
      estimatedHours: parsedEstimatedHours != null,
      doneRatio: true,
      repository: repository.trim().length > 0,
    };
    for (const key of Object.keys(STANDARD_FIELD_LABELS) as StandardFieldKey[]) {
      if (fieldRequired(key) && !requiredValues[key]) {
        setFormError(`${STANDARD_FIELD_LABELS[key]}を入力してください`);
        return;
      }
    }
    const customFieldValidationError = validateCustomFieldValues(customFieldsQuery.data?.data ?? [], customFields);
    if (customFieldValidationError) {
      setFormError(customFieldValidationError);
      return;
    }
    const payload = {
        projectId: project.id,
        trackerId,
        subject: subject.trim(),
        statusId,
        priority,
        ...(fieldEnabled('description') ? { description: description.trim() || null } : {}),
        ...(fieldEnabled('assignee') ? { assigneeId: assignee.assigneeId, assigneeGroupId: assignee.assigneeGroupId } : {}),
        ...(fieldEnabled('category') ? { categoryId: categoryId || null } : {}),
        ...(fieldEnabled('parent') ? { parentId: parentId || null } : {}),
        ...(fieldEnabled('startDate') ? { startDate: startDate || null } : {}),
        ...(fieldEnabled('dueDate') ? { dueDate: dueDate || null } : {}),
        ...(fieldEnabled('estimatedHours') ? { estimatedHours: parsedEstimatedHours } : {}),
        ...(fieldEnabled('doneRatio') ? { doneRatio } : {}),
        ...(fieldEnabled('repository') ? { repository: repository.trim() || null } : {}),
        customFields,
      };

    try {
      const res = await createMutation.mutateAsync(payload);
      const issue = res.data;
      if (issue?.id && attachFiles.length > 0) {
        try {
          await uploadMutation.mutateAsync({ files: attachFiles, issueId: issue.id });
        } catch {
          // navigate even if upload fails
        }
      }
      if (!issue?.id) return;
      if (shouldContinue) {
        resetForNextIssue();
        setSuccessIssue({ id: issue.id, number: issue.number });
        navigate(`/projects/${project.identifier}/issues/new`, { replace: true });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      navigate(`/projects/${project.identifier}/issues/${issue.id}`);
    } catch (error) {
      setFormError(apiErrorMessage(error, 'チケットの作成に失敗しました'));
    }
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
        {successIssue && (
          <p className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
            チケット
            <Link
              to={`/projects/${project.identifier}/issues/${successIssue.id}`}
              className="font-medium text-green-800 underline hover:text-green-900"
            >
              #{successIssue.number}
            </Link>
            が作成されました。
          </p>
        )}
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
            チケット名<RequiredMark />
          </label>
          <input
            name="issue-subject"
            autoComplete="on"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {fieldEnabled('description') && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('issues.description')}{fieldRequired('description') && <RequiredMark />}
          </label>
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
        )}
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
            options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: t(`issues.priorities.${n}` as const) }))}
            ariaLabel={t('issues.priority')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {fieldEnabled('assignee') && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('issues.assignee')}{fieldRequired('assignee') && <RequiredMark />}
          </label>
          <AppSelect
            value={assigneeValue}
            onChange={setAssigneeValue}
            options={[{ value: '', label: '-' }, ...assigneeOptions]}
            ariaLabel={t('issues.assignee')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        )}
        {fieldEnabled('category') && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('issues.category')}{fieldRequired('category') && <RequiredMark />}
          </label>
          <AppSelect
            value={categoryId}
            onChange={setCategoryId}
            options={[{ value: '', label: '-' }, ...categories.map((item) => ({ value: item.id, label: item.name }))]}
            ariaLabel={t('issues.category')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        )}
        {fieldEnabled('parent') && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('issues.parent')}{fieldRequired('parent') && <RequiredMark />}
          </label>
          <AppSelect
            value={parentId}
            onChange={setParentId}
            options={[{ value: '', label: '-' }, ...projectIssues.map((item) => ({ value: item.id, label: `#${item.number} ${item.subject}` }))]}
            ariaLabel={t('issues.parent')}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        )}
        {(fieldEnabled('startDate') || fieldEnabled('dueDate')) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {fieldEnabled('startDate') && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t('issues.startDate')}{fieldRequired('startDate') && <RequiredMark />}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          )}
          {fieldEnabled('dueDate') && (
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t('issues.dueDate')}{fieldRequired('dueDate') && <RequiredMark />}
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          )}
        </div>
        )}
        {dateValidationError && <p className="text-sm text-red-600">{dateValidationError}</p>}
        {fieldEnabled('estimatedHours') && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('issues.estimatedHours')}{fieldRequired('estimatedHours') && <RequiredMark />}
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode={estimatedHoursUnit === 'hours' ? 'text' : 'decimal'}
              value={estimatedHours}
              onChange={(e) => {
                setFormError('');
                setEstimatedHours(e.target.value);
              }}
              placeholder={estimatedHoursUnit === 'hours' ? 'h:mm' : '日数'}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="w-32 shrink-0">
              <AppSelect
                value={estimatedHoursUnit}
                onChange={(value) => {
                  const nextUnit = value as EstimatedEffortUnit;
                  setEstimatedHours((current) => convertEstimatedEffortInput(current, estimatedHoursUnit, nextUnit));
                  setEstimatedHoursUnit(nextUnit);
                }}
                options={[
                  { value: 'hours', label: estimatedEffortUnitLabel('hours') },
                  { value: 'days', label: estimatedEffortUnitLabel('days') },
                ]}
                ariaLabel={`${t('issues.estimatedHours')}の単位`}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">日入力は1日=8時間で換算します。</p>
        </div>
        )}
        {fieldEnabled('doneRatio') && (
        <div>
          <label className="mb-1 block flex justify-between text-sm font-medium text-slate-700">
            <span>{t('issues.doneRatio')}</span>
          </label>
          <ProgressRangeInput
            value={doneRatio}
            onChange={(value) => setDoneRatio(Number(value))}
          />
        </div>
        )}
        {fieldEnabled('repository') && (
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('issues.repository')}{fieldRequired('repository') && <RequiredMark />}
          </label>
          <input
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            placeholder="https://github.com/..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        )}
        <IssueCustomFieldInputs
          fields={customFieldsQuery.data?.data ?? []}
          values={customFields}
          onChange={(fieldId, value) => setCustomFields((prev) => ({ ...prev, [fieldId]: value }))}
          referenceOptions={customFieldReferenceOptions}
          onUploadFiles={uploadCustomFieldFiles}
        />
        <div className="space-y-3">
          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {formError}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="submitMode"
              value="create"
              disabled={isPending || !!dateValidationError || !canCreateIssue || !trackerId}
              className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {isPending ? t('app.loading') : t('app.create')}
            </button>
            <button
              type="submit"
              name="submitMode"
              value="continue"
              disabled={isPending || !!dateValidationError || !canCreateIssue || !trackerId}
              className="rounded-lg border border-primary-200 bg-white px-5 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-60"
            >
              連続作成
            </button>
          </div>
        </div>
        </form>
      </div>
    </div>
  );
}

