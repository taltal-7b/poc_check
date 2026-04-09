import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProject } from '../api/hooks';

const tabPaths = [
  { key: 'overview', suffix: '', labelKey: 'nav.overview' },
  { key: 'issues', suffix: 'issues', labelKey: 'nav.issues' },
  { key: 'time_entries', suffix: 'time_entries', labelKey: 'nav.timeEntries' },
  { key: 'wiki', suffix: 'wiki', labelKey: 'nav.wiki' },
  { key: 'news', suffix: 'news', labelKey: 'nav.news' },
  { key: 'forums', suffix: 'forums', labelKey: 'nav.forums' },
  { key: 'documents', suffix: 'documents', labelKey: 'nav.documents' },
  { key: 'versions', suffix: 'versions', labelKey: 'versions.title' },
  { key: 'gantt', suffix: 'gantt', labelKey: 'nav.gantt' },
  { key: 'calendar', suffix: 'calendar', labelKey: 'nav.calendar' },
  { key: 'members', suffix: 'members', labelKey: 'nav.members' },
  { key: 'activity', suffix: 'activity', labelKey: 'nav.activity' },
  { key: 'settings', suffix: 'settings', labelKey: 'nav.settings' },
] as const;

export default function ProjectDetailPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const id = identifier ?? '';
  const { data, isLoading, isError } = useProject(id);
  const project = data?.data;

  const base = `/projects/${id}`;

  const membersCount = project?._count?.members ?? '—';
  const openIssues = project?._count?.issues ?? '—';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {isLoading && <p className="text-slate-500">{t('app.loading')}</p>}
      {isError && <p className="text-red-600">{t('app.error')}</p>}
      {project && (
        <div className="flex flex-col gap-8 lg:flex-row">
          <aside className="lg:w-56 lg:shrink-0">
            <nav className="space-y-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              {tabPaths.map((tab) => {
                const to = tab.suffix ? `${base}/${tab.suffix}` : base;
                return (
                  <Link
                    key={tab.key}
                    to={to}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-primary-50 hover:text-primary-800"
                  >
                    {t(tab.labelKey)}
                  </Link>
                );
              })}
            </nav>
          </aside>
          <div className="min-w-0 flex-1 space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
              <p className="mt-1 font-mono text-sm text-slate-500">{project.identifier}</p>
              {project.description && <p className="mt-4 text-slate-700">{project.description}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('nav.members')}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{membersCount}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.title')}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{openIssues}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('versions.title')}</p>
                <p className="mt-2 text-sm text-slate-600">
                  <Link to={`${base}/versions`} className="font-medium text-primary-600 hover:text-primary-700">
                    {t('nav.roadmap')}
                  </Link>
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
              {t('nav.overview')} — {t('projects.title')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
