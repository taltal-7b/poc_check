import { useState, useEffect, useRef } from 'react';
import { Paperclip, Upload, Download, X, File } from 'lucide-react';
import { issuesApi, attachmentsApi, API_URL } from '../../lib/api';

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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadError('');

    try {
      const fileArray = Array.from(files);
      await issuesApi.uploadIssueAttachments(issueId, fileArray);
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Reload issue data
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
      
      // Reload issue data
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

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    // 拡張子に応じてアイコンを変更することも可能
    return <File className="w-5 h-5 text-gray-400" />;
  };

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
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className={`btn btn-sm btn-secondary flex items-center space-x-1 cursor-pointer ${
              uploading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
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
          {attachments.map((attachment: any) => (
            <div
              key={attachment.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                {getFileIcon(attachment.filename)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleDownload(attachment.id, attachment.filename)}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline truncate"
                      title={attachment.filename}
                    >
                      {attachment.filename}
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
                    <p className="text-xs text-gray-600 mt-1">{attachment.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center space-x-2 ml-4">
                <button
                  onClick={() => handleDownload(attachment.id, attachment.filename)}
                  className="text-gray-600 hover:text-blue-600"
                  title="ダウンロード"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(attachment.id, attachment.filename)}
                  className="text-gray-600 hover:text-red-600"
                  title="削除"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500">
        <p>※ 最大ファイルサイズ: 10MB</p>
        <p>※ 複数ファイルを同時にアップロード可能</p>
      </div>
    </div>
  );
}
