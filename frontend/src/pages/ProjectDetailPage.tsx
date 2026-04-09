import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useProject, useProjectIssues } from '../api/hooks';
import ProjectSubNav from '../components/ProjectSubNav';

export default function ProjectDetailPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const id = identifier ?? '';
  const { data, isLoading, isError } = useProject(id);
  const project = data?.data;

  const base = `/projects/${id}`;

  const membersCount = project?._count?.members ?? '—';

  const issuesQuery = useProjectIssues(id, { per_page: 1 });
  const openIssueCount = issuesQuery.data?.pagination?.total ?? '—';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {isLoading && <p className="text-slate-500">{t('app.loading')}</p>}
      {isError && <p className="text-red-600">{t('app.error')}</p>}
      <ProjectSubNav identifier={id} />
      {project && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
            <p className="mt-1 font-mono text-sm text-slate-500">{project.identifier}</p>
            {project.description && <p className="mt-3 text-slate-700">{project.description}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('nav.members')}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{membersCount}</p>
            </div>
            <Link to={`${base}/issues`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm block hover:border-primary-300 hover:shadow transition-all">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('issues.title')}</p>
              <p className="mt-2 text-2xl font-semibold text-primary-600">{openIssueCount}</p>
            </Link>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('versions.title')}</p>
              <p className="mt-2 text-sm text-slate-600">
                <Link to={`${base}/versions`} className="font-medium text-primary-600 hover:text-primary-700">
                  {t('nav.roadmap')}
                </Link>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
