import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { Pencil, Trash2 } from 'lucide-react';
import { useRoles, useCreateRole, useUpdateRole, useDeleteRole } from '../../api/hooks';
import type { Role } from '../../types';

type PermissionLevel = 'none' | 'view' | 'edit';

interface FeaturePermission {
  key: string;
  label: string;
  viewPerms: string[];
  editPerms: string[];
  canDisable?: boolean;
}

const FEATURES: FeaturePermission[] = [
  {
    key: 'project',
    label: 'プロジェクト',
    viewPerms: ['view_project'],
    editPerms: ['manage_project', 'edit_project'],
    canDisable: false,
  },
  {
    key: 'issues',
    label: 'チケット',
    viewPerms: ['view_issues'],
    editPerms: ['add_issues', 'edit_issues', 'delete_issues', 'manage_issue_relations', 'add_issue_notes', 'edit_issue_notes'],
  },
  {
    key: 'wiki',
    label: 'Wiki',
    viewPerms: ['view_wiki_pages'],
    editPerms: ['edit_wiki_pages', 'rename_wiki_pages', 'delete_wiki_pages'],
  },
  {
    key: 'news',
    label: 'ニュース',
    viewPerms: ['view_news'],
    editPerms: ['manage_news'], // Assuming manage_news for edit
  },
  {
    key: 'forums',
    label: 'フォーラム',
    viewPerms: ['view_messages'],
    editPerms: ['add_messages', 'edit_messages', 'delete_messages', 'manage_boards'],
  },
  {
    key: 'calendar',
    label: 'カレンダー',
    viewPerms: ['view_calendar'],
    editPerms: ['manage_calendar'], // カレンダーの編集権限を追加
  },
  {
    key: 'files',
    label: 'ファイル',
    viewPerms: ['view_files'],
    editPerms: ['manage_files'],
  },
];

