import { useEffect, useState, useRef } from 'react';
import { Paperclip, Upload, Download, X, File } from 'lucide-react';
import { api, issuesApi, attachmentsApi } from '../../lib/api';

interface IssueAttachmentsSectionProps {
  issueId: number;
  attachments?: any[];
  onRefresh?: () => void;
}

export default function IssueAttachmentsSection({
  issueId,
  attachments = [],
  onRefresh,
}: IssueAttachmentsSectionProps) {
  const maxFilesPerUpload = 10;
  const maxFileSizeBytes = 5 * 1024 * 1024;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadingPreviewIdsRef = useRef<Set<string>>(new Set());

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const selectedFiles = Array.from(files);
    const rejectedFiles: string[] = [];
    let validFiles = selectedFiles.filter((file) => {
      if (file.size > maxFileSizeBytes) {
        rejectedFiles.push(`${file.name} (サイズ超過)`);
        return false;
      }
      return true;
    });

    if (validFiles.length > maxFilesPerUpload) {
      const overflow = validFiles.slice(maxFilesPerUpload);
      overflow.forEach((file) => rejectedFiles.push(`${file.name} (最大件数超過)`));
      validFiles = validFiles.slice(0, maxFilesPerUpload);
    }

    if (rejectedFiles.length > 0) {
      setUploadError(`アップロードできないファイルがあります: ${rejectedFiles.join(', ')}`);
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setUploading(true);
    if (rejectedFiles.length === 0) {
      setUploadError('');
    }

    try {
      await issuesApi.uploadIssueAttachments(issueId, validFiles);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      console.error('Failed to upload files:', err);
      setUploadError(err.response?.data?.message || 'ファイルのアップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attachmentId: number, filename: string) => {
    if (!confirm(`「${filename}」を削除してもよろしいですか？`)) return;

    try {
      await attachmentsApi.delete(attachmentId);

      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      console.error('Failed to delete attachment:', err);
      alert(err.response?.data?.message || 'ファイルの削除に失敗しました');
    }
  };

  const handleDownload = (attachmentId: number, filename: string) => {
    const url = attachmentsApi.getDownloadUrl(attachmentId);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP');
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

  const getFileIcon = (_filename: string) => {
    return <File className="w-5 h-5 text-gray-400" />;
  };

  useEffect(() => {
    let cancelled = false;
    const attachmentIds = new Set(attachments.map((attachment) => String(attachment.id)));

    setPreviewUrls((prev) => {
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
      const targets = attachments.filter((attachment) => {
        if (!attachment?.id) return false;
        if (!isImageFile(attachment)) return false;
        const id = String(attachment.id);
        if (previewUrls[id]) return false;
        if (loadingPreviewIdsRef.current.has(id)) return false;
        loadingPreviewIdsRef.current.add(id);
        return true;
      });

      if (targets.length === 0) return;

      const entries = await Promise.all(
        targets.map(async (attachment) => {
          const id = String(attachment.id);
          try {
            const response = await api.get(`/attachments/${attachment.id}/download`, {
              responseType: 'blob',
            });
            const url = URL.createObjectURL(response.data);
            return [id, url] as const;
          } catch (error) {
            console.error('Failed to load preview:', attachment.id, error);
            return null;
          } finally {
            loadingPreviewIdsRef.current.delete(id);
          }
        })
      );

      if (cancelled) return;

      setPreviewUrls((prev) => {
        const next = { ...prev };
        entries.forEach((entry) => {
          if (!entry) return;
          const [id, url] = entry;
          next[id] = url;
        });
        return next;
      });
    };

    loadPreviews();

    return () => {
      cancelled = true;
    };
  }, [attachments]);

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
          <Paperclip className="w-5 h-5" />
          <span>添付ファイル</span>
          {attachments.length > 0 && (
            <span className="text-sm font-normal text-gray-500">
              ({attachments.length})
            </span>
          )}
        </h2>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            disabled={uploading}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className={`btn btn-sm btn-secondary flex items-center space-x-1 cursor-pointer ${
              uploading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            aria-disabled={uploading}
          >
            <Upload className="w-4 h-4" />
            <span>{uploading ? 'アップロード中...' : 'ファイルを追加'}</span>
          </label>
        </div>
      </div>

      {uploadError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded text-sm">
          {uploadError}
        </div>
      )}

      {attachments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Paperclip className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">添付ファイルはありません</p>
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment: any) => {
            const displayName = normalizeFilename(attachment.filename || '');
            const showPreview = isImageFile(attachment);
            const previewUrl = previewUrls[String(attachment.id)];
            return (
              <div
                key={attachment.id}
                className="flex items-start justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-start space-x-3 flex-1 min-w-0">
                  {showPreview ? (
                    previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={displayName}
                        className="h-12 w-12 rounded object-cover border border-gray-200 shrink-0"
                        loading="lazy"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded border border-gray-200 bg-gray-100 animate-pulse shrink-0" />
                    )
                  ) : (
                    getFileIcon(displayName)
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleDownload(attachment.id, displayName)}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline truncate"
                        title={displayName}
                      >
                        {displayName}
                      </button>
                    </div>
                    <div className="flex items-center space-x-3 text-xs text-gray-500 mt-1">
                      <span>{formatFileSize(attachment.filesize || 0)}</span>
                      {attachment.author && (
                        <span>
                          {attachment.author.lastName} {attachment.author.firstName}
                        </span>
                      )}
                      <span>{formatDateTime(attachment.createdOn)}</span>
                    </div>
                    {attachment.description && (
                      <p className="text-xs text-gray-600 mt-1">
                        {attachment.description}
                      </p>
                    )}
                    {showPreview && previewUrl && (
                      <img
                        src={previewUrl}
                        alt={displayName}
                        className="mt-3 max-h-[400px] w-auto rounded border border-gray-200"
                        loading="lazy"
                      />
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2 ml-4 pt-1">
                  <button
                    onClick={() => handleDownload(attachment.id, displayName)}
                    className="text-gray-600 hover:text-blue-600"
                    title="ダウンロード"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(attachment.id, displayName)}
                    className="text-gray-600 hover:text-red-600"
                    title="削除"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500">
        <p>※ 最大ファイルサイズ: 5MB (1ファイル)</p>
        <p>※ 最大10件まで同時にアップロード可能</p>
      </div>
    </div>
  );
}

