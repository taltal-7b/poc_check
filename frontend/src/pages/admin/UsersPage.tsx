import { useEffect, useState } from 'react';
import { Edit, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { usersApi } from '../../lib/api';
import Loading from '../../components/ui/Loading';
import Pagination from '../../components/ui/Pagination';
import CreateUserModal from '../../components/users/CreateUserModal';

const statusOptions = [
  { value: '1', label: '有効' },
  { value: '2', label: '登録済み' },
  { value: '3', label: 'ロック' },
];

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadUsers();
  }, [page, search, statusFilter]);

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
      setError(err.response?.data?.message || 'ユーザーの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClick = () => {
    setEditingUser(null);
    setIsModalOpen(true);
  };

  const handleEditClick = (user: any) => {
    setEditingUser(user);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingUser(null);
  };

  const handleModalSuccess = () => {
    loadUsers();
  };

  const handleDelete = async (userId: number) => {
    if (!confirm('このユーザーを削除してもよろしいですか？')) return;
    try {
      await usersApi.delete(userId);
      loadUsers();
    } catch (err) {
      console.error('Failed to delete user:', err);
      alert('ユーザーの削除に失敗しました。');
    }
  };

  const handleToggleLock = async (userId: number) => {
    try {
      await usersApi.toggleLock(userId);
      loadUsers();
    } catch (err) {
      console.error('Failed to toggle lock:', err);
      alert('ユーザーのステータス更新に失敗しました。');
    }
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('ja-JP');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">ユーザー管理</h1>
        <button
          onClick={handleCreateClick}
          className="btn btn-primary flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>新規ユーザー</span>
        </button>
      </div>

      <p className="text-sm text-gray-600">
        システムユーザーの作成・編集・削除
      </p>

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
                    アクション
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      ユーザーが見つかりません。
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
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
                        {user.lastName} {user.firstName}
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
                            onClick={() => handleEditClick(user)}
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

      {/* User Create/Edit Modal */}
      <CreateUserModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
        editingUser={editingUser}
      />
    </div>
  );
}
