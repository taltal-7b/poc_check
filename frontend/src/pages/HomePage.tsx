import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ja, enUS } from 'date-fns/locale';
import { useActivities, useProjects } from '../api/hooks';
import { useAuthStore } from '../stores/auth';

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  const locale = i18n.language?.startsWith('ja') ? ja : enUS;

  const projectsQuery = useProjects(
    isAuthenticated ? { sort: 'updatedAt', order: 'desc', limit: 6 } : undefined,
  );
  const activitiesQuery = useActivities(
    isAuthenticated ? { limit: 12 } : undefined,
  );

  const recentProjects = projectsQuery.data?.data ?? [];
  const recentActivity = activitiesQuery.data?.data ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">
          {isAuthenticated
            ? `${t('nav.home')} — ${user?.firstname ?? user?.login ?? ''}`
            : t('app.title')}
        </h1>
        <p className="mt-2 text-slate-600">
          {isAuthenticated ? t('myPage.title') : t('nav.login')}
        </p>
      </div>

      {!isAuthenticated && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
          <p className="text-slate-800">{t('auth.login')}</p>
          <Link
            to="/login"
            className="mt-4 inline-flex rounded-lg bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700"
          >
            {t('nav.login')}
          </Link>
        </div>
      )}

      {isAuthenticated && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{t('projects.title')}</h2>
              <Link to="/projects" className="text-sm font-medium text-primary-600 hover:text-primary-700">
                {t('nav.projects')}
              </Link>
            </div>
            {projectsQuery.isLoading ? (
              <p className="text-sm text-slate-500">{t('app.loading')}</p>
            ) : recentProjects.length === 0 ? (
              <p className="text-sm text-slate-500">{t('app.noData')}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {recentProjects.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/projects/${p.identifier}`}
                      className="block rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 transition hover:border-primary-200 hover:bg-primary-50/40"
                    >
                      <span className="font-medium text-slate-900">{p.name}</span>
                      <span className="ml-2 text-xs text-slate-500">{p.identifier}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">{t('activity.title')}</h2>
              <Link to="/activity" className="text-sm font-medium text-primary-600 hover:text-primary-700">
                {t('nav.activity')}
              </Link>
            </div>
            {activitiesQuery.isLoading ? (
              <p className="text-sm text-slate-500">{t('app.loading')}</p>
            ) : recentActivity.length === 0 ? (
              <p className="text-sm text-slate-500">{t('app.noData')}</p>
            ) : (
              <ul className="space-y-3">
                {recentActivity.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-col gap-1 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{a.title}</p>
                      {a.description && <p className="text-sm text-slate-600">{a.description}</p>}
                    </div>
                    <time className="shrink-0 text-xs text-slate-500">
                      {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true, locale })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
