import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { FileText, Pencil, Plus, Trash2, X } from 'lucide-react';
import ProjectSubNav from '../components/ProjectSubNav';
import {
  useProject,
  useDocuments,
  useDocument,
  useEnumerations,
  useMembers,
  useUploadAttachments,
  useDeleteAttachment,
} from '../api/hooks';
import { useAuthStore } from '../stores/auth';
import api from '../api/client';
import type { Attachment, Document } from '../types';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
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

function parsePermissions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  try {
    return format(parseISO(value), 'yyyy/MM/dd HH:mm');
  } catch {
    return value;
  }
}

type DocumentForm = {
  title: string;
  description: string;
  categoryId: string;
};

type SortKey = 'category' | 'date' | 'title' | 'author';

const EMPTY_FORM: DocumentForm = { title: '', description: '', categoryId: '' };

export default function DocumentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { identifier, documentId } = useParams<{ identifier: string; documentId?: string }>();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const projectQuery = useProject(identifier ?? '');
  const project = projectQuery.data?.data ?? null;
  const projectId = project?.id ?? '';

  const docsQuery = useDocuments(projectId);
  const documentQuery = useDocument(projectId, documentId ?? '');
  const membersQuery = useMembers(projectId);

  const documents = useMemo(() => unwrapList<Document>(docsQuery.data), [docsQuery.data]);
  const currentDocument = documentId ? documentQuery.data?.data ?? null : null;

  const { data: categoriesRaw } = useEnumerations('DocumentCategory');
  const categories = useMemo(() => unwrapList<{ id: string; name: string }>(categoriesRaw), [categoriesRaw]);

  const canModify = useMemo(() => {
    if (!currentUser?.id) return false;
    if (currentUser.admin) return true;
    const me = (membersQuery.data?.data ?? []).find((m) => m.userId === currentUser.id);
    if (!me) return false;
    const perms = new Set<string>();
    for (const mr of me.memberRoles ?? []) {
      for (const p of parsePermissions(mr.role?.permissions)) perms.add(p);
    }
    return perms.has('manage_documents');
  }, [currentUser, membersQuery.data]);

  const [sortBy, setSortBy] = useState<SortKey>('category');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [form, setForm] = useState<DocumentForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, { url: string; kind: 'image' | 'pdf' }>>({});
  const [thumbnailLoading, setThumbnailLoading] = useState(false);
  const thumbnailUrlsRef = useRef<string[]>([]);

  const sortedSections = useMemo(() => {
    const byDateDesc = (a: Document, b: Document) => {
      const da = a.createdAt ? Date.parse(a.createdAt) : 0;
      const db = b.createdAt ? Date.parse(b.createdAt) : 0;
      return db - da;
    };
    const authorName = (d: Document) =>
      d.author ? `${d.author.lastname} ${d.author.firstname}`.trim() || d.author.login : '未設定';
    const createdDay = (d: Document) => {
      if (!d.createdAt) return '日付未設定';
      try {
        return format(parseISO(d.createdAt), 'yyyy-MM-dd');
      } catch {
        return '日付未設定';
      }
    };
    const titleGroup = (d: Document) => {
      const title = (d.title ?? '').trim();
      if (!title) return '#';
      return title.slice(0, 1).toUpperCase();
    };

    if (sortBy === 'category') {
      const map = new Map<string, { name: string; position: number; docs: Document[] }>();
      for (const d of documents) {
        const key = d.category?.id ?? d.categoryId ?? 'uncategorized';
        const categoryMeta = categories.find((c) => c.id === key) as
          | ({ id: string; name: string; position?: number })
          | undefined;
        const name = d.category?.name ?? categoryMeta?.name ?? t('documents.category');
        const position =
          typeof categoryMeta?.position === 'number' ? categoryMeta.position : Number.MAX_SAFE_INTEGER;
        const bucket = map.get(key);
        if (bucket) bucket.docs.push(d);
        else map.set(key, { name, position, docs: [d] });
      }

      return Array.from(map.entries())
        .map(([id, value]) => ({
          id,
          name: value.name,
          docs: [...value.docs].sort(byDateDesc),
          position: value.position,
        }))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'ja'));
    }

    if (sortBy === 'date') {
      const map = new Map<string, Document[]>();
      for (const d of documents) {
        const key = createdDay(d);
        const bucket = map.get(key);
        if (bucket) bucket.push(d);
        else map.set(key, [d]);
      }

      return Array.from(map.entries())
        .map(([key, docs]) => ({
          id: `date-${key}`,
          name: key,
          docs: [...docs].sort(byDateDesc),
          sortValue: key,
        }))
        .sort((a, b) => b.sortValue.localeCompare(a.sortValue, 'ja'))
        .map(({ sortValue: _sortValue, ...section }) => section);
    }

    if (sortBy === 'author') {
      const map = new Map<string, Document[]>();
      for (const d of documents) {
        const key = authorName(d);
        const bucket = map.get(key);
        if (bucket) bucket.push(d);
        else map.set(key, [d]);
      }

      return Array.from(map.entries())
        .map(([key, docs]) => ({
          id: `author-${key}`,
          name: key,
          docs: [...docs].sort(byDateDesc),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    }

    const map = new Map<string, Document[]>();
    for (const d of documents) {
      const key = titleGroup(d);
      const bucket = map.get(key);
      if (bucket) bucket.push(d);
      else map.set(key, [d]);
    }
    return Array.from(map.entries())
      .map(([key, docs]) => ({
        id: `title-${key}`,
        name: key,
        docs: [...docs].sort((a, b) => {
          const byTitle = (a.title ?? '').localeCompare(b.title ?? '', 'ja');
          if (byTitle !== 0) return byTitle;
          return byDateDesc(a, b);
        }),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  }, [documents, categories, t, sortBy]);

  const uploadAttachments = useUploadAttachments();
  const deleteAttachment = useDeleteAttachment();

  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const replaceThumbnails = (next: Record<string, { url: string; kind: 'image' | 'pdf' }>) => {
    for (const url of thumbnailUrlsRef.current) URL.revokeObjectURL(url);
    thumbnailUrlsRef.current = Object.values(next).map((x) => x.url);
    setThumbnails(next);
  };

  useEffect(() => {
    return () => {
      for (const url of thumbnailUrlsRef.current) URL.revokeObjectURL(url);
      thumbnailUrlsRef.current = [];
    };
  }, []);

  const closePreview = () => {
    setPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingDoc(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setAttachFiles([]);
  };

  const openCreateModal = () => {
    setEditingDoc(null);
    setForm({ title: '', description: '', categoryId: categories[0]?.id ?? '' });
    setFormError(null);
    setAttachFiles([]);
    setModalOpen(true);
  };

  const openEditModal = (doc: Document) => {
    setEditingDoc(doc);
    setForm({
      title: doc.title ?? '',
      description: doc.description ?? '',
      categoryId: doc.category?.id ?? doc.categoryId ?? '',
    });
    setFormError(null);
    setAttachFiles([]);
    setModalOpen(true);
  };

  const createDoc = useMutation({
    mutationFn: async (payload: DocumentForm & { attachmentIds?: string[] }) => {
      await api.post(`/projects/${projectId}/documents`, {
        title: payload.title.trim(),
        description: payload.description.trim() ? payload.description.trim() : null,
        categoryId: payload.categoryId,
        attachmentIds: payload.attachmentIds,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', projectId] });
      closeModal();
    },
    onError: (error) => setFormError(extractErrorMessage(error, t('app.error'))),
  });

  const updateDoc = useMutation({
    mutationFn: async (payload: DocumentForm & { id: string; attachmentIds?: string[] }) => {
      await api.put(`/projects/${projectId}/documents/${payload.id}`, {
        title: payload.title.trim(),
        description: payload.description.trim() ? payload.description.trim() : null,
        categoryId: payload.categoryId,
        attachmentIds: payload.attachmentIds,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['documents', projectId] });
      qc.invalidateQueries({ queryKey: ['document', projectId] });
      closeModal();
    },
    onError: (error) => setFormError(extractErrorMessage(error, t('app.error'))),
  });

  const deleteDoc = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/projects/${projectId}/documents/${id}`);
    },
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ['documents', projectId] });
      qc.invalidateQueries({ queryKey: ['document', projectId, id] });
      closeModal();
      if (documentId === id && identifier) navigate(`/projects/${identifier}/documents`);
    },
    onError: (error) => window.alert(extractErrorMessage(error, t('app.error'))),
  });

  const submitForm = async () => {
    if (!form.title.trim() || !form.categoryId || !projectId) return;
    setFormError(null);

    try {
      let attachmentIds: string[] = [];
      if (attachFiles.length > 0) {
        const uploaded = await uploadAttachments.mutateAsync({ files: attachFiles });
        const rows = (uploaded.data?.attachments ?? []) as Array<{ id?: string }>;
        attachmentIds = rows.filter((x) => !!x.id).map((x) => String(x.id));
      }

      if (editingDoc) {
        await updateDoc.mutateAsync({ id: editingDoc.id, ...form, attachmentIds });
      } else {
        await createDoc.mutateAsync({ ...form, attachmentIds });
      }
    } catch (error) {
      setFormError(extractErrorMessage(error, t('app.error')));
    }
  };

  const handleDelete = (doc: Document) => {
    if (!window.confirm('この文書を削除しますか？')) return;
    deleteDoc.mutate(doc.id);
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      await deleteAttachment.mutateAsync(attachmentId);
      qc.invalidateQueries({ queryKey: ['documents', projectId] });
      if (documentId) qc.invalidateQueries({ queryKey: ['document', projectId, documentId] });
      setEditingDoc((prev) => {
        if (!prev) return prev;
        return { ...prev, attachments: (prev.attachments ?? []).filter((a) => a.id !== attachmentId) };
      });
    } catch (error) {
      window.alert(extractErrorMessage(error, t('app.error')));
    }
  };

  const isImageAttachment = (att: Attachment) => Boolean(att.contentType?.startsWith('image/'));
  const isPdfAttachment = (att: Attachment) =>
    att.contentType?.includes('pdf') || att.filename.toLowerCase().endsWith('.pdf');
  const thumbnailDeps = useMemo(
    () =>
      (currentDocument?.attachments ?? [])
        .map((att) => `${att.id}:${att.filename}:${att.filesize}:${att.createdAt}`)
        .join('|'),
    [currentDocument?.attachments],
  );

  const downloadAttachmentFile = async (att: Attachment) => {
    try {
      setDownloadingId(att.id);
      const res = await api.get(`/attachments/${att.id}/download`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: att.contentType ?? 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(extractErrorMessage(error, t('app.error')));
    } finally {
      setDownloadingId(null);
    }
  };

  const previewImageAttachment = async (att: Attachment) => {
    try {
      setDownloadingId(att.id);
      const res = await api.get(`/attachments/${att.id}/download`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: att.contentType ?? 'image/*' });
      const url = URL.createObjectURL(blob);
      setPreview((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url, name: att.filename };
      });
    } catch (error) {
      window.alert(extractErrorMessage(error, t('app.error')));
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    const targets = (currentDocument?.attachments ?? []).filter((att) => isImageAttachment(att) || isPdfAttachment(att));
    if (!targets.length) {
      replaceThumbnails({});
      return;
    }

    let cancelled = false;
    setThumbnailLoading(true);

    (async () => {
      const settled = await Promise.all(
        targets.map(async (att) => {
          try {
            const res = await api.get(`/attachments/${att.id}/download`, { responseType: 'blob' });
            const blob = new Blob([res.data], { type: att.contentType ?? 'application/octet-stream' });
            return {
              id: att.id,
              thumb: {
                url: URL.createObjectURL(blob),
                kind: isPdfAttachment(att) ? ('pdf' as const) : ('image' as const),
              },
            };
          } catch {
            return null;
          }
        }),
      );
      const next: Record<string, { url: string; kind: 'image' | 'pdf' }> = {};
      for (const item of settled) {
        if (!item) continue;
        next[item.id] = item.thumb;
      }
      if (cancelled) {
        Object.values(next).forEach((x) => URL.revokeObjectURL(x.url));
        return;
      }
      replaceThumbnails(next);
      setThumbnailLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [currentDocument?.id, thumbnailDeps]);

  const saving = createDoc.isPending || updateDoc.isPending || uploadAttachments.isPending;
  const isListLoading = projectQuery.isLoading || docsQuery.isLoading;
  const isDetailLoading = projectQuery.isLoading || (Boolean(documentId) && documentQuery.isLoading);

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-6">
      <ProjectSubNav identifier={identifier} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('documents.title')}</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            並び替え
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              <option value="category">カテゴリ順</option>
              <option value="date">日付順</option>
              <option value="title">タイトル順</option>
              <option value="author">作成者順</option>
            </select>
          </label>
          {canModify && (
            <button
              type="button"
              onClick={openCreateModal}
              disabled={!projectId || categories.length === 0}
              className="inline-flex items-center gap-2 rounded border border-slate-300 bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200 disabled:opacity-50"
            >
              <Plus size={16} />
              {t('documents.new')}
            </button>
          )}
        </div>
      </div>
      {!documentId ? (
        isListLoading ? (
          <p className="text-slate-500">{t('app.loading')}</p>
        ) : sortedSections.length === 0 ? (
          <p className="text-slate-500">{t('app.noData')}</p>
        ) : (
          <div className="space-y-6">
            {sortedSections.map((group) => (
              <section key={group.id}>
                <h2 className="mb-3 text-lg font-semibold text-gray-800">{group.name}</h2>
                <ul className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
                  {group.docs.map((doc) => (
                    <li key={doc.id} className="px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/projects/${identifier}/documents/${doc.id}`}
                            className="text-lg font-semibold text-primary-700 hover:underline"
                          >
                            {doc.title}
                          </Link>
                          <p className="mt-1 text-xs text-gray-500">{formatDateTime(doc.createdAt)}</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{doc.description || '-'}</p>
                        </div>
                        {canModify && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(doc)}
                              className="rounded border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(doc)}
                              disabled={deleteDoc.isPending && deleteDoc.variables === doc.id}
                              className="rounded border border-red-300 bg-white p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : isDetailLoading ? (
        <p className="text-slate-500">{t('app.loading')}</p>
      ) : !currentDocument ? (
        <p className="text-slate-500">{t('app.noData')}</p>
      ) : (
        <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <Link to={`/projects/${identifier}/documents`} className="text-sm text-primary-700 underline hover:text-primary-900">
              {t('app.back')}
            </Link>
            {canModify && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(currentDocument)}
                  className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  {t('app.edit')}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(currentDocument)}
                  className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                >
                  {t('app.delete')}
                </button>
              </div>
            )}
          </div>

          <h2 className="text-xl font-semibold text-gray-900">{currentDocument.title}</h2>
          <p className="mt-1 text-sm text-gray-500">{formatDateTime(currentDocument.createdAt)}</p>

          <div className="mt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">説明</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{currentDocument.description || '-'}</p>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">添付ファイル</h3>
            {(currentDocument.attachments?.length ?? 0) === 0 ? (
              <p className="mt-2 text-sm text-gray-500">-</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {currentDocument.attachments!.map((att) => (
                  <li key={att.id} className="flex items-center gap-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                    <FileText size={16} className="text-slate-500" />
                    <button
                      type="button"
                      onClick={() => downloadAttachmentFile(att)}
                      disabled={downloadingId === att.id}
                      className="text-left text-primary-700 hover:underline disabled:opacity-50"
                    >
                      {att.filename}
                    </button>
                    <span className="text-sm text-slate-500">{(att.filesize / 1024).toFixed(0)} KB</span>
                    {isImageAttachment(att) && (
                      <button
                        type="button"
                        onClick={() => previewImageAttachment(att)}
                        disabled={downloadingId === att.id}
                        className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        プレビュー
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {(currentDocument.attachments?.some((att) => isImageAttachment(att) || isPdfAttachment(att)) ?? false) && (
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">サムネイル</h4>
                {thumbnailLoading ? (
                  <p className="mt-2 text-sm text-gray-500">{t('app.loading')}</p>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {currentDocument.attachments!
                      .filter((att) => isImageAttachment(att) || isPdfAttachment(att))
                      .map((att) => {
                        const thumb = thumbnails[att.id];
                        return (
                          <button
                            key={att.id}
                            type="button"
                            onClick={() => (isImageAttachment(att) ? previewImageAttachment(att) : downloadAttachmentFile(att))}
                            className="group w-24"
                          >
                            <div className="flex h-28 w-24 items-center justify-center overflow-hidden rounded border border-gray-300 bg-white">
                              {!thumb ? (
                                <div className="h-8 w-8 animate-pulse rounded bg-gray-200" />
                              ) : thumb.kind === 'image' ? (
                                <img src={thumb.url} alt={att.filename} className="h-full w-full object-cover" />
                              ) : (
                                <iframe
                                  src={`${thumb.url}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                                  title={att.filename}
                                  className="pointer-events-none h-full w-[calc(100%+12px)] -mr-3 border-0"
                                />
                              )}
                            </div>
                            <p className="mt-1 line-clamp-2 text-left text-[11px] text-gray-600 group-hover:text-primary-700">
                              {att.filename}
                            </p>
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {canModify && categoriesRaw?.success && categories.length === 0 && (
        <p className="text-sm text-amber-700">DocumentCategory が未設定です。管理画面の列挙値からカテゴリを作成してください。</p>
      )}

      <Dialog open={modalOpen} onClose={closeModal} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold">{editingDoc ? t('app.edit') : t('documents.new')}</DialogTitle>
            <div className="mt-4 space-y-3">
              {formError && <p className="text-sm text-red-600">{formError}</p>}

              <label className="block text-sm">
                <span className="text-gray-700">{t('documents.titleField')}</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm">
                <span className="text-gray-700">{t('projects.description')}</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block text-sm">
                <span className="text-gray-700">{t('documents.category')}</span>
                <select
                  value={form.categoryId}
                  onChange={(e) => setForm((prev) => ({ ...prev, categoryId: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">{t('app.required')}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              {editingDoc && (editingDoc.attachments?.length ?? 0) > 0 && (
                <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="mb-2 text-xs font-medium text-gray-600">{t('settings.attachments')}</p>
                  <ul className="space-y-1 text-sm">
                    {editingDoc.attachments!.map((att) => (
                      <li key={att.id} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => downloadAttachmentFile(att)}
                          className="min-w-0 flex-1 truncate text-left text-primary-700 hover:underline"
                        >
                          {att.filename}
                        </button>
                        <span className="shrink-0 text-xs text-gray-400">{(att.filesize / 1024).toFixed(0)} KB</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteAttachment(att.id)}
                          disabled={deleteAttachment.isPending}
                          className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
                <label className="block text-sm">
                  <span className="text-gray-700">{t('settings.attachments')}</span>
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length > 0) setAttachFiles((prev) => [...prev, ...files]);
                      e.currentTarget.value = '';
                    }}
                    className="mt-1 w-full text-sm"
                  />
                </label>
                {attachFiles.length > 0 && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {attachFiles.map((file, idx) => (
                      <li key={`${file.name}-${idx}`} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-gray-700">{file.name}</span>
                        <span className="shrink-0 text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</span>
                        <button
                          type="button"
                          onClick={() => setAttachFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="rounded p-1 text-gray-500 hover:bg-gray-200"
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeModal} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                  {t('app.cancel')}
                </button>
                <button
                  type="button"
                  disabled={!form.title.trim() || !form.categoryId || saving}
                  onClick={submitForm}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {editingDoc ? t('app.save') : t('app.create')}
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
            <div className="mb-2 flex items-center justify-between text-white">
              <DialogTitle className="truncate text-sm font-medium">{preview?.name ?? ''}</DialogTitle>
              <button type="button" onClick={closePreview} className="rounded px-2 py-1 text-sm hover:bg-white/10">
                {t('app.close')}
              </button>
            </div>
            {preview?.url && <img src={preview.url} alt={preview.name} className="max-h-[80vh] w-full rounded object-contain" />}
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
