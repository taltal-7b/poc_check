import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, formatDistanceToNow } from 'date-fns';
import { ja, enUS } from 'date-fns/locale';
import { useUser, useIssues, useActivities } from '../api/hooks';
import type { Issue, Activity } from '../types';

export default function UserProfilePage() {
  const { t, i18n } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const id = userId ?? '';
  const locale = i18n.language?.startsWith('ja') ? ja : enUS;

  const { data: userData, isLoading, isError } = useUser(id);
  const user = userData?.data;

  const assignedQuery = useIssues({ assignee: id, closed: 'false', perPage: 10 });
  const reportedQuery = useIssues({ author: id, closed: 'true', perPage: 10 });
  const activityQuery = useActivities({ user_id: id, perPage: 30 });

  const assignedIssues: Issue[] = assignedQuery.data?.data ?? [];
  const reportedIssues: Issue[] = reportedQuery.data?.data ?? [];
  const activities: Activity[] = activityQuery.data?.data ?? [];

  const assignedTotal = assignedQuery.data?.pagination?.total ?? 0;
  const reportedTotal = reportedQuery.data?.pagination?.total ?? 0;

  if (isLoading) return <div className="px-4 py-8"><p className="text-slate-500">{t('app.loading')}</p></div>;
  if (isError || !user) return <div className="px-4 py-8"><p className="text-red-600">{t('app.error')}</p></div>;

  const fullName = `${user.firstname} ${user.lastname}`.trim() || user.login;

  const groupByDate = (items: Activity[]) => {
    const groups: Record<string, Activity[]> = {};
    for (const a of items) {
      const day = format(new Date(a.createdAt), 'yyyy/MM/dd');
      (groups[day] ??= []).push(a);
    }
    return Object.entries(groups);
  };

  const activityGroups = groupByDate(activities);

  const actTypeIcon = (type: string) => {
    switch (type) {
      case 'issue': return '🎫';
      case 'wiki': return '📄';
      case 'news': return '📰';
      case 'message': return '💬';
      case 'document': return '📎';
      default: return '📋';
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* User header */}
      <div className="mb-8 flex items-start gap-5">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-100 text-2xl font-bold text-primary-700">
          {(user.firstname?.[0] ?? user.login[0]).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{fullName}</h1>
          <ul className="mt-2 space-y-0.5 text-sm text-slate-600">
            <li>{t('users.login')}: {user.login}</li>
            <li>{t('users.createdAt')}: {format(new Date(user.createdAt), 'yyyy/MM/dd')}</li>
          </ul>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-5">
        {/* Left: tickets */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-lg font-semibold text-slate-900">{t('issues.title')}</h2>

          {/* Ticket summary table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-500" />
                  <th className="px-4 py-2 text-center font-medium text-slate-500">{i18n.language?.startsWith('ja') ? '件数' : 'Count'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-2 text-slate-700">{i18n.language?.startsWith('ja') ? '担当しているチケット（未完了）' : 'Assigned issues (Open)'}</td>
                  <td className="px-4 py-2 text-center font-medium text-primary-600">{assignedTotal}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-slate-700">{i18n.language?.startsWith('ja') ? '報告したチケット（完了）' : 'Reported issues (Closed)'}</td>
                  <td className="px-4 py-2 text-center font-medium text-green-600">{reportedTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Assigned issues list */}
          {assignedIssues.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {i18n.language?.startsWith('ja') ? '担当しているチケット（未完了）' : 'Assigned issues (Open)'}
              </h3>
              <ul className="space-y-1">
                {assignedIssues.map((iss) => (
                  <li key={iss.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
                    <span className="font-mono text-xs text-slate-400">#{iss.number}</span>
                    <Link to={iss.project?.identifier ? `/projects/${iss.project.identifier}/issues/${iss.id}` : `/issues/${iss.id}`}
                      className="min-w-0 flex-1 truncate font-medium text-primary-600 hover:underline">
                      {iss.subject}
                    </Link>
                    <span className="shrink-0 text-xs text-slate-400">{iss.project?.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Reported issues list */}
          {reportedIssues.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {i18n.language?.startsWith('ja') ? '報告したチケット（完了）' : 'Reported issues (Closed)'}
              </h3>
              <ul className="space-y-1">
                {reportedIssues.map((iss) => (
                  <li key={iss.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm">
                    <span className="font-mono text-xs text-slate-400">#{iss.number}</span>
                    <Link to={iss.project?.identifier ? `/projects/${iss.project.identifier}/issues/${iss.id}` : `/issues/${iss.id}`}
                      className="min-w-0 flex-1 truncate font-medium text-primary-600 hover:underline">
                      {iss.subject}
                    </Link>
                    <span className="shrink-0 text-xs text-slate-400">{iss.project?.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right: activity */}
        <div className="lg:col-span-3">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('activity.title')}</h2>
          {activityGroups.length === 0 ? (
            <p className="text-sm text-slate-400">{t('app.noData')}</p>
          ) : (
            <div className="space-y-6">
              {activityGroups.map(([day, items]) => (
                <div key={day}>
                  <h3 className="mb-3 text-sm font-bold text-slate-800">{day}</h3>
                  <ul className="space-y-3">
                    {items.map((a) => (
                      <li key={a.id} className="flex gap-3 text-sm">
                        <span className="mt-0.5 text-base leading-none">{actTypeIcon(a.actType)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-slate-700">
                            <span className="text-xs text-slate-400">
                              {format(new Date(a.createdAt), 'HH:mm')}
                            </span>
                            {a.project && (
                              <>
                                {' '}
                                <Link to={`/projects/${a.project.identifier}`} className="font-medium text-primary-600 hover:underline">
                                  {a.project.name}
                                </Link>
                              </>
                            )}
                            {' - '}
                            <span className="font-medium">{a.title}</span>
                          </div>
                          {a.description && (
                            <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{a.description}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
