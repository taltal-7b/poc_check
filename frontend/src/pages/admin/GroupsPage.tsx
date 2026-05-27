import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { Pencil, Trash2 } from 'lucide-react';
import AppSelect from '../../components/AppSelect';
import {
  useAddGroupProject,
  useAddGroupUsersBulk,
  useDeleteGroup,
  useGroup,
  useGroups,
  useProjects,
  useRemoveGroupProject,
  useRemoveGroupUser,
  useRoles,
  useUpdateGroup,
  useUsers,
} from '../../api/hooks';
import type { Group } from '../../types';

type TabKey = 'general' | 'users' | 'projects';
type PendingProject = { projectId: string; roleIds: string[] };

function userLabel(user: { login: string; lastname: string; firstname: string }) {
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

export default function GroupsPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useGroups();
  const groups = data?.data ?? [];
  const deleteGroup = useDeleteGroup();

  const [editGroupId, setEditGroupId] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('general');
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

  const groupQuery = useGroup(editGroupId);
  const editOpen = !!editGroupId;
  const usersQuery = useUsers({ page: 1, per_page: 500 }, { enabled: editOpen });
  const projectsQuery = useProjects({ page: 1, per_page: 500 }, { enabled: editOpen });
  const rolesQuery = useRoles({ enabled: editOpen });
  const updateGroup = useUpdateGroup();
  const addUsersBulk = useAddGroupUsersBulk();
  const removeGroupUser = useRemoveGroupUser();
  const addProject = useAddGroupProject();
  const removeGroupProject = useRemoveGroupProject();

  const group = groupQuery.data?.data;
  const users = usersQuery.data?.data ?? [];
  const projects = projectsQuery.data?.data ?? [];
  const roles = (rolesQuery.data?.data ?? []).filter((r) => r.assignable);

  useEffect(() => {
    setNameDraft(group?.name ?? '');
  }, [group?.name]);

  const resetEditState = () => {
    setActiveTab('general');
    setNameDraft('');
    setSelectedUserIds(new Set());
    setPendingUserIds([]);
    setPendingRemovedUserIds([]);
    setSelectedProjectId('');
    setSelectedRoleIds(new Set());
    setPendingProjects([]);
    setPendingRemovedProjectIds([]);
    setMessage('');
    setError('');
  };

  const openEdit = (target: Group) => {
    resetEditState();
    setEditGroupId(target.id);
  };

  const closeEdit = () => {
    setEditGroupId('');
    resetEditState();
  };

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
    setPendingUserIds(Array.from(new Set([...pendingUserIds, ...Array.from(selectedUserIds)])));
    setSelectedUserIds(new Set());
    setMessage('');
    setError('');
  };

  const togglePendingRemoveUser = (userId: string) => {
    setPendingRemovedUserIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
    setMessage('');
    setError('');
  };

  const onAddProject = () => {
    if (!selectedProjectId || !selectedRoleIds.size || pendingProjects.some((p) => p.projectId === selectedProjectId)) return;
    setPendingProjects((prev) => [...prev, { projectId: selectedProjectId, roleIds: Array.from(selectedRoleIds) }]);
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

  const onSaveGeneral = async () => {
    if (!editGroupId || !group) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === group.name) return;
    setError('');
    setMessage('');
    try {
      await updateGroup.mutateAsync({ id: editGroupId, name: trimmed });
      setMessage(t('groups.saved'));
    } catch (err: unknown) {
      setError(mutationErrorMessage(err, t('app.error')));
    }
  };

  const onSaveUsers = async () => {
    if (!editGroupId || (pendingUserIds.length === 0 && pendingRemovedUserIds.length === 0)) return;
    setError('');
    setMessage('');
    try {
      for (const userId of pendingRemovedUserIds) await removeGroupUser.mutateAsync({ id: editGroupId, userId });
      if (pendingUserIds.length > 0) await addUsersBulk.mutateAsync({ id: editGroupId, userIds: pendingUserIds });
      setPendingUserIds([]);
      setPendingRemovedUserIds([]);
      await groupQuery.refetch();
      setMessage(t('groups.saved'));
    } catch (err: unknown) {
      setError(mutationErrorMessage(err, t('app.error')));
    }
  };

  const onSaveProjects = async () => {
    if (!editGroupId || (pendingProjects.length === 0 && pendingRemovedProjectIds.length === 0)) return;
    setError('');
    setMessage('');
    try {
      for (const projectId of pendingRemovedProjectIds) await removeGroupProject.mutateAsync({ id: editGroupId, projectId });
      for (const pending of pendingProjects) {
        await addProject.mutateAsync({ id: editGroupId, projectId: pending.projectId, roleIds: pending.roleIds });
      }
      setPendingProjects([]);
      setPendingRemovedProjectIds([]);
      await groupQuery.refetch();
      setMessage(t('groups.saved'));
    } catch (err: unknown) {
      setError(mutationErrorMessage(err, t('app.error')));
    }
  };

  const handleDelete = async (target: Group) => {
    if (!window.confirm(t('app.confirm'))) return;
    await deleteGroup.mutateAsync(target.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{t('groups.title')}</h1>
        <Link to="/admin/groups/new" className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
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
                <th className="px-3 py-2 text-right font-medium text-gray-600">{t('app.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-gray-500">
                    {t('app.noData')}
                  </td>
                </tr>
              ) : (
                groups.map((groupItem) => (
                  <tr key={groupItem.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{groupItem.name}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{groupItem.userCount ?? 0}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          className="rounded p-1 text-primary-600 hover:bg-primary-50"
                          onClick={() => openEdit(groupItem)}
                          title={t('app.edit')}
                          aria-label={`${groupItem.name} ${t('app.edit')}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                          onClick={() => void handleDelete(groupItem)}
                          disabled={deleteGroup.isPending}
                          title={t('app.delete')}
                          aria-label={`${groupItem.name} ${t('app.delete')}`}
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
      )}

      <Dialog open={!!editGroupId} onClose={closeEdit} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{group?.name ?? t('app.edit')}</DialogTitle>
            {groupQuery.isLoading || !group ? (
              <p className="mt-4 text-sm text-gray-500">{t('app.loading')}</p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
                  {(['general', 'users', 'projects'] as TabKey[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab);
                        setMessage('');
                      }}
                      className={`rounded px-3 py-1.5 text-sm ${
                        activeTab === tab ? 'bg-primary-600 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {tab === 'general' ? t('groups.general') : tab === 'users' ? t('groups.users') : t('groups.projects')}
                    </button>
                  ))}
                </div>

                {activeTab === 'general' && (
                  <div className="space-y-3">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">{t('groups.name')}</span>
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
                        onClick={() => void onSaveGeneral()}
                        disabled={updateGroup.isPending || !nameDraft.trim() || nameDraft.trim() === group.name}
                        className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {t('groups.save')}
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'users' && (
                  <div className="space-y-4">
                    <div className="rounded border border-gray-200 p-3">
                      <p className="text-sm font-medium text-gray-700">{t('groups.members')}</p>
                      <ul className="mt-2 space-y-1 text-sm text-gray-700">
                        {(group.users ?? []).map((u) => (
                          <li key={u.id} className="flex items-center justify-between gap-2">
                            <span className={pendingRemovedUserIds.includes(u.id) ? 'text-red-700' : ''}>
                              {pendingRemovedUserIds.includes(u.id) ? `- ${userLabel(u)}` : userLabel(u)}
                            </span>
                            <button type="button" onClick={() => togglePendingRemoveUser(u.id)} className="text-xs text-red-700 hover:underline">
                              {pendingRemovedUserIds.includes(u.id) ? t('groups.undoRemoveUser') : t('groups.removeUser')}
                            </button>
                          </li>
                        ))}
                        {pendingUserIds.map((uid) => {
                          const user = users.find((u) => u.id === uid);
                          return <li key={`pending-user-${uid}`} className="text-primary-700">+ {user ? userLabel(user) : uid}</li>;
                        })}
                        {group.users.length === 0 && pendingUserIds.length === 0 && <li className="text-gray-500">{t('app.noData')}</li>}
                      </ul>
                    </div>
                    <div className="max-h-64 overflow-y-auto rounded border border-gray-200 p-3">
                      {availableUsers.map((u) => (
                        <label key={u.id} className="flex items-center gap-2 py-1 text-sm">
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button type="button" onClick={onAddUsers} disabled={selectedUserIds.size === 0} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
                        {t('groups.add')}
                      </button>
                      <button type="button" onClick={() => void onSaveUsers()} disabled={addUsersBulk.isPending || removeGroupUser.isPending || (pendingUserIds.length === 0 && pendingRemovedUserIds.length === 0)} className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
                        {t('groups.save')}
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'projects' && (
                  <div className="space-y-4">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-gray-700">{t('projects.title')}</span>
                      <AppSelect
                        value={selectedProjectId}
                        onChange={setSelectedProjectId}
                        options={[{ value: '', label: '-' }, ...availableProjects.map((p) => ({ value: p.id, label: p.name }))]}
                        ariaLabel={t('projects.title')}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      />
                    </label>
                    <fieldset className="rounded border border-gray-200 p-3">
                      <legend className="px-1 text-sm font-medium text-gray-700">{t('members.roles')}</legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {roles.map((role) => (
                          <label key={role.id} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={selectedRoleIds.has(role.id)} onChange={() => toggleRole(role.id)} className="h-4 w-4 rounded border-gray-300 text-primary-600" />
                            {role.name}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <button type="button" onClick={onAddProject} disabled={!selectedProjectId || selectedRoleIds.size === 0} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">
                      {t('groups.add')}
                    </button>
                    <div className="rounded border border-gray-200 p-3">
                      <p className="text-sm font-medium text-gray-700">{t('groups.projects')}</p>
                      <ul className="mt-2 space-y-1 text-sm text-gray-700">
                        {(group.projects ?? []).map((p) => (
                          <li key={p.memberId} className="flex items-center justify-between gap-2">
                            <span className={pendingRemovedProjectIds.includes(p.projectId) ? 'text-red-700' : ''}>
                              {pendingRemovedProjectIds.includes(p.projectId) ? `- ${p.projectName}` : p.projectName} ({p.roles.map((r) => r.name).join(', ')})
                            </span>
                            <button type="button" onClick={() => togglePendingRemoveProject(p.projectId)} className="text-xs text-red-700 hover:underline">
                              {pendingRemovedProjectIds.includes(p.projectId) ? t('groups.undoRemoveProject') : t('groups.removeProject')}
                            </button>
                          </li>
                        ))}
                        {pendingProjects.map((p) => {
                          const project = projects.find((pp) => pp.id === p.projectId);
                          const roleNames = p.roleIds.map((rid) => roles.find((r) => r.id === rid)?.name).filter(Boolean).join(', ');
                          return <li key={`pending-${p.projectId}`} className="text-primary-700">+ {project?.name ?? p.projectId} ({roleNames})</li>;
                        })}
                      </ul>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => void onSaveProjects()} disabled={addProject.isPending || removeGroupProject.isPending || (pendingProjects.length === 0 && pendingRemovedProjectIds.length === 0)} className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50">
                        {t('groups.save')}
                      </button>
                    </div>
                  </div>
                )}

                {message && <p className="text-sm text-emerald-700">{message}</p>}
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end border-t border-gray-200 pt-4">
                  <button type="button" onClick={closeEdit} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    {t('app.close')}
                  </button>
                </div>
              </div>
            )}
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
