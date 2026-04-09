import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, UserMinus } from 'lucide-react';
import { useProject, useMembers, useUsers, useRoles } from '../api/hooks';
import api from '../api/client';
import type { Member, User, Role } from '../types';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

export default function MembersPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const qc = useQueryClient();

  const { data: projectRaw } = useProject(identifier ?? '');
  const project =
    projectRaw && typeof projectRaw === 'object' && 'id' in projectRaw ? (projectRaw as { id: string }) : null;
  const projectId = project?.id ?? '';

  const membersRaw = useMembers(projectId);
  const usersRaw = useUsers();
  const rolesRaw = useRoles();

  const members = useMemo(() => unwrapList<Member>(membersRaw.data), [membersRaw.data]);
  const users = useMemo(() => unwrapList<User>(usersRaw.data), [usersRaw.data]);
  const roles = useMemo(() => unwrapList<Role>(rolesRaw.data).filter((r) => r.assignable), [rolesRaw.data]);

  const [modalOpen, setModalOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [roleIds, setRoleIds] = useState<Set<string>>(new Set());

  const addMember = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${projectId}/members`, {
        userId,
        roleIds: Array.from(roleIds),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', projectId] });
      setModalOpen(false);
      setUserId('');
      setRoleIds(new Set());
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      await api.delete(`/projects/${projectId}/members/${memberId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', projectId] }),
  });

  const toggleRole = (id: string) => {
    setRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const displayName = (m: Member) => {
    if (m.user) return `${m.user.firstname} ${m.user.lastname}`.trim() || m.user.login;
    if (m.group) return m.group.name;
    return m.userId ?? m.groupId ?? '—';
  };

  const emailOf = (m: Member) => m.user?.mail ?? '—';

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-6">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.members')}</h1>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          <UserPlus size={18} />
          Add member
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Roles</th>
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
                  <button
                    type="button"
                    onClick={() => removeMember.mutate(m.id)}
                    disabled={removeMember.isPending}
                    className="text-rose-600 hover:text-rose-800 p-1 disabled:opacity-50"
                    title={t('app.delete')}
                  >
                    <UserMinus size={18} />
                  </button>
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
            <DialogTitle className="text-lg font-semibold">Add member</DialogTitle>
            <div className="mt-4 space-y-4">
              <label className="block text-sm">
                <span className="text-gray-700">User</span>
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">—</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.login} ({u.firstname} {u.lastname})
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend className="text-sm text-gray-700 mb-2">Roles</legend>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-100 rounded p-2">
                  {roles.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={roleIds.has(r.id)} onChange={() => toggleRole(r.id)} />
                      {r.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                  {t('app.cancel')}
                </button>
                <button
                  type="button"
                  disabled={!userId || roleIds.size === 0 || addMember.isPending}
                  onClick={() => addMember.mutate()}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {t('app.save')}
                </button>
              </div>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
