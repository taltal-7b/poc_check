import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Edit, MessageSquare, Trash2 } from 'lucide-react';
import { api, attachmentsApi, issuesApi } from '../../lib/api';
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
  const [commentError, setCommentError] = useState('');
  const [commentUploadError, setCommentUploadError] = useState('');
  const [pendingJournalId, setPendingJournalId] = useState<number | null>(null);
  const [journalPreviewUrls, setJournalPreviewUrls] = useState<Record<string, string>>({});
  const loadingJournalPreviewIdsRef = useRef<Set<string>>(new Set());

  const commentMaxFiles = 10;
  const commentMaxFileSizeBytes = 5 * 1024 * 1024;

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
      setError(err.response?.data?.message || '課題の読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleCommentFilesChange = (files: FileList | null) => {
    if (!files || files.length === 0) {
      setCommentFiles([]);
      setCommentError('');
      return;
    }

    const selectedFiles = Array.from(files);
    const rejectedFiles: string[] = [];
    let validFiles = selectedFiles.filter((file) => {
      if (file.size > commentMaxFileSizeBytes) {
        rejectedFiles.push(`${file.name} (サイズ超過)`);
        return false;
      }
      return true;
    });

    if (validFiles.length > commentMaxFiles) {
      const overflow = validFiles.slice(commentMaxFiles);
      overflow.forEach((file) => rejectedFiles.push(`${file.name} (最大件数超過)`));
      validFiles = validFiles.slice(0, commentMaxFiles);
    }

    if (rejectedFiles.length > 0) {
      setCommentError(`添付できないファイルがあります: ${rejectedFiles.join(', ')}`);
    } else {
      setCommentError('');
    }

    setCommentFiles(validFiles);
    setCommentUploadError('');
  };

  const handleRemoveCommentFile = (index: number) => {
    setCommentFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddComment = async () => {
    const trimmedComment = comment.trim();
    if (!trimmedComment && commentFiles.length === 0) {
      setCommentError('コメントを入力してください');
      return;
    }

    setCommentError('');
    setCommentUploadError('');
    setAddingComment(true);

    try {
      const response = await issuesApi.addJournal(parseInt(id!), {
        notes: trimmedComment || '添付ファイル',
      });
      const journalId = response.data?.data?.journal?.id;

      setComment('');
      setCommentInputKey((prev) => prev + 1);

      if (journalId && commentFiles.length > 0) {
        try {
          await issuesApi.uploadJournalAttachments(parseInt(id!), journalId, commentFiles);
          setCommentFiles([]);
          setPendingJournalId(null);
        } catch (err: any) {
          console.error('Failed to upload comment files:', err);
          setPendingJournalId(journalId);
          setCommentUploadError(
            err.response?.data?.message || '添付ファイルのアップロードに失敗しました'
          );
          await loadIssue();
          return;
        }
      }

      await loadIssue();
    } catch (err: any) {
      console.error('Failed to add comment:', err);
      setCommentError(err.response?.data?.message || 'コメントの追加に失敗しました');
    } finally {
      setAddingComment(false);
    }
  };

  const handleRetryCommentUpload = async () => {
    if (!pendingJournalId || commentFiles.length === 0 || !id) return;

    setAddingComment(true);
    setCommentUploadError('');
    try {
      await issuesApi.uploadJournalAttachments(parseInt(id), pendingJournalId, commentFiles);
      setPendingJournalId(null);
      setCommentFiles([]);
      setCommentInputKey((prev) => prev + 1);
      await loadIssue();
    } catch (err: any) {
      console.error('Failed to retry comment upload:', err);
      setCommentUploadError(
        err.response?.data?.message || '添付ファイルのアップロードに失敗しました'
      );
    } finally {
      setAddingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('この課題を削除してもよろしいですか？')) return;

    try {
      await issuesApi.delete(parseInt(id!));
      navigate('/issues');
    } catch (err: any) {
      console.error('Failed to delete issue:', err);
      alert('課題の削除に失敗しました');
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

  const normalizeFilename = (filename: string) => {
    if (!filename) return '';
    if (!/[\u00c0-\u00ff]/.test(filename)) return filename;
    try {
      const decoded = decodeURIComponent(escape(filename));
      if (!decoded || decoded === filename) return filename;
      if (decoded.includes('\uFFFD')) return filename;
      return decoded;
    } catch {
      return filename;
    }
  };

  const isImageFile = (attachment: any) => {
    const contentType = attachment?.contentType || attachment?.content_type || '';
    if (typeof contentType === 'string' && contentType.startsWith('image/')) return true;
    const filename = normalizeFilename(attachment?.filename || '');
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(filename);
  };

  useEffect(() => {
    let cancelled = false;
    const attachments = issue?.journals?.flatMap((journal: any) => journal.attachments || []) || [];
    const attachmentIds = new Set(attachments.map((attachment: any) => String(attachment.id)));

    setJournalPreviewUrls((prev) => {
      const next = { ...prev };
      Object.keys(prev).forEach((key) => {
        if (!attachmentIds.has(key)) {
          URL.revokeObjectURL(prev[key]);
          delete next[key];
        }
      });
      return next;
    });

    const loadPreviews = async () => {
      const targets = attachments.filter((attachment: any) => {
        if (!attachment?.id) return false;
        if (!isImageFile(attachment)) return false;
        const id = String(attachment.id);
        if (journalPreviewUrls[id]) return false;
        if (loadingJournalPreviewIdsRef.current.has(id)) return false;
        loadingJournalPreviewIdsRef.current.add(id);
        return true;
      });

      if (targets.length === 0) return;

      const entries = await Promise.all(
        targets.map(async (attachment: any) => {
          const id = String(attachment.id);
          try {
            const response = await api.get(`/attachments/${attachment.id}/download`, {
              responseType: 'blob',
            });
            const url = URL.createObjectURL(response.data);
            return [id, url] as const;
          } catch (error) {
            console.error('Failed to load journal preview:', attachment.id, error);
            return null;
          } finally {
            loadingJournalPreviewIdsRef.current.delete(id);
          }
        })
      );

      if (cancelled) return;

      setJournalPreviewUrls((prev) => {
        const next = { ...prev };
        entries.forEach((entry) => {
          if (!entry) return;
          const [entryId, url] = entry;
          next[entryId] = url;
        });
        return next;
      });
    };

    loadPreviews();

    return () => {
      cancelled = true;
    };
  }, [issue]);

  const handleDeleteAttachment = async (attachmentId: number) => {
    if (!confirm('この添付ファイルを削除してもよろしいですか？')) return;
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
              <Badge color="red">プライベート</Badge>
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
            <span>編集</span>
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
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4">説明</h2>
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

          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <MessageSquare className="w-5 h-5" />
              <span>コメント</span>
            </h2>
            <div className="space-y-4">
              {issue.journals && issue.journals.length > 0 ? (
                issue.journals.map((journal: any) => (
                  <div key={journal.id} className="border-b border-gray-200 pb-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-medium text-gray-900">
                          {journal.user?.lastName} {journal.user?.firstName}
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
                        {journal.attachments.map((attachment: any) => {
                          const displayName = normalizeFilename(attachment.filename || '');
                          const downloadUrl = attachmentsApi.getDownloadUrl(attachment.id);
                          const previewUrl = journalPreviewUrls[String(attachment.id)];
                          const showPreview = isImageFile(attachment);
                          return (
                            <div
                              key={attachment.id}
                              className="flex items-start justify-between p-2 bg-gray-50 rounded"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2">
                                  {showPreview && previewUrl && (
                                    <img
                                      src={previewUrl}
                                      alt={displayName}
                                      className="h-10 w-10 rounded object-cover border border-gray-200"
                                      loading="lazy"
                                    />
                                  )}
                                  <a
                                    href={downloadUrl}
                                    download={displayName}
                                    className="text-sm text-blue-600 hover:text-blue-800 truncate block"
                                  >
                                    {displayName}
                                  </a>
                                </div>
                                <div className="text-xs text-gray-500">
                                  {formatFileSize(attachment.filesize)} ・{' '}
                                  {attachment.author
                                    ? `${attachment.author.lastName} ${attachment.author.firstName}`
                                    : '不明'}
                                </div>
                                {showPreview && previewUrl && (
                                  <img
                                    src={previewUrl}
                                    alt={displayName}
                                    className="mt-3 max-h-[400px] w-auto rounded border border-gray-200"
                                    loading="lazy"
                                  />
                                )}
                              </div>
                              <button
                                onClick={() => handleDeleteAttachment(attachment.id)}
                                className="text-red-600 hover:text-red-800 ml-2"
                                title="削除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {journal.details && journal.details.length > 0 && (
                      <div className="mt-2 text-sm text-gray-600">
                        {journal.details.map((detail: any, idx: number) => (
                          <div key={idx}>
                            {detail.property}: {detail.oldValue || '(空)'} → {detail.value || '(空)'}
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
                  onChange={(e) => {
                    setComment(e.target.value);
                    setCommentError('');
                    setCommentUploadError('');
                  }}
                  className="input h-24 resize-none w-full"
                  placeholder="コメントを入力..."
                />
                {commentError && (
                  <div className="mt-2 text-sm text-red-600">{commentError}</div>
                )}
                {commentUploadError && (
                  <div className="mt-2 text-sm text-red-600">
                    {commentUploadError}
                    {pendingJournalId && commentFiles.length > 0 && (
                      <button
                        onClick={handleRetryCommentUpload}
                        className="ml-2 text-blue-600 hover:text-blue-800 underline"
                        disabled={addingComment}
                      >
                        添付を再アップロード
                      </button>
                    )}
                  </div>
                )}
                <div className="mt-2">
                  <input
                    key={commentInputKey}
                    type="file"
                    multiple
                    onChange={(e) => handleCommentFilesChange(e.target.files)}
                    className="input"
                    disabled={addingComment}
                  />
                </div>
                {commentFiles.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {commentFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${index}`}
                        className="flex items-center justify-between text-sm text-gray-700"
                      >
                        <div className="truncate">
                          {file.name} ({formatFileSize(file.size)})
                        </div>
                        <button
                          onClick={() => handleRemoveCommentFile(index)}
                          className="text-red-600 hover:text-red-800 ml-3"
                          type="button"
                        >
                          削除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={handleAddComment}
                    disabled={addingComment}
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
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4">詳細</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-gray-500">ステータス</dt>
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
                <dt className="text-sm font-medium text-gray-500">担当者</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {issue.assignedTo
                    ? `${issue.assignedTo.lastName} ${issue.assignedTo.firstName}`
                    : '未割り当て'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">作成者</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {issue.author
                    ? `${issue.author.lastName} ${issue.author.firstName}`
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
                <dt className="text-sm font-medium text-gray-500">作成日</dt>
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

          <IssueRelationsSection issueId={parseInt(id!)} />
          <IssueWatchersSection issueId={parseInt(id!)} />
          <IssueTimeEntriesSection
            issueId={parseInt(id!)}
            estimatedHours={issue.estimatedHours}
          />
          {issue.children && issue.children.length > 0 && (
            <IssueChildrenSection children={issue.children} />
          )}
        </div>
      </div>

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
