import { useEffect, useMemo, useState } from 'react';
import { Edit, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { groupsApi, usersApi } from '../../lib/api';
import Loading from '../../components/ui/Loading';
import Pagination from '../../components/ui/Pagination';

type UserFormState = {
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  admin: boolean;
  status: string;
  groupIds: number[];
};

const emptyForm = (): UserFormState => ({
  login: '',
  email: '',
  firstName: '',
  lastName: '',
  password: '',
  admin: false,
  status: '1',
  groupIds: [],
});

const statusOptions = [
  { value: '1', label: '有効' },
  { value: '2', label: '登録済み' },
  { value: '3', label: 'ロック' },
];

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<UserFormState>(emptyForm());

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadGroups();
  }, []);

  useEffect(() => {
    loadUsers();
  }, [page, search, statusFilter]);

  const groupedUsers = useMemo(() => users, [users]);

  const loadGroups = async () => {
    try {
      const response = await groupsApi.getAll();
      setGroups(response.data.data.groups || []);
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { page, limit: 25 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const response = await usersApi.getAll(params);
      const { users: list, pagination } = response.data.data;
      setUsers(list || []);
      setTotalPages(pagination.pages || 1);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      setError(err.response?.data?.message || 'Failed to load users.');
    } finally {
      setLoading(false);
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

    if (!formData.login.trim() && !editingId) {
      setFormError('Login is required.');
      return;
    }

    if (!formData.email.trim()) {
      setFormError('Email is required.');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        email: formData.email.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        admin: formData.admin,
        status: Number(formData.status),
        groupIds: formData.groupIds,
      };

      if (!editingId) {
        payload.login = formData.login.trim();
        payload.password = formData.password;
      } else if (formData.password.trim()) {
        payload.password = formData.password;
      }

      if (editingId) {
        await usersApi.update(editingId, payload);
      } else {
        await usersApi.create(payload);
      }

      resetForm();
      loadUsers();
    } catch (err: any) {
      console.error('Failed to save user:', err);
      setFormError(err.response?.data?.message || 'Failed to save user.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (user: any) => {
    setEditingId(user.id);
    setFormData({
      login: user.login || '',
      email: user.email || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      password: '',
      admin: !!user.admin,
      status: user.status?.toString() || '1',
      groupIds: (user.groups || []).map((group: any) => group.id),
    });
  };

  const handleDelete = async (userId: number) => {
    if (!confirm('Delete this user?')) return;
    try {
      await usersApi.delete(userId);
      loadUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
      alert('Failed to delete user.');
    }
  };

  const handleToggleLock = async (userId: number) => {
    try {
      await usersApi.toggleLock(userId);
      loadUsers();
    } catch (err) {
      console.error('Failed to toggle lock:', err);
      alert('Failed to update user status.');
    }
  };

  const toggleGroupSelection = (groupId: number) => {
    setFormData((prev) => {
      const exists = prev.groupIds.includes(groupId);
      return {
        ...prev,
        groupIds: exists
          ? prev.groupIds.filter((id) => id !== groupId)
          : [...prev.groupIds, groupId],
      };
    });
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('ja-JP');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ユーザー管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            システムユーザーの作成・編集・削除
          </p>
        </div>
        <button
          onClick={() => setEditingId(null)}
          className="btn btn-primary flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>新規ユーザー</span>
        </button>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {editingId ? 'ユーザー編集' : 'ユーザー作成'}
        </h2>
        {formError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">ログインID *</label>
              <input
                type="text"
                value={formData.login}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, login: event.target.value }))
                }
                className="input"
                placeholder="ログインID"
                required={!editingId}
                disabled={!!editingId}
              />
            </div>
            <div>
              <label className="label">メールアドレス *</label>
              <input
                type="email"
                value={formData.email}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, email: event.target.value }))
                }
                className="input"
                placeholder="email@example.com"
                required
              />
            </div>
            <div>
              <label className="label">名</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    firstName: event.target.value,
                  }))
                }
                className="input"
              />
            </div>
            <div>
              <label className="label">姓</label>
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
            <div>
              <label className="label">
                パスワード {editingId ? '(変更しない場合は空欄)' : '*'}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    password: event.target.value,
                  }))
                }
                className="input"
                required={!editingId}
              />
            </div>
            <div>
              <label className="label">ステータス</label>
              <select
                value={formData.status}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, status: event.target.value }))
                }
                className="input"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.admin}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, admin: event.target.checked }))
                }
              />
              <label className="text-sm text-gray-700">管理者</label>
            </div>
          </div>

          {groups.length > 0 && (
            <div>
              <label className="label">グループ</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {groups.map((group) => (
                  <label key={group.id} className="flex items-center space-x-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={formData.groupIds.includes(group.id)}
                      onChange={() => toggleGroupSelection(group.id)}
                    />
                    <span>{group.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? '保存中...' : editingId ? '更新' : '作成'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">ユーザー一覧</h2>
          <div className="flex items-center space-x-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input w-56"
              placeholder="検索..."
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="input w-44"
            >
              <option value="">すべてのステータス</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

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
                    ログインID
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    名前
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    メールアドレス
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ステータス
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    グループ
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    最終ログイン
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {groupedUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      ユーザーが見つかりませんでした
                    </td>
                  </tr>
                ) : (
                  groupedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {user.login}
                        {user.admin && (
                          <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded">
                            管理者
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {user.firstName} {user.lastName}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {user.email}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {statusOptions.find((option) => option.value === String(user.status))?.label ||
                          user.status}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {(user.groups || []).map((group: any) => group.name).join(', ') ||
                          '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {formatDateTime(user.lastLoginOn)}
                      </td>
                      <td className="px-4 py-2 text-right text-sm">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(user)}
                            className="btn btn-secondary flex items-center space-x-1"
                          >
                            <Edit className="w-4 h-4" />
                            <span>編集</span>
                          </button>
                          <button
                            onClick={() => handleToggleLock(user.id)}
                            className="btn btn-secondary flex items-center space-x-1"
                          >
                            {user.status === 3 ? (
                              <>
                                <Unlock className="w-4 h-4" />
                                <span>ロック解除</span>
                              </>
                            ) : (
                              <>
                                <Lock className="w-4 h-4" />
                                <span>ロック</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
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

        {totalPages > 1 && (
          <div className="border-t border-gray-200">
            <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
