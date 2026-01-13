import { useParams } from 'react-router-dom';
import { Edit, MessageSquare, Clock, Link as LinkIcon } from 'lucide-react';

export default function IssueDetailPage() {
  const { id } = useParams();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-gray-500">#{id}</span>
            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
              新規
            </span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">
            課題のタイトル
          </h1>
        </div>
        <button className="btn btn-secondary flex items-center space-x-2">
          <Edit className="w-5 h-5" />
          <span>編集</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4">説明</h2>
            <div className="prose max-w-none">
              <p className="text-gray-600">課題の説明がここに表示されます。</p>
            </div>
          </div>

          {/* Comments */}
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <MessageSquare className="w-5 h-5" />
              <span>コメント</span>
            </h2>
            <div className="space-y-4">
              <div className="text-center py-8 text-gray-500">
                <p>コメントがありません</p>
              </div>
              <div>
                <textarea
                  className="input h-24 resize-none"
                  placeholder="コメントを入力..."
                />
                <div className="mt-2 flex justify-end">
                  <button className="btn btn-primary">コメントを追加</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Details */}
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4">詳細</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  ステータス
                </dt>
                <dd className="mt-1">
                  <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                    新規
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  優先度
                </dt>
                <dd className="mt-1 text-sm text-gray-900">通常</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  担当者
                </dt>
                <dd className="mt-1 text-sm text-gray-900">未割り当て</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  作成者
                </dt>
                <dd className="mt-1 text-sm text-gray-900">ユーザー名</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  作成日
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  2024-01-01 10:00
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  更新日
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  2024-01-01 10:00
                </dd>
              </div>
            </dl>
          </div>

          {/* Relations */}
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <LinkIcon className="w-5 h-5" />
              <span>関連</span>
            </h2>
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">関連する課題はありません</p>
            </div>
          </div>

          {/* Time */}
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <Clock className="w-5 h-5" />
              <span>作業時間</span>
            </h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <dt className="text-gray-600">予定時間</dt>
                <dd className="font-medium">-</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-gray-600">作業時間</dt>
                <dd className="font-medium">0h</dd>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
