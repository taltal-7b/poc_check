import { useState } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { projectsApi } from '../../lib/api';
import { useNavigate } from 'react-router-dom';

interface ProjectSettingsTabProps {
  project: any;
  onUpdate: () => void;
}

export default function ProjectSettingsTab({ project, onUpdate }: ProjectSettingsTabProps) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: project.name || '',
    identifier: project.identifier || '',
    description: project.description || '',
    homepage: project.homepage || '',
    isPublic: project.isPublic ?? true,
    status: project.status || 'active',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.name.trim()) {
      setError('プロジェクト名を入力してください');
      return;
    }

    if (!formData.identifier.trim()) {
      setError('識別子を入力してください');
      return;
    }

    // 識別子の検証（英数字とハイフン、アンダースコアのみ）
    const identifierRegex = /^[a-z0-9_-]+$/i;
    if (!identifierRegex.test(formData.identifier)) {
      setError('識別子は英数字、ハイフン、アンダースコアのみ使用できます');
      return;
    }

    setLoading(true);

    try {
      await projectsApi.update(project.id, formData);
      setSuccess('プロジェクトを更新しました');
      onUpdate();
    } catch (err: any) {
      console.error('Failed to update project:', err);
      setError(err.response?.data?.message || 'プロジェクトの更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('このプロジェクトを削除してもよろしいですか？この操作は取り消せません。')) {
      return;
    }

    const confirmText = prompt('削除を確認するために、プロジェクト名を入力してください:');
    if (confirmText !== project.name) {
      alert('プロジェクト名が一致しません');
      return;
    }

    try {
      await projectsApi.delete(project.id);
      navigate('/projects');
    } catch (err: any) {
      alert('プロジェクトの削除に失敗しました');
    }
  };

  const handleArchive = async () => {
    if (!confirm('このプロジェクトをアーカイブしてもよろしいですか？')) {
      return;
    }

    try {
      await projectsApi.update(project.id, { status: 'archived' });
      onUpdate();
    } catch (err: any) {
      alert('プロジェクトのアーカイブに失敗しました');
    }
  };

  const handleClose = async () => {
    if (!confirm('このプロジェクトをクローズしてもよろしいですか？')) {
      return;
    }

    try {
      await projectsApi.update(project.id, { status: 'closed' });
      onUpdate();
    } catch (err: any) {
      alert('プロジェクトのクローズに失敗しました');
    }
  };

  const handleReopen = async () => {
    try {
      await projectsApi.update(project.id, { status: 'active' });
      onUpdate();
    } catch (err: any) {
      alert('プロジェクトの再オープンに失敗しました');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">プロジェクト設定</h2>
        <p className="text-gray-600">プロジェクトの基本情報を編集します</p>
      </div>

      <div className="card">
        <h3 className="text-lg font-bold text-gray-900 mb-4">基本情報</h3>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              プロジェクト名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              識別子 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.identifier}
              onChange={(e) => setFormData({ ...formData, identifier: e.target.value.toLowerCase() })}
              className="input w-full"
              pattern="[a-z0-9_-]+"
              title="英数字、ハイフン、アンダースコアのみ使用できます"
              required
            />
            <p className="mt-1 text-sm text-gray-500">
              英数字、ハイフン、アンダースコアのみ使用できます
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              説明
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input w-full"
              rows={4}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ホームページ
            </label>
            <input
              type="url"
              value={formData.homepage}
              onChange={(e) => setFormData({ ...formData, homepage: e.target.value })}
              className="input w-full"
              placeholder="https://example.com"
            />
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isPublic}
                onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">公開プロジェクト</span>
            </label>
            <p className="mt-1 text-sm text-gray-500 ml-6">
              チェックを入れると、すべてのユーザーがこのプロジェクトを閲覧できます
            </p>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              className="btn btn-primary flex items-center space-x-2"
              disabled={loading}
            >
              <Save className="w-5 h-5" />
              <span>{loading ? '保存中...' : '保存'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Project Status */}
      <div className="card">
        <h3 className="text-lg font-bold text-gray-900 mb-4">プロジェクトのステータス</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">現在のステータス</p>
              <p className="text-sm text-gray-600">
                {project.status === 'active' && 'アクティブ - プロジェクトは進行中です'}
                {project.status === 'closed' && 'クローズ - プロジェクトは完了しています'}
                {project.status === 'archived' && 'アーカイブ - プロジェクトはアーカイブされています'}
              </p>
            </div>
            <div className="flex space-x-2">
              {project.status === 'active' && (
                <>
                  <button onClick={handleClose} className="btn btn-secondary">
                    クローズ
                  </button>
                  <button onClick={handleArchive} className="btn btn-secondary">
                    アーカイブ
                  </button>
                </>
              )}
              {project.status !== 'active' && (
                <button onClick={handleReopen} className="btn btn-primary">
                  再オープン
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="card border-red-200">
        <h3 className="text-lg font-bold text-red-900 mb-4">危険な操作</h3>
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium text-gray-900">プロジェクトを削除</p>
              <p className="text-sm text-gray-600">
                この操作は取り消せません。プロジェクトとすべての関連データが完全に削除されます。
              </p>
            </div>
            <button
              onClick={handleDelete}
              className="btn btn-danger flex items-center space-x-2 ml-4"
            >
              <Trash2 className="w-5 h-5" />
              <span>削除</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
