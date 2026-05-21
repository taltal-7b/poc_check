import { useEffect, useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { renderMarkdown } from '../components/RichTextEditor';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Pencil, FileIcon, Download, Trash2, Check, X, Rss } from 'lucide-react';
import RichTextEditor from '../components/RichTextEditor';
import AppSelect from '../components/AppSelect';
import IssueCustomFieldInputs from '../components/IssueCustomFieldInputs';
import WatchButton from '../components/WatchButton';
import ProgressRangeInput from '../components/ProgressRangeInput';
import { useDeleteIssue, useIssue, useUpdateIssue, useUploadAttachments, useDeleteAttachment, useUpdateJournal, useDeleteJournal, useTrackers, useStatuses, useMembers, useProjectIssues, useIssueCustomFields } from '../api/hooks';
import { AttachmentLink, AttachmentPreview } from '../components/AttachmentLink';
import { useAuthStore } from '../stores/auth';
import { openAuthenticatedAtom } from '../utils/atom';
import type { CustomField, Issue, IssueCustomFieldValue, Journal, JournalDetail, User, Attachment } from '../types';
import {
  convertEstimatedEffortInput,
  estimatedEffortUnitLabel,
  formatEstimatedEffort,
  parseEstimatedEffort,
  type EstimatedEffortUnit,
} from '../utils/estimatedEffort';

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
  assigneeValue: string;
  parentId: string;
  startDate: string;
  dueDate: string;
  estimatedHours: string;
  doneRatio: string;
  repository: string;
  customFields: Record<string, string | string[]>;
}

function customFieldFormValue(field: IssueCustomFieldValue): string | string[] {
  if (field.value != null) return field.value;
  if (field.multiple) return [];
  return field.defaultValue ?? '';
}

type EditableCustomField = CustomField | IssueCustomFieldValue;

