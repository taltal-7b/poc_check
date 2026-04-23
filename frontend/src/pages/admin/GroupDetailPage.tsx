import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useAddGroupProject,
  useAddGroupUsersBulk,
  useGroup,
  useProjects,
  useRemoveGroupProject,
  useRemoveGroupUser,
  useRoles,
  useUpdateGroup,
  useUsers,
} from '../../api/hooks';

type TabKey = 'general' | 'users' | 'projects';

type PendingProject = {
  projectId: string;
  roleIds: string[];
};

function userLabel(user: { login: string; lastname: string; firstname: string }) {
  const fullName = `${user.lastname} ${user.firstname}`.trim();
  return fullName ? `${user.login} (${fullName})` : user.login;
}

export default function GroupDetailPage() {
  const { t } = useTranslation();
  const { groupId } = useParams<{ groupId: string }>();
  const [activeTab, setActiveTab] = useState<TabKey>('general');

  const groupQuery = useGroup(groupId ?? '');
  const usersQuery = useUsers({ page: 1, per_page: 500 });
  const projectsQuery = useProjects({ page: 1, per_page: 500 });
  const rolesQuery = useRoles();

  const updateGroup = useUpdateGroup();
  const addUsersBulk = useAddGroupUsersBulk();
  const removeGroupUser = useRemoveGroupUser();
  const addProject = useAddGroupProject();
  const removeGroupProject = useRemoveGroupProject();

  const [nameDraft, setNameDraft] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [pendingUserIds, setPendingUserIds] = useState<string[]>([]);
  const [pendingRemovedUserIds, setPendingRemovedUserIds] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [pendingProjects, setPendingProjects] = useState<PendingProject[]>([]);
  const [pendingRemovedProjectIds, setPendingRemovedProjectIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const group = groupQuery.data?.data;
  const users = usersQuery.data?.data ?? [];
  const projects = projectsQuery.data?.data ?? [];
  const roles = (rolesQuery.data?.data ?? []).filter((r) => r.assignable);

  useEffect(() => {
    if (group?.name) {
      setNameDraft(group.name);
    }
  }, [group?.name]);

  useEffect(() => {
    setMessage('');
  }, [activeTab]);

  const existingUserIds = useMemo(() => new Set((group?.users ?? []).map((u) => u.id)), [group?.users]);
  const existingProjectIds = useMemo(() => new Set((group?.projects ?? []).map((p) => p.projectId)), [group?.projects]);

  const availableUsers = useMemo(
    () => users.filter((u) => !existingUserIds.has(u.id) && !pendingUserIds.includes(u.id)),
    [users, existingUserIds, pendingUserIds],
  );
  const availableProjects = useMemo(
    () =>
      projects.filter((p) => {
        const existingAndNotRemoved = existingProjectIds.has(p.id) && !pendingRemovedProjectIds.includes(p.id);
        const alreadyPendingAdd = pendingProjects.some((pp) => pp.projectId === p.id);
        return !existingAndNotRemoved && !alreadyPendingAdd;
      }),
    [projects, existingProjectIds, pendingProjects, pendingRemovedProjectIds],
  );

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const onAddUsers = () => {
    if (!selectedUserIds.size) return;
    const next = Array.from(new Set([...pendingUserIds, ...Array.from(selectedUserIds)]));
    setPendingUserIds(next);
    setSelectedUserIds(new Set());
    setMessage('');
    setError('');
  };

  const togglePendingRemoveUser = (userId: string) => {
    setPendingRemovedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
    setMessage('');
    setError('');
  };

  const onAddProject = () => {
    if (!selectedProjectId || !selectedRoleIds.size) return;
    if (pendingProjects.some((p) => p.projectId === selectedProjectId)) return;
    setPendingProjects((prev) => [
      ...prev,
      {
        projectId: selectedProjectId,
        roleIds: Array.from(selectedRoleIds),
      },
    ]);
    if (pendingRemovedProjectIds.includes(selectedProjectId)) {
      setPendingRemovedProjectIds((prev) => prev.filter((id) => id !== selectedProjectId));
    }
    setSelectedProjectId('');
    setSelectedRoleIds(new Set());
    setMessage('');
    setError('');
  };

  const togglePendingRemoveProject = (projectId: string) => {
    setPendingRemovedProjectIds((prev) =>
      prev.includes(projectId) ? prev.filter((id) => id !== projectId) : [...prev, projectId],
    );
    setMessage('');
    setError('');
  };

  const onSaveGeneral = async () => {
    if (!groupId || !group) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === group.name) return;
    setError('');
    setMessage('');
    try {
      await updateGroup.mutateAsync({ id: groupId, name: trimmed });
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

  const onSaveUsers = async () => {
    if (!groupId || (pendingUserIds.length === 0 && pendingRemovedUserIds.length === 0)) return;
    setError('');
    setMessage('');
    try {
      for (const userId of pendingRemovedUserIds) {
        await removeGroupUser.mutateAsync({ id: groupId, userId });
      }
      if (pendingUserIds.length > 0) {
        await addUsersBulk.mutateAsync({ id: groupId, userIds: pendingUserIds });
      }
      setPendingUserIds([]);
      setPendingRemovedUserIds([]);
      await groupQuery.refetch();
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

  const onSaveProjects = async () => {
    if (!groupId || (pendingProjects.length === 0 && pendingRemovedProjectIds.length === 0)) return;
    setError('');
    setMessage('');
    try {
      for (const projectId of pendingRemovedProjectIds) {
        await removeGroupProject.mutateAsync({ id: groupId, projectId });
      }
      for (const pending of pendingProjects) {
        await addProject.mutateAsync({
          id: groupId,
          projectId: pending.projectId,
          roleIds: pending.roleIds,
        });
      }
      setPendingProjects([]);
      setPendingRemovedProjectIds([]);
      await groupQuery.refetch();
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

  if (!groupId) return <p className="text-gray-500">{t('app.noData')}</p>;
  if (groupQuery.isLoading) return <p className="text-gray-500">{t('app.loading')}</p>;
  if (!group) return <p className="text-red-600">{t('app.error')}</p>;

  return (
    <div className="space-y-4">
      <Link to="/admin/groups" className="inline-block text-sm text-primary-700 hover:underline">
        ← {t('groups.title')}
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900">{group.name}</h1>

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
            onClick={() => setActiveTab('users')}
            className={`rounded px-3 py-1.5 text-sm ${
              activeTab === 'users' ? 'bg-primary-600 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t('groups.users')}
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
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-sm font-medium text-gray-700">{t('groups.name')}</span>
              <input
                type="text"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onSaveGeneral}
                disabled={updateGroup.isPending || !nameDraft.trim() || nameDraft.trim() === group.name}
                className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {t('groups.save')}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="mt-4 space-y-4">
            <div className="rounded border border-gray-200 p-3">
              <p className="text-sm font-medium text-gray-700">{t('groups.members')}</p>
              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                {(group.users ?? []).map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2">
                    <span className={pendingRemovedUserIds.includes(u.id) ? 'text-red-700' : ''}>
                      {pendingRemovedUserIds.includes(u.id) ? `- ${userLabel(u)}` : userLabel(u)}
                    </span>
                    <button
                      type="button"
                      onClick={() => togglePendingRemoveUser(u.id)}
                      disabled={removeGroupUser.isPending}
                      className="text-xs text-red-700 hover:underline disabled:opacity-50"
                    >
                      {pendingRemovedUserIds.includes(u.id) ? t('groups.undoRemoveUser') : t('groups.removeUser')}
                    </button>
                  </li>
                ))}
                {pendingUserIds.map((uid) => {
                  const user = users.find((u) => u.id === uid);
                  return (
                    <li key={`pending-user-${uid}`} className="text-primary-700">
                      + {user ? userLabel(user) : uid}
                    </li>
                  );
                })}
                {group.users.length === 0 && pendingUserIds.length === 0 && (
                  <li className="text-gray-500">{t('app.noData')}</li>
                )}
              </ul>
            </div>
            <div className="rounded border border-gray-200">
              <div className="max-h-64 overflow-y-auto p-3 space-y-2">
                {availableUsers.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(u.id)}
                      onChange={() => toggleUser(u.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600"
                    />
                    {userLabel(u)}
                  </label>
                ))}
                {availableUsers.length === 0 && <p className="text-sm text-gray-500">{t('app.noData')}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={onAddUsers}
                disabled={selectedUserIds.size === 0}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                {t('groups.add')}
              </button>
              <span className="text-xs text-gray-500">
                {t('groups.pendingUsers')}: +{pendingUserIds.length} / -{pendingRemovedUserIds.length}
              </span>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onSaveUsers}
                disabled={
                  addUsersBulk.isPending ||
                  removeGroupUser.isPending ||
                  (pendingUserIds.length === 0 && pendingRemovedUserIds.length === 0)
                }
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
                <option value="">—</option>
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
                {(group.projects ?? []).map((p) => (
                  <li key={p.memberId} className="flex items-center justify-between gap-2">
                    <span className={pendingRemovedProjectIds.includes(p.projectId) ? 'text-red-700' : ''}>
                      {pendingRemovedProjectIds.includes(p.projectId)
                        ? `- ${p.projectName} (${p.roles.map((r) => r.name).join(', ')})`
                        : `${p.projectName} (${p.roles.map((r) => r.name).join(', ')})`}
                    </span>
                    <button
                      type="button"
                      onClick={() => togglePendingRemoveProject(p.projectId)}
                      disabled={removeGroupProject.isPending}
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
              </ul>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onSaveProjects}
                disabled={
                  addProject.isPending ||
                  removeGroupProject.isPending ||
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
