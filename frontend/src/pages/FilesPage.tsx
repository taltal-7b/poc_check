import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { format, parseISO } from 'date-fns';
import { Download, Eye, FileText, Image as ImageIcon, Trash2, Upload, X } from 'lucide-react';
import ProjectSubNav from '../components/ProjectSubNav';
import AppSelect from '../components/AppSelect';
import { useDeleteProjectFile, useProject, useProjectFiles, useUploadProjectFiles } from '../api/hooks';
import api from '../api/client';
import type { ProjectFile } from '../types';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  try {
    return format(parseISO(value), 'yyyy/MM/dd HH:mm');
  } catch {
    return value;
  }
}

function userName(user: ProjectFile['author']): string {
  if (!user) return '-';
  return `${user.lastname} ${user.firstname}`.trim() || user.login;
}

function isImageFile(file: Pick<ProjectFile, 'filename' | 'contentType'>): boolean {
  const lower = file.filename.toLowerCase();
  return Boolean(file.contentType?.startsWith('image/')) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lower);
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { error?: { message?: string } } } }).response;
    const message = response?.data?.error?.message;
    if (message) return message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

type PreviewItem = {
  key: string;
  name: string;
  url: string;
};

export default function FilesPage() {
  const { identifier } = useParams<{ identifier: string }>();
  const projectQuery = useProject(identifier ?? '');
  const project = projectQuery.data?.data ?? null;
  const projectId = project?.id ?? '';
  const filesQuery = useProjectFiles(projectId);
  const uploadFiles = useUploadProjectFiles(projectId);
  const deleteFile = useDeleteProjectFile(projectId);

  const payload = filesQuery.data?.data;
  const files = payload?.files ?? [];
  const versions = payload?.versions ?? [];
  const canManage = Boolean(payload?.canManage);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileDescriptions, setFileDescriptions] = useState<string[]>([]);
  const [versionId, setVersionId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [selectedPreviews, setSelectedPreviews] = useState<PreviewItem[]>([]);
  const selectedPreviewUrlsRef = useRef<string[]>([]);
  const activePreviewUrlRef = useRef<string | null>(null);

  const groupedFiles = useMemo(() => {
    const versionMap = new Map(versions.map((version) => [version.id, version]));
    const groups = new Map<string, { id: string; name: string; files: ProjectFile[]; position: number }>();

    versions.forEach((version, index) => {
      groups.set(version.id, { id: version.id, name: version.name, files: [], position: index });
    });
    groups.set('__none__', {
      id: '__none__',
      name: versions.length > 0 ? 'その他' : 'ファイル一覧',
      files: [],
      position: Number.MAX_SAFE_INTEGER,
    });

    files.forEach((file) => {
      const key = file.versionId && versionMap.has(file.versionId) ? file.versionId : '__none__';
      groups.get(key)!.files.push(file);
    });

    return Array.from(groups.values())
      .filter((group) => group.files.length > 0)
      .map((group) => ({
        ...group,
        files: [...group.files].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
      }))
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'ja'));
  }, [files, versions]);

  useEffect(() => {
    selectedPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    const previews = selectedFiles
      .map((file, index) => ({ file, index }))
      .filter(({ file }) => file.type.startsWith('image/'))
      .map(({ file, index }) => {
        const url = URL.createObjectURL(file);
        selectedPreviewUrlsRef.current.push(url);
        return {
          key: `${file.name}-${file.size}-${file.lastModified}-${index}`,
          name: file.name,
          url,
        };
      });
    setSelectedPreviews(previews);

    return () => {
      selectedPreviewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      selectedPreviewUrlsRef.current = [];
    };
  }, [selectedFiles]);

  const closeUpload = () => {
    if (uploadFiles.isPending) return;
    setUploadOpen(false);
    setSelectedFiles([]);
    setFileDescriptions([]);
    setVersionId('');
    setFormError(null);
  };

  const submitUpload = async () => {
    if (!selectedFiles.length) {
      setFormError('ファイルを選択してください。');
      return;
    }
    setFormError(null);
    try {
      await uploadFiles.mutateAsync({
        files: selectedFiles,
        descriptions: fileDescriptions.map((value) => value.trim()),
        versionId: versionId || undefined,
      });
      closeUpload();
    } catch (error) {
      setFormError(extractErrorMessage(error, 'アップロードに失敗しました。'));
    }
  };

  const downloadProjectFile = async (file: ProjectFile) => {
    setDownloadingId(file.id);
    try {
      const res = await api.get(`/projects/${projectId}/files/${file.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingId(null);
    }
  };

  const previewProjectFile = async (file: ProjectFile) => {
    setDownloadingId(file.id);
    try {
      const res = await api.get(`/projects/${projectId}/files/${file.id}/download`, { responseType: 'blob' });
      if (activePreviewUrlRef.current) URL.revokeObjectURL(activePreviewUrlRef.current);
      const url = URL.createObjectURL(res.data);
      activePreviewUrlRef.current = url;
      setPreview({ url, name: file.filename });
    } finally {
      setDownloadingId(null);
    }
  };

  const closePreview = () => {
    if (activePreviewUrlRef.current) URL.revokeObjectURL(activePreviewUrlRef.current);
    activePreviewUrlRef.current = null;
    setPreview(null);
  };

  useEffect(() => () => {
    if (activePreviewUrlRef.current) URL.revokeObjectURL(activePreviewUrlRef.current);
  }, []);

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setFileDescriptions((prev) => prev.filter((_, i) => i !== index));
  };

  if (!identifier) return <p className="text-slate-500">データがありません</p>;

  return (
    <div className="space-y-6">
      <ProjectSubNav identifier={identifier} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">ファイル</h1>
        {canManage && (
          <button
            type="button"
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700"
          >
            <Upload className="h-4 w-4" aria-hidden />
            ファイルを追加
          </button>
        )}
      </div>

      {projectQuery.isLoading || filesQuery.isLoading ? (
        <p className="text-slate-500">読み込み中...</p>
      ) : groupedFiles.length === 0 ? (
        <p className="text-slate-500">データがありません</p>
      ) : (
        <div className="space-y-6">
          {groupedFiles.map((group) => (
            <section key={group.id}>
              {!(group.id === '__none__' && versions.length === 0) && (
                <h2 className="mb-3 text-lg font-semibold text-slate-800">{group.name}</h2>
              )}
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto overflow-y-hidden">
                  <table className="min-w-[920px] w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="min-w-72 px-3 py-3 text-left font-semibold text-slate-700">ファイル</th>
                        <th className="w-24 px-3 py-3 text-left font-semibold text-slate-700">サイズ</th>
                        <th className="min-w-64 px-3 py-3 text-left font-semibold text-slate-700">説明</th>
                        <th className="w-36 px-3 py-3 text-left font-semibold text-slate-700">作成者</th>
                        <th className="w-40 px-3 py-3 text-left font-semibold text-slate-700">登録日</th>
                        <th className="w-28 px-3 py-3 text-right font-semibold text-slate-700">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.files.map((file) => (
                        <tr key={file.id} className="align-top hover:bg-slate-50/80">
                          <td className="px-3 py-3">
                            <button
                              type="button"
                              onClick={() => downloadProjectFile(file)}
                              disabled={downloadingId === file.id}
                              className="inline-flex max-w-[22rem] items-center gap-2 text-left font-medium text-slate-900 hover:text-primary-700 disabled:opacity-50"
                            >
                              {isImageFile(file) ? <ImageIcon size={16} className="shrink-0 text-slate-500" /> : <FileText size={16} className="shrink-0 text-slate-500" />}
                              <span className="truncate">{file.filename}</span>
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{formatBytes(file.filesize)}</td>
                          <td className="max-w-md px-3 py-3 text-slate-700">
                            <span className="line-clamp-2 whitespace-pre-wrap">{file.description || '-'}</span>
                          </td>
                          <td className="max-w-36 truncate px-3 py-3 text-slate-700">{userName(file.author)}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-600">{formatDateTime(file.createdAt)}</td>
                          <td className="px-3 py-3">
                            <div className="flex justify-end gap-1">
                              {isImageFile(file) && (
                                <button
                                  type="button"
                                  onClick={() => previewProjectFile(file)}
                                  disabled={downloadingId === file.id}
                                  title="プレビュー"
                                  aria-label="プレビュー"
                                  className="rounded p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                                >
                                  <Eye size={15} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => downloadProjectFile(file)}
                                disabled={downloadingId === file.id}
                                title="ダウンロード"
                                aria-label="ダウンロード"
                                className="rounded p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                              >
                                <Download size={15} />
                              </button>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm('このファイルを削除します。よろしいですか？')) {
                                      deleteFile.mutate(file.id);
                                    }
                                  }}
                                  disabled={deleteFile.isPending && deleteFile.variables === file.id}
                                  title="削除"
                                  aria-label="削除"
                                  className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                >
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}

      <Dialog open={uploadOpen} onClose={closeUpload} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-xl rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
              <DialogTitle className="text-lg font-semibold text-slate-900">ファイルを追加</DialogTitle>
              <button type="button" onClick={closeUpload} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {formError && <p className="text-sm text-red-600">{formError}</p>}

              {versions.length > 0 && (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-500">バージョン</span>
                  <AppSelect
                    value={versionId}
                    onChange={setVersionId}
                    options={[{ value: '', label: '未設定' }, ...versions.map((version) => ({ value: version.id, label: version.name }))]}
                    ariaLabel="バージョン"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <Upload size={16} />
                  ファイル選択
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      const next = Array.from(e.target.files ?? []);
                      if (next.length) {
                        const tooLarge = next.find((file) => file.size > 5 * 1024 * 1024);
                        if (tooLarge) {
                          setFormError(`ファイルサイズが大きすぎます。上限は5MBです: ${tooLarge.name}`);
                          e.currentTarget.value = '';
                          return;
                        }
                        setFormError(null);
                        setSelectedFiles((prev) => [...prev, ...next]);
                        setFileDescriptions((prev) => [...prev, ...next.map(() => '')]);
                      }
                      e.currentTarget.value = '';
                    }}
                  />
                </label>

                {selectedFiles.length > 0 && (
                  <ul className="mt-3 space-y-3">
                    {selectedFiles.map((file, index) => {
                      const previewItem = selectedPreviews.find((item) =>
                        item.key === `${file.name}-${file.size}-${file.lastModified}-${index}`,
                      );
                      return (
                        <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                          <div className="flex gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{file.name}</span>
                                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{formatBytes(file.size)}</span>
                                <button
                                  type="button"
                                  onClick={() => removeSelectedFile(index)}
                                  className="rounded p-1 text-slate-500 hover:bg-slate-100"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <label className="mt-2 block">
                                <span className="text-xs font-medium text-slate-600">説明</span>
                                <textarea
                                  value={fileDescriptions[index] ?? ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setFileDescriptions((prev) => {
                                      const next = [...prev];
                                      next[index] = value;
                                      return next;
                                    });
                                  }}
                                  rows={2}
                                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                                />
                              </label>
                            </div>
                            {previewItem && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (activePreviewUrlRef.current) URL.revokeObjectURL(activePreviewUrlRef.current);
                                  const url = URL.createObjectURL(file);
                                  activePreviewUrlRef.current = url;
                                  setPreview({ url, name: previewItem.name });
                                }}
                                className="group w-28 shrink-0 text-left"
                              >
                                <div className="aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                                  <img src={previewItem.url} alt={previewItem.name} className="h-full w-full object-cover" />
                                </div>
                                <p className="mt-1 truncate text-xs text-slate-600 group-hover:text-primary-700">プレビュー</p>
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

            </div>
              <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">ファイルサイズ上限は5MBです。</p>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={submitUpload}
                    disabled={!selectedFiles.length || uploadFiles.isPending}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploadFiles.isPending ? '保存中...' : '追加'}
                  </button>
                  <button type="button" onClick={closeUpload} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    キャンセル
                  </button>
                </div>
              </div>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog open={Boolean(preview)} onClose={closePreview} className="relative z-[60]">
        <div className="fixed inset-0 bg-black/70" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-5xl rounded-xl bg-black p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between gap-3 text-white">
              <DialogTitle className="truncate text-sm font-medium">{preview?.name ?? ''}</DialogTitle>
              <button type="button" onClick={closePreview} className="rounded px-2 py-1 text-sm hover:bg-white/10">
                閉じる
              </button>
            </div>
            {preview?.url && <img src={preview.url} alt={preview.name} className="max-h-[80vh] w-full rounded object-contain" />}
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
