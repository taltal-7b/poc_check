import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Search, Edit, Trash2, Calendar } from 'lucide-react';
import { newsApi, projectsApi } from '../../lib/api';
import Loading from '../../components/ui/Loading';
import Pagination from '../../components/ui/Pagination';
import CreateNewsModal from '../../components/news/CreateNewsModal';
import EditNewsModal from '../../components/news/EditNewsModal';

export default function NewsListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [newsList, setNewsList] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingNews, setEditingNews] = useState<any>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    loadNews();
  }, [currentPage, searchTerm, projectFilter]);

  useEffect(() => {
    if (searchParams.get('openModal') === 'true') {
      setIsCreateModalOpen(true);
    }
  }, [searchParams]);

  const loadProjects = async () => {
    try {
      const response = await projectsApi.getAll();
      setProjects(response.data.data.projects || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadNews = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await newsApi.getAll({
        page: currentPage,
        limit: 25,
        search: searchTerm,
        projectId: projectFilter || undefined,
      });
      setNewsList(response.data.data.news || []);
      setTotalPages(response.data.data.pagination?.pages || 1);
    } catch (err: any) {
      console.error('Failed to load news:', err);
      setError(err.response?.data?.message || 'ニュースの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (newsId: number, title: string) => {
    if (!confirm(`ニュース「${title}」を削除してもよろしいですか？`)) return;

    try {
      await newsApi.delete(newsId);
      loadNews();
    } catch (err: any) {
      console.error('Failed to delete news:', err);
      alert(err.response?.data?.message || 'ニュースの削除に失敗しました');
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP');
  };

  if (loading && newsList.length === 0) {
    return (
      <div className="py-12">
        <Loading />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">ニュース</h1>
          <p className="mt-1 text-sm text-gray-500">
            プロジェクトのお知らせを管理
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn btn-primary flex items-center space-x-2"
        >
          <Plus className="w-5 h-5" />
          <span>新規ニュース</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-3 md:space-y-0 mb-4">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="タイトル、内容で検索..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="input pl-10"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="input"
            >
              <option value="">すべてのプロジェクト</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {newsList.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>ニュースがありません</p>
          </div>
        ) : (
          <div className="space-y-4">
            {newsList.map((news) => (
              <div
                key={news.id}
                className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {news.title}
                    </h3>
                    <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
                      <div className="flex items-center space-x-1">
                        <Calendar className="w-4 h-4" />
                        <span>{formatDate(news.createdOn)}</span>
                      </div>
                      {news.project && (
                        <span className="text-blue-600">
                          {news.project.name}
                        </span>
                      )}
                      {news.author && (
                        <span>
                          {news.author.firstName} {news.author.lastName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 ml-4">
                    <button
                      onClick={() => setEditingNews(news)}
                      className="text-blue-600 hover:text-blue-900"
                      title="編集"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(news.id, news.title)}
                      className="text-red-600 hover:text-red-900"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {news.summary && (
                  <p className="text-gray-700 text-sm">{news.summary}</p>
                )}
                {news.description && (
                  <p className="text-gray-600 text-sm mt-2 line-clamp-3">
                    {news.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      <CreateNewsModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={loadNews}
        projects={projects}
      />

      {editingNews && (
        <EditNewsModal
          isOpen={!!editingNews}
          onClose={() => setEditingNews(null)}
          onSuccess={() => {
            setEditingNews(null);
            loadNews();
          }}
          news={editingNews}
          projects={projects}
        />
      )}
    </div>
  );
}
