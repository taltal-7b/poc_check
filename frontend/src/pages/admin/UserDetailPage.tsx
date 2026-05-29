import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import {
  useAddGroupUser,
  useAdminDisableTotp,
  useAddUserProject,
  useAllProjects,
  useGroups,
  useRemoveGroupUser,
  useRemoveUserProject,
  useRoles,
  useUser,
} from '../../api/hooks';

type TabKey = 'general' | 'groups' | 'projects';

const SYSTEM_ADMIN_LABEL = 'システム管理者';

function displayName(user: { login: string; lastname: string; firstname: string }) {
  const fullName = `${user.lastname} ${user.firstname}`.trim();
  return fullName ? `${user.login} (${fullName})` : user.login;
}

function mutationErrorMessage(err: unknown, fallback: string) {
  return typeof err === 'object' &&
    err &&
    'response' in err &&
    typeof (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ===
      'string'
    ? (err as { response?: { data?: { error?: { message?: string } } } }).response!.data!.error!.message!
    : fallback;
}

export default function UserDetailPage() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [removeProjectTarget, setRemoveProjectTarget] = useState<{ id: string; name: string } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const userQuery = useUser(userId ?? '');
  const groupsQuery = useGroups();
  const projectsQuery = useAllProjects({ enabled: addProjectOpen });
  const rolesQuery = useRoles();
  const addGroupUser = useAddGroupUser();
  const removeGroupUser = useRemoveGroupUser();
  const addProject = useAddUserProject();
  const removeProject = useRemoveUserProject();
  const adminDisableTotp = useAdminDisableTotp();

  const user = userQuery.data?.data;
  const groups = groupsQuery.data?.data ?? [];
  const projects = projectsQuery.data?.data ?? [];
  const roles = (rolesQuery.data?.data ?? []).filter((r) => r.assignable);

  const savedGroupIds = useMemo(() => new Set((user?.groups ?? []).map((g) => g.id)), [user?.groups]);
  const existingProjectIds = useMemo(() => new Set((user?.projects ?? []).map((p) => p.projectId)), [user?.projects]);
  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const effectiveGroupIds = useMemo(() => {
    const next = new Set(savedGroupIds);
    for (const id of selectedGroupIds) {
      if (next.has(id)) next.delete(id);
      else next.add(id);
    }
    return next;
  }, [savedGroupIds, selectedGroupIds]);

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    setMessage('');
    setError('');
  };

  const onSaveGroups = async () => {
    if (!userId || selectedGroupIds.size === 0) return;
    setError('');
    setMessage('');
    try {
      for (const groupId of selectedGroupIds) {
        if (savedGroupIds.has(groupId)) {
          await removeGroupUser.mutateAsync({ id: groupId, userId });
        } else {
          await addGroupUser.mutateAsync({ id: groupId, userId });
        }
      }
      setSelectedGroupIds(new Set());
      await userQuery.refetch();
      setMessage(t('groups.saved'));
    } catch (err: unknown) {
      setError(mutationErrorMessage(err, t('app.error')));
    }
  };

  const openAddProject = () => {
    setSelectedProjectIds(new Set());
    setSelectedRoleIds(new Set());
    setMessage('');
    setError('');
    setAddProjectOpen(true);
  };

  const openRemoveProject = (project: { id: string; name: string }) => {
    removeProject.reset();
    setRemoveProjectTarget(project);
  };

  const closeRemoveProject = () => {
    removeProject.reset();
    setRemoveProjectTarget(null);
  };

  const onAddProjects = async () => {
    if (!userId || selectedProjectIds.size === 0 || selectedRoleIds.size === 0) return;
    setMessage('');
    setError('');
    const roleIds = Array.from(selectedRoleIds);
    const failedProjectIds = new Set<string>();
    let firstError: unknown;

    for (const projectId of selectedProjectIds) {
      try {
        await addProject.mutateAsync({
          id: userId,
          projectId,
          roleIds,
        });
      } catch (err: unknown) {
        failedProjectIds.add(projectId);
        firstError ??= err;
      }
    }

    await userQuery.refetch();

    if (failedProjectIds.size > 0) {
      setSelectedProjectIds(failedProjectIds);
      setError(mutationErrorMessage(firstError, t('app.error')));
      return;
    }

    setAddProjectOpen(false);
    setSelectedProjectIds(new Set());
    setSelectedRoleIds(new Set());
    setMessage(t('groups.saved'));
  };

  const onRemoveProject = async () => {
    if (!userId || !removeProjectTarget) return;
    setError('');
    setMessage('');
    try {
      await removeProject.mutateAsync({ id: userId, projectId: removeProjectTarget.id });
      closeRemoveProject();
      await userQuery.refetch();
      setMessage(t('groups.saved'));
    } catch (err: unknown) {
      setError(mutationErrorMessage(err, t('app.error')));
    }
  };

  const onDisableTotp = async () => {
    if (!userId) return;
    setError('');
    setMessage('');
    try {
      await adminDisableTotp.mutateAsync(userId);
      await userQuery.refetch();
      setMessage('二段階認証を無効化しました');
    } catch (err: unknown) {
      setError(mutationErrorMessage(err, t('app.error')));
    }
  };

  if (!userId) return <p className="text-gray-500">{t('app.noData')}</p>;
  if (userQuery.isLoading) return <p className="text-gray-500">{t('app.loading')}</p>;
  if (!user) return <p className="text-red-600">{t('app.error')}</p>;

  return (
    <div className="space-y-4">
      <Link to="/admin/users" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-5 w-5" aria-hidden />
        {t('app.back')}
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900">{displayName(user)}</h1>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`rounded px-3 py-1.5 text-sm ${
              activeTab === 'general' ? 'bg-primary-600 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t('groups.general')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('groups')}
            className={`rounded px-3 py-1.5 text-sm ${
              activeTab === 'groups' ? 'bg-primary-600 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t('groups.title')}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('projects')}
            className={`rounded px-3 py-1.5 text-sm ${
              activeTab === 'projects' ? 'bg-primary-600 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t('groups.projects')}
          </button>
        </div>

        {activeTab === 'general' && (
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-500">{t('users.login')}</dt>
              <dd className="font-mono text-gray-900">{user.login}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{t('users.name')}</dt>
              <dd className="text-gray-900">{`${user.lastname} ${user.firstname}`.trim()}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{t('users.email')}</dt>
              <dd className="text-gray-900">{user.mail}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{SYSTEM_ADMIN_LABEL}</dt>
              <dd className="text-gray-900">{user.admin ? t('app.yes') : t('app.no')}</dd>
            </div>
            <div>
              <dt className="text-gray-500">{t('myAccount.twoFactor')}</dt>
              <dd className="flex items-center gap-3 text-gray-900">
                <span>{user.totpEnabled ? t('app.yes') : t('app.no')}</span>
                {user.totpEnabled && (
                  <button
                    type="button"
                    onClick={onDisableTotp}
                    disabled={adminDisableTotp.isPending}
                    className="rounded border border-rose-600 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    無効化
                  </button>
                )}
              </dd>
            </div>
          </dl>
        )}

        {activeTab === 'groups' && (
          <div className="mt-4 space-y-4">
            <div className="rounded border border-gray-200 p-3">
              <div className="space-y-2">
                {groups.map((group) => (
                  <label key={group.id} className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={effectiveGroupIds.has(group.id)}
                      onChange={() => toggleGroup(group.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600"
                    />
                    {group.name}
                  </label>
                ))}
                {groups.length === 0 && <p className="text-sm text-gray-500">{t('app.noData')}</p>}
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onSaveGroups}
                disabled={addGroupUser.isPending || removeGroupUser.isPending || selectedGroupIds.size === 0}
                className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {t('groups.save')}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'projects' && (
          <div className="mt-4 space-y-4">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={openAddProject}
                className="inline-flex items-center gap-1.5 rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {t('groups.add')}
              </button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('projects.title')}</th>
                    <th className="px-4 py-3 font-medium">{t('members.roles')}</th>
                    <th className="px-4 py-3 text-center font-medium">{t('app.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(user.projects ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                        {t('app.noData')}
                      </td>
                    </tr>
                  ) : (
                    (user.projects ?? []).map((project) => (
                      <tr key={project.memberId} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-900">
                          <Link to={`/projects/${project.projectIdentifier}`} className="hover:text-primary-700 hover:underline">
                            {project.projectName}
                          </Link>
                        </td>
                        <td className="px-4 py-2 text-gray-700">{project.roles.map((role) => role.name).join(', ') || '-'}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-center">
                            <button
                              type="button"
                              onClick={() => openRemoveProject({ id: project.projectId, name: project.projectName })}
                              disabled={removeProject.isPending}
                              className="rounded p-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                              title={t('groups.removeProject')}
                              aria-label={`${project.projectName} ${t('groups.removeProject')}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Dialog open={addProjectOpen} onClose={() => setAddProjectOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">
              {t('groups.add')} {t('projects.title')}
            </DialogTitle>
            <div className="mt-4 space-y-4">
              <fieldset className="rounded-lg border border-gray-200 p-4">
                <legend className="px-1 text-sm font-medium text-gray-800">{t('projects.title')}</legend>
                <div className="grid max-h-80 gap-x-6 gap-y-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                  {projects.map((project) => {
                    const alreadyAdded = existingProjectIds.has(project.id);
                    return (
                      <label
                        key={project.id}
                        className={`flex min-w-0 items-start gap-2 text-sm ${alreadyAdded ? 'text-gray-400' : 'text-gray-800'}`}
                      >
                        <input
                          type="checkbox"
                          checked={alreadyAdded || selectedProjectIds.has(project.id)}
                          disabled={alreadyAdded}
                          onChange={() => toggleProject(project.id)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 disabled:text-gray-300"
                        />
                        <span className="break-words">{project.name}</span>
                      </label>
                    );
                  })}
                  {projectsQuery.isLoading && <p className="text-sm text-gray-500">{t('app.loading')}</p>}
                  {!projectsQuery.isLoading && projects.length === 0 && (
                    <p className="text-sm text-gray-500">{t('app.noData')}</p>
                  )}
                </div>
              </fieldset>
              <fieldset className="rounded-lg border border-gray-200 p-4">
                <legend className="px-1 text-sm font-medium text-gray-800">{t('members.roles')}</legend>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {roles.map((role) => (
                    <label key={role.id} className="flex items-center gap-2 text-sm text-gray-800">
                      <input
                        type="checkbox"
                        checked={selectedRoleIds.has(role.id)}
                        onChange={() => toggleRole(role.id)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600"
                      />
                      {role.name}
                    </label>
                  ))}
                  {roles.length === 0 && <p className="text-sm text-gray-500">{t('app.noData')}</p>}
                </div>
              </fieldset>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAddProjectOpen(false)}
                  className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {t('app.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void onAddProjects()}
                  disabled={addProject.isPending || selectedProjectIds.size === 0 || selectedRoleIds.size === 0}
                  className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {t('groups.add')}
                </button>
              </div>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog open={!!removeProjectTarget} onClose={closeRemoveProject} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-slate-900">確認</DialogTitle>
            <p className="mt-2 text-sm text-slate-600">
              このユーザーから <span className="font-semibold text-slate-800">{removeProjectTarget?.name}</span>
              {' '}を解除します。よろしいですか？
            </p>
            {removeProject.isError && <p className="mt-4 text-sm text-red-600">{t('app.error')}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeRemoveProject}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t('app.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void onRemoveProject()}
                disabled={removeProject.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t('groups.removeProject')}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

