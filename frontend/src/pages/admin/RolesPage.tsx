import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useRoles, useCreateRole, useUpdateRole } from '../../api/hooks';
import type { Role } from '../../types';

const PERMISSION_GROUPS: Record<string, string[]> = {
  project: ['view_project', 'manage_project', 'select_project_modules', 'add_project', 'edit_project', 'close_project', 'delete_project', 'copy_project'],
  issues: [
    'view_issues',
    'add_issues',
    'edit_issues',
    'edit_own_issues',
    'copy_issues',
    'manage_issue_relations',
    'add_issue_notes',
    'edit_issue_notes',
    'edit_own_issue_notes',
    'move_issues',
    'delete_issues',
    'manage_public_queries',
    'save_queries',
  ],
  time: ['log_time', 'view_time_entries', 'edit_time_entries', 'edit_own_time_entries', 'manage_project_activities'],
  wiki: ['view_wiki_pages', 'view_wiki_edits', 'export_wiki_pages', 'edit_wiki_pages', 'rename_wiki_pages', 'delete_wiki_pages'],
  forums: ['view_messages', 'add_messages', 'edit_messages', 'edit_own_messages', 'delete_messages', 'delete_own_messages', 'manage_boards'],
  documents: ['view_documents', 'add_documents', 'edit_documents', 'delete_documents'],
  administration: ['administrate'],
};

function parsePermissions(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  try {
    const j = JSON.parse(raw) as unknown;
    if (Array.isArray(j)) return new Set(j.map(String));
  } catch {
    /* comma-separated */
  }
  return new Set(
    raw
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(Boolean),
  );
}

function categoryLabel(cat: string, t: (k: string) => string) {
  const map: Record<string, string> = {
    project: t('projects.title'),
    issues: t('issues.title'),
    time: t('timeEntries.title'),
    wiki: t('wiki.title'),
    forums: t('forums.title'),
    documents: t('documents.title'),
    administration: t('nav.admin'),
  };
  return map[cat] || cat;
}

export default function RolesPage() {
  const { t } = useTranslation();
  const { data: rolesRes, isLoading, isError } = useRoles();
  const roles = rolesRes?.data ?? [];
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();

  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [assignable, setAssignable] = useState(true);
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());

  const sortedRoles = useMemo(() => [...roles].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [roles]);

  const openCreate = () => {
    setName('');
    setAssignable(true);
    setSelectedPerms(new Set());
    setCreateOpen(true);
  };

  const openEdit = (r: Role) => {
    setEditRole(r);
    setName(r.name);
    setAssignable(r.assignable);
    setSelectedPerms(parsePermissions(r.permissions));
  };

  const togglePerm = (p: string) => {
    setSelectedPerms(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await createRole.mutateAsync({ name, assignable, permissions: [...selectedPerms] });
    setCreateOpen(false);
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRole) return;
    await updateRole.mutateAsync({ id: editRole.id, name, assignable, permissions: [...selectedPerms] });
    setEditRole(null);
  };

  const permissionForm = (
    <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
      {Object.entries(PERMISSION_GROUPS).map(([cat, perms]) => (
        <fieldset key={cat} className="rounded-lg border border-gray-200 p-3">
          <legend className="px-1 text-sm font-semibold text-gray-800">{categoryLabel(cat, t)}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {perms.map(p => (
              <label key={p} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={selectedPerms.has(p)} onChange={() => togglePerm(p)} />
                <span className="font-mono text-xs">{p}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{t('roles.title')}</h1>
        <button type="button" onClick={openCreate} className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
          {t('roles.new')}
        </button>
      </div>

      {isLoading && <p className="text-gray-500">{t('app.loading')}</p>}
      {isError && <p className="text-red-600">{t('app.error')}</p>}

      {!isLoading && !isError && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('roles.roleName')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('roles.assignable')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('roles.builtin')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRoles.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-8 text-center text-gray-500">
                    {t('app.noData')}
                  </td>
                </tr>
              ) : (
                sortedRoles.map(r => (
                  <tr key={r.id} className="cursor-pointer hover:bg-gray-50" onClick={() => openEdit(r)}>
                    <td className="px-3 py-2 font-medium text-gray-900">{r.name}</td>
                    <td className="px-3 py-2 text-gray-700">{r.assignable ? t('app.yes') : t('app.no')}</td>
                    <td className="px-3 py-2">
                      {r.builtin !== 0 ? (
                        <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-800">{t('roles.builtin')}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-500">{t('roles.permissions')}</p>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('roles.new')}</DialogTitle>
            <form className="mt-4 flex min-h-0 flex-1 flex-col gap-4" onSubmit={submitCreate}>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('roles.roleName')}</label>
                <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={assignable} onChange={e => setAssignable(e.target.checked)} />
                {t('roles.assignable')}
              </label>
              {permissionForm}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={() => setCreateOpen(false)}>
                  {t('app.cancel')}
                </button>
                <button type="submit" className="rounded bg-primary-600 px-4 py-2 text-sm text-white" disabled={createRole.isPending}>
                  {t('app.create')}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog open={!!editRole} onClose={() => setEditRole(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('app.edit')}</DialogTitle>
            <form className="mt-4 flex min-h-0 flex-1 flex-col gap-4" onSubmit={submitEdit}>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('roles.roleName')}</label>
                <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} required disabled={editRole ? editRole.builtin !== 0 : false} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={assignable} onChange={e => setAssignable(e.target.checked)} disabled={editRole ? editRole.builtin !== 0 : false} />
                {t('roles.assignable')}
              </label>
              {permissionForm}
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={() => setEditRole(null)}>
                  {t('app.cancel')}
                </button>
                <button type="submit" className="rounded bg-primary-600 px-4 py-2 text-sm text-white" disabled={updateRole.isPending}>
                  {t('app.save')}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
