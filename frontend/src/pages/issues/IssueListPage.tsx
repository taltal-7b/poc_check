import { useState, useEffect } from 'react';
import { Plus, Search, Filter, ExternalLink } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { issuesApi, projectsApi, issueStatusesApi, usersApi } from '../../lib/api';
import CreateIssueModal from '../../components/issues/CreateIssueModal';
import Loading from '../../components/ui/Loading';
import Badge from '../../components/ui/Badge';
import Pagination from '../../components/ui/Pagination';

export default function IssueListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [issues, setIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState('');
  const [statusId, setStatusId] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  
  // Master data for filters
  const [projects, setProjects] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadIssues();
    loadFilters();
  }, [page, search, projectId, statusId, assignedToId]);

  useEffect(() => {
    // Check if openModal query parameter is present
    if (searchParams.get('openModal') === 'true') {
      setIsCreateModalOpen(true);
      // Remove the query parameter
      searchParams.delete('openModal');
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams]);

  const loadFilters = async () => {
    try {
      const [projectsRes, statusesRes, usersRes] = await Promise.all([
        projectsApi.getAll(),
        issueStatusesApi.getAll(),
        usersApi.getAll(),
      ]);
      setProjects(projectsRes.data.data.projects || []);
      setStatuses(statusesRes.data.data.statuses || []);
      setUsers(usersRes.data.data.users || []);
    } catch (err) {
      console.error('Failed to load filters:', err);
    }
  };

  const loadIssues = async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { page, limit: 25 };
      if (search) params.search = search;
      if (projectId) params.projectId = projectId;
      if (statusId) params.statusId = statusId;
      if (assignedToId) params.assignedToId = assignedToId;

      const response = await issuesApi.getAll(params);
      const { issues: issuesList, pagination } = response.data.data;
      
      setIssues(issuesList || []);
      setTotalPages(pagination.pages);
      setTotal(pagination.total);
    } catch (err: any) {
      console.error('Failed to load issues:', err);
      setError(err.response?.data?.message || '課題の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleFilterChange = (filterName: string, value: string) => {
    setPage(1);
    switch (filterName) {
      case 'projectId':
        setProjectId(value);
        break;
      case 'statusId':
        setStatusId(value);
        break;
      case 'assignedToId':
        setAssignedToId(value);
        break;
    }
  };

  const getStatusColor = (status: any) => {
    if (!status) return 'gray';
    if (status.isClosed) return 'gray';
    if (status.name === '新規') return 'blue';
    if (status.name === '進行中') return 'yellow';
    if (status.name === 'レビュー中') return 'purple';
    if (status.name === '完了') return 'green';
    return 'gray';
  };

  const getPriorityColor = (priority: any) => {
    if (!priority) return 'gray';
    if (priority.name === '低') return 'gray';
    if (priority.name === '通常') return 'blue';
    if (priority.name === '高') return 'orange';
    if (priority.name === '緊急' || priority.name === '至急') return 'red';
    return 'gray';
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">課題</h1>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn btn-primary flex items-center space-x-2"
        >
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
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="input pl-10 w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <select
              value={projectId}
              onChange={(e) => handleFilterChange('projectId', e.target.value)}
              className="input"
            >
              <option value="">すべてのプロジェクト</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <select
              value={statusId}
              onChange={(e) => handleFilterChange('statusId', e.target.value)}
              className="input"
            >
              <option value="">すべてのステータス</option>
              {statuses.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
            <select
              value={assignedToId}
              onChange={(e) => handleFilterChange('assignedToId', e.target.value)}
              className="input"
            >
              <option value="">すべての担当者</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.firstName} {user.lastName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Issues Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-12">
            <Loading />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      プロジェクト
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      トラッカー
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
                  {issues.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-12 text-center text-gray-500"
                      >
                        課題がありません
                      </td>
                    </tr>
                  ) : (
                    issues.map((issue) => (
                      <tr key={issue.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          <Link
                            to={`/issues/${issue.id}`}
                            className="text-blue-600 hover:text-blue-800 flex items-center"
                          >
                            #{issue.id}
                            <ExternalLink className="w-3 h-3 ml-1" />
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {issue.project?.name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {issue.tracker?.name || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          <div className="max-w-md truncate">
                            {issue.subject}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <Badge color={getStatusColor(issue.status)}>
                            {issue.status?.name || '-'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {issue.assignedTo
                            ? `${issue.assignedTo.firstName} ${issue.assignedTo.lastName}`
                            : '未割り当て'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <Badge color={getPriorityColor(issue.priority)}>
                            {issue.priority?.name || '-'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(issue.updatedOn)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Show total count */}
      {!loading && issues.length > 0 && (
        <div className="text-sm text-gray-600 text-center">
          全 {total} 件の課題
        </div>
      )}

      {/* Create Issue Modal */}
      <CreateIssueModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => {
          loadIssues();
        }}
      />
    </div>
  );
}