function customFieldOptions(field: EditableCustomField): string[] {
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

function validateCustomFieldValues(fields: EditableCustomField[], values: Record<string, string | string[]>): string | null {
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

function parseAssigneeValue(value: string) {
  if (value.startsWith('user:')) return { assigneeId: value.slice(5), assigneeGroupId: null };
  if (value.startsWith('group:')) return { assigneeId: null, assigneeGroupId: value.slice(6) };
  return { assigneeId: null, assigneeGroupId: null };
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
  if (!d) return '-';
  try { return format(new Date(d), 'yyyy-MM-dd'); } catch { return d; }
}

function formatJournalDate(value: string): string {
  try {
    return format(new Date(value), 'yyyy年M月d日');
  } catch {
    return value;
  }
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ identifier?: string; issueId?: string }>();
  const { identifier, issueId } = params;
  const id = issueId ?? '';

  // URL parameter debug
  useEffect(() => {
    console.log('IssueDetailPage params:', { identifier, issueId, id });
  }, [identifier, issueId, id]);

  const { data, isLoading, isError, error } = useIssue(id);
  const updateMutation = useUpdateIssue();
  const issueDeleteMutation = useDeleteIssue();
  const uploadMutation = useUploadAttachments();
  const deleteMutation = useDeleteAttachment();
  const journalUpdateMutation = useUpdateJournal();
  const journalDeleteMutation = useDeleteJournal();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentUser = useAuthStore((s) => s.user);

  const issue = data?.data as IssueWithExtras | undefined;

  // Debug log
  useEffect(() => {
    console.log('IssueDetailPage:', { id, isLoading, isError, error, issueExists: !!issue });
  }, [id, isLoading, isError, error, issue]);

  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<EditForm>({
    subject: '', description: '', trackerId: '', statusId: '',
    priority: '2', assigneeValue: '', parentId: '', startDate: '', dueDate: '',
    estimatedHours: '', doneRatio: '0', repository: '', customFields: {},
  });
  const [note, setNote] = useState('');
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [descHtml, setDescHtml] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; filename: string } | null>(null);
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);
  const [editingJournalNote, setEditingJournalNote] = useState('');
  const [deleteJournalTarget, setDeleteJournalTarget] = useState<{ id: string; userName: string } | null>(null);
  const [deleteIssueConfirmOpen, setDeleteIssueConfirmOpen] = useState(false);
  const [editError, setEditError] = useState('');
  const [customFieldAttachments, setCustomFieldAttachments] = useState<Array<{ value: string; label: string }>>([]);
  const [estimatedHoursUnit, setEstimatedHoursUnit] = useState<EstimatedEffortUnit>('hours');

  const locale = ja;
  const projectSlug = identifier ?? issue?.project?.identifier ?? '';

  const trackersQuery = useTrackers();
  const statusesQuery = useStatuses();
  const membersQuery = useMembers(issue?.project?.id ?? '');
  const projectIssuesQuery = useProjectIssues(issue?.project?.id ?? '', { perPage: 1000 }, { enabled: !!issue?.project?.id });
  const editCustomFieldsQuery = useIssueCustomFields(issue?.project?.id ?? '', form.trackerId);
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
      if (m.user) {
        const label = `${m.user.lastname} ${m.user.firstname}`.trim() || m.user.login;
        map.set(m.user.id, label);
      }
      if (m.group) {
        map.set(m.group.id, m.group.name);
      }
    });
    return map;
  }, [members]);

  const assigneeOptions = useMemo(() => {
    const seen = new Set<string>();
    const currentUserValue = currentUser?.id ? `user:${currentUser.id}` : '';
    const options = members.flatMap((member) => {
      if (member.user) {
        const value = `user:${member.user.id}`;
        if (seen.has(value)) return [];
        seen.add(value);
        const label = `${member.user.lastname} ${member.user.firstname}`.trim() || member.user.login;
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
    if (!currentUserValue || !seen.has(currentUserValue)) return options;
    return [{ value: currentUserValue, label: '自分' }, ...options.filter((option) => option.value !== currentUserValue)];
  }, [members, currentUser?.id]);

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

  const attachmentNameMap = useMemo(
    () => new Map((issue?.attachments ?? []).map((attachment) => [attachment.id, attachment.filename])),
    [issue?.attachments],
  );
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
    attachments: [
      ...(issue?.attachments ?? []).map((attachment) => ({ value: attachment.id, label: attachment.filename })),
      ...customFieldAttachments,
    ],
  }), [customFieldUserOptions, projectIssues, issue?.attachments, customFieldAttachments]);

  const dateValidationError = useMemo(() => {
    if (!form.startDate || !form.dueDate) return '';
    if (form.dueDate < form.startDate) return t('issues.dateOrderError');
    return '';
  }, [form.startDate, form.dueDate, t]);

  useEffect(() => {
    if (!isEditing) return;
    const fields = editCustomFieldsQuery.data?.data ?? [];
    const issueValueMap = new Map(
      (issue?.customFields ?? []).map((field) => [field.id, customFieldFormValue(field)]),
    );
    setForm((prev) => {
      const next: Record<string, string | string[]> = {};
      for (const field of fields) {
        if (prev.customFields[field.id] !== undefined) next[field.id] = prev.customFields[field.id];
        else if (issueValueMap.has(field.id)) next[field.id] = issueValueMap.get(field.id) ?? '';
        else next[field.id] = field.multiple ? [] : field.defaultValue ?? '';
      }
      return { ...prev, customFields: next };
    });
  }, [editCustomFieldsQuery.data, isEditing, issue?.customFields]);

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

  const canEditJournal = (journalUserId: string) => {
    if (!isAuthenticated) return false;
    if (currentUser?.admin) return true;
    if (journalUserId === currentUser?.id) return canComment;
    return permissionSet.has('edit_issue_notes') || permissionSet.has('edit_issues');
  };

  const canDeleteJournal = (journalUserId: string) => {
    if (!isAuthenticated) return false;
    if (currentUser?.admin) return true;
    if (journalUserId === currentUser?.id) return canComment;
    return permissionSet.has('delete_issue_notes') || permissionSet.has('edit_issues');
  };

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
    setEditError('');
    setForm({
      subject: issue.subject,
      description: issue.description ?? '',
      trackerId: issue.trackerId,
      statusId: issue.statusId,
      priority: String(issue.priority),
      assigneeValue: issue.assigneeGroupId ? `group:${issue.assigneeGroupId}` : issue.assigneeId ? `user:${issue.assigneeId}` : '',
      parentId: issue.parentId ?? '',
      startDate: toDateStr(issue.startDate),
      dueDate: toDateStr(issue.dueDate),
      estimatedHours: issue.estimatedHours != null ? formatEstimatedEffort(issue.estimatedHours, 'hours') : '',
      doneRatio: String(issue.doneRatio),
      repository: (issue as Issue & { repository?: string }).repository ?? '',
      customFields: Object.fromEntries((issue.customFields ?? []).map((field) => [
        field.id,
        customFieldFormValue(field),
      ])),
    });
    setEstimatedHoursUnit('hours');
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setEditError('');
    setIsEditing(false);
  };

  const saveEdit = () => {
    if (!issue || !form.subject.trim()) return;
    if (!canEditIssue) return;
    if (dateValidationError) return;
    setEditError('');
    const customFieldValidationError = validateCustomFieldValues(
      editCustomFieldsQuery.data?.data ?? issue.customFields ?? [],
      form.customFields,
    );
    if (customFieldValidationError) {
      setEditError(customFieldValidationError);
      return;
    }
    const parsedEstimatedHours = parseEstimatedEffort(form.estimatedHours, estimatedHoursUnit);
    if (form.estimatedHours.trim() && parsedEstimatedHours == null) {
      setEditError(`${t('issues.estimatedHours')} は h:mm または数値で入力してください`);
      return;
    }
    const assignee = parseAssigneeValue(form.assigneeValue);
    updateMutation.mutate(
      {
        id: issue.id,
        subject: form.subject.trim(),
        description: form.description,
        trackerId: form.trackerId,
        statusId: form.statusId,
        priority: Number(form.priority),
        assigneeId: assignee.assigneeId,
        assigneeGroupId: assignee.assigneeGroupId,
        parentId: form.parentId || null,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        estimatedHours: parsedEstimatedHours,
        doneRatio: Number(form.doneRatio),
        repository: form.repository.trim() || null,
        customFields: form.customFields,
      },
      {
        onSuccess: () => {
          setEditError('');
          setIsEditing(false);
        },
        onError: (error) => setEditError(apiErrorMessage(error, 'チケットの保存に失敗しました')),
      },
    );
  };

  const setField = (key: keyof EditForm, value: string) => {
    setEditError('');
    setForm((prev) => ({ ...prev, [key]: value }));
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
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  };

  const confirmDeleteIssue = () => {
    if (!issue || !canEditIssue) return;
    issueDeleteMutation.mutate(issue.id, {
      onSuccess: () => {
        setDeleteIssueConfirmOpen(false);
        navigate(projectSlug ? `/projects/${projectSlug}/issues` : '/issues');
      },
    });
  };

  const propKeyLabel = (detail: JournalDetail): string => {
    if (detail.property === 'cf') {
      return (detail as JournalDetail & { customFieldName?: string | null }).customFieldName || detail.propKey;
    }
    const map: Record<string, string> = {
      subject: t('issues.subject'),
      description: t('issues.description'),
      trackerId: t('issues.tracker'),
      statusId: t('issues.status'),
      priority: t('issues.priority'),
      assigneeId: t('issues.assignee'),
      assigneeGroupId: t('issues.assignee'),
      categoryId: t('issues.category'),
      parentId: t('issues.parent'),
      startDate: t('issues.startDate'),
      dueDate: t('issues.dueDate'),
      estimatedHours: t('issues.estimatedHours'),
      doneRatio: t('issues.doneRatio'),
      projectId: t('projects.title'),
      repository: t('issues.repository'),
    };
    return map[detail.propKey] ?? detail.propKey;
  };

  const customFieldJournalValue = (detail: JournalDetail, rawValue: string | null): string => {
    if (!rawValue) return '';
    const field = issue?.customFields?.find((item) => item.id === detail.propKey);
    if (!field) return rawValue;
    const values = (() => {
      if (!field.multiple) return [rawValue];
      try {
        const parsed = JSON.parse(rawValue);
        return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
      } catch {
        return rawValue.split(/\r?\n/).filter(Boolean);
      }
    })();
    const labels = values.map((value) => {
      if (field.fieldFormat === 'bool') return value === '1' ? 'はい' : 'いいえ';
      if (field.fieldFormat === 'user') return assigneeNameMap.get(value) ?? value;
      if (field.fieldFormat === 'issue') return issueNameMap.get(value) ?? value;
      if (field.fieldFormat === 'attachment') return attachmentNameMap.get(value) ?? value;
      if (field.fieldFormat === 'progress') return `${value}%`;
      if (field.fieldFormat === 'key_value') {
        const rawOptions = Array.isArray(field.possibleValues)
          ? field.possibleValues.map(String)
          : typeof field.possibleValues === 'string'
            ? field.possibleValues.split(/\r?\n|\|/).map((entry) => entry.trim()).filter(Boolean)
            : [];
        const match = rawOptions
          .map((entry) => {
            const parsed = entry.match(/^([^=:\s]+)\s*[=:]\s*(.+)$/);
            return parsed ? { value: parsed[1], label: parsed[2] } : { value: entry, label: entry };
          })
          .find((entry) => entry.value === value);
        return match?.label ?? value;
      }
      return value;
    });
    return labels.join(', ');
  };

  const formatDetailValue = (detail: JournalDetail): string => {
    if (!detail.newValue) return '';
    if (detail.property === 'cf') return customFieldJournalValue(detail, detail.newValue);
    if (detail.propKey === 'priority' && detail.newValue) {
      return t(`issues.priorities.${detail.newValue}` as 'issues.priorities.1') || detail.newValue;
    }
    if (detail.propKey === 'trackerId') return trackerNameMap.get(detail.newValue) ?? detail.newValue;
    if (detail.propKey === 'statusId') return statusNameMap.get(detail.newValue) ?? detail.newValue;
    if (detail.propKey === 'assigneeId' || detail.propKey === 'assigneeGroupId') return assigneeNameMap.get(detail.newValue) ?? detail.newValue;
    if (detail.propKey === 'parentId') return issueNameMap.get(detail.newValue) ?? detail.newValue;
    if (detail.propKey === 'projectId') return issue?.project?.name ?? detail.newValue;
    if (detail.propKey === 'doneRatio' && detail.newValue) return `${detail.newValue}%`;
    if (detail.propKey === 'startDate' || detail.propKey === 'dueDate') {
      return formatJournalDate(detail.newValue);
    }
    if (detail.propKey === 'description') return '変更あり';
    return detail.newValue;
  };

  const formatDetailOldValue = (detail: JournalDetail): string => {
    if (!detail.oldValue) return '';
    if (detail.property === 'cf') return customFieldJournalValue(detail, detail.oldValue);
    if (detail.propKey === 'priority' && detail.oldValue) {
      return t(`issues.priorities.${detail.oldValue}` as 'issues.priorities.1') || detail.oldValue;
    }
    if (detail.propKey === 'trackerId') return trackerNameMap.get(detail.oldValue) ?? detail.oldValue;
    if (detail.propKey === 'statusId') return statusNameMap.get(detail.oldValue) ?? detail.oldValue;
    if (detail.propKey === 'assigneeId' || detail.propKey === 'assigneeGroupId') return assigneeNameMap.get(detail.oldValue) ?? detail.oldValue;
    if (detail.propKey === 'parentId') return issueNameMap.get(detail.oldValue) ?? detail.oldValue;
    if (detail.propKey === 'projectId') return issue?.project?.name ?? detail.oldValue;
    if (detail.propKey === 'doneRatio' && detail.oldValue) return `${detail.oldValue}%`;
    if (detail.propKey === 'startDate' || detail.propKey === 'dueDate') {
      return formatJournalDate(detail.oldValue);
    }
    if (detail.propKey === 'description') return '変更あり';
    return detail.oldValue;
  };

  const renderDetail = (detail: JournalDetail) => {
    const label = propKeyLabel(detail);
    if (detail.oldValue && detail.newValue) {
      return <span><strong>{label}</strong> を <del className="text-red-500">{formatDetailOldValue(detail)}</del> から <ins className="text-green-600 no-underline">{formatDetailValue(detail)}</ins> に変更</span>;
    }
    if (detail.newValue) {
      return <span><strong>{label}</strong> を <ins className="text-green-600 no-underline">{formatDetailValue(detail)}</ins> に設定</span>;
    }
    if (detail.oldValue) {
      return <span><strong>{label}</strong> <del className="text-red-500">{formatDetailOldValue(detail)}</del> を削除</span>;
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
    : issue.assigneeGroup?.name ?? '-';

  const selectCls = 'w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500';
  const inputCls = selectCls;
  const issueDetailBase = projectSlug || issue.project?.identifier
    ? `/projects/${projectSlug || issue.project?.identifier}/issues`
    : '/issues';
  const issueAtomUrl = projectSlug || issue.project?.identifier
    ? `/api/v1/projects/${projectSlug || issue.project?.identifier}/issues/${issue.id}/atom`
    : `/api/v1/issues/${issue.id}/atom`;
  const openIssueAtom = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    await openAuthenticatedAtom(issueAtomUrl);
  };
  const repositoryValue = (issue as Issue & { repository?: string }).repository;
  const customFieldDisplayText = (field: IssueCustomFieldValue): string => {
    const raw = field.value;
    const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const labels = values.map((value) => {
      if (field.fieldFormat === 'bool') return value === '1' ? 'はい' : 'いいえ';
      if (field.fieldFormat === 'user') return assigneeNameMap.get(value) ?? value;
      if (field.fieldFormat === 'issue') return issueNameMap.get(value) ?? value;
      if (field.fieldFormat === 'attachment') return attachmentNameMap.get(value) ?? value;
      if (field.fieldFormat === 'progress') return `${value}%`;
      if (field.fieldFormat === 'key_value') {
        const rawOptions = Array.isArray(field.possibleValues)
          ? field.possibleValues.map(String)
          : typeof field.possibleValues === 'string'
            ? field.possibleValues.split(/\r?\n|\|/).map((entry) => entry.trim()).filter(Boolean)
            : [];
        const match = rawOptions
          .map((entry) => {
            const parsed = entry.match(/^([^=:\s]+)\s*[=:]\s*(.+)$/);
            return parsed ? { value: parsed[1], label: parsed[2] } : { value: entry, label: entry };
          })
          .find((entry) => entry.value === value);
        return match?.label ?? value;
      }
      return value;
    });
    return labels.join(', ');
  };
  const customFieldRows = (issue.customFields ?? []).map((field) => {
    const text = customFieldDisplayText(field);
    const value = text
      ? field.fieldFormat === 'link'
        ? <a href={text} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline break-all">{text}</a>
        : field.fieldFormat === 'attachment' && !Array.isArray(field.value)
          ? (
            <AttachmentLink id={String(field.value)} filename={text} className="text-primary-600 hover:underline break-all">
              {text}
            </AttachmentLink>
          )
        : field.fieldFormat === 'progress'
          ? (
            <div className="flex items-center gap-3">
              <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: text }} />
              </div>
              <span className="text-sm font-medium text-slate-900">{text}</span>
            </div>
          )
        : <span className="text-slate-900 whitespace-pre-wrap">{text}</span>
      : <span className="text-slate-900">-</span>;
    return { key: `cf-${field.id}`, label: field.name, value };
  });
  const propertyRows: Array<{ key: string; label: string; value: ReactNode }> = [
    { key: 'tracker', label: t('issues.tracker'), value: <span className="font-medium text-slate-900">{issue.tracker?.name ?? '-'}</span> },
    { key: 'status', label: t('issues.status'), value: <span className="font-medium text-slate-900">{issue.status?.name ?? '-'}</span> },
    {
      key: 'priority',
      label: t('issues.priority'),
      value: (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${priorityBadgeClass(issue.priority)}`}>
          {t(`issues.priorities.${issue.priority}` as 'issues.priorities.1')}
        </span>
      ),
    },
    {
      key: 'assignee',
      label: t('issues.assignee'),
      value: issue.assignee
        ? <Link to={`/users/${issue.assignee.id}`} className="font-medium text-primary-600 hover:underline">{assigneeName}</Link>
        : issue.assigneeGroup
          ? <span className="font-medium text-slate-900">[グループ] {issue.assigneeGroup.name}</span>
        : <span className="font-medium text-slate-900">-</span>,
    },
    { key: 'startDate', label: t('issues.startDate'), value: <span className="text-slate-900">{displayDate(issue.startDate)}</span> },
    { key: 'dueDate', label: t('issues.dueDate'), value: <span className="text-slate-900">{displayDate(issue.dueDate)}</span> },
    { key: 'estimatedHours', label: t('issues.estimatedHours'), value: <span className="text-slate-900">{issue.estimatedHours != null ? `${issue.estimatedHours}h` : '-'}</span> },
    {
      key: 'doneRatio',
      label: t('issues.doneRatio'),
      value: (
        <div className="flex items-center gap-3">
          <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${issue.doneRatio}%` }} />
          </div>
          <span className="text-sm font-medium text-slate-900">{issue.doneRatio}%</span>
        </div>
      ),
    },
    {
      key: 'parent',
      label: t('issues.parent'),
      value: issue.parent
        ? (
          <Link to={`${issueDetailBase}/${issue.parent.id}`} className="text-primary-600 hover:underline">
            {issue.parent.subject}
          </Link>
        )
        : <span className="text-slate-900">-</span>,
    },
    ...(repositoryValue ? [{
      key: 'repository',
      label: t('issues.repository'),
      value: (() => {
        const repo = repositoryValue;
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
    ...customFieldRows,
    {
      key: 'children',
      label: t('issues.children'),
      value: issue.children && issue.children.length > 0
        ? (
          <ul className="space-y-0.5">
            {issue.children.map((child) => (
              <li key={child.id}>
                <Link to={`${issueDetailBase}/${child.id}`} className="text-primary-600 hover:underline text-sm">
                  #{child.number} {child.subject}
                </Link>
              </li>
            ))}
          </ul>
        )
        : <span className="text-slate-900">-</span>,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Context header */}
      <div className="mb-4 text-sm text-slate-500">
        <span>{issue.project?.name ?? projectSlug ?? '-'}</span>
        {issue.parent ? (
          <>
            <span className="mx-1.5">/</span>
            <Link to={`${issueDetailBase}/${issue.parent.id}`} className="text-primary-600 hover:underline">
              {issue.parent.subject}
            </Link>
          </>
        ) : null}
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
        {!isEditing && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <WatchButton watchableType="Issue" watchableId={issue.id} />
            {canEditIssue && (
              <button type="button" onClick={enterEdit}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                <Pencil className="h-4 w-4" />
                {t('app.edit')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Properties */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        {isEditing ? (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.tracker')}</label>
              <AppSelect
                value={form.trackerId}
                onChange={(value) => setField('trackerId', value)}
                options={trackers.map((tr) => ({ value: tr.id, label: tr.name }))}
                ariaLabel={t('issues.tracker')}
                className={selectCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.status')}</label>
              <AppSelect
                value={form.statusId}
                onChange={(value) => setField('statusId', value)}
                options={statuses.map((item) => ({ value: item.id, label: item.name }))}
                ariaLabel={t('issues.status')}
                className={selectCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.priority')}</label>
              <AppSelect
                value={form.priority}
                onChange={(value) => setField('priority', value)}
                options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: t(`issues.priorities.${n}` as 'issues.priorities.1') }))}
                ariaLabel={t('issues.priority')}
                className={selectCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.assignee')}</label>
              <AppSelect
                value={form.assigneeValue}
                onChange={(value) => setField('assigneeValue', value)}
                options={[{ value: '', label: '-' }, ...assigneeOptions]}
                ariaLabel={t('issues.assignee')}
                className={selectCls}
              />
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
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode={estimatedHoursUnit === 'hours' ? 'text' : 'decimal'}
                  value={form.estimatedHours}
                  onChange={(e) => setField('estimatedHours', e.target.value)}
                  placeholder={estimatedHoursUnit === 'hours' ? 'h:mm' : '日数'}
                  className={`${inputCls} min-w-0 flex-1`}
                />
                <div className="w-28 shrink-0">
                  <AppSelect
                    value={estimatedHoursUnit}
                    onChange={(value) => {
                      const nextUnit = value as EstimatedEffortUnit;
                      setForm((prev) => ({
                        ...prev,
                        estimatedHours: convertEstimatedEffortInput(prev.estimatedHours, estimatedHoursUnit, nextUnit),
                      }));
                      setEstimatedHoursUnit(nextUnit);
                      setEditError('');
                    }}
                    options={[
                      { value: 'hours', label: estimatedEffortUnitLabel('hours') },
                      { value: 'days', label: estimatedEffortUnitLabel('days') },
                    ]}
                    ariaLabel={`${t('issues.estimatedHours')}の単位`}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.doneRatio')}</label>
              <ProgressRangeInput value={form.doneRatio} onChange={(value) => setField('doneRatio', value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.parent')}</label>
              <AppSelect
                value={form.parentId}
                onChange={(value) => setField('parentId', value)}
                options={[
                  { value: '', label: '-' },
                  ...(projectIssues ?? []).map((item) => ({ value: item.id, label: `#${(item as Issue).number} ${item.subject}` })),
                ]}
                ariaLabel={t('issues.parent')}
                className={selectCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.repository')}</label>
              <input type="text" value={form.repository}
                onChange={(e) => setField('repository', e.target.value)} placeholder="https://github.com/..." className={inputCls} />
            </div>
            <IssueCustomFieldInputs
              fields={editCustomFieldsQuery.data?.data ?? issue.customFields ?? []}
              values={form.customFields}
              onChange={(fieldId, value) => {
                setEditError('');
                setForm((prev) => ({
                  ...prev,
                  customFields: { ...prev.customFields, [fieldId]: value },
                }));
              }}
              referenceOptions={customFieldReferenceOptions}
              onUploadFiles={async (files, fieldId) => {
                const res = await uploadMutation.mutateAsync({ files, issueId: issue.id, description: `custom-field:${fieldId}` });
                const uploaded = ((res.data?.attachments ?? []) as Array<{ id?: string; filename?: string }>).flatMap((attachment) =>
                  attachment.id ? [{ value: attachment.id, label: attachment.filename ?? attachment.id }] : [],
                );
                setCustomFieldAttachments((prev) => {
                  const seen = new Set(prev.map((item) => item.value));
                  return [...prev, ...uploaded.filter((item) => !seen.has(item.value))];
                });
                return uploaded;
              }}
              labelClassName="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500"
              inputClassName={inputCls}
            />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">
              {propertyRows.map((row, idx, arr) => (
                <div key={row.key}
                  className={`flex items-center gap-3 px-5 py-3 ${idx < arr.length - (arr.length % 2 === 0 ? 2 : 1) ? 'sm:border-b sm:border-slate-100' : ''} ${idx % 2 === 0 ? 'sm:border-r sm:border-slate-100' : ''}`}>
                  <dt className="w-24 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">{row.label}</dt>
                  <dd className="min-w-0 flex-1 text-sm">{row.value}</dd>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 px-5 py-2 text-xs text-slate-400">
              {t('issues.author')}: {issue.author ? <Link to={`/users/${issue.author.id}`} className="text-primary-600 hover:underline">{`${issue.author.lastname} ${issue.author.firstname}`.trim() || issue.author.login}</Link> : '-'}
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
        <div className="mb-6 space-y-3">
          {(editError || dateValidationError) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {editError || dateValidationError}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button type="button" onClick={saveEdit} disabled={updateMutation.isPending || !form.subject.trim() || !!dateValidationError}
                className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50">
                {updateMutation.isPending ? t('app.loading') : t('app.save')}
              </button>
              <button type="button" onClick={cancelEdit}
                className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                {t('app.cancel')}
              </button>
            </div>
            <button type="button" onClick={() => setDeleteIssueConfirmOpen(true)}
              className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700">
              {t('app.delete')}
            </button>
          </div>
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
        const latestFiveActivityJournals = activityJournals.slice(-5);
        if (!latestFiveActivityJournals.length) return null;
        return (
          <section className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{t('activity.title')}（最新5件）</h2>
            <ul className="mt-1.5 divide-y divide-slate-100">
              {latestFiveActivityJournals.map((j) => {
                const details = (j.details ?? []).filter((d) => d.oldValue || d.newValue);
                const userName = j.user ? `${j.user.lastname} ${j.user.firstname}`.trim() || j.user.login : '-';
                return (
                  <li key={j.id} className="py-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 leading-tight">
                      <span className="font-medium text-slate-600">{userName}</span>
                      <span>・</span>
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
            <h2 className="text-sm font-semibold text-slate-900">{t('issues.addComment')}</h2>
            {commentJournals.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">{t('app.noData')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100">
                {commentJournals.map((j) => {
                  const hasNotes = j.notes && j.notes.trim();
                  const imgs = (j.attachments ?? []).filter((a) => a.contentType?.startsWith('image/'));
                  const nonImgs = (j.attachments ?? []).filter((a) => !a.contentType?.startsWith('image/'));
                  const userName = j.user ? `${j.user.lastname} ${j.user.firstname}`.trim() || j.user.login : '-';
                  const canEdit = canEditJournal(j.userId);
                  const canDelete = canDeleteJournal(j.userId);
                  const isEdited = j.updatedAt && j.createdAt !== j.updatedAt;

                  return (
                    <li key={j.id} className="py-2">
                      {/* Header row: user/time + edit/delete */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 leading-tight">
                          <span className="font-medium text-slate-600">{userName}</span>
                          <span>・</span>
                          <time dateTime={j.createdAt}>{format(new Date(j.createdAt), 'yyyy-MM-dd HH:mm', { locale })}</time>
                          {isEdited && <span className="text-slate-400">{t('activity.edited')}</span>}
                        </div>
                        {(canEdit || canDelete) && hasNotes && editingJournalId !== j.id && (
                          <div className="flex items-center gap-0.5">
                            {canEdit && (
                              <button type="button" onClick={() => startEditJournal(j)}
                                title={t('app.edit')}
                                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canDelete && (
                              <button type="button"
                                onClick={() => setDeleteJournalTarget({ id: j.id, userName })}
                                title={t('app.delete')}
                                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
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
                              <AttachmentPreview
                                id={att.id}
                                filename={att.filename}
                                linkClassName="block overflow-hidden rounded border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                                imageClassName="h-20 w-auto max-w-[140px] object-cover"
                              />
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
                              <AttachmentLink id={att.id} filename={att.filename}
                                className="text-primary-600 hover:underline truncate text-[11px]">{att.filename}</AttachmentLink>
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
                <AttachmentLink id={att.id} filename={att.filename}
                  className="shrink-0 rounded p-1 text-primary-600 hover:bg-primary-50">
                  <Download className="h-4 w-4" />
                </AttachmentLink>
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

            <div className="flex items-center justify-between gap-3">
              <button type="submit"
                disabled={(updateMutation.isPending || uploadMutation.isPending) || (!note.trim() && attachFiles.length === 0)}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
                {(updateMutation.isPending || uploadMutation.isPending) ? t('app.loading') : '送信'}
              </button>
              <a
                href={issueAtomUrl}
                onClick={openIssueAtom}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Rss className="h-4 w-4" />
                Atom
              </a>
            </div>
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
              {' '}を削除しますか？
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

      {/* Delete issue confirmation modal */}
      {deleteIssueConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteIssueConfirmOpen(false)}>
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{t('app.confirm')}</h3>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium text-slate-800">#{issue.number} {issue.subject}</span>
              {' '}を削除します。よろしいですか？
            </p>
            {issueDeleteMutation.isError && (
              <p className="mt-3 text-sm text-red-600">{t('app.error')}</p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteIssueConfirmOpen(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {t('app.cancel')}
              </button>
              <button type="button" onClick={confirmDeleteIssue} disabled={issueDeleteMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {issueDeleteMutation.isPending ? t('app.loading') : t('app.delete')}
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

