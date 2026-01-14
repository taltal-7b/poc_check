import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { issuesApi, projectsApi, trackersApi, issueStatusesApi, issuePrioritiesApi, usersApi } from '../../lib/api';

interface EditIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  issueId: number;
  initialData: any;
}

export default function EditIssueModal({
  isOpen,
  onClose,
  onSuccess,
  issueId,
  initialData,
}: EditIssueModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [trackers, setTrackers] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [priorities, setPriorities] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    statusId: '',
    priorityId: '',
    assignedToId: '',
    startDate: '',
    dueDate: '',
    estimatedHours: '',
    doneRatio: 0,
    isPrivate: false,
  });

  useEffect(() => {
    if (isOpen && initialData) {
      setFormData({
        subject: initialData.subject || '',
        description: initialData.description || '',
        statusId: initialData.statusId || '',
        priorityId: initialData.priorityId || '',
        assignedToId: initialData.assignedToId || '',
        startDate: initialData.startDate ? initialData.startDate.split('T')[0] : '',
        dueDate: initialData.dueDate ? initialData.dueDate.split('T')[0] : '',
        estimatedHours: initialData.estimatedHours || '',
        doneRatio: initialData.doneRatio || 0,
        isPrivate: initialData.isPrivate || false,
      });
      loadMasterData();
    }
  }, [isOpen, initialData]);

  const loadMasterData = async () => {
    try {
      const [projectsRes, trackersRes, statusesRes, prioritiesRes, usersRes] = await Promise.all([
        projectsApi.getAll(),
        trackersApi.getAll(),
        issueStatusesApi.getAll(),
        issuePrioritiesApi.getAll(),
        usersApi.getAll(),
      ]);

      setProjects(projectsRes.data.data.projects || []);
      setTrackers(trackersRes.data.data.trackers || []);
      setStatuses(statusesRes.data.data.statuses || []);
      setPriorities(prioritiesRes.data.data.priorities || []);
      setUsers(usersRes.data.data.users || []);
    } catch (err: any) {
      console.error('Failed to load master data:', err);
      setError('マスターデータの読み込みに失敗しました');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.subject.trim()) {
      setError('件名を入力してください');
      return;
    }

    setLoading(true);

    try {
      const payload: any = {
        subject: formData.subject,
        description: formData.description,
        doneRatio: formData.doneRatio,
        isPrivate: formData.isPrivate,
      };

      if (formData.statusId) payload.statusId = parseInt(formData.statusId as string);
      if (formData.priorityId) payload.priorityId = parseInt(formData.priorityId as string);
      if (formData.assignedToId) payload.assignedToId = parseInt(formData.assignedToId as string);
      if (formData.startDate) payload.startDate = formData.startDate;
      if (formData.dueDate) payload.dueDate = formData.dueDate;
      if (formData.estimatedHours) payload.estimatedHours = parseFloat(formData.estimatedHours as string);

      await issuesApi.update(issueId, payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to update issue:', err);
      setError(err.response?.data?.message || '課題の更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={handleClose}
        ></div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          {/* Header */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">課題を編集</h3>
              <button
                onClick={handleClose}
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
              {/* Subject */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  件名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(e) =>
                    setFormData({ ...formData, subject: e.target.value })
                  }
                  className="input w-full"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  説明
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  className="input w-full"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ステータス
                  </label>
                  <select
                    value={formData.statusId}
                    onChange={(e) =>
                      setFormData({ ...formData, statusId: e.target.value })
                    }
                    className="input w-full"
                  >
                    <option value="">選択してください</option>
                    {statuses.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    優先度
                  </label>
                  <select
                    value={formData.priorityId}
                    onChange={(e) =>
                      setFormData({ ...formData, priorityId: e.target.value })
                    }
                    className="input w-full"
                  >
                    <option value="">選択してください</option>
                    {priorities.map((priority) => (
                      <option key={priority.id} value={priority.id}>
                        {priority.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Assigned To */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    担当者
                  </label>
                  <select
                    value={formData.assignedToId}
                    onChange={(e) =>
                      setFormData({ ...formData, assignedToId: e.target.value })
                    }
                    className="input w-full"
                  >
                    <option value="">未割り当て</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.lastName} {user.firstName} ({user.login})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Estimated Hours */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    予定工数
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={formData.estimatedHours}
                    onChange={(e) =>
                      setFormData({ ...formData, estimatedHours: e.target.value })
                    }
                    className="input w-full"
                    placeholder="時間"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    開始日
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, startDate: e.target.value })
                    }
                    className="input w-full"
                  />
                </div>

                {/* Due Date */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    期日
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) =>
                      setFormData({ ...formData, dueDate: e.target.value })
                    }
                    className="input w-full"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  進捗率 (%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="10"
                  value={formData.doneRatio}
                  onChange={(e) =>
                    setFormData({ ...formData, doneRatio: parseInt(e.target.value) })
                  }
                  className="w-full"
                />
                <div className="text-center text-sm text-gray-600 mt-1">
                  {formData.doneRatio}%
                </div>
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isPrivate}
                    onChange={(e) =>
                      setFormData({ ...formData, isPrivate: e.target.checked })
                    }
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">プライベート課題</span>
                </label>
              </div>

              {/* Actions */}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={handleClose}
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
                  {loading ? '更新中...' : '更新'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
