import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Image, Link as LinkIcon, Save, Trash2 } from 'lucide-react';
import ProjectSubNav from '../components/ProjectSubNav';
import RichTextEditor from '../components/RichTextEditor';
import { AttachmentLink } from '../components/AttachmentLink';
import {
  useProject,
  useWikiPage,
  useCreateWikiPage,
  useUpdateWikiPage,
  useMembers,
  useUploadAttachments,
  useDeleteAttachment,
} from '../api/hooks';
import { useAuthStore } from '../stores/auth';
import NotFoundPage from './NotFoundPage';
import { isNotFoundError } from '../utils/http-error';
import type { Attachment, WikiPage as WikiPageType } from '../types';

function unwrap<T>(raw: unknown): T | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object' && raw !== null && 'data' in raw && !Array.isArray(raw)) {
    return (raw as { data: T }).data;
  }
  return raw as T;
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

export default function WikiEditPage() {
  const { t } = useTranslation();
  const { identifier, title: titleParam } = useParams<{ identifier: string; title?: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);

  const { data: projectRaw } = useProject(identifier ?? '');
  const project = projectRaw?.data ?? null;
  const projectId = project?.id ?? '';
  const membersQuery = useMembers(projectId);
  const members = membersQuery.data?.data ?? [];

  const isNew = !titleParam || titleParam === 'new';
  const decodedTitle = titleParam && titleParam !== 'new' ? decodeURIComponent(titleParam) : '';

  const pageQuery = useWikiPage(projectId, decodedTitle);
  const existing = unwrap<WikiPageType>(pageQuery.data);

  const [title, setTitle] = useState(decodedTitle);
  const [text, setText] = useState('');
  const [comments, setComments] = useState('');
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (existing?.content?.text != null) setText(existing.content.text);
    setComments(existing?.content?.comments ?? '');
    setAttachedFiles(existing?.attachments ?? []);
    if (isNew) return;
    if (existing?.title) setTitle(existing.title);
    else if (decodedTitle) setTitle(decodedTitle);
  }, [existing?.content?.text, existing?.content?.comments, existing?.title, decodedTitle, isNew]);

  useEffect(() => {
    setSaveMessage(null);
  }, [titleParam]);

  const create = useCreateWikiPage(projectId);
  const update = useUpdateWikiPage(projectId);
  const uploadAttachments = useUploadAttachments();
  const deleteAttachment = useDeleteAttachment();

  const canEditWiki = useMemo(() => {
    if (currentUser?.admin) return true;
    if (!currentUser?.id) return false;
    const meMember = members.find((m) => m.userId === currentUser.id);
    if (!meMember) return false;
    const perms = new Set<string>();
    for (const mr of meMember.memberRoles ?? []) {
      for (const p of parsePermissions(mr.role?.permissions)) perms.add(p);
    }
    return perms.has('edit_wiki_pages');
  }, [members, currentUser]);

  useEffect(() => {
    if (!identifier || !projectId || membersQuery.isLoading) return;
    if (canEditWiki) return;
    if (decodedTitle) navigate(`/projects/${identifier}/wiki/${encodeURIComponent(decodedTitle)}`, { replace: true });
    else navigate(`/projects/${identifier}/wiki`, { replace: true });
  }, [identifier, projectId, decodedTitle, canEditWiki, membersQuery.isLoading, navigate]);

  useEffect(() => {
    if (!identifier || !projectId || isNew || pageQuery.isLoading) return;
    if (!existing?.protected) return;
    navigate(`/projects/${identifier}/wiki/${encodeURIComponent(decodedTitle)}`, { replace: true });
  }, [identifier, projectId, isNew, existing?.protected, decodedTitle, navigate, pageQuery.isLoading]);

  const insertAttachmentMarkup = (att: Attachment, asImage: boolean) => {
    const url = `/api/v1/attachments/${att.id}/download`;
    const markup = asImage ? `![${att.filename}](${url})` : `[${att.filename}](${url})`;
    setText((prev) => `${prev}${prev.endsWith('\n') || prev.length === 0 ? '' : '\n'}${markup}\n`);
  };

  const save = async () => {
    if (!projectId) return;
    try {
      const normalizedComments = comments.trim();
      const payloadComments = normalizedComments.length > 0 ? normalizedComments : null;
      let uploadedAttachmentIds: string[] = [];
      if (attachFiles.length > 0) {
        const uploaded = await uploadAttachments.mutateAsync({ files: attachFiles });
        const attachments = ((uploaded.data?.attachments ?? []) as { id?: string }[]).filter((a) => !!a.id);
        uploadedAttachmentIds = attachments.map((a) => String(a.id));
      }
      if (isNew) {
        if (!title.trim()) return;
        await create.mutateAsync({
          title: title.trim(),
          text,
          comments: payloadComments,
          attachmentIds: uploadedAttachmentIds,
        });
        setSaveMessage({ type: 'success', text: 'Wikiページを保存しました。' });
        navigate(`/projects/${identifier}/wiki/${encodeURIComponent(title.trim())}`);
      } else {
        const normalizedTitle = title.trim();
        if (!normalizedTitle) return;
        await update.mutateAsync({
          title: decodedTitle,
          newTitle: normalizedTitle !== decodedTitle ? normalizedTitle : undefined,
          text,
          comments: payloadComments,
          attachmentIds: uploadedAttachmentIds,
        });
        setSaveMessage({ type: 'success', text: 'Wikiページを保存しました。' });
        navigate(`/projects/${identifier}/wiki/${encodeURIComponent(normalizedTitle)}`);
      }
      setAttachFiles([]);
    } catch (error: any) {
      const msg = error?.response?.data?.error?.message || 'Wikiページの保存に失敗しました。';
      setSaveMessage({ type: 'error', text: msg });
    }
  };

  const cancel = () => {
    if (isNew) navigate(`/projects/${identifier}/wiki`);
    else navigate(`/projects/${identifier}/wiki/${encodeURIComponent(decodedTitle)}`);
  };

  if (!identifier) return <p className="text-slate-500">{t('app.noData')}</p>;

  if (!isNew && pageQuery.isError && isNotFoundError(pageQuery.error)) {
    return <NotFoundPage />;
  }

  if (!canEditWiki && !membersQuery.isLoading) {
    return (
      <div className="space-y-6">
        <ProjectSubNav identifier={identifier} />
        <p className="text-slate-500">{t('app.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProjectSubNav identifier={identifier} />
      <div className="mx-auto w-full space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-slate-900">{t('wiki.editPage')}</h1>
          <button
            type="button"
            onClick={cancel}
            className="inline-flex justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {t('app.cancel')}
          </button>
        </div>

        {saveMessage && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              saveMessage.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {saveMessage.text}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-5 p-4 sm:p-5">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">タイトル</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                placeholder="ページタイトル"
              />
            </label>

            <div>
              <span className="mb-1 block text-xs font-medium text-slate-500">本文</span>
              <RichTextEditor
                value={text}
                onChange={setText}
                rows={18}
                placeholder="Wiki本文"
                files={attachFiles}
                onFilesChange={setAttachFiles}
                showAttachments={true}
              />
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">コメント</span>
              <input
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                placeholder="更新コメント（任意）"
              />
            </label>

            {(attachedFiles.length > 0 || attachFiles.length > 0) && (
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('settings.attachments')}</h2>
                {attachedFiles.length > 0 && (
                  <ul className="space-y-2 text-sm">
                    {attachedFiles.map((att) => (
                      <li key={att.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <AttachmentLink
                          id={att.id}
                          filename={att.filename}
                          className="min-w-0 flex-1 text-primary-700 hover:underline"
                        >
                          {att.filename}
                        </AttachmentLink>
                        <button
                          type="button"
                          onClick={() => insertAttachmentMarkup(att, false)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                          リンク挿入
                        </button>
                        {(att.contentType ?? '').startsWith('image/') && (
                          <button
                            type="button"
                            onClick={() => insertAttachmentMarkup(att, true)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Image className="h-3.5 w-3.5" />
                            画像挿入
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteAttachment.mutateAsync(att.id);
                            setAttachedFiles((prev) => prev.filter((f) => f.id !== att.id));
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          削除
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {attachFiles.length > 0 && (
                  <p className="mt-3 text-xs text-slate-500">新規追加ファイルは保存時にアップロードされます。</p>
                )}
              </section>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={save}
            disabled={
              create.isPending ||
              update.isPending ||
              uploadAttachments.isPending ||
              deleteAttachment.isPending ||
              !title.trim()
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden />
            {t('app.save')}
          </button>
          <button type="button" onClick={cancel} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {t('app.cancel')}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
