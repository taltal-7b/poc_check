import { useState, useEffect } from 'react';
import { Activity, FileText, Users, Calendar, MessageSquare, Edit, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import Loading from '../ui/Loading';
import Badge from '../ui/Badge';
import { Link } from 'react-router-dom';

interface ProjectActivityTabProps {
  projectId: number;
}

export default function ProjectActivityTab({ projectId }: ProjectActivityTabProps) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'issues' | 'members' | 'versions'>('all');

  useEffect(() => {
    loadActivities();
  }, [projectId, filter]);

  const loadActivities = async () => {
    setLoading(true);
    setError('');
    try {
      // プロジェクトの課題を取得
      const issuesRes = await api.get(`/issues?projectId=${projectId}&limit=50`);
      const issues = issuesRes.data.data.issues || [];

      // 各課題のジャーナル（履歴）を取得
      const activitiesPromises = issues.map(async (issue: any) => {
        try {
          const journalsRes = await api.get(`/issues/${issue.id}/journals`);
          const journals = journalsRes.data.data.journals || [];
          return journals.map((journal: any) => ({
            ...journal,
            type: 'issue',
            issue: issue,
          }));
        } catch {
          return [];
        }
      });

      const allJournals = await Promise.all(activitiesPromises);
      const flatJournals = allJournals.flat();

      // 作成日時でソート
      const sorted = flatJournals.sort((a, b) =>
        new Date(b.createdOn).getTime() - new Date(a.createdOn).getTime()
      );

      setActivities(sorted.slice(0, 100)); // 最新100件
    } catch (err: any) {
      console.error('Failed to load activities:', err);
      setError('活動履歴の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (activity: any) => {
    if (activity.notes) {
      return <MessageSquare className="w-5 h-5 text-blue-600" />;
    }
    if (activity.details && activity.details.length > 0) {
      return <Edit className="w-5 h-5 text-orange-600" />;
    }
    return <Plus className="w-5 h-5 text-green-600" />;
  };

  const getActivityDescription = (activity: any) => {
    if (activity.notes) {
      return 'コメントを追加しました';
    }
    if (activity.details && activity.details.length > 0) {
      const changes = activity.details.map((d: any) => d.property).join(', ');
      return `${changes} を更新しました`;
    }
    return '課題を作成しました';
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'たった今';
    if (minutes < 60) return `${minutes}分前`;
    if (hours < 24) return `${hours}時間前`;
    if (days < 7) return `${days}日前`;
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">活動履歴</h2>
        <div className="flex space-x-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 text-sm rounded ${
              filter === 'all'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            すべて
          </button>
          <button
            onClick={() => setFilter('issues')}
            className={`px-3 py-1 text-sm rounded ${
              filter === 'issues'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            課題
          </button>
        </div>
      </div>

      {activities.length === 0 ? (
        <div className="card text-center py-12">
          <Activity className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            活動がありません
          </h3>
          <p className="text-gray-600">
            プロジェクトで何かアクションがあると、ここに表示されます
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="flow-root">
            <ul className="-mb-8">
              {activities.map((activity, activityIdx) => (
                <li key={activity.id}>
                  <div className="relative pb-8">
                    {activityIdx !== activities.length - 1 ? (
                      <span
                        className="absolute top-5 left-5 -ml-px h-full w-0.5 bg-gray-200"
                        aria-hidden="true"
                      />
                    ) : null}
                    <div className="relative flex items-start space-x-3">
                      <div className="relative">
                        <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center ring-8 ring-white">
                          {getActivityIcon(activity)}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div>
                          <div className="text-sm">
                            <span className="font-medium text-gray-900">
                              {activity.user
                                ? `${activity.user.firstName} ${activity.user.lastName}`
                                : '不明なユーザー'}
                            </span>
                            <span className="text-gray-600 mx-2">が</span>
                            <Link
                              to={`/issues/${activity.issue?.id}`}
                              className="font-medium text-primary-600 hover:underline"
                            >
                              #{activity.issue?.id} {activity.issue?.subject}
                            </Link>
                            <span className="text-gray-600 mx-2">で</span>
                            <span className="text-gray-600">
                              {getActivityDescription(activity)}
                            </span>
                          </div>
                          <p className="mt-0.5 text-sm text-gray-500">
                            {formatDateTime(activity.createdOn)}
                          </p>
                        </div>
                        {activity.notes && (
                          <div className="mt-2 text-sm text-gray-700 bg-gray-50 rounded-md p-3 border border-gray-200">
                            <p className="whitespace-pre-wrap">{activity.notes}</p>
                          </div>
                        )}
                        {activity.details && activity.details.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {activity.details.map((detail: any, idx: number) => (
                              <div
                                key={idx}
                                className="text-sm text-gray-600 flex items-center space-x-2"
                              >
                                <Badge variant="default">{detail.property}</Badge>
                                <span>:</span>
                                {detail.oldValue && (
                                  <>
                                    <span className="line-through text-gray-400">
                                      {detail.oldValue}
                                    </span>
                                    <span>→</span>
                                  </>
                                )}
                                <span className="font-medium">{detail.newValue || '(空)'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
