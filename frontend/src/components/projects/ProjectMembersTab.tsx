import { useState, useEffect } from 'react';
import { UserPlus, Trash2, Shield, X } from 'lucide-react';
import { projectsApi, usersApi, api } from '../../lib/api';
import Loading from '../ui/Loading';
import Badge from '../ui/Badge';

interface ProjectMembersTabProps {
  projectId: number;
  onUpdate?: () => void;
}

export default function ProjectMembersTab({ projectId, onUpdate }: ProjectMembersTabProps) {
  const [members, setMembers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    loadMembers();
    loadRoles();
  }, [projectId]);

  const loadMembers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await projectsApi.getMembers(projectId);
      setMembers(response.data.data.members || []);
    } catch (err: any) {
      console.error('Failed to load members:', err);
      setError('メンバーの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const loadRoles = async () => {
    try {
      const response = await api.get('/roles');
      setRoles(response.data.data.roles || []);
    } catch (err) {
      console.error('Failed to load roles:', err);
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    if (!confirm('このメンバーを削除してもよろしいですか？')) return;

    try {
      await projectsApi.removeMember(projectId, memberId);
      loadMembers();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      alert('メンバーの削除に失敗しました');
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
        <h2 className="text-2xl font-bold text-gray-900">プロジェクトメンバー</h2>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary flex items-center space-x-2"
        >
          <UserPlus className="w-5 h-5" />
          <span>メンバーを追加</span>
        </button>
      </div>

      {members.length === 0 ? (
        <div className="card text-center py-12">
          <UserPlus className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            メンバーがいません
          </h3>
          <p className="text-gray-600 mb-4">
            プロジェクトにメンバーを追加してください
          </p>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="btn btn-primary"
          >
            メンバーを追加
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ユーザー
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ロール
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    追加日
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {member.user?.lastName} {member.user?.firstName}
                          </div>
                          <div className="text-sm text-gray-500">
                            {member.user?.login}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {member.roles?.map((role: any) => (
                          <Badge key={role.id} variant="info">
                            <Shield className="w-3 h-3 inline mr-1" />
                            {role.name}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(member.createdOn).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {isAddModalOpen && (
        <AddMemberModal
          projectId={projectId}
          roles={roles}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={() => {
            loadMembers();
            if (onUpdate) onUpdate();
            setIsAddModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

// Add Member Modal Component
interface AddMemberModalProps {
  projectId: number;
  roles: any[];
  onClose: () => void;
  onSuccess: () => void;
}

function AddMemberModal({ projectId, roles, onClose, onSuccess }: AddMemberModalProps) {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const response = await usersApi.getAll();
      setUsers(response.data.data.users || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedUserId) {
      setError('ユーザーを選択してください');
      return;
    }

    if (selectedRoleIds.length === 0) {
      setError('少なくとも1つのロールを選択してください');
      return;
    }

    setLoading(true);

    try {
      await projectsApi.addMember(projectId, {
        userId: parseInt(selectedUserId),
        roleIds: selectedRoleIds,
      });
      onSuccess();
    } catch (err: any) {
      console.error('Failed to add member:', err);
      setError(err.response?.data?.message || 'メンバーの追加に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = (roleId: number) => {
    if (selectedRoleIds.includes(roleId)) {
      setSelectedRoleIds(selectedRoleIds.filter(id => id !== roleId));
    } else {
      setSelectedRoleIds([...selectedRoleIds, roleId]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        ></div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          {/* Header */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">メンバーを追加</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* User Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ユーザー <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="input w-full"
                  required
                >
                  <option value="">選択してください</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.lastName} {user.firstName} ({user.login})
                    </option>
                  ))}
                </select>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ロール <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-300 rounded-md p-3">
                  {roles.map((role) => (
                    <label key={role.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedRoleIds.includes(role.id)}
                        onChange={() => toggleRole(role.id)}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">{role.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Actions */}
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
                  {loading ? '追加中...' : '追加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
