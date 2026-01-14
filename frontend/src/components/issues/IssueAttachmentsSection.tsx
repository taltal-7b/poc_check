import { useState } from 'react';
import { Paperclip, Upload, Trash2 } from 'lucide-react';
import { attachmentsApi, issuesApi } from '../../lib/api';

interface IssueAttachmentsSectionProps {
  issueId: number;
  attachments: any[];
  onRefresh: () => void;
}

const formatFileSize = (size: number) => {
  if (!Number.isFinite(size)) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export default function IssueAttachmentsSection({
  issueId,
  attachments,
  onRefresh,
}: IssueAttachmentsSectionProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);
    try {
      await issuesApi.uploadIssueAttachments(issueId, selectedFiles);
      setSelectedFiles([]);
      setInputKey((prev) => prev + 1);
      onRefresh();
    } catch (error: any) {
      console.error('Failed to upload attachments:', error);
      alert(error.response?.data?.message || '添付ファイルのアップロードに失敗しました');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attachmentId: number) => {
    if (!confirm('この添付ファイルを削除してもよろしいですか？')) return;
    try {
      await attachmentsApi.delete(attachmentId);
      onRefresh();
    } catch (error: any) {
      console.error('Failed to delete attachment:', error);
      alert(error.response?.data?.message || '添付ファイルの削除に失敗しました');
    }
  };

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-900 flex items-center space-x-2">
          <Paperclip className="w-5 h-5" />
          <span>添付ファイル</span>
        </h2>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <input
            key={inputKey}
            type="file"
            multiple
            onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
            className="input"
          />
          <button
            onClick={handleUpload}
            disabled={uploading || selectedFiles.length === 0}
            className="btn btn-sm btn-primary flex items-center space-x-1"
          >
            <Upload className="w-4 h-4" />
            <span>{uploading ? 'アップロード中...' : 'アップロード'}</span>
          </button>
        </div>

        {attachments && attachments.length > 0 ? (
          <div className="space-y-2">
            {attachments.map((attachment: any) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between p-2 bg-gray-50 rounded hover:bg-gray-100"
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
                      : '不明'}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(attachment.id)}
                  className="text-red-600 hover:text-red-800 ml-2"
                  title="削除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500 text-sm">
            添付ファイルはありません
          </div>
        )}
      </div>
    </div>
  );
}
