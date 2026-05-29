import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { CircleHelp } from 'lucide-react';
import ProjectSubNav from '../components/ProjectSubNav';
import AppSelect from '../components/AppSelect';
import { useDeleteProject, useProject, useProjectCustomFields, useProjects, useTrackers, useUpdateProject } from '../api/hooks';

const DEFAULT_MODULES = [
  'issue_tracking',
  'time_tracking',
  'news',
  'documents',
  'files',
  'wiki',
  'repository',
  'boards',
  'calendar',
  'gantt',
];

const MODULE_LABELS: Record<string, string> = {
  issue_tracking: 'チケット',
  time_tracking: '時間管理',
  news: 'ニュース',
  documents: '文書',
  files: 'ファイル',
  wiki: 'Wiki',
  repository: 'リポジトリ',
  boards: 'フォーラム',
  calendar: 'カレンダー',
  gantt: 'ガントチャート',
};

const STATUS_ACTIVE = 1;
const STATUS_ARCHIVED = 5;
const STATUS_CLOSED = 9;

type ConfirmAction = 'save' | 'archive' | 'unarchive' | 'close' | 'reopen' | 'delete' | null;

function normalizeSelectedKeys(selected: Record<string, boolean>): string[] {
  return Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort();
}

export default function ProjectSettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { identifier } = useParams<{ identifier: string }>();
  const id = identifier ?? '';

  const { data, isLoading } = useProject(id);
  const project = data?.data;
  const canManageProject = Boolean(project?.permissions?.canManageProject);

  const projectsQuery = useProjects();
  const trackersQuery = useTrackers();
  const customFieldsQuery = useProjectCustomFields(id, canManageProject);
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [parentId, setParentId] = useState('');
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>({});
  const [selectedTrackerIds, setSelectedTrackerIds] = useState<Record<string, boolean>>({});
  const [selectedCustomFieldIds, setSelectedCustomFieldIds] = useState<Record<string, boolean>>({});
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<{
    name: string;
    slug: string;
    description: string;
    isPublic: boolean;
    parentId: string;
    modules: string[];
    trackers: string[];
    customFields: string[];
  } | null>(null);

  const projects = projectsQuery.data?.data ?? [];
  const trackers = trackersQuery.data?.data ?? [];
  const issueCustomFields = useMemo(
    () => customFieldsQuery.data?.data ?? [],
    [customFieldsQuery.data],
  );

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setSlug(project.identifier);
    setDescription(project.description ?? '');
    setIsPublic(project.isPublic);
    setParentId(project.parentId ?? '');
    const mods: Record<string, boolean> = {};
    DEFAULT_MODULES.forEach((m) => {
      mods[m] = project.enabledModules?.some((e) => e.name === m) ?? false;
    });
    setEnabledModules(mods);
    const tr: Record<string, boolean> = {};
    trackers.forEach((x) => {
      tr[x.id] = true;
    });
    setSelectedTrackerIds(tr);
    const cf: Record<string, boolean> = {};
    issueCustomFields.forEach((field) => {
      cf[field.id] = project.projectCustomFields?.some((row) => row.customFieldId === field.id) ?? false;
    });
    setSelectedCustomFieldIds(cf);
    setInitialSnapshot({
      name: project.name.trim(),
      slug: project.identifier.trim(),
      description: (project.description ?? '').trim(),
      isPublic: project.isPublic,
      parentId: project.parentId ?? '',
      modules: normalizeSelectedKeys(mods),
      trackers: normalizeSelectedKeys(tr),
      customFields: normalizeSelectedKeys(cf),
    });
  }, [project, trackers, issueCustomFields]);

  const moduleList = useMemo(
    () => Object.entries(enabledModules).filter(([, v]) => v).map(([k]) => k),
    [enabledModules],
  );
  const trackerIds = useMemo(
    () => Object.entries(selectedTrackerIds).filter(([, v]) => v).map(([x]) => x),
    [selectedTrackerIds],
  );
  const customFieldIds = useMemo(
    () => Object.entries(selectedCustomFieldIds).filter(([, v]) => v).map(([x]) => x),
    [selectedCustomFieldIds],
  );

  const currentSnapshot = useMemo(
    () => ({
      name: name.trim(),
      slug: slug.trim(),
      description: description.trim(),
      isPublic,
      parentId,
      modules: normalizeSelectedKeys(enabledModules),
      trackers: normalizeSelectedKeys(selectedTrackerIds),
      customFields: normalizeSelectedKeys(selectedCustomFieldIds),
    }),
    [name, slug, description, isPublic, parentId, enabledModules, selectedTrackerIds, selectedCustomFieldIds],
  );

  const hasChanges = useMemo(() => {
    if (!initialSnapshot) return false;
    return JSON.stringify(currentSnapshot) !== JSON.stringify(initialSnapshot);
  }, [currentSnapshot, initialSnapshot]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !canManageProject || project.status !== STATUS_ACTIVE || !hasChanges) return;
    setConfirmAction('save');
  };

  const executeSave = () => {
    if (!project || !canManageProject) return;
    updateMutation.mutate(
      {
      id: project.id,
      name: name.trim(),
      identifier: slug.trim(),
      description: description.trim() || null,
      isPublic,
      parentId: parentId || null,
      enabledModules: moduleList,
      trackerIds,
      customFieldIds,
      },
      { onSuccess: () => setConfirmAction(null) },
    );
  };

  const handleArchive = () => {
    if (!project || !canManageProject) return;
    setConfirmAction('archive');
  };

  const handleUnarchive = () => {
    if (!project || !canManageProject) return;
    setConfirmAction('unarchive');
  };

  const handleClose = () => {
    if (!project || !canManageProject) return;
    setConfirmAction('close');
  };

  const handleReopen = () => {
    if (!project || !canManageProject) return;
    setConfirmAction('reopen');
  };

  const handleDelete = () => {
    if (!project || !canManageProject) return;
    setConfirmAction('delete');
  };

  const executeArchive = () => {
    if (!project || !canManageProject) return;
    updateMutation.mutate(
      { id: project.id, status: STATUS_ARCHIVED },
      { onSuccess: () => setConfirmAction(null) },
    );
  };

  const executeUnarchive = () => {
    if (!project || !canManageProject) return;
    updateMutation.mutate(
      { id: project.id, status: STATUS_ACTIVE },
      { onSuccess: () => setConfirmAction(null) },
    );
  };

  const executeClose = () => {
    if (!project || !canManageProject) return;
    updateMutation.mutate(
      { id: project.id, status: STATUS_CLOSED },
      { onSuccess: () => setConfirmAction(null) },
    );
  };

  const executeReopen = () => {
    if (!project || !canManageProject) return;
    updateMutation.mutate(
      { id: project.id, status: STATUS_ACTIVE },
      { onSuccess: () => setConfirmAction(null) },
    );
  };

  const executeDelete = () => {
    if (!project || !canManageProject) return;
    deleteMutation.mutate(project.id, {
      onSuccess: () => navigate('/projects'),
    });
  };

  const toggleModule = (key: string) => {
    if (!project || project.status !== STATUS_ACTIVE || !canManageProject) return;
    setEnabledModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTracker = (tid: string) => {
    if (!project || project.status !== STATUS_ACTIVE || !canManageProject) return;
    setSelectedTrackerIds((prev) => ({ ...prev, [tid]: !prev[tid] }));
  };

  const toggleCustomField = (fieldId: string) => {
    if (!project || project.status !== STATUS_ACTIVE || !canManageProject) return;
    setSelectedCustomFieldIds((prev) => ({ ...prev, [fieldId]: !prev[fieldId] }));
  };

  if (isLoading || !project) {
    return (
      <div className="px-4 py-8">
        <p className="text-slate-500">{t('app.loading')}</p>
      </div>
    );
  }

  const isActiveProject = project.status === STATUS_ACTIVE;
  const isArchivedProject = project.status === STATUS_ARCHIVED;
  const isClosedProject = project.status === STATUS_CLOSED;
  const canEditProjectFields = canManageProject && isActiveProject;

  return (
    <div className="space-y-6">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t('nav.settings')}</h1>
      {!canManageProject && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          このプロジェクト設定を変更する権限がありません。
        </p>
      )}
      {canManageProject && !isActiveProject && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {isArchivedProject
            ? 'このプロジェクトはアーカイブされています。情報の参照・更新はできません。アーカイブ解除のみ可能です。'
            : 'このプロジェクトはクローズされています。情報の参照は可能ですが、更新はできません。再開のみ可能です。'}
        </p>
      )}
      <form onSubmit={handleSave} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {!isArchivedProject && (
        <fieldset disabled={!canEditProjectFields} className="space-y-6">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('projects.name')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canEditProjectFields}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('projects.identifier')}</label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            disabled={!canEditProjectFields}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('projects.description')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canEditProjectFields}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="settings-isPublic"
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            disabled={!canEditProjectFields}
            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="settings-isPublic" className="text-sm text-slate-700">
            {t('projects.isPublicToNonMembers')}
          </label>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('projects.parent')}</label>
          <AppSelect
            value={parentId}
            onChange={setParentId}
            options={[
              { value: '', label: '-' },
              ...projects.filter((p) => p.id !== project.id).map((p) => ({ value: p.id, label: `${p.name} (${p.identifier})` })),
            ]}
            ariaLabel={t('projects.parent')}
            disabled={!canEditProjectFields}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">{t('projects.modules')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {DEFAULT_MODULES.map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!enabledModules[m]}
                  onChange={() => toggleModule(m)}
                  disabled={!canEditProjectFields}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm">{MODULE_LABELS[m] ?? m}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">
            <span className="inline-flex items-center gap-1.5">
              {t('projects.trackers')}
              <span
                tabIndex={0}
                aria-label={t('projects.trackerHelpLabel')}
                aria-describedby="project-tracker-help"
                className="group/help relative inline-flex cursor-help rounded-full text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <CircleHelp aria-hidden="true" className="h-4 w-4" />
                <span
                  id="project-tracker-help"
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-72 -translate-x-1/2 rounded-md border border-slate-200 bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-5 text-white opacity-0 shadow-lg transition group-hover/help:opacity-100 group-focus/help:opacity-100"
                >
                  {t('projects.trackerHelp')}
                </span>
              </span>
            </span>
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {trackers.map((tr) => (
              <label key={tr.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!selectedTrackerIds[tr.id]}
                  onChange={() => toggleTracker(tr.id)}
                  disabled={!canEditProjectFields}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                {tr.name}
              </label>
            ))}
          </div>
        </fieldset>
        {issueCustomFields.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">カスタムフィールド</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {issueCustomFields.map((field) => (
                <label key={field.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!selectedCustomFieldIds[field.id]}
                    onChange={() => toggleCustomField(field.id)}
                    disabled={!canEditProjectFields}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  {field.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        </fieldset>
        )}
        {canManageProject && (
        <div className="flex flex-wrap gap-3">
          {!isArchivedProject && (
            <button
              type="submit"
              disabled={updateMutation.isPending || !hasChanges || !canEditProjectFields}
              className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {updateMutation.isPending ? t('app.loading') : t('app.save')}
            </button>
          )}
          {isArchivedProject ? (
            <button
              type="button"
              onClick={handleUnarchive}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              {t('projects.unarchive')}
            </button>
          ) : (
            isActiveProject && (
            <button
              type="button"
              onClick={handleArchive}
              className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              {t('projects.archive')}
            </button>
            )
          )}
          {isClosedProject ? (
            <button
              type="button"
              onClick={handleReopen}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              {t('projects.reopen')}
            </button>
          ) : (
            isActiveProject && (
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-slate-300 bg-slate-50 px-5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
              >
                {t('projects.close')}
              </button>
            )
          )}
          {isActiveProject && (
            <button
              type="button"
              onClick={handleDelete}
              className="rounded-lg border border-red-300 bg-red-50 px-5 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
            >
              {t('app.delete')}
            </button>
          )}
        </div>
        )}
      </form>
      </div>

      <Dialog open={confirmAction != null} onClose={() => setConfirmAction(null)} className="relative z-[100]">
        <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-slate-900">{t('app.confirm')}</DialogTitle>
            <p className="mt-2 text-sm text-slate-600">
              {confirmAction === 'save' && '変更内容を保存します。よろしいですか？'}
              {confirmAction === 'archive' && 'このプロジェクトをアーカイブします。よろしいですか？'}
              {confirmAction === 'unarchive' && 'このプロジェクトのアーカイブを解除します。よろしいですか？'}
              {confirmAction === 'close' && 'このプロジェクトをクローズします。よろしいですか？'}
              {confirmAction === 'reopen' && 'このプロジェクトを再開します。よろしいですか？'}
              {confirmAction === 'delete' && 'このプロジェクトを削除します。よろしいですか？'}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (confirmAction === 'save') executeSave();
                  if (confirmAction === 'archive') executeArchive();
                  if (confirmAction === 'unarchive') executeUnarchive();
                  if (confirmAction === 'close') executeClose();
                  if (confirmAction === 'reopen') executeReopen();
                  if (confirmAction === 'delete') executeDelete();
                }}
                disabled={updateMutation.isPending || deleteMutation.isPending}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {(updateMutation.isPending || deleteMutation.isPending) ? t('app.loading') : 'はい'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('app.cancel')}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}

