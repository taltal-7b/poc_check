import { useState, useEffect } from 'react';
import { Link as LinkIcon, Plus, X } from 'lucide-react';
import { issuesApi } from '../../lib/api';

interface IssueRelationsSectionProps {
  issueId: number;
}

export default function IssueRelationsSection({ issueId }: IssueRelationsSectionProps) {
  const [relations, setRelations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [relationType, setRelationType] = useState('relates');
  const [targetIssueId, setTargetIssueId] = useState('');
  const [adding, setAdding] = useState(false);

  const relationTypes = [
    { value: 'relates', label: '関連している' },
    { value: 'duplicates', label: '重複している' },
    { value: 'duplicated', label: '重複されている' },
    { value: 'blocks', label: 'ブロックしている' },
    { value: 'blocked', label: 'ブロックされている' },
    { value: 'precedes', label: '先行している' },
    { value: 'follows', label: '後続している' },
    { value: 'copied_to', label: 'コピー先' },
    { value: 'copied_from', label: 'コピー元' },
  ];

  useEffect(() => {
    loadRelations();
  }, [issueId]);

  const loadRelations = async () => {
    try {
      const response = await issuesApi.getRelations(issueId);
      setRelations(response.data.data.relations || []);
    } catch (error) {
      console.error('Failed to load relations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRelation = async () => {
    if (!targetIssueId) return;

    setAdding(true);
    try {
      await issuesApi.addRelation(issueId, {
        issueToId: parseInt(targetIssueId),
        relationType,
      });
      setTargetIssueId('');
      setShowAddForm(false);
      loadRelations();
    } catch (error: any) {
      console.error('Failed to add relation:', error);
      alert(error.response?.data?.message || '関連の追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveRelation = async (relationId: number) => {
    if (!confirm('この関連を削除してもよろしいですか？')) return;

    try {
      await issuesApi.delete(relationId);
      loadRelations();
    } catch (error) {
      console.error('Failed to remove relation:', error);
      alert('関連の削除に失敗しました');
    }
  };

  const getRelationLabel = (type: string) => {
    const relation = relationTypes.find((r) => r.value === type);
    return relation?.label || type;
  };

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
          <LinkIcon className="w-5 h-5" />
          <span>関連課題</span>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                関連タイプ
              </label>
              <select
                value={relationType}
                onChange={(e) => setRelationType(e.target.value)}
                className="input"
              >
                {relationTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                課題番号
              </label>
              <input
                type="number"
                value={targetIssueId}
                onChange={(e) => setTargetIssueId(e.target.value)}
                placeholder="課題IDを入力"
                className="input"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2">
            <button
              onClick={() => setShowAddForm(false)}
              className="btn btn-sm btn-secondary"
            >
              キャンセル
            </button>
            <button
              onClick={handleAddRelation}
              disabled={adding || !targetIssueId}
              className="btn btn-sm btn-primary"
            >
              {adding ? '追加中...' : '追加'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-4 text-gray-500">読み込み中...</div>
      ) : relations.length > 0 ? (
        <div className="space-y-2">
          {relations.map((rel: any) => (
            <div
              key={rel.id}
              className="flex justify-between items-center p-2 bg-gray-50 rounded hover:bg-gray-100"
            >
              <div className="flex-1">
                <span className="text-sm text-gray-600 mr-2">
                  {getRelationLabel(rel.relationType)}:
                </span>
                <a
                  href={`/issues/${rel.issueTo?.id}`}
                  className="text-blue-600 hover:underline"
                >
                  #{rel.issueTo?.id} {rel.issueTo?.subject}
                </a>
              </div>
              <button
                onClick={() => handleRemoveRelation(rel.id)}
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
          <p className="text-sm">関連する課題はありません</p>
        </div>
      )}
    </div>
  );
}
