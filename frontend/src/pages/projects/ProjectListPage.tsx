import { useState, useEffect } from 'react';
import { Plus, Search, ExternalLink, Users, FileText } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { projectsApi } from '../../lib/api';
import CreateProjectModal from '../../components/projects/CreateProjectModal';
import Loading from '../../components/ui/Loading';
import Badge from '../../components/ui/Badge';

export default function ProjectListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    loadProjects();
  }, [search, statusFilter]);

  useEffect(() => {
    // Check if openModal query parameter is present
    if (searchParams.get('openModal') === 'true') {
      setIsCreateModalOpen(true);
      // Remove the query parameter
      searchParams.delete('openModal');
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams]);

  const loadProjects = async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;

      const response = await projectsApi.getAll(params);
      setProjects(response.data.data.projects || []);
    } catch (err: any) {
      console.error('Failed to load projects:', err);
      setError(err.response?.data?.message || 'プロジェクトの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: any = {
      active: { label: 'アクティブ', color: 'green' },
      closed: { label: 'クローズ', color: 'gray' },
      archived: { label: 'アーカイブ', color: 'gray' },
    };
    const statusInfo = statusMap[status] || { label: status, color: 'blue' };
    return <Badge color={statusInfo.color as any}>{statusInfo.label}</Badge>;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">プロジェクト</h1>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn btn-primary flex items-center space-x-2"
        >
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
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-48"
          >
            <option value="">すべてのステータス</option>
            <option value="active">アクティブ</option>
            <option value="closed">クローズ</option>
            <option value="archived">アーカイブ</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Projects List */}
      {loading ? (
        <div className="card py-12">
          <Loading />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.length === 0 ? (
            <div className="col-span-full card">
              <div className="text-center py-12 text-gray-500">
                <p>プロジェクトがありません</p>
                <p className="text-sm mt-2">
                  新しいプロジェクトを作成して始めましょう
                </p>
              </div>
            </div>
          ) : (
            projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="card hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-900 flex items-center">
                    {project.name}
                    <ExternalLink className="w-4 h-4 ml-2 text-gray-400" />
                  </h3>
                  {getStatusBadge(project.status || 'active')}
                </div>
                
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {project.description || '説明がありません'}
                </p>

                <div className="flex items-center justify-between text-sm text-gray-500">
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center">
                      <Users className="w-4 h-4 mr-1" />
                      <span>{project.memberCount || 0}</span>
                    </div>
                    <div className="flex items-center">
                      <FileText className="w-4 h-4 mr-1" />
                      <span>{project.issueCount || 0}</span>
                    </div>
                  </div>
                  <div className="text-xs">
                    {project.isPublic ? '公開' : '非公開'}
                  </div>
                </div>

                {project.updatedOn && (
                  <div className="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-500">
                    更新: {formatDate(project.updatedOn)}
                  </div>
                )}
              </Link>
            ))
          )}
        </div>
      )}

      {/* Show total count */}
      {!loading && projects.length > 0 && (
        <div className="text-sm text-gray-600 text-center">
          全 {projects.length} 件のプロジェクト
        </div>
      )}

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          loadProjects();
        }}
      />
    </div>
  );
}
