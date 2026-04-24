import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useAddGroupUser,
  useAddUserProject,
  useGroups,
  useProjects,
  useRemoveGroupUser,
  useRemoveUserProject,
  useRoles,
  useUser,
} from '../../api/hooks';

type TabKey = 'general' | 'groups' | 'projects';

type PendingProject = {
  projectId: string;
  roleIds: string[];
};

function displayName(user: { login: string; lastname: string; firstname: string }) {
  const fullName = `${user.lastname} ${user.firstname}`.trim();
  return fullName ? `${user.login} (${fullName})` : user.login;
}

export default function UserDetailPage() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [pendingProjects, setPendingProjects] = useState<PendingProject[]>([]);
  const [pendingRemovedProjectIds, setPendingRemovedProjectIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const userQuery = useUser(userId ?? '');
  const groupsQuery = useGroups();
  const projectsQuery = useProjects({ page: 1, per_page: 500 });
  const rolesQuery = useRoles();
  const addGroupUser = useAddGroupUser();
  const removeGroupUser = useRemoveGroupUser();
  const addProject = useAddUserProject();
  const removeProject = useRemoveUserProject();

  const user = userQuery.data?.data;
  const groups = groupsQuery.data?.data ?? [];
  const projects = projectsQuery.data?.data ?? [];
  const roles = (rolesQuery.data?.data ?? []).filter((r) => r.assignable);

  const savedGroupIds = useMemo(() => new Set((user?.groups ?? []).map((g) => g.id)), [user?.groups]);
  const existingProjectIds = useMemo(() => new Set((user?.projects ?? []).map((p) => p.projectId)), [user?.projects]);
  const availableProjects = useMemo(
    () =>
      projects.filter((p) => {
        const existingAndNotRemoved = existingProjectIds.has(p.id) && !pendingRemovedProjectIds.includes(p.id);
        const alreadyPendingAdd = pendingProjects.some((pp) => pp.projectId === p.id);
        return !existingAndNotRemoved && !alreadyPendingAdd;
      }),
    [projects, existingProjectIds, pendingProjects, pendingRemovedProjectIds],
  );

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
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
      const msg =
        typeof err === 'object' &&
        err &&
        'response' in err &&
        typeof (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ===
          'string'
          ? (err as { response?: { data?: { error?: { message?: string } } } }).response!.data!.error!.message!
          : t('app.error');
      setError(msg);
    }
  };

  const onAddProject = () => {
    if (!selectedProjectId || selectedRoleIds.size === 0) return;
    setPendingProjects((prev) => [
      ...prev,
      {
        projectId: selectedProjectId,
        roleIds: Array.from(selectedRoleIds),
      },
    ]);
    setSelectedProjectId('');
    setSelectedRoleIds(new Set());
    setMessage('');
    setError('');
  };

  const togglePendingRemoveProject = (projectId: string) => {
    setPendingRemovedProjectIds((prev) => {
      if (prev.includes(projectId)) {
        setPendingProjects((pending) => pending.filter((p) => p.projectId !== projectId));
        return prev.filter((id) => id !== projectId);
      }
      return [...prev, projectId];
    });
    setMessage('');
    setError('');
  };

  const onSaveProjects = async () => {
    if (!userId || (pendingProjects.length === 0 && pendingRemovedProjectIds.length === 0)) return;
    setError('');
    setMessage('');
    try {
      for (const projectId of pendingRemovedProjectIds) {
        await removeProject.mutateAsync({ id: userId, projectId });
      }
      for (const pending of pendingProjects) {
        await addProject.mutateAsync({
          id: userId,
          projectId: pending.projectId,
          roleIds: pending.roleIds,
        });
      }
      setPendingProjects([]);
      setPendingRemovedProjectIds([]);
      await userQuery.refetch();
      setMessage(t('groups.saved'));
    } catch (err: unknown) {
      const msg =
        typeof err === 'object' &&
        err &&
        'response' in err &&
        typeof (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ===
          'string'
          ? (err as { response?: { data?: { error?: { message?: string } } } }).response!.data!.error!.message!
          : t('app.error');
      setError(msg);
    }
  };

  if (!userId) return <p className="text-gray-500">{t('app.noData')}</p>;
  if (userQuery.isLoading) return <p className="text-gray-500">{t('app.loading')}</p>;
  if (!user) return <p className="text-red-600">{t('app.error')}</p>;

  return (
    <div className="space-y-4">
      <Link to="/admin/users" className="inline-block text-sm text-primary-700 hover:underline">
        ← {t('users.title')}
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
              <dt className="text-gray-500">{t('users.admin')}</dt>
              <dd className="text-gray-900">{user.admin ? t('app.yes') : t('app.no')}</dd>
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
            <label className="block text-sm">
              <span className="mb-1 block text-sm font-medium text-gray-700">{t('projects.title')}</span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">－</option>
                {availableProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="rounded border border-gray-200 p-3">
              <legend className="px-1 text-sm font-medium text-gray-700">{t('members.roles')}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {roles.map((role) => (
                  <label key={role.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedRoleIds.has(role.id)}
                      onChange={() => toggleRole(role.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600"
                    />
                    {role.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={onAddProject}
                disabled={!selectedProjectId || selectedRoleIds.size === 0}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {t('groups.add')}
              </button>
              <span className="text-xs text-gray-500">
                {t('groups.pendingProjects')}: +{pendingProjects.length} / -{pendingRemovedProjectIds.length}
              </span>
            </div>
            <div className="rounded border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-700">{t('groups.projects')}</p>
              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                {(user.projects ?? []).map((p) => (
                  <li key={p.memberId} className="flex items-center justify-between gap-2">
                    <span className={pendingRemovedProjectIds.includes(p.projectId) ? 'text-red-700' : ''}>
                      {pendingRemovedProjectIds.includes(p.projectId)
                        ? `- ${p.projectName} (${p.roles.map((r) => r.name).join(', ')})`
                        : `${p.projectName} (${p.roles.map((r) => r.name).join(', ')})`}
                    </span>
                    <button
                      type="button"
                      onClick={() => togglePendingRemoveProject(p.projectId)}
                      disabled={removeProject.isPending}
                      className="text-xs text-red-700 hover:underline disabled:opacity-50"
                    >
                      {pendingRemovedProjectIds.includes(p.projectId)
                        ? t('groups.undoRemoveProject')
                        : t('groups.removeProject')}
                    </button>
                  </li>
                ))}
                {pendingProjects.map((p) => {
                  const project = projects.find((pp) => pp.id === p.projectId);
                  const roleNames = p.roleIds
                    .map((rid) => roles.find((r) => r.id === rid)?.name)
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <li key={`pending-${p.projectId}`} className="text-primary-700">
                      + {project?.name ?? p.projectId} ({roleNames})
                    </li>
                  );
                })}
                {(user.projects ?? []).length === 0 && pendingProjects.length === 0 && (
                  <li className="text-gray-500">{t('app.noData')}</li>
                )}
              </ul>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onSaveProjects}
                disabled={
                  addProject.isPending ||
                  removeProject.isPending ||
                  (pendingProjects.length === 0 && pendingRemovedProjectIds.length === 0)
                }
                className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {t('groups.save')}
              </button>
            </div>
          </div>
        )}
      </div>

      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
