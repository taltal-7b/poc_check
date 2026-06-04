import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CircleHelp } from 'lucide-react';
import { useCreateProject, useProject, useUpdateProject, useAllProjects, useTrackers } from '../api/hooks';
import AppSelect from '../components/AppSelect';
import { httpStatus } from '../utils/http-error';
import type { Project } from '../types';

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
  issue_tracking: 'チケットトラッキング',
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

function toKebabIdentifier(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

export default function ProjectNewPage({ isEdit = false }: { isEdit?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { identifier: projectId } = useParams<{ identifier?: string }>();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const identifierInputRef = useRef<HTMLInputElement>(null);
  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const projectQuery = useProject(isEdit && projectId ? projectId : '');
  const projectsQuery = useAllProjects();
  const trackersQuery = useTrackers();

  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [identifierTouched, setIdentifierTouched] = useState(isEdit);
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [parentId, setParentId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEFAULT_MODULES.map((m) => [m, true])),
  );
  const [selectedTrackerIds, setSelectedTrackerIds] = useState<Record<string, boolean>>({});
  const [initializedProjectId, setInitializedProjectId] = useState<string | null>(null);
  const [trackersInitializedProjectId, setTrackersInitializedProjectId] = useState<string | null>(null);

  const project = projectQuery.data?.data;
  const projects = projectsQuery.data?.data ?? [];
  const trackers = trackersQuery.data?.data ?? [];

  // 編集モード時の初期値は、対象プロジェクトが切り替わったときだけロードする
  useEffect(() => {
    if (isEdit && project && project.id !== initializedProjectId) {
      setName(project.name);
      setIdentifier(project.identifier);
      setIdentifierTouched(true);
      setDescription(project.description || '');
      setIsPublic(project.isPublic);
      setParentId(project.parentId || '');
      setInitializedProjectId(project.id);

      // enabledModulesをセット
      const modules: Record<string, boolean> = {};
      DEFAULT_MODULES.forEach((m) => {
        modules[m] = project.enabledModules?.some((em: any) => em.name === m) ?? true;
      });
      setEnabledModules(modules);

      setTrackersInitializedProjectId(null);
    }
  }, [isEdit, project, initializedProjectId]);

  useEffect(() => {
    if (!isEdit || !project || !trackers.length) return;
    if (trackersInitializedProjectId === project.id) return;
    const trackersSelected: Record<string, boolean> = {};
    trackers.forEach((tr) => {
      trackersSelected[tr.id] =
        ((project as any).projectTrackers ?? []).some((pt: any) => pt.trackerId === tr.id);
    });
    setSelectedTrackerIds(trackersSelected);
    setTrackersInitializedProjectId(project.id);
  }, [isEdit, project, trackers, trackersInitializedProjectId]);

  useEffect(() => {
    if (trackers.length && Object.keys(selectedTrackerIds).length === 0) {
      const init: Record<string, boolean> = {};
      trackers.forEach((tr) => {
        init[tr.id] = true;
      });
      setSelectedTrackerIds(init);
    }
  }, [trackers, selectedTrackerIds]);

  useEffect(() => {
    if (!isEdit) {
      setInitializedProjectId(null);
      setTrackersInitializedProjectId(null);
      setIdentifierTouched(false);
    }
  }, [isEdit]);

  // 同じプロジェクト編集画面へ戻ってきたときでも初期値を再ロードする
  useEffect(() => {
    if (!isEdit) return;
    setInitializedProjectId(null);
    setTrackersInitializedProjectId(null);
  }, [isEdit, location.key]);

  useEffect(() => {
    if (!identifierTouched) {
      setIdentifier(toKebabIdentifier(name));
    }
  }, [name, identifierTouched]);

  const trackerIds = useMemo(
    () => Object.entries(selectedTrackerIds).filter(([, v]) => v).map(([id]) => id),
    [selectedTrackerIds],
  );

  const moduleList = useMemo(
    () => Object.entries(enabledModules).filter(([, v]) => v).map(([k]) => k),
    [enabledModules],
  );

  const childMap = useMemo(() => {
    const map = new Map<string, Project[]>();
    projects.forEach((p) => {
      if (!p.parentId) return;
      const arr = map.get(p.parentId) ?? [];
      arr.push(p);
      map.set(p.parentId, arr);
    });
    return map;
  }, [projects]);

  const descendantIds = useMemo(() => {
    if (!isEdit || !project?.id) return new Set<string>();
    const result = new Set<string>();
    const walk = (id: string) => {
      const children = childMap.get(id) ?? [];
      for (const child of children) {
        if (!result.has(child.id)) {
          result.add(child.id);
          walk(child.id);
        }
      }
    };
    walk(project.id);
    return result;
  }, [isEdit, project?.id, childMap]);

  const parentCandidates = useMemo(
    () =>
      projects.filter((p) => {
        if (!isEdit || !project?.id) return true;
        return p.id !== project.id && !descendantIds.has(p.id);
      }),
    [projects, isEdit, project?.id, descendantIds],
  );

  const parentOptions = useMemo(() => {
    const byParent = new Map<string | null, Project[]>();
    parentCandidates.forEach((p) => {
      const key = p.parentId ?? null;
      const arr = byParent.get(key) ?? [];
      arr.push(p);
      byParent.set(key, arr);
    });
    for (const arr of byParent.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    }

    const flat: Array<{ id: string; label: string }> = [];
    const walk = (parentKey: string | null, depth: number) => {
      const nodes = byParent.get(parentKey) ?? [];
      for (const node of nodes) {
        const prefix = depth > 0 ? `${'　'.repeat(depth)}» ` : '';
        flat.push({ id: node.id, label: `${prefix}${node.name}` });
        walk(node.id, depth + 1);
      }
    };
    walk(null, 0);
    return flat;
  }, [parentCandidates]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIdentifierError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('プロジェクト名は必須です。');
      nameInputRef.current?.focus();
      return;
    }
    const idf = identifier.trim() || toKebabIdentifier(trimmedName);
    if (!idf) {
      setFormError('識別子は必須です。');
      identifierInputRef.current?.focus();
      return;
    }
    const data = {
      name: trimmedName,
      identifier: idf,
      description: description.trim() || null,
      isPublic,
      parentId: parentId || null,
      status: 1,
      enabledModules: moduleList,
      trackerIds,
    };

    const handleError = (error: unknown) => {
      if (httpStatus(error) === 409) {
        setIdentifierError('すでに使用されている識別子です。');
        identifierInputRef.current?.focus();
        return;
      }
      setFormError(t('app.error'));
    };

    if (isEdit && projectId) {
      updateMutation.mutate(
        { id: projectId, ...data },
        {
          onSuccess: (res) => {
            const updated = res.data;
            if (updated?.identifier) navigate(`/projects/${updated.identifier}`);
          },
          onError: handleError,
        },
      );
    } else {
      createMutation.mutate(
        data,
        {
          onSuccess: (res) => {
            const created = res.data;
            if (created?.identifier) navigate(`/projects/${created.identifier}`);
          },
          onError: handleError,
        },
      );
    }
  };

  const toggleModule = (key: string) => {
    setEnabledModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTracker = (id: string) => {
    setSelectedTrackerIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-5 w-5" />
          {t('app.back')}
        </button>
      </div>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">
        {isEdit ? t('app.edit') : t('projects.new')}
      </h1>
      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('projects.name')}<span className="ml-1 text-red-500">*</span>
          </label>
          <input
            ref={nameInputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t('projects.identifier')}<span className="ml-1 text-red-500">*</span>
          </label>
          <input
            ref={identifierInputRef}
            value={identifier}
            onChange={(e) => {
              setIdentifierTouched(true);
              setIdentifier(e.target.value);
              setIdentifierError(null);
            }}
            required
            aria-invalid={identifierError ? 'true' : undefined}
            aria-describedby={identifierError ? 'project-identifier-error' : undefined}
            className={`w-full rounded-lg border px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 ${
              identifierError
                ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30'
                : 'border-slate-300 focus:border-primary-500 focus:ring-primary-500/30'
            }`}
          />
          {identifierError && (
            <p id="project-identifier-error" className="mt-1 text-sm text-red-600">
              {identifierError}
            </p>
          )}
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
            id="isPublic"
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="isPublic" className="text-sm text-slate-700">
            {t('projects.isPublicToNonMembers')}
          </label>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">{t('projects.parent')}</label>
          <AppSelect
            value={parentId}
            onChange={setParentId}
            options={[{ value: '', label: '-' }, ...parentOptions.map((p) => ({ value: p.id, label: p.label }))]}
            ariaLabel={t('projects.parent')}
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
                aria-describedby="project-form-tracker-help"
                className="group/help relative inline-flex cursor-help rounded-full text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
              >
                <CircleHelp aria-hidden="true" className="h-4 w-4" />
                <span
                  id="project-form-tracker-help"
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
                  className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                {tr.name}
              </label>
            ))}
          </div>
        </fieldset>
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending || updateMutation.isPending}
            className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {(createMutation.isPending || updateMutation.isPending) ? t('app.loading') : t('app.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

