import { useState, useEffect } from 'react';
import { Clock, Plus, X } from 'lucide-react';
import { issuesApi, timeEntriesApi } from '../../lib/api';

interface IssueTimeEntriesSectionProps {
  issueId: number;
  estimatedHours?: number;
}

export default function IssueTimeEntriesSection({
  issueId,
  estimatedHours,
}: IssueTimeEntriesSectionProps) {
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    hours: '',
    activityId: '',
    comments: '',
    spentOn: new Date().toISOString().split('T')[0],
  });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadTimeEntries();
    loadActivities();
  }, [issueId]);

  const loadTimeEntries = async () => {
    try {
      const response = await issuesApi.getTimeEntries(issueId);
      setTimeEntries(response.data.data.timeEntries || []);
    } catch (error) {
      console.error('Failed to load time entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadActivities = async () => {
    try {
      const response = await timeEntriesApi.getActivities();
      setActivities(response.data.data.activities || []);
      if (response.data.data.activities?.length > 0) {
        setFormData((prev) => ({
          ...prev,
          activityId: response.data.data.activities[0].id,
        }));
      }
    } catch (error) {
      console.error('Failed to load activities:', error);
    }
  };

  const handleAddTimeEntry = async () => {
    if (!formData.hours || !formData.activityId) return;

    setAdding(true);
    try {
      await issuesApi.addTimeEntry(issueId, {
        hours: parseFloat(formData.hours),
        activityId: parseInt(formData.activityId),
        comments: formData.comments,
        spentOn: formData.spentOn,
      });
      setFormData({
        hours: '',
        activityId: activities[0]?.id || '',
        comments: '',
        spentOn: new Date().toISOString().split('T')[0],
      });
      setShowAddForm(false);
      loadTimeEntries();
    } catch (error: any) {
      console.error('Failed to add time entry:', error);
      alert(error.response?.data?.message || '時間記録の追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveTimeEntry = async (timeEntryId: number) => {
    if (!confirm('この時間記録を削除してもよろしいですか？')) return;

    try {
      await timeEntriesApi.delete(timeEntryId);
      loadTimeEntries();
    } catch (error) {
      console.error('Failed to remove time entry:', error);
      alert('時間記録の削除に失敗しました');
    }
  };

  const totalSpentHours = timeEntries.reduce(
    (sum, entry) => sum + (entry.hours || 0),
    0
  );

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP');
  };

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
          <Clock className="w-5 h-5" />
          <span>作業時間</span>
        </h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="btn btn-sm btn-secondary flex items-center space-x-1"
        >
          <Plus className="w-4 h-4" />
          <span>記録</span>
        </button>
      </div>

      <div className="mb-4 space-y-2">
        <div className="flex justify-between text-sm">
          <dt className="text-gray-600">予定時間</dt>
          <dd className="font-medium">
            {estimatedHours ? `${estimatedHours}h` : '-'}
          </dd>
        </div>
        <div className="flex justify-between text-sm">
          <dt className="text-gray-600">作業時間</dt>
          <dd className="font-medium">{totalSpentHours.toFixed(2)}h</dd>
        </div>
        {estimatedHours && (
          <div className="flex justify-between text-sm">
            <dt className="text-gray-600">進捗</dt>
            <dd className={`font-medium ${totalSpentHours > estimatedHours ? 'text-red-600' : 'text-green-600'}`}>
              {((totalSpentHours / estimatedHours) * 100).toFixed(0)}%
            </dd>
          </div>
        )}
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                作業時間 (時間)
              </label>
              <input
                type="number"
                step="0.25"
                min="0"
                value={formData.hours}
                onChange={(e) =>
                  setFormData({ ...formData, hours: e.target.value })
                }
                placeholder="例: 2.5"
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                作業分類
              </label>
              <select
                value={formData.activityId}
                onChange={(e) =>
                  setFormData({ ...formData, activityId: e.target.value })
                }
                className="input"
              >
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              作業日
            </label>
            <input
              type="date"
              value={formData.spentOn}
              onChange={(e) =>
                setFormData({ ...formData, spentOn: e.target.value })
              }
              className="input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              コメント
            </label>
            <textarea
              value={formData.comments}
              onChange={(e) =>
                setFormData({ ...formData, comments: e.target.value })
              }
              placeholder="作業内容を入力..."
              className="input h-20 resize-none"
            />
          </div>
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="btn btn-sm btn-secondary"
            >
              キャンセル
            </button>
            <button
              onClick={handleAddTimeEntry}
              disabled={adding || !formData.hours || !formData.activityId}
              className="btn btn-sm btn-primary"
            >
              {adding ? '記録中...' : '記録'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-4 text-gray-500">読み込み中...</div>
      ) : timeEntries.length > 0 ? (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {timeEntries.map((entry: any) => (
            <div
              key={entry.id}
              className="p-3 bg-gray-50 rounded hover:bg-gray-100"
            >
              <div className="flex justify-between items-start mb-1">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900">
                      {entry.hours}h
                    </span>
                    <span className="text-sm text-gray-600">
                      {entry.activity?.name}
                    </span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDate(entry.spentOn)} - {entry.user?.firstName}{' '}
                    {entry.user?.lastName}
                  </div>
                  {entry.comments && (
                    <p className="text-sm text-gray-700 mt-1">
                      {entry.comments}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveTimeEntry(entry.id)}
                  className="text-red-600 hover:text-red-800"
                  title="削除"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500">
          <p className="text-sm">作業時間の記録がありません</p>
        </div>
      )}
    </div>
  );
}
