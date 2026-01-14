import { useState, useEffect } from 'react';
import { FolderTree, Plus, Edit2, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import Loading from '../ui/Loading';
import Badge from '../ui/Badge';

interface ProjectCategoriesTabProps {
  projectId: number;
}

export default function ProjectCategoriesTab({ projectId }: ProjectCategoriesTabProps) {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);

  useEffect(() => {
    loadCategories();
  }, [projectId]);

  const loadCategories = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/projects/${projectId}/categories`);
      setCategories(response.data.data.categories || []);
    } catch (err: any) {
      console.error('Failed to load categories:', err);
      setError('カテゴリの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (categoryId: number) => {
    if (!confirm('このカテゴリを削除してもよろしいですか？')) return;

    try {
      await api.delete(`/categories/${categoryId}`);
      loadCategories();
    } catch (err: any) {
      alert('カテゴリの削除に失敗しました');
    }
  };

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">課題カテゴリ</h2>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn btn-primary flex items-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>カテゴリを追加</span>
        </button>
      </div>

      {categories.length === 0 ? (
        <div className="card text-center py-12">
          <FolderTree className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            カテゴリがありません
          </h3>
          <p className="text-gray-600 mb-4">
            課題を分類するためのカテゴリを追加しましょう
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="btn btn-primary"
          >
            カテゴリを追加
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    カテゴリ名
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    担当者
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    課題数
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {categories.map((category) => (
                  <tr key={category.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {category.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {category.assignedTo
                          ? `${category.assignedTo.lastName} ${category.assignedTo.firstName}`
                          : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="info">{category.issuesCount || 0}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => setEditingCategory(category)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(category.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Category Modal */}
      {(isCreateModalOpen || editingCategory) && (
        <CategoryModal
          projectId={projectId}
          category={editingCategory}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingCategory(null);
          }}
          onSuccess={() => {
            loadCategories();
            setIsCreateModalOpen(false);
            setEditingCategory(null);
          }}
        />
      )}
    </div>
  );
}

// Category Modal Component
interface CategoryModalProps {
  projectId: number;
  category?: any;
  onClose: () => void;
  onSuccess: () => void;
}

function CategoryModal({ projectId, category, onClose, onSuccess }: CategoryModalProps) {
  const [formData, setFormData] = useState({
    name: category?.name || '',
    assignedToId: category?.assignedTo?.id || '',
  });
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await api.get(`/projects/${projectId}/members`);
      const members = response.data.data.members || [];
      setUsers(members.map((m: any) => m.user).filter(Boolean));
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('カテゴリ名を入力してください');
      return;
    }

    setLoading(true);

    try {
      const payload: any = {
        name: formData.name,
      };

      if (formData.assignedToId) {
        payload.assignedToId = parseInt(formData.assignedToId as string);
      }

      if (category) {
        await api.put(`/categories/${category.id}`, payload);
      } else {
        await api.post(`/projects/${projectId}/categories`, payload);
      }

      onSuccess();
    } catch (err: any) {
      console.error('Failed to save category:', err);
      setError(err.response?.data?.message || 'カテゴリの保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        ></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                {category ? 'カテゴリを編集' : 'カテゴリを追加'}
              </h3>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                <X className="w-6 h-6" />
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  カテゴリ名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input w-full"
                  placeholder="例: バグ修正"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  担当者
                </label>
                <select
                  value={formData.assignedToId}
                  onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">未割り当て</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.lastName} {user.firstName} ({user.login})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-sm text-gray-500">
                  このカテゴリの課題のデフォルト担当者
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  disabled={loading}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? '保存中...' : category ? '更新' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
