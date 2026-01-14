import { GitBranch } from 'lucide-react';
import Badge from '../ui/Badge';

interface IssueChildrenSectionProps {
  children: any[];
}

export default function IssueChildrenSection({
  children,
}: IssueChildrenSectionProps) {
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

  if (!children || children.length === 0) {
    return (
      <div className="card">
        <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
          <GitBranch className="w-5 h-5" />
          <span>子課題</span>
        </h2>
        <div className="text-center py-4 text-gray-500">
          <p className="text-sm">子課題はありません</p>
        </div>
      </div>
    );
  }

  const completedCount = children.filter((child) => child.status?.isClosed).length;
  const progressPercentage = (completedCount / children.length) * 100;

  return (
    <div className="card">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2 mb-2">
          <GitBranch className="w-5 h-5" />
          <span>子課題</span>
          <span className="text-sm font-normal text-gray-500">
            ({completedCount}/{children.length})
          </span>
        </h2>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
      </div>

      <div className="space-y-2">
        {children.map((child: any) => (
          <a
            key={child.id}
            href={`/issues/${child.id}`}
            className="block p-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <span className="text-sm text-gray-500">#{child.id}</span>
                  <Badge color={getStatusColor(child.status)}>
                    {child.status?.name || '-'}
                  </Badge>
                  <Badge color={getPriorityColor(child.priority)}>
                    {child.priority?.name || '-'}
                  </Badge>
                </div>
                <h3 className="text-sm font-medium text-gray-900">
                  {child.subject}
                </h3>
                <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
                  <span>{child.tracker?.name}</span>
                  {child.assignedTo && (
                    <span>
                      担当: {child.assignedTo.firstName}{' '}
                      {child.assignedTo.lastName}
                    </span>
                  )}
                  <span>進捗: {child.doneRatio}%</span>
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
