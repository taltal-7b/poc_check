import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Settings, Users, FileText, Activity, Calendar, FolderTree, BookOpen, FileIcon } from 'lucide-react';
import { projectsApi, issuesApi } from '../../lib/api';
import Loading from '../../components/ui/Loading';
import Badge from '../../components/ui/Badge';
import ProjectMembersTab from '../../components/projects/ProjectMembersTab';
import ProjectVersionsTab from '../../components/projects/ProjectVersionsTab';
import ProjectSettingsTab from '../../components/projects/ProjectSettingsTab';
import ProjectCategoriesTab from '../../components/projects/ProjectCategoriesTab';
import ProjectActivityTab from '../../components/projects/ProjectActivityTab';

type TabType = 'overview' | 'issues' | 'members' | 'versions' | 'categories' | 'settings' | 'wiki' | 'documents' | 'activity';

export default function ProjectDetailPage() {
  const { id } = useParams();
  const [project, setProject] = useState<any>(null);
  const [recentIssues, setRecentIssues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (id) {
      loadProject();
      loadRecentIssues();
    }
  }, [id]);

  const loadProject = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await projectsApi.getById(parseInt(id!));
      setProject(response.data.data.project);
    } catch (err: any) {
      console.error('Failed to load project:', err);
      setError(err.response?.data?.message || 'プロジェクトの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const loadRecentIssues = async () => {
    try {
      const response = await issuesApi.getAll({ projectId: id, limit: 5 });
      setRecentIssues(response.data.data.issues || []);
    } catch (err) {
      console.error('Failed to load recent issues:', err);
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

  if (loading) {
    return (
      <div className="py-12">
        <Loading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>プロジェクトが見つかりません</p>
      </div>
    );
  }

  const tabs = [
    { id: 'overview' as TabType, label: '概要', icon: FolderTree },
    { id: 'issues' as TabType, label: '課題', icon: FileText },
    { id: 'members' as TabType, label: 'メンバー', icon: Users },
    { id: 'versions' as TabType, label: 'バージョン', icon: Calendar },
    { id: 'categories' as TabType, label: 'カテゴリ', icon: FolderTree },
    { id: 'wiki' as TabType, label: 'Wiki', icon: BookOpen },
    { id: 'documents' as TabType, label: 'ドキュメント', icon: FileIcon },
    { id: 'activity' as TabType, label: '活動', icon: Activity },
    { id: 'settings' as TabType, label: '設定', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center space-x-2 mb-2">
            {getStatusBadge(project.status || 'active')}
            {project.isPublic ? (
              <Badge color="blue">公開</Badge>
            ) : (
              <Badge color="gray">非公開</Badge>
            )}
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            {project.name}
          </h1>
          <p className="text-gray-600 mt-2">
            {project.description || '説明がありません'}
          </p>
        </div>
        <button 
          onClick={() => setActiveTab('settings')}
          className="btn btn-secondary flex items-center space-x-2"
        >
          <Settings className="w-5 h-5" />
          <span>設定</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center space-x-2 py-3 px-4 border-b-2 font-medium text-sm whitespace-nowrap transition-colors
                  ${
                    activeTab === tab.id
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'overview' && (
          <OverviewTab
            project={project}
            recentIssues={recentIssues}
            getStatusBadge={getStatusBadge}
            formatDate={formatDate}
          />
        )}
        {activeTab === 'issues' && (
          <IssuesTab projectId={project.id} />
        )}
        {activeTab === 'members' && (
          <ProjectMembersTab projectId={parseInt(id!)} onUpdate={loadProject} />
        )}
        {activeTab === 'versions' && (
          <ProjectVersionsTab projectId={parseInt(id!)} />
        )}
        {activeTab === 'categories' && (
          <ProjectCategoriesTab projectId={parseInt(id!)} />
        )}
        {activeTab === 'settings' && (
          <ProjectSettingsTab project={project} onUpdate={loadProject} />
        )}
        {activeTab === 'wiki' && (
          <ComingSoonTab feature="Wiki" />
        )}
        {activeTab === 'documents' && (
          <ComingSoonTab feature="ドキュメント" />
        )}
        {activeTab === 'activity' && (
          <ProjectActivityTab projectId={parseInt(id!)} />
        )}
      </div>
    </div>
  );
}

// Overview Tab Component
function OverviewTab({ project, recentIssues, getStatusBadge, formatDate }: any) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            プロジェクト情報
          </h2>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">識別子</dt>
              <dd className="mt-1 text-sm text-gray-900">{project.identifier}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">ステータス</dt>
              <dd className="mt-1">
                {getStatusBadge(project.status || 'active')}
              </dd>
            </div>
            {project.homepage && (
              <div className="col-span-2">
                <dt className="text-sm font-medium text-gray-500">ホームページ</dt>
                <dd className="mt-1 text-sm">
                  <a
                    href={project.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {project.homepage}
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-gray-500">作成日</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {formatDate(project.createdOn)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500">更新日</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {formatDate(project.updatedOn)}
              </dd>
            </div>
          </dl>
        </div>

        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">最近の課題</h2>
            <Link
              to={`/issues?projectId=${project.id}`}
              className="text-sm text-blue-600 hover:underline"
            >
              すべて表示
            </Link>
          </div>
          {recentIssues.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>課題がありません</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentIssues.map((issue: any) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.id}`}
                  className="block p-3 border border-gray-200 rounded hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500">#{issue.id}</span>
                        <Badge color="blue">{issue.tracker?.name}</Badge>
                        <Badge color="gray">{issue.status?.name}</Badge>
                      </div>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {issue.subject}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
            <Users className="w-5 h-5" />
            <span>メンバー</span>
          </h2>
          <div className="text-center py-4 text-gray-500">
            <p className="text-sm">メンバー: {project.memberCount || 0}</p>
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
              <dd className="font-medium">{project.issueCount || 0}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-gray-600">完了済み</dt>
              <dd className="font-medium text-green-600">
                {project.closedIssueCount || 0}
              </dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-gray-600">進行中</dt>
              <dd className="font-medium text-blue-600">
                {project.openIssueCount || 0}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

// Issues Tab Component
function IssuesTab({ projectId }: { projectId: number }) {
  return (
    <div className="card">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900">プロジェクトの課題</h2>
        <Link
          to={`/issues?projectId=${projectId}`}
          className="btn btn-primary"
        >
          課題一覧を表示
        </Link>
      </div>
      <p className="text-gray-600">
        このプロジェクトのすべての課題を表示するには、上のボタンをクリックしてください。
      </p>
    </div>
  );
}

// Coming Soon Tab Component
function ComingSoonTab({ feature }: { feature: string }) {
  return (
    <div className="card">
      <div className="text-center py-12">
        <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {feature}機能
        </h2>
        <p className="text-gray-600">
          この機能は現在開発中です。もうしばらくお待ちください。
        </p>
      </div>
    </div>
  );
}
