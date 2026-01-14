import { useEffect, useState } from 'react';
import { Edit, Plus, Trash2 } from 'lucide-react';
import { groupsApi, usersApi } from '../../lib/api';
import Loading from '../../components/ui/Loading';

type GroupFormState = {
  name: string;
  description: string;
  lastName: string;
  userIds: number[];
};

const emptyForm = (): GroupFormState => ({
  name: '',
  description: '',
  lastName: '',
  userIds: [],
});

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<GroupFormState>(emptyForm());

  useEffect(() => {
    loadGroups();
    loadUsers();
  }, []);

  const loadGroups = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await groupsApi.getAll();
      setGroups(response.data.data.groups || []);
    } catch (err: any) {
      console.error('Failed to load groups:', err);
      setError(err.response?.data?.message || 'Failed to load groups.');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await usersApi.getAll({ limit: 200 });
      setUsers(response.data.data.users || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const resetForm = () => {
    setFormData(emptyForm());
    setEditingId(null);
    setFormError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('グループ名は必須です');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        lastName: formData.lastName.trim(),
        userIds: formData.userIds,
      };

      if (editingId) {
        await groupsApi.update(editingId, payload);
      } else {
        await groupsApi.create(payload);
      }

      resetForm();
      loadGroups();
    } catch (err: any) {
      console.error('Failed to save group:', err);
      setFormError(err.response?.data?.message || 'グループの保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (group: any) => {
    setEditingId(group.id);
    setFormData({
      name: group.name || '',
      description: group.description || '',
      lastName: group.lastName || '',
      userIds: (group.users || []).map((u: any) => u.id),
    });
  };

  const handleDelete = async (groupId: number) => {
    if (!confirm('このグループを削除してもよろしいですか？')) return;
    try {
      await groupsApi.delete(groupId);
      loadGroups();
    } catch (err) {
      console.error('Failed to delete group:', err);
      alert('グループの削除に失敗しました');
    }
  };

  const toggleUserSelection = (userId: number) => {
    setFormData((prev) => {
      const exists = prev.userIds.includes(userId);
      return {
        ...prev,
        userIds: exists
          ? prev.userIds.filter((id) => id !== userId)
          : [...prev.userIds, userId],
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">グループ管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            ユーザーをグループに整理
          </p>
        </div>
        <button className="btn btn-primary flex items-center space-x-2" onClick={resetForm}>
          <Plus className="w-4 h-4" />
          <span>新規グループ</span>
        </button>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {editingId ? 'グループ編集' : 'グループ作成'}
        </h2>
        {formError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">グループ名 *</label>
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
            <div>
              <label className="label">姓（任意）</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    lastName: event.target.value,
                  }))
                }
                className="input"
              />
            </div>
          </div>
          <div>
            <label className="label">説明</label>
            <textarea
              value={formData.description}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              className="input"
              rows={3}
            />
          </div>
          {users.length > 0 && (
            <div>
              <label className="label">メンバー</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {users.map((user) => (
                  <label key={user.id} className="flex items-center space-x-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.userIds.includes(user.id)}
                      onChange={() => toggleUserSelection(user.id)}
                    />
                        <span>
                          {user.lastName} {user.firstName} ({user.login})
                        </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end space-x-3">
            {editingId && (
              <button type="button" onClick={resetForm} className="btn btn-secondary" disabled={saving}>
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
        <h2 className="text-lg font-semibold text-gray-900 mb-4">グループ一覧</h2>
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
                    グループ名
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    説明
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    メンバー数
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groups.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      グループが見つかりませんでした
                    </td>
                  </tr>
                ) : (
                  groups.map((group) => (
                    <tr key={group.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-900">{group.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {group.description || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {(group.users || []).length}
                      </td>
                      <td className="px-4 py-2 text-right text-sm">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(group)}
                            className="btn btn-secondary flex items-center space-x-1"
                          >
                            <Edit className="w-4 h-4" />
                            <span>編集</span>
                          </button>
                          <button
                            onClick={() => handleDelete(group.id)}
                            className="btn btn-secondary text-red-600 hover:bg-red-50 flex items-center space-x-1"
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
