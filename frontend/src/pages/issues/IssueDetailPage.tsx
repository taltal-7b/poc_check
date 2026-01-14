import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Edit, MessageSquare, Trash2 } from 'lucide-react';
import { attachmentsApi, issuesApi } from '../../lib/api';
import EditIssueModal from '../../components/issues/EditIssueModal';
import IssueRelationsSection from '../../components/issues/IssueRelationsSection';
import IssueWatchersSection from '../../components/issues/IssueWatchersSection';
import IssueTimeEntriesSection from '../../components/issues/IssueTimeEntriesSection';
import IssueChildrenSection from '../../components/issues/IssueChildrenSection';
import IssueAttachmentsSection from '../../components/issues/IssueAttachmentsSection';
import Loading from '../../components/ui/Loading';
import Badge from '../../components/ui/Badge';

export default function IssueDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [issue, setIssue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commentInputKey, setCommentInputKey] = useState(0);

  useEffect(() => {
    if (id) {
      loadIssue();
    }
  }, [id]);

  const loadIssue = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await issuesApi.getById(parseInt(id!));
      setIssue(response.data.data.issue);
    } catch (err: any) {
      console.error('Failed to load issue:', err);
      setError(err.response?.data?.message || '課題�E読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async () => {
    if (!comment.trim()) return;

    setAddingComment(true);
    try {
      const response = await issuesApi.addJournal(parseInt(id!), { notes: comment });
      const journalId = response.data?.data?.journal?.id;
      if (journalId && commentFiles.length > 0) {
        await issuesApi.uploadJournalAttachments(parseInt(id!), journalId, commentFiles);
      }
      setComment('');
      setCommentFiles([]);
      setCommentInputKey((prev) => prev + 1);
      loadIssue(); // Reload to get updated journals
    } catch (err: any) {
      console.error('Failed to add comment:', err);
      alert('コメント�E追加に失敗しました');
    } finally {
      setAddingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('こ�E課題を削除してもよろしぁE��すか�E�E)) return;

    try {
      await issuesApi.delete(parseInt(id!));
      navigate('/issues');
    } catch (err: any) {
      console.error('Failed to delete issue:', err);
      alert('課題�E削除に失敗しました');
    }
  };

  const getStatusColor = (status: any) => {
    if (!status) return 'gray';
    if (status.isClosed) return 'gray';
    if (status.name === '新要E) return 'blue';
    if (status.name === '進行中') return 'yellow';
    if (status.name === 'レビュー中') return 'purple';
    if (status.name === '完亁E) return 'green';
    return 'gray';
  };

  const getPriorityColor = (priority: any) => {
    if (!priority) return 'gray';
    if (priority.name === '佁E) return 'gray';
    if (priority.name === '通常') return 'blue';
    if (priority.name === '髁E) return 'orange';
    if (priority.name === '緊急' || priority.name === '至急') return 'red';
    return 'gray';
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP');
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP');
  };

  const formatFileSize = (size: number) => {
    if (!Number.isFinite(size)) return '-';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!confirm('こ�E添付ファイルを削除してもよろしぁE��すか�E�E)) return;
    try {
      await attachmentsApi.delete(attachmentId);
      loadIssue();
    } catch (err: any) {
      console.error('Failed to delete attachment:', err);
      alert(err.response?.data?.message || '添付ファイルの削除に失敗しました');
    }
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

  if (!issue) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>課題が見つかりません</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-gray-500">#{issue.id}</span>
            <Badge color={getStatusColor(issue.status)}>
              {issue.status?.name || '-'}
            </Badge>
            {issue.isPrivate && (
              <Badge color="red">プライベ�EチE/Badge>
            )}
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">
            {issue.subject}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {issue.project?.name} / {issue.tracker?.name}
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="btn btn-secondary flex items-center space-x-2"
          >
            <Edit className="w-5 h-5" />
            <span>編雁E/span>
          </button>
          <button
            onClick={handleDelete}
            className="btn btn-secondary flex items-center space-x-2 text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4">説昁E/h2>
            <div className="prose max-w-none">
              {issue.description ? (
                <p className="text-gray-700 whitespace-pre-wrap">{issue.description}</p>
              ) : (
                <p className="text-gray-400 italic">説明がありません</p>
              )}
            </div>
          </div>

          <IssueAttachmentsSection
            issueId={parseInt(id!)}
            attachments={issue.attachments || []}
            onRefresh={loadIssue}
          />

          {/* Comments */}
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <MessageSquare className="w-5 h-5" />
              <span>コメンチE/span>
            </h2>
            <div className="space-y-4">
              {issue.journals && issue.journals.length > 0 ? (
                issue.journals.map((journal: any) => (
                  <div key={journal.id} className="border-b border-gray-200 pb-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-medium text-gray-900">
                          {journal.user?.firstName} {journal.user?.lastName}
                        </span>
                        <span className="text-sm text-gray-500 ml-2">
                          {formatDateTime(journal.createdOn)}
                        </span>
                      </div>
                    </div>
                    {journal.notes && (
                      <p className="text-gray-700 whitespace-pre-wrap">{journal.notes}</p>
                    )}
                    {journal.attachments && journal.attachments.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {journal.attachments.map((attachment: any) => (
                          <div
                            key={attachment.id}
                            className="flex items-center justify-between p-2 bg-gray-50 rounded"
                          >
                            <div className="flex-1 min-w-0">
                              <a
                                href={attachmentsApi.getDownloadUrl(attachment.id)}
                                className="text-sm text-blue-600 hover:text-blue-800 truncate block"
                              >
                                {attachment.filename}
                              </a>
                              <div className="text-xs text-gray-500">
                                {formatFileSize(attachment.filesize)} ·{' '}
                                {attachment.author
                                  ? `${attachment.author.firstName} ${attachment.author.lastName}`
                                  : '不�E'}
                              </div>
                            </div>
                            <button
                              onClick={() => handleDeleteAttachment(attachment.id)}
                              className="text-red-600 hover:text-red-800 ml-2"
                              title="削除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {journal.details && journal.details.length > 0 && (
                      <div className="mt-2 text-sm text-gray-600">
                        {journal.details.map((detail: any, idx: number) => (
                          <div key={idx}>
                            {detail.property}: {detail.oldValue || '(空)'} ↁE{detail.value || '(空)'}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>コメントがありません</p>
                </div>
              )}
              <div>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="input h-24 resize-none w-full"
                  placeholder="コメントを入劁E.."
                />
                <div className="mt-2">
                  <input
                    key={commentInputKey}
                    type="file"
                    multiple
                    onChange={(e) => setCommentFiles(Array.from(e.target.files || []))}
                    className="input"
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={handleAddComment}
                    disabled={addingComment || !comment.trim()}
                    className="btn btn-primary"
                  >
                    {addingComment ? 'コメント追加中...' : 'コメントを追加'}
                  </button>
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
                <dt className="text-sm font-medium text-gray-500">スチE�Eタス</dt>
                <dd className="mt-1">
                  <Badge color={getStatusColor(issue.status)}>
                    {issue.status?.name || '-'}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">優先度</dt>
                <dd className="mt-1">
                  <Badge color={getPriorityColor(issue.priority)}>
                    {issue.priority?.name || '-'}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">拁E��老E/dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {issue.assignedTo
                    ? `${issue.assignedTo.firstName} ${issue.assignedTo.lastName}`
                    : '未割り当て'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">作�E老E/dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {issue.author
                    ? `${issue.author.firstName} ${issue.author.lastName}`
                    : '-'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">開始日</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatDate(issue.startDate)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">期日</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatDate(issue.dueDate)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">進捗率</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {issue.doneRatio}%
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">作�E日</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatDateTime(issue.createdOn)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">更新日</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {formatDateTime(issue.updatedOn)}
                </dd>
              </div>
            </dl>
          </div>

          {/* Relations */}
          <IssueRelationsSection issueId={parseInt(id!)} />

          {/* Watchers */}
          <IssueWatchersSection issueId={parseInt(id!)} />

          {/* Time Entries */}
          <IssueTimeEntriesSection
            issueId={parseInt(id!)}
            estimatedHours={issue.estimatedHours}
          />

          {/* Children */}
          {issue.children && issue.children.length > 0 && (
            <IssueChildrenSection children={issue.children} />
          )}
        </div>
      </div>

      {/* Edit Modal */}
      <EditIssueModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={() => {
          loadIssue();
        }}
        issueId={parseInt(id!)}
        initialData={issue}
      />
    </div>
  );
}
