import { useState, useEffect } from 'react';
import { Eye, Plus, X } from 'lucide-react';
import { issuesApi, usersApi } from '../../lib/api';

interface IssueWatchersSectionProps {
  issueId: number;
}

export default function IssueWatchersSection({ issueId }: IssueWatchersSectionProps) {
  const [watchers, setWatchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadWatchers();
    loadUsers();
  }, [issueId]);

  const loadWatchers = async () => {
    try {
      const response = await issuesApi.getWatchers(issueId);
      setWatchers(response.data.data.watchers || []);
    } catch (error) {
      console.error('Failed to load watchers:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const response = await usersApi.getAll();
      setUsers(response.data.data.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    }
  };

  const handleAddWatcher = async () => {
    if (!selectedUserId) return;

    setAdding(true);
    try {
      await issuesApi.addWatcher(issueId, parseInt(selectedUserId));
      setSelectedUserId('');
      setShowAddForm(false);
      loadWatchers();
    } catch (error: any) {
      console.error('Failed to add watcher:', error);
      alert(error.response?.data?.message || 'ウォッチャーの追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveWatcher = async (userId: number) => {
    if (!confirm('このウォッチャーを削除してもよろしいですか？')) return;

    try {
      await issuesApi.removeWatcher(issueId, userId);
      loadWatchers();
    } catch (error) {
      console.error('Failed to remove watcher:', error);
      alert('ウォッチャーの削除に失敗しました');
    }
  };

  const availableUsers = users.filter(
    (user) => !watchers.find((w) => w.user?.id === user.id)
  );

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
          <Eye className="w-5 h-5" />
          <span>ウォッチャー</span>
        </h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn btn-sm btn-secondary flex items-center space-x-1"
        >
          <Plus className="w-4 h-4" />
          <span>追加</span>
        </button>
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ユーザー
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="input"
            >
              <option value="">ユーザーを選択</option>
              {availableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.lastName} {user.firstName} ({user.login})
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="btn btn-sm btn-secondary"
            >
              キャンセル
            </button>
            <button
              onClick={handleAddWatcher}
              disabled={adding || !selectedUserId}
              className="btn btn-sm btn-primary"
            >
              {adding ? '追加中...' : '追加'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-4 text-gray-500">読み込み中...</div>
      ) : watchers.length > 0 ? (
        <div className="space-y-2">
          {watchers.map((watcher: any) => (
            <div
              key={watcher.id}
              className="flex justify-between items-center p-2 bg-gray-50 rounded hover:bg-gray-100"
            >
              <div className="flex-1">
                <span className="text-sm text-gray-900">
                  {watcher.user?.lastName} {watcher.user?.firstName}
                </span>
                <span className="text-sm text-gray-500 ml-2">
                  ({watcher.user?.login})
                </span>
              </div>
              <button
                onClick={() => handleRemoveWatcher(watcher.user?.id)}
                className="text-red-600 hover:text-red-800"
                title="削除"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500">
          <p className="text-sm">ウォッチャーはいません</p>
        </div>
      )}
    </div>
  );
}
