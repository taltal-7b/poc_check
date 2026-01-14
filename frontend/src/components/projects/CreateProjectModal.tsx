import { useState } from 'react';
import { X } from 'lucide-react';
import { projectsApi } from '../../lib/api';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateProjectModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateProjectModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    identifier: '',
    description: '',
    isPublic: true,
    homepage: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim()) {
      setError('プロジェクト名を入力してください');
      return;
    }

    if (!formData.identifier.trim()) {
      setError('識別子を入力してください');
      return;
    }

    // Validate identifier format
    const identifierRegex = /^[a-z0-9-]+$/;
    if (!identifierRegex.test(formData.identifier)) {
      setError('識別子は小文字の英数字とハイフンのみ使用できます');
      return;
    }

    setLoading(true);

    try {
      await projectsApi.create({
        name: formData.name,
        identifier: formData.identifier,
        description: formData.description,
        isPublic: formData.isPublic,
        homepage: formData.homepage || undefined,
      });

      onSuccess();
      resetForm();
      onClose();
    } catch (err: any) {
      console.error('Failed to create project:', err);
      setError(err.response?.data?.message || 'プロジェクトの作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      identifier: '',
      description: '',
      isPublic: true,
      homepage: '',
    });
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleNameChange = (name: string) => {
    setFormData({ ...formData, name });
    
    // Auto-generate identifier from name if identifier is empty
    if (!formData.identifier) {
      const identifier = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      setFormData({ ...formData, name, identifier });
    } else {
      setFormData({ ...formData, name });
    }
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
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          {/* Header */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">新規プロジェクト</h3>
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
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  プロジェクト名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="input w-full"
                  placeholder="例: マイプロジェクト"
                  required
                />
              </div>

              {/* Identifier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  識別子 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.identifier}
                  onChange={(e) =>
                    setFormData({ ...formData, identifier: e.target.value.toLowerCase() })
                  }
                  className="input w-full"
                  placeholder="例: my-project"
                  pattern="[a-z0-9-]+"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  小文字の英数字とハイフンのみ使用できます
                </p>
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
                  placeholder="プロジェクトの説明を入力してください"
                />
              </div>

              {/* Homepage */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ホームページ
                </label>
                <input
                  type="url"
                  value={formData.homepage}
                  onChange={(e) =>
                    setFormData({ ...formData, homepage: e.target.value })
                  }
                  className="input w-full"
                  placeholder="https://example.com"
                />
              </div>

              {/* Is Public */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.isPublic}
                    onChange={(e) =>
                      setFormData({ ...formData, isPublic: e.target.checked })
                    }
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">
                    公開プロジェクト（すべてのユーザーが閲覧可能）
                  </span>
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
                  {loading ? '作成中...' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
