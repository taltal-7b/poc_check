import { Plus, Search } from 'lucide-react';

export default function ProjectListPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">プロジェクト</h1>
        <button className="btn btn-primary flex items-center space-x-2">
          <Plus className="w-5 h-5" />
          <span>新規プロジェクト</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="card">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="プロジェクトを検索..."
              className="input pl-10"
            />
          </div>
          <select className="input w-48">
            <option value="">すべてのステータス</option>
            <option value="active">アクティブ</option>
            <option value="closed">クローズ</option>
            <option value="archived">アーカイブ</option>
          </select>
        </div>
      </div>

      {/* Projects List */}
      <div className="card">
        <div className="text-center py-12 text-gray-500">
          <p>プロジェクトがありません</p>
          <p className="text-sm mt-2">
            新しいプロジェクトを作成して始めましょう
          </p>
        </div>
      </div>
    </div>
  );
}
