import { useParams } from 'react-router-dom';
import { Settings, Users, FileText, Activity } from 'lucide-react';

export default function ProjectDetailPage() {
  const { id } = useParams();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            プロジェクト名
          </h1>
          <p className="text-gray-600 mt-2">プロジェクトの説明</p>
        </div>
        <button className="btn btn-secondary flex items-center space-x-2">
          <Settings className="w-5 h-5" />
          <span>設定</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button className="py-4 px-1 border-b-2 border-primary-600 font-medium text-primary-600">
            概要
          </button>
          <button className="py-4 px-1 border-b-2 border-transparent font-medium text-gray-500 hover:text-gray-700">
            課題
          </button>
          <button className="py-4 px-1 border-b-2 border-transparent font-medium text-gray-500 hover:text-gray-700">
            メンバー
          </button>
          <button className="py-4 px-1 border-b-2 border-transparent font-medium text-gray-500 hover:text-gray-700">
            活動
          </button>
        </nav>
      </div>

      {/* Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              プロジェクト情報
            </h2>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  識別子
                </dt>
                <dd className="mt-1 text-sm text-gray-900">project-{id}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  ステータス
                </dt>
                <dd className="mt-1">
                  <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                    アクティブ
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              最近の課題
            </h2>
            <div className="text-center py-8 text-gray-500">
              <p>課題がありません</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <Users className="w-5 h-5" />
              <span>メンバー</span>
            </h2>
            <div className="text-center py-4 text-gray-500">
              <p className="text-sm">メンバー: 0</p>
            </div>
          </div>

          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <FileText className="w-5 h-5" />
              <span>統計</span>
            </h2>
            <dl className="space-y-2">
              <div className="flex justify-between text-sm">
                <dt className="text-gray-600">課題</dt>
                <dd className="font-medium">0</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-gray-600">完了済み</dt>
                <dd className="font-medium text-green-600">0</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt className="text-gray-600">進行中</dt>
                <dd className="font-medium text-blue-600">0</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
