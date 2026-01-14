import { useEffect, useMemo, useState } from 'react';
import { Edit, Plus, Trash2 } from 'lucide-react';
import { rolesApi } from '../../lib/api';
import Loading from '../../components/ui/Loading';

type RoleFormState = {
  name: string;
  assignable: boolean;
  issuesVisibility: string;
  usersVisibility: string;
  timeEntriesVisibility: string;
  permissions: string[];
};

const emptyForm = (): RoleFormState => ({
  name: '',
  assignable: true,
  issuesVisibility: 'default',
  usersVisibility: 'all',
  timeEntriesVisibility: 'all',
  permissions: [],
});

const visibilityOptions = [
  { value: 'all', label: 'すべて' },
  { value: 'default', label: 'デフォルト' },
  { value: 'own', label: '自分のみ' },
];

export default function RolesPage() {
  const [roles, setRoles] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<RoleFormState>(emptyForm());

  useEffect(() => {
    loadRoles();
    loadPermissions();
  }, []);

  const loadRoles = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await rolesApi.getAll();
      setRoles(response.data.data.roles || []);
    } catch (err: any) {
      console.error('Failed to load roles:', err);
      setError(err.response?.data?.message || 'Failed to load roles.');
    } finally {
      setLoading(false);
    }
  };

  const loadPermissions = async () => {
    try {
      const response = await rolesApi.getAvailablePermissions();
      setPermissions(response.data.data.permissions || []);
    } catch (err) {
      console.error('Failed to load permissions:', err);
    }
  };

  const permissionGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    permissions.forEach((perm) => {
      const key = perm.module || 'general';
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(perm);
    });
    return groups;
  }, [permissions]);

  const resetForm = () => {
    setFormData(emptyForm());
    setEditingId(null);
    setFormError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('ロール名は必須です');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        assignable: formData.assignable,
        issuesVisibility: formData.issuesVisibility,
        usersVisibility: formData.usersVisibility,
        timeEntriesVisibility: formData.timeEntriesVisibility,
        permissions: formData.permissions,
      };

      if (editingId) {
        await rolesApi.update(editingId, payload);
      } else {
        await rolesApi.create(payload);
      }

      resetForm();
      loadRoles();
    } catch (err: any) {
      console.error('Failed to save role:', err);
      setFormError(err.response?.data?.message || 'ロールの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (role: any) => {
    try {
      const response = await rolesApi.getById(role.id);
      const roleData = response.data.data.role;
      setEditingId(role.id);
      setFormData({
        name: roleData.name || '',
        assignable: roleData.assignable ?? true,
        issuesVisibility: roleData.issuesVisibility || 'default',
        usersVisibility: roleData.usersVisibility || 'all',
        timeEntriesVisibility: roleData.timeEntriesVisibility || 'all',
        permissions: roleData.permissions || [],
      });
    } catch (err) {
      console.error('Failed to load role details:', err);
      alert('ロール詳細の読み込みに失敗しました');
    }
  };

  const handleDelete = async (role: any) => {
    if (!confirm('このロールを削除してもよろしいですか？')) return;
    try {
      await rolesApi.delete(role.id);
      loadRoles();
    } catch (err) {
      console.error('Failed to delete role:', err);
      alert('ロールの削除に失敗しました');
    }
  };

  const togglePermission = (permName: string) => {
    setFormData((prev) => {
      const exists = prev.permissions.includes(permName);
      return {
        ...prev,
        permissions: exists
          ? prev.permissions.filter((p) => p !== permName)
          : [...prev.permissions, permName],
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ロール管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            権限と表示ルールを定義
          </p>
        </div>
        <button className="btn btn-primary flex items-center space-x-2" onClick={() => resetForm()}>
          <Plus className="w-4 h-4" />
          <span>新規ロール</span>
        </button>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {editingId ? 'ロール編集' : 'ロール作成'}
        </h2>
        {formError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">ロール名 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, name: event.target.value }))
                }
                className="input"
                required
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.assignable}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    assignable: event.target.checked,
                  }))
                }
              />
              <label className="text-sm text-gray-700">割り当て可能</label>
            </div>
            <div>
              <label className="label">課題の表示範囲</label>
              <select
                value={formData.issuesVisibility}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    issuesVisibility: event.target.value,
                  }))
                }
                className="input"
              >
                {visibilityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">ユーザーの表示範囲</label>
              <select
                value={formData.usersVisibility}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    usersVisibility: event.target.value,
                  }))
                }
                className="input"
              >
                {visibilityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">時間記録の表示範囲</label>
              <select
                value={formData.timeEntriesVisibility}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    timeEntriesVisibility: event.target.value,
                  }))
                }
                className="input"
              >
                {visibilityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">権限</label>
            <div className="space-y-4">
              {Object.entries(permissionGroups).map(([moduleName, modulePerms]) => (
                <div key={moduleName} className="border border-gray-200 rounded-md p-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">
                    {moduleName === 'general' ? '全般' : moduleName}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {(modulePerms as any[]).map((perm) => (
                      <label key={perm.name} className="flex items-center space-x-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={formData.permissions.includes(perm.name)}
                          onChange={() => togglePermission(perm.name)}
                        />
                        <span>{perm.description || perm.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="btn btn-secondary"
                disabled={saving}
              >
                キャンセル
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中...' : editingId ? '更新' : '作成'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">ロール一覧</h2>
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {error}
          </div>
        )}
        {loading ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ロール名
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    割り当て可能
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    組み込み
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {roles.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      ロールが見つかりませんでした
                    </td>
                  </tr>
                ) : (
                  roles.map((role) => (
                    <tr key={role.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-900">{role.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {role.assignable ? 'はい' : 'いいえ'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {role.builtin ? 'はい' : 'いいえ'}
                      </td>
                      <td className="px-4 py-2 text-right text-sm">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(role)}
                            className="btn btn-secondary flex items-center space-x-1"
                          >
                            <Edit className="w-4 h-4" />
                            <span>編集</span>
                          </button>
                          <button
                            onClick={() => handleDelete(role)}
                            className="btn btn-secondary text-red-600 hover:bg-red-50 flex items-center space-x-1"
                            disabled={role.builtin}
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>削除</span>
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
      </div>
    </div>
  );
}
