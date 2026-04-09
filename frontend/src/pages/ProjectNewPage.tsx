import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCreateProject, useProjects, useTrackers } from '../api/hooks';

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

function toKebabIdentifier(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

export default function ProjectNewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createMutation = useCreateProject();
  const projectsQuery = useProjects();
  const trackersQuery = useTrackers();

  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [parentId, setParentId] = useState('');
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(DEFAULT_MODULES.map((m) => [m, true])),
  );
  const [selectedTrackerIds, setSelectedTrackerIds] = useState<Record<string, boolean>>({});

  const projects = projectsQuery.data?.data ?? [];
  const trackers = trackersQuery.data?.data ?? [];

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const idf = identifier.trim() || toKebabIdentifier(name);
    createMutation.mutate(
      {
        name: name.trim(),
        identifier: idf,
        description: description.trim() || null,
        isPublic,
        parentId: parentId || null,
        status: 1,
        enabledModules: moduleList,
        trackerIds,
      },
      {
        onSuccess: (res) => {
          const created = res.data;
          if (created?.identifier) navigate(`/projects/${created.identifier}`);
        },
      },
    );
  };

  const toggleModule = (key: string) => {
    setEnabledModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleTracker = (id: string) => {
    setSelectedTrackerIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">{t('projects.new')}</h1>
      <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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
            value={identifier}
            onChange={(e) => {
              setIdentifierTouched(true);
              setIdentifier(e.target.value);
            }}
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
            id="isPublic"
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
          />
          <label htmlFor="isPublic" className="text-sm text-slate-700">
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
            {projects.map((p) => (
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
                <span className="font-mono text-xs">{m}</span>
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
        {createMutation.isError && <p className="text-sm text-red-600">{t('app.error')}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {createMutation.isPending ? t('app.loading') : t('app.create')}
          </button>
        </div>
      </form>
    </div>
  );
}
