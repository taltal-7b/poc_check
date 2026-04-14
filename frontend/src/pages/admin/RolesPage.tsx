import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { Pencil, Trash2 } from 'lucide-react';
import { useRoles, useCreateRole, useUpdateRole, useDeleteRole } from '../../api/hooks';
import type { Role } from '../../types';

type RoleType = 'manager' | 'developer' | 'reporter' | 'viewer';

// Helper function to safely parse permissions
function parsePermissions(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // Fallback: comma-separated string
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

const ROLE_TYPES: Record<RoleType, { label: string; description: string; details: string[]; permissions: string[] }> = {
  manager: {
    label: '管理者',
    description: 'プロジェクトの全権限',
    details: [
      'プロジェクト設定の編集・削除',
      'メンバー管理（追加・削除・ロール変更）',
      'すべてのチケット操作（作成・編集・削除・ステータス変更）',
      'バージョン、Wiki、フォーラム、文書の管理',
      '工数・ガントチャート・カレンダーの閲覧・編集',
    ],
    permissions: [
      'view_project', 'manage_project', 'edit_project', 'delete_project',
      'view_issues', 'add_issues', 'edit_issues', 'delete_issues', 'manage_issue_relations',
      'add_issue_notes', 'edit_issue_notes',
      'log_time', 'view_time_entries', 'edit_time_entries', 'manage_project_activities',
      'view_wiki_pages', 'edit_wiki_pages', 'rename_wiki_pages', 'delete_wiki_pages',
      'view_messages', 'add_messages', 'edit_messages', 'delete_messages', 'manage_boards',
      'view_documents', 'add_documents', 'edit_documents', 'delete_documents',
    ],
  },
  developer: {
    label: '開発者',
    description: '開発作業に必要な権限',
    details: [
      'チケットの作成・編集・削除',
      'チケットのステータス・進捗率変更',
      'すべてのチケットの閲覧とコメント',
      'Wiki・文書の作成・編集',
      '工数登録',
      '※メンバー管理・プロジェクト設定変更は不可',
    ],
    permissions: [
      'view_project',
      'view_issues', 'add_issues', 'edit_issues', 'edit_own_issues', 'delete_issues',
      'add_issue_notes', 'edit_issue_notes', 'edit_own_issue_notes',
      'log_time', 'view_time_entries', 'edit_own_time_entries',
      'view_wiki_pages', 'edit_wiki_pages',
      'view_messages', 'add_messages', 'edit_own_messages',
      'view_documents', 'add_documents',
    ],
  },
  reporter: {
    label: '報告者',
    description: 'バグ報告・要望起案用の権限',
    details: [
      'チケットの作成・閲覧',
      '自分が作成したチケットの編集',
      'すべてのチケットへのコメント追加',
      'Wiki・文書の閲覧',
      '※他人のチケット編集・削除、進捗率変更は不可',
    ],
    permissions: [
      'view_project',
      'view_issues', 'add_issues', 'edit_own_issues',
      'add_issue_notes',
      'view_wiki_pages',
      'view_messages', 'add_messages',
      'view_documents',
    ],
  },
  viewer: {
    label: '閲覧者',
    description: '閲覧とコメントのみの権限',
    details: [
      'すべてのチケット・Wiki・文書の閲覧',
      'チケット・フォーラムへのコメント追加',
      '※チケット作成・編集・削除、ステータス変更は不可',
    ],
    permissions: [
      'view_project',
      'view_issues',
      'add_issue_notes',
      'view_wiki_pages',
      'view_messages', 'add_messages',
      'view_documents',
    ],
  },
};

export default function RolesPage() {
  const { t } = useTranslation();
  const { data: rolesRes, isLoading, isError } = useRoles();
  const roles = rolesRes?.data ?? [];
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRoleMutation = useDeleteRole();

  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [deleteRole, setDeleteRole] = useState<Role | null>(null);
  const [name, setName] = useState('');
  const [roleType, setRoleType] = useState<RoleType>('developer');

  const sortedRoles = useMemo(() => [...roles].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [roles]);

  const openCreate = () => {
    setName('');
    setRoleType('developer');
    setCreateOpen(true);
  };

  const openEdit = (r: Role) => {
    setEditRole(r);
    setName(r.name);
    // Try to detect role type from permissions by comparing exact match
    const perms = new Set(parsePermissions(r.permissions));
    let detectedType: RoleType = 'developer';
    
    // Find exact match by comparing size and contents
    for (const [type, config] of Object.entries(ROLE_TYPES)) {
      const configPerms = new Set(config.permissions);
      if (perms.size === configPerms.size && [...perms].every(p => configPerms.has(p))) {
        detectedType = type as RoleType;
        break;
      }
    }
    
    setRoleType(detectedType);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const permissions = ROLE_TYPES[roleType].permissions;
    await createRole.mutateAsync({ name, assignable: true, permissions });
    setCreateOpen(false);
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRole) return;
    const permissions = ROLE_TYPES[roleType].permissions;
    await updateRole.mutateAsync({ id: editRole.id, name, assignable: true, permissions });
    setEditRole(null);
  };

  const handleDelete = async () => {
    if (!deleteRole) return;
    await deleteRoleMutation.mutateAsync(deleteRole.id);
    setDeleteRole(null);
  };

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
                <th className="px-3 py-2 text-left font-medium text-gray-600">ロール名</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">権限タイプ</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">操作</th>
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
                sortedRoles.map(r => {
                  const perms = new Set(parsePermissions(r.permissions));
                  let detectedType: RoleType = 'developer';
                  for (const [type, config] of Object.entries(ROLE_TYPES)) {
                    const configPerms = new Set(config.permissions);
                    if (perms.size === configPerms.size && [...perms].every(p => configPerms.has(p))) {
                      detectedType = type as RoleType;
                      break;
                    }
                  }
                  // 削除可能条件: builtin === 0 かつ 管理者ロールではない
                  const isDeletable = r.builtin === 0 && r.name !== '管理者';
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{r.name}</td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                          {ROLE_TYPES[detectedType].label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(r)}
                            className="rounded p-1 text-blue-600 hover:bg-blue-50"
                            title="編集"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {isDeletable && (
                            <button
                              type="button"
                              onClick={() => setDeleteRole(r)}
                              className="rounded p-1 text-red-600 hover:bg-red-50"
                              title="削除"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('roles.new')}</DialogTitle>
            <form className="mt-4 space-y-4" onSubmit={submitCreate}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ロール名</label>
                <input 
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="例: プロジェクトマネージャー"
                  required 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">権限タイプ</label>
                <select
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={roleType}
                  onChange={e => setRoleType(e.target.value as RoleType)}
                >
                  {Object.entries(ROLE_TYPES).map(([type, config]) => (
                    <option key={type} value={type}>
                      {config.label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 rounded bg-blue-50 p-3 border border-blue-100">
                  <p className="text-xs font-semibold text-blue-900 mb-1">{ROLE_TYPES[roleType].description}</p>
                  <ul className="space-y-1">
                    {ROLE_TYPES[roleType].details.map((detail, idx) => (
                      <li key={idx} className="text-xs text-gray-700 flex items-start gap-1">
                        <span className="text-blue-600 mt-0.5">•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={() => setCreateOpen(false)}>
                  {t('app.cancel')}
                </button>
                <button type="submit" className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700" disabled={createRole.isPending}>
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
          <DialogPanel className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">ロールを編集</DialogTitle>
            <form className="mt-4 space-y-4" onSubmit={submitEdit}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ロール名</label>
                <input 
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  required 
                  disabled={editRole ? editRole.builtin !== 0 : false}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">権限タイプ</label>
                <select
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={roleType}
                  onChange={e => setRoleType(e.target.value as RoleType)}
                  disabled={editRole ? editRole.builtin !== 0 : false}
                >
                  {Object.entries(ROLE_TYPES).map(([type, config]) => (
                    <option key={type} value={type}>
                      {config.label}
                    </option>
                  ))}
                </select>
                <div className="mt-2 rounded bg-blue-50 p-3 border border-blue-100">
                  <p className="text-xs font-semibold text-blue-900 mb-1">{ROLE_TYPES[roleType].description}</p>
                  <ul className="space-y-1">
                    {ROLE_TYPES[roleType].details.map((detail, idx) => (
                      <li key={idx} className="text-xs text-gray-700 flex items-start gap-1">
                        <span className="text-blue-600 mt-0.5">•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
                <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={() => setEditRole(null)}>
                  {t('app.cancel')}
                </button>
                <button type="submit" className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700" disabled={updateRole.isPending}>
                  {t('app.save')}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog open={!!deleteRole} onClose={() => setDeleteRole(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('app.confirm')}</DialogTitle>
            <p className="mt-2 text-sm text-gray-600">
              ロール「{deleteRole?.name}」を削除しますか？この操作は取り消せません。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteRole(null)} className="rounded border border-gray-300 px-4 py-2 text-sm">
                {t('app.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteRoleMutation.isPending}
                className="rounded bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t('app.delete')}
              </button>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
