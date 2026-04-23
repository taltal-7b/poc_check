import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGroups } from '../../api/hooks';

export default function GroupsPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useGroups();
  const groups = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{t('groups.title')}</h1>
        <Link
          to="/admin/groups/new"
          className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          {t('groups.new')}
        </Link>
      </div>

      {isLoading && <p className="text-gray-500">{t('app.loading')}</p>}
      {isError && <p className="text-red-600">{t('app.error')}</p>}

      {!isLoading && !isError && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('groups.name')}</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">{t('groups.members')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-8 text-center text-gray-500">
                    {t('app.noData')}
                  </td>
                </tr>
              ) : (
                groups.map((group) => (
                  <tr key={group.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <Link to={`/admin/groups/${group.id}`} className="text-primary-700 hover:underline">
                        {group.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">{group.userCount ?? 0}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
