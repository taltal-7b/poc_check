import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { groupsApi, usersApi } from '../../lib/api';

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

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingUser?: any;
}

export default function CreateUserModal({
  isOpen,
  onClose,
  onSuccess,
  editingUser,
}: CreateUserModalProps) {
  const [groups, setGroups] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState<UserFormState>(emptyForm());

  useEffect(() => {
    if (isOpen) {
      loadGroups();
      if (editingUser) {
        setFormData({
          login: editingUser.login || '',
          email: editingUser.email || '',
          firstName: editingUser.firstName || '',
          lastName: editingUser.lastName || '',
          password: '',
          admin: !!editingUser.admin,
          status: editingUser.status?.toString() || '1',
          groupIds: (editingUser.groups || []).map((group: any) => group.id),
        });
      } else {
        setFormData(emptyForm());
      }
      setFormError('');
    }
  }, [isOpen, editingUser]);

  const loadGroups = async () => {
    try {
      const response = await groupsApi.getAll();
      setGroups(response.data.data.groups || []);
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');

    if (!formData.login.trim() && !editingUser) {
      setFormError('ログインIDは必須です。');
      return;
    }

    if (!formData.email.trim()) {
      setFormError('メールアドレスは必須です。');
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

      if (!editingUser) {
        payload.login = formData.login.trim();
        payload.password = formData.password;
      } else if (formData.password.trim()) {
        payload.password = formData.password;
      }

      if (editingUser) {
        await usersApi.update(editingUser.id, payload);
      } else {
        await usersApi.create(payload);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to save user:', err);
      setFormError(err.response?.data?.message || 'ユーザーの保存に失敗しました。');
    } finally {
      setSaving(false);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4">
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">
            {editingUser ? 'ユーザー編集' : 'ユーザー作成'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            disabled={saving}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {formError}
            </div>
          )}

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
                required={!editingUser}
                disabled={!!editingUser}
                autoComplete="off"
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
                autoComplete="off"
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
                autoComplete="off"
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
                autoComplete="off"
              />
            </div>
            <div>
              <label className="label">
                パスワード {editingUser ? '(変更しない場合は空白)' : '*'}
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
                required={!editingUser}
                autoComplete="new-password"
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
                id="admin-checkbox"
              />
              <label htmlFor="admin-checkbox" className="text-sm text-gray-700">
                管理者
              </label>
            </div>
          </div>

          {groups.length > 0 && (
            <div>
              <label className="label">グループ</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {groups.map((group) => (
                  <label
                    key={group.id}
                    className="flex items-center space-x-2 text-sm text-gray-700"
                  >
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

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={saving}
            >
              キャンセル
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? '保存中...' : editingUser ? '更新' : '作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
