import { Plus, Search, Filter } from 'lucide-react';

export default function IssueListPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">課題</h1>
        <button className="btn btn-primary flex items-center space-x-2">
          <Plus className="w-5 h-5" />
          <span>新規課題</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="card">
        <div className="space-y-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="課題を検索..."
                className="input pl-10"
              />
            </div>
            <button className="btn btn-secondary flex items-center space-x-2">
              <Filter className="w-5 h-5" />
              <span>フィルター</span>
            </button>
          </div>

          <div className="flex items-center space-x-4">
            <select className="input flex-1">
              <option value="">すべてのプロジェクト</option>
            </select>
            <select className="input flex-1">
              <option value="">すべてのステータス</option>
              <option value="new">新規</option>
              <option value="in_progress">進行中</option>
              <option value="resolved">解決済み</option>
              <option value="closed">クローズ</option>
            </select>
            <select className="input flex-1">
              <option value="">すべての担当者</option>
            </select>
          </div>
        </div>
      </div>

      {/* Issues Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  件名
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ステータス
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  担当者
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  優先度
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  更新日
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  課題がありません
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
