import { useState, useEffect } from 'react';
import { Calendar, Plus, Edit2, Trash2, CheckCircle, XCircle, X } from 'lucide-react';
import { api } from '../../lib/api';
import Loading from '../ui/Loading';
import Badge from '../ui/Badge';

interface ProjectVersionsTabProps {
  projectId: number;
}

export default function ProjectVersionsTab({ projectId }: ProjectVersionsTabProps) {
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<any>(null);

  useEffect(() => {
    loadVersions();
  }, [projectId]);

  const loadVersions = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get(`/projects/${projectId}/versions`);
      setVersions(response.data.data.versions || []);
    } catch (err: any) {
      console.error('Failed to load versions:', err);
      setError('バージョンの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (versionId: number) => {
    if (!confirm('このバージョンを削除してもよろしいですか？')) return;

    try {
      await api.delete(`/versions/${versionId}`);
      loadVersions();
    } catch (err: any) {
      alert('バージョンの削除に失敗しました');
    }
  };

  const handleToggleStatus = async (version: any) => {
    try {
      if (version.status === 'open') {
        await api.post(`/versions/${version.id}/close`);
      } else {
        await api.post(`/versions/${version.id}/reopen`);
      }
      loadVersions();
    } catch (err: any) {
      alert('ステータスの変更に失敗しました');
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
        <h2 className="text-2xl font-bold text-gray-900">バージョン管理</h2>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn btn-primary flex items-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>バージョンを追加</span>
        </button>
      </div>

      {versions.length === 0 ? (
        <div className="card text-center py-12">
          <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            バージョンがありません
          </h3>
          <p className="text-gray-600 mb-4">
            プロジェクトにバージョンを追加してリリース管理を始めましょう
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="btn btn-primary"
          >
            バージョンを追加
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {versions.map((version) => (
            <div key={version.id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-bold text-gray-900">
                      {version.name}
                    </h3>
                    <Badge variant={version.status === 'open' ? 'success' : 'default'}>
                      {version.status === 'open' ? 'オープン' : 'クローズ'}
                    </Badge>
                    {version.sharing === 'descendants' && (
                      <Badge variant="info">サブプロジェクト共有</Badge>
                    )}
                  </div>
                  {version.description && (
                    <p className="text-gray-600 mb-3">{version.description}</p>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    {version.dueDate && (
                      <div>
                        <dt className="text-gray-500">期日</dt>
                        <dd className="font-medium text-gray-900">
                          {new Date(version.dueDate).toLocaleDateString('ja-JP')}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-gray-500">作成日</dt>
                      <dd className="font-medium text-gray-900">
                        {new Date(version.createdOn).toLocaleDateString('ja-JP')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-gray-500">更新日</dt>
                      <dd className="font-medium text-gray-900">
                        {new Date(version.updatedOn).toLocaleDateString('ja-JP')}
                      </dd>
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => handleToggleStatus(version)}
                    className="p-2 text-gray-600 hover:text-gray-900"
                    title={version.status === 'open' ? 'クローズ' : 'オープン'}
                  >
                    {version.status === 'open' ? (
                      <XCircle className="w-5 h-5" />
                    ) : (
                      <CheckCircle className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={() => setEditingVersion(version)}
                    className="p-2 text-blue-600 hover:text-blue-900"
                  >
                    <Edit2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDelete(version.id)}
                    className="p-2 text-red-600 hover:text-red-900"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Version Modal */}
      {(isCreateModalOpen || editingVersion) && (
        <VersionModal
          projectId={projectId}
          version={editingVersion}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingVersion(null);
          }}
          onSuccess={() => {
            loadVersions();
            setIsCreateModalOpen(false);
            setEditingVersion(null);
          }}
        />
      )}
    </div>
  );
}

// Version Modal Component
interface VersionModalProps {
  projectId: number;
  version?: any;
  onClose: () => void;
  onSuccess: () => void;
}

function VersionModal({ projectId, version, onClose, onSuccess }: VersionModalProps) {
  const [formData, setFormData] = useState({
    name: version?.name || '',
    description: version?.description || '',
    status: version?.status || 'open',
    sharing: version?.sharing || 'none',
    dueDate: version?.dueDate?.split('T')[0] || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('名前を入力してください');
      return;
    }

    setLoading(true);

    try {
      const payload: any = {
        name: formData.name,
        description: formData.description,
        status: formData.status,
        sharing: formData.sharing,
      };

      if (formData.dueDate) {
        payload.dueDate = formData.dueDate;
      }

      if (version) {
        await api.put(`/versions/${version.id}`, payload);
      } else {
        await api.post(`/projects/${projectId}/versions`, payload);
      }

      onSuccess();
    } catch (err: any) {
      console.error('Failed to save version:', err);
      setError(err.response?.data?.message || 'バージョンの保存に失敗しました');
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
                {version ? 'バージョンを編集' : 'バージョンを追加'}
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
                  名前 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input w-full"
                  placeholder="例: v1.0.0"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  説明
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input w-full"
                  rows={3}
                  placeholder="バージョンの説明"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  期日
                </label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ステータス
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="input w-full"
                >
                  <option value="open">オープン</option>
                  <option value="locked">ロック</option>
                  <option value="closed">クローズ</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  共有設定
                </label>
                <select
                  value={formData.sharing}
                  onChange={(e) => setFormData({ ...formData, sharing: e.target.value })}
                  className="input w-full"
                >
                  <option value="none">共有しない</option>
                  <option value="descendants">サブプロジェクトと共有</option>
                  <option value="hierarchy">プロジェクトツリーで共有</option>
                  <option value="tree">すべてのプロジェクトで共有</option>
                  <option value="system">システム全体で共有</option>
                </select>
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
                  {loading ? '保存中...' : version ? '更新' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