// Helper function to safely parse permissions
function parsePermissions(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return raw.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

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
  const [featureLevels, setFeatureLevels] = useState<Record<string, PermissionLevel>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initial: Record<string, PermissionLevel> = {};
    FEATURES.forEach(f => {
      initial[f.key] = f.canDisable === false ? 'view' : 'none';
    });
    setFeatureLevels(initial);
  }, []);

  const sortedRoles = useMemo(() => {
    const defaultRoleNames = ['管理者', '開発者', '報告者'];
    
    // 1. デフォルトロールを抽出
    const defaultRoles = defaultRoleNames
      .map(name => roles.find(r => r.name === name))
      .filter((r): r is Role => !!r);
    
    // 2. それ以外のロールを抽出して作成日時順にソート
    const otherRoles = roles
      .filter(r => !defaultRoleNames.includes(r.name))
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateA - dateB;
      });
    
    // 3. 結合
    return [...defaultRoles, ...otherRoles];
  }, [roles]);

  const openCreate = () => {
    setName('');
    setError(null);
    const initial: Record<string, PermissionLevel> = {};
    FEATURES.forEach(f => {
      initial[f.key] = f.canDisable === false ? 'view' : 'none';
    });
    setFeatureLevels(initial);
    setCreateOpen(true);
  };

  const openEdit = (r: Role) => {
    if (r.name === '管理者') return;
    
    setName(r.name);
    setError(null);
    setEditRole(r);
    const perms = new Set(parsePermissions(r.permissions));
    
    const levels: Record<string, PermissionLevel> = {};
    FEATURES.forEach(f => {
      const hasEdit = f.editPerms.length > 0 && f.editPerms.every(p => perms.has(p));
      const hasView = f.viewPerms.every(p => perms.has(p));
      
      if (hasEdit) levels[f.key] = 'edit';
      else if (hasView) levels[f.key] = 'view';
      else levels[f.key] = f.canDisable === false ? 'view' : 'none';
    });
    setFeatureLevels(levels);
  };

  const getPermissionsFromLevels = () => {
    const perms = new Set<string>();
    FEATURES.forEach(f => {
      const level = featureLevels[f.key];
      if (level === 'view' || level === 'edit') {
        f.viewPerms.forEach(p => perms.add(p));
      }
      if (level === 'edit') {
        f.editPerms.forEach(p => perms.add(p));
      }
    });
    return Array.from(perms);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await createRole.mutateAsync({ name, assignable: true, permissions: getPermissionsFromLevels() });
      setCreateOpen(false);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'ロールの作成に失敗しました';
      setError(msg);
      console.error('Failed to create role:', err);
    }
  };

  const submitEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRole) return;
    setError(null);
    try {
      await updateRole.mutateAsync({ id: editRole.id, name, assignable: true, permissions: getPermissionsFromLevels() });
      setEditRole(null);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'ロールの更新に失敗しました';
      setError(msg);
      console.error('Failed to update role:', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteRole) return;
    try {
      await deleteRoleMutation.mutateAsync(deleteRole.id);
      setDeleteRole(null);
    } catch (error) {
      console.error('Failed to delete role:', error);
    }
  };

  const renderPermissionSelects = () => (
    <div className="space-y-4">
      {FEATURES.map(f => (
        <div key={f.key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
          <span className="text-sm font-medium text-gray-700 w-24">{f.label}</span>
          <div className="flex gap-2">
            <div className="w-20 flex justify-center">
              {f.canDisable !== false ? (
                <button
                  type="button"
                  onClick={() => setFeatureLevels(prev => ({ ...prev, [f.key]: 'none' }))}
                  className={`w-full py-1 text-xs rounded-full border ${
                    featureLevels[f.key] === 'none'
                      ? 'bg-gray-100 border-gray-300 text-gray-700 font-semibold'
                      : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  閲覧不可
                </button>
              ) : (
                <div className="w-full h-6"></div>
              )}
            </div>
            <div className="w-20 flex justify-center">
              <button
                type="button"
                onClick={() => setFeatureLevels(prev => ({ ...prev, [f.key]: 'view' }))}
                className={`w-full py-1 text-xs rounded-full border ${
                  featureLevels[f.key] === 'view'
                    ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                    : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                閲覧可能
              </button>
            </div>
            <div className="w-20 flex justify-center">
              {f.editPerms.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setFeatureLevels(prev => ({ ...prev, [f.key]: 'edit' }))}
                  className={`w-full py-1 text-xs rounded-full border ${
                    featureLevels[f.key] === 'edit'
                      ? 'bg-green-50 border-green-300 text-green-700 font-semibold'
                      : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  編集可能
                </button>
              ) : (
                <div className="w-full h-6"></div>
              )}
            </div>
          </div>
        </div>
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
                <th className="px-3 py-2 text-left font-medium text-gray-600">ロール名</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRoles.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-3 py-8 text-center text-gray-500">
                    {t('app.noData')}
                  </td>
                </tr>
              ) : (
                sortedRoles.map(r => {
                  const isEditable = r.builtin === 0 && r.name !== '管理者';
                  const isDeletable = r.builtin === 0 && r.name !== '管理者';
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{r.name}</td>
                      <td className="px-3 py-2">
                        {(isEditable || isDeletable) ? (
                          <div className="flex items-center justify-center gap-2">
                            {isEditable && (
                              <button
                                type="button"
                                onClick={() => openEdit(r)}
                                className="rounded p-1 text-blue-600 hover:bg-blue-50"
                                title="編集"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            )}
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
                        ) : (
                          <div className="text-center text-xs text-gray-400">—</div>
                        )}
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
            {error && (
              <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-600 border border-red-100">
                {error}
              </div>
            )}
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
                <label className="block text-sm font-medium text-gray-700 mb-2">権限設定</label>
                <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                  {renderPermissionSelects()}
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
            {error && (
              <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-600 border border-red-100">
                {error}
              </div>
            )}
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
                <label className="block text-sm font-medium text-gray-700 mb-2">権限設定</label>
                <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
                  {renderPermissionSelects()}
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
