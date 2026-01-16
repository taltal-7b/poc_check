import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { issuesApi, projectsApi, trackersApi, issueStatusesApi, issuePrioritiesApi, usersApi } from '../../lib/api';

export default function CreateIssuePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [trackers, setTrackers] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [priorities, setPriorities] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    projectId: '',
    trackerId: '',
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
    loadMasterData();
  }, []);

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

      if (trackersRes.data.data.trackers?.length > 0 && !formData.trackerId) {
        setFormData((prev) => ({ ...prev, trackerId: trackersRes.data.data.trackers[0].id }));
      }

      const defaultPriority = prioritiesRes.data.data.priorities?.find((p: any) => p.isDefault);
      if (defaultPriority && !formData.priorityId) {
        setFormData((prev) => ({ ...prev, priorityId: defaultPriority.id }));
      }

      const firstStatus = statusesRes.data.data.statuses?.find((s: any) => !s.isClosed);
      if (firstStatus && !formData.statusId) {
        setFormData((prev) => ({ ...prev, statusId: firstStatus.id }));
      }
    } catch (err: any) {
      console.error('Failed to load master data:', err);
      setError('マスターデータの読み込みに失敗しました');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.projectId) {
      setError('プロジェクトを選択してください');
      return;
    }

    if (!formData.trackerId) {
      setError('トラッカーを選択してください');
      return;
    }

    if (!formData.subject.trim()) {
      setError('件名を入力してください');
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        projectId: parseInt(formData.projectId, 10),
        trackerId: parseInt(formData.trackerId, 10),
        subject: formData.subject,
        description: formData.description,
        doneRatio: formData.doneRatio,
        isPrivate: formData.isPrivate,
      };

      if (formData.statusId) payload.statusId = parseInt(formData.statusId, 10);
      if (formData.priorityId) payload.priorityId = parseInt(formData.priorityId, 10);
      if (formData.assignedToId) payload.assignedToId = parseInt(formData.assignedToId, 10);
      if (formData.startDate) payload.startDate = formData.startDate;
      if (formData.dueDate) payload.dueDate = formData.dueDate;
      if (formData.estimatedHours) payload.estimatedHours = parseFloat(formData.estimatedHours);

      await issuesApi.create(payload);
      navigate('/issues');
    } catch (err: any) {
      console.error('Failed to create issue:', err);
      setError(err.response?.data?.message || '課題の作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">新規課題</h1>
          <p className="text-sm text-gray-500 mt-1">課題の基本情報を入力してください</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/issues')}
          className="btn btn-secondary"
        >
          一覧に戻る
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">
              プロジェクト<span className="text-red-500">*</span>
            </label>
            <select
              value={formData.projectId}
              onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
              className="input"
              required
            >
              <option value="">選択してください</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">
              トラッカー<span className="text-red-500">*</span>
            </label>
            <select
              value={formData.trackerId}
              onChange={(e) => setFormData({ ...formData, trackerId: e.target.value })}
              className="input"
              required
            >
              <option value="">選択してください</option>
              {trackers.map((tracker) => (
                <option key={tracker.id} value={tracker.id}>
                  {tracker.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">
            件名<span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            className="input"
            required
          />
        </div>

        <div>
          <label className="label">説明</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="input h-32 resize-none"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">ステータス</label>
            <select
              value={formData.statusId}
              onChange={(e) => setFormData({ ...formData, statusId: e.target.value })}
              className="input"
            >
              <option value="">選択してください</option>
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">優先度</label>
            <select
              value={formData.priorityId}
              onChange={(e) => setFormData({ ...formData, priorityId: e.target.value })}
              className="input"
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
          <div>
            <label className="label">担当者</label>
            <select
              value={formData.assignedToId}
              onChange={(e) => setFormData({ ...formData, assignedToId: e.target.value })}
              className="input"
            >
              <option value="">未割り当て</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.lastName} {user.firstName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">予定工数 (時間)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={formData.estimatedHours}
              onChange={(e) => setFormData({ ...formData, estimatedHours: e.target.value })}
              className="input"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">開始日</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="input"
            />
          </div>
          <div>
            <label className="label">期日</label>
            <input
              type="date"
              value={formData.dueDate}
              onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="label">進捗率 (%)</label>
          <input
            type="range"
            min={0}
            max={100}
            value={formData.doneRatio}
            onChange={(e) => setFormData({ ...formData, doneRatio: parseInt(e.target.value, 10) })}
          />
          <div className="text-sm text-gray-500 mt-1">{formData.doneRatio}%</div>
        </div>

        <div>
          <label className="flex items-center space-x-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={formData.isPrivate}
              onChange={(e) => setFormData({ ...formData, isPrivate: e.target.checked })}
            />
            <span>プライベート課題</span>
          </label>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={() => navigate('/issues')}
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
            {loading ? '作成中...' : '作成'}
          </button>
        </div>
      </form>
    </div>
  );
}
