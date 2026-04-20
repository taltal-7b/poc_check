import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import { useDeleteProject, useProject, useProjects, useTrackers, useUpdateProject } from '../api/hooks';

const DEFAULT_MODULES = [
  'issue_tracking',
  'time_tracking',
  'news',
  'documents',
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
  wiki: 'Wiki',
  repository: 'リポジトリ',
  boards: 'フォーラム',
  calendar: 'カレンダー',
  gantt: 'ガントチャート',
};

const STATUS_ACTIVE = 1;
const STATUS_ARCHIVED = 2;

type ConfirmAction = 'save' | 'archive' | 'unarchive' | 'delete' | null;

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

  const projectsQuery = useProjects();
  const trackersQuery = useTrackers();
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [parentId, setParentId] = useState('');
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>({});
  const [selectedTrackerIds, setSelectedTrackerIds] = useState<Record<string, boolean>>({});
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [initialSnapshot, setInitialSnapshot] = useState<{
    name: string;
    slug: string;
    description: string;
    isPublic: boolean;
    parentId: string;
    modules: string[];
    trackers: string[];
  } | null>(null);

  const projects = projectsQuery.data?.data ?? [];
  const trackers = trackersQuery.data?.data ?? [];

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
    setInitialSnapshot({
      name: project.name.trim(),
      slug: project.identifier.trim(),
      description: (project.description ?? '').trim(),
      isPublic: project.isPublic,
      parentId: project.parentId ?? '',
      modules: normalizeSelectedKeys(mods),
      trackers: normalizeSelectedKeys(tr),
    });
  }, [project, trackers]);

  const moduleList = useMemo(
    () => Object.entries(enabledModules).filter(([, v]) => v).map(([k]) => k),
    [enabledModules],
  );
  const trackerIds = useMemo(
    () => Object.entries(selectedTrackerIds).filter(([, v]) => v).map(([x]) => x),
    [selectedTrackerIds],
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
    }),
    [name, slug, description, isPublic, parentId, enabledModules, selectedTrackerIds],
  );

  const hasChanges = useMemo(() => {
    if (!initialSnapshot) return false;
    return JSON.stringify(currentSnapshot) !== JSON.stringify(initialSnapshot);
  }, [currentSnapshot, initialSnapshot]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !hasChanges) return;
    setConfirmAction('save');
  };

  const executeSave = () => {
    if (!project) return;
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
      },
      { onSuccess: () => setConfirmAction(null) },
    );
  };

  const handleArchive = () => {
    if (!project) return;
    setConfirmAction('archive');
  };

  const handleUnarchive = () => {
    if (!project) return;
    setConfirmAction('unarchive');
  };

  const handleDelete = () => {
    if (!project) return;
    setConfirmAction('delete');
  };

  const executeArchive = () => {
    if (!project) return;
    updateMutation.mutate(
      { id: project.id, status: STATUS_ARCHIVED },
      { onSuccess: () => setConfirmAction(null) },
    );
  };

  const executeUnarchive = () => {
    if (!project) return;
    updateMutation.mutate(
      { id: project.id, status: STATUS_ACTIVE },
      { onSuccess: () => setConfirmAction(null) },
    );
  };

  const executeDelete = () => {
    if (!project) return;
    deleteMutation.mutate(project.id, {
      onSuccess: () => navigate('/projects'),
    });
  };

  const toggleModule = (key: string) => {
    setEnabledModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTracker = (tid: string) => {
    setSelectedTrackerIds((prev) => ({ ...prev, [tid]: !prev[tid] }));
  };

  if (isLoading || !project) {
    return (
      <div className="px-4 py-8">
        <p className="text-slate-500">{t('app.loading')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t('nav.settings')}</h1>
      <form onSubmit={handleSave} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('projects.name')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('projects.identifier')}</label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('projects.description')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="settings-isPublic" className="text-sm text-slate-700">
            {t('projects.isPublic')}
          </label>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('projects.parent')}</label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          >
            <option value="">—</option>
            {projects
              .filter((p) => p.id !== project.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.identifier})
                </option>
              ))}
          </select>
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
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm">{MODULE_LABELS[m] ?? m}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">{t('projects.trackers')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {trackers.map((tr) => (
              <label key={tr.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={!!selectedTrackerIds[tr.id]}
                  onChange={() => toggleTracker(tr.id)}
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                {tr.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={updateMutation.isPending || !hasChanges}
            className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {updateMutation.isPending ? t('app.loading') : t('app.save')}
          </button>
          {project.status === STATUS_ARCHIVED ? (
            <button
              type="button"
              onClick={handleUnarchive}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              {t('projects.unarchive')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleArchive}
              className="rounded-lg border border-amber-300 bg-amber-50 px-5 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              {t('projects.archive')}
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className="rounded-lg border border-red-300 bg-red-50 px-5 py-2 text-sm font-semibold text-red-800 hover:bg-red-100"
          >
            {t('app.delete')}
          </button>
        </div>
        <div className="flex gap-3 text-sm">
          <button
            type="button"
            onClick={() => updateMutation.mutate({ id: project.id, status: STATUS_ACTIVE })}
            className="text-primary-600 hover:text-primary-800"
          >
            {t('projects.reopen')}
          </button>
        </div>
      </form>
      </div>

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmAction(null)}>
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900">{t('app.confirm')}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {confirmAction === 'save' && '変更内容を保存します。よろしいですか？'}
              {confirmAction === 'archive' && 'このプロジェクトをアーカイブします。よろしいですか？'}
              {confirmAction === 'unarchive' && 'このプロジェクトのアーカイブを解除します。よろしいですか？'}
              {confirmAction === 'delete' && 'このプロジェクトを削除します。よろしいですか？'}
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  if (confirmAction === 'save') executeSave();
                  if (confirmAction === 'archive') executeArchive();
                  if (confirmAction === 'unarchive') executeUnarchive();
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
          </div>
        </div>
      )}
    </div>
  );
}
