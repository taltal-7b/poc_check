import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, UserMinus, Pencil } from 'lucide-react';
import { useMembers, useUsers, useRoles, useProject, useProjectMemberGroups } from '../api/hooks';
import api from '../api/client';
import type { Member, User, Role } from '../types';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useAuthStore } from '../stores/auth';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

function unwrapObject<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null && 'data' in raw) {
    return ((raw as { data?: T }).data ?? null) as T | null;
  }
  return raw as T;
}

export default function MembersPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const qc = useQueryClient();

  const slug = identifier ?? '';

  const membersRaw = useMembers(slug);
  const usersRaw = useUsers();
  const groupsRaw = useProjectMemberGroups(slug);
  const rolesRaw = useRoles();
  const projectRaw = useProject(slug);
  const currentUser = useAuthStore((s) => s.user);
  const isSystemAdmin = useAuthStore((s) => !!s.user?.admin);

  const members = useMemo(() => unwrapList<Member>(membersRaw.data), [membersRaw.data]);
  const users = useMemo(() => unwrapList<User>(usersRaw.data), [usersRaw.data]);
  const groups = useMemo(() => unwrapList<{ id: string; name: string }>(groupsRaw.data), [groupsRaw.data]);
  const roles = useMemo(() => unwrapList<Role>(rolesRaw.data).filter((r) => r.assignable), [rolesRaw.data]);
  const project = useMemo(() => unwrapObject<{ id: string; createdByUserId?: string | null }>(projectRaw.data), [projectRaw.data]);

  const existingUserIds = useMemo(() => new Set(members.map((m) => m.userId).filter(Boolean)), [members]);
  const availableUsers = useMemo(() => users.filter((u) => !existingUserIds.has(u.id)), [users, existingUserIds]);

  const [modalOpen, setModalOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());
  const [editTarget, setEditTarget] = useState<Member | null>(null);
  const [editRoleIds, setEditRoleIds] = useState<Set<string>>(new Set());
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const addMember = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${slug}/members`, {
        ...(groupId ? { groupId } : { userId }),
        roleIds: Array.from(roleIds),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', slug] });
      setModalOpen(false);
      setUserId('');
      setGroupId('');
      setRoleIds(new Set());
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      await api.delete(`/projects/${slug}/members/${memberId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', slug] });
      setRemoveTarget(null);
    },
  });

  const updateMember = useMutation({
    mutationFn: async ({ memberId, nextRoleIds }: { memberId: string; nextRoleIds: string[] }) => {
      await api.put(`/projects/${slug}/members/${memberId}`, { roleIds: nextRoleIds });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', slug] });
      setEditTarget(null);
      setEditRoleIds(new Set());
    },
  });

  const toggleRole = (id: string) => {
    setRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEditRole = (id: string) => {
    setEditRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const displayName = (m: Member) => {
    if (m.user) return `${m.user.lastname} ${m.user.firstname}`.trim() || m.user.login;
    if (m.group) return m.group.name;
    return m.userId ?? m.groupId ?? '—';
  };

  const emailOf = (m: Member) => m.user?.mail ?? '—';

  const canManageMembers = useMemo(() => {
    if (isSystemAdmin) return true;
    if (!currentUser) return false;
    if (project?.createdByUserId && project.createdByUserId === currentUser.id) return true;
    const selfMember = members.find((m) => m.userId === currentUser.id);
    if (!selfMember) return false;
    return (selfMember.memberRoles ?? []).some((mr) => (mr.role?.name ?? '') === '管理者');
  }, [isSystemAdmin, currentUser, project, members]);

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-6">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('members.title')}</h1>
        {canManageMembers && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            <UserPlus size={18} />
            {t('members.addMember')}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">{t('members.name')}</th>
              <th className="px-4 py-3 font-medium">{t('members.roles')}</th>
              <th className="px-4 py-3 font-medium">{t('auth.email')}</th>
              <th className="px-4 py-3 font-medium w-24">{t('app.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map((m) => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">{displayName(m)}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {(m.memberRoles ?? []).map((mr) => (
                      <span key={mr.role?.id ?? mr.role?.name} className="rounded-full bg-primary-100 text-primary-800 px-2 py-0.5 text-xs">
                        {mr.role?.name ?? '—'}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2 text-gray-600">{emailOf(m)}</td>
                <td className="px-4 py-2">
                  {canManageMembers ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditTarget(m);
                          const existing = new Set((m.memberRoles ?? []).map((mr) => mr.role?.id).filter(Boolean) as string[]);
                          setEditRoleIds(existing);
                        }}
                        disabled={updateMember.isPending}
                        className="text-blue-600 hover:text-blue-800 p-1 disabled:opacity-50"
                        title={t('app.edit')}
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(m)}
                        disabled={removeMember.isPending}
                        className="text-rose-600 hover:text-rose-800 p-1 disabled:opacity-50"
                        title={t('members.removeMember')}
                      >
                        <UserMinus size={18} />
                      </button>
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {members.length === 0 && <p className="p-6 text-center text-gray-500">{t('app.noData')}</p>}
      </div>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <DialogTitle className="text-lg font-semibold">{t('members.addMember')}</DialogTitle>
            <div className="mt-4 space-y-4">
              <label className="block text-sm">
                <span className="text-gray-700">{t('members.user')}</span>
                <select
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    if (e.target.value) setGroupId('');
                  }}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {availableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.login} ({u.lastname} {u.firstname})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">{t('groups.title')}</span>
                <select
                  value={groupId}
                  onChange={(e) => {
                    setGroupId(e.target.value);
                    if (e.target.value) setUserId('');
                  }}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend className="text-sm text-gray-700 mb-2">{t('members.roles')}</legend>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-100 rounded p-2">
                  {roles.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={roleIds.has(r.id)}
                        onChange={() => toggleRole(r.id)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      {r.name}
                    </label>
                  ))}
                  {roles.length === 0 && (
                    <p className="text-xs text-gray-400 py-2">{t('app.noData')}</p>
                  )}
                </div>
              </fieldset>
              {addMember.isError && (
                <p className="text-sm text-red-600">
                  {(addMember.error as Error)?.message ?? t('app.error')}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                  {t('app.cancel')}
                </button>
                <button
                  type="button"
                  disabled={(!userId && !groupId) || roleIds.size === 0 || addMember.isPending}
                  onClick={() => addMember.mutate()}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {addMember.isPending ? t('app.loading') : t('app.save')}
                </button>
              </div>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog open={editTarget !== null} onClose={() => setEditTarget(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <DialogTitle className="text-lg font-semibold">{t('app.edit')}</DialogTitle>
            <div className="mt-4 space-y-4">
              <p className="text-sm text-gray-700">
                <span className="font-medium">{editTarget ? displayName(editTarget) : ''}</span> のロールを編集
              </p>
              <fieldset>
                <legend className="text-sm text-gray-700 mb-2">{t('members.roles')}</legend>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-100 rounded p-2">
                  {roles.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editRoleIds.has(r.id)}
                        onChange={() => toggleEditRole(r.id)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      {r.name}
                    </label>
                  ))}
                  {roles.length === 0 && (
                    <p className="text-xs text-gray-400 py-2">{t('app.noData')}</p>
                  )}
                </div>
              </fieldset>
              {updateMember.isError && (
                <p className="text-sm text-red-600">
                  {(updateMember.error as Error)?.message ?? t('app.error')}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditTarget(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                  {t('app.cancel')}
                </button>
                <button
                  type="button"
                  disabled={!editTarget || editRoleIds.size === 0 || updateMember.isPending}
                  onClick={() => editTarget && updateMember.mutate({ memberId: editTarget.id, nextRoleIds: Array.from(editRoleIds) })}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {updateMember.isPending ? t('app.loading') : t('app.save')}
                </button>
              </div>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      {/* Remove confirmation modal */}
      <Dialog open={removeTarget !== null} onClose={() => setRemoveTarget(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('app.confirm')}</DialogTitle>
            <p className="mt-3 text-sm text-gray-600">
              <span className="font-medium text-gray-900">{removeTarget ? displayName(removeTarget) : ''}</span> を削除しますか？
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm"
              >
                {t('app.cancel')}
              </button>
              <button
                type="button"
                disabled={removeMember.isPending}
                onClick={() => removeTarget && removeMember.mutate(removeTarget.id)}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {removeMember.isPending ? t('app.loading') : t('app.delete')}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
