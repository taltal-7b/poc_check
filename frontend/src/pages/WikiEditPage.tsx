import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Image, Link as LinkIcon, Trash2 } from 'lucide-react';
import RichTextEditor from '../components/RichTextEditor';
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

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  if (!canEditWiki && !membersQuery.isLoading) {
    return <p className="text-gray-500">{t('app.loading')}</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t('wiki.editPage')}</h1>
      {saveMessage && (
        <div
          className={`rounded-md border px-3 py-2 text-sm ${
            saveMessage.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {saveMessage.text}
        </div>
      )}

      <label className="block max-w-xl text-sm">
        <span className="text-gray-700">タイトル</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="ページタイトル"
        />
      </label>

      <RichTextEditor
        value={text}
        onChange={setText}
        rows={18}
        placeholder="Wiki本文"
        files={attachFiles}
        onFilesChange={setAttachFiles}
        showAttachments={true}
      />

      <label className="block max-w-xl text-sm">
        <span className="text-gray-700">コメント</span>
        <input
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="更新コメント（任意）"
        />
      </label>

      {(attachedFiles.length > 0 || attachFiles.length > 0) && (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">{t('settings.attachments')}</h2>
          {attachedFiles.length > 0 && (
            <ul className="space-y-2 text-sm">
              {attachedFiles.map((att) => (
                <li key={att.id} className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/v1/attachments/${att.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-700 hover:underline"
                  >
                    {att.filename}
                  </a>
                  <button
                    type="button"
                    onClick={() => insertAttachmentMarkup(att, false)}
                    className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                  >
                    <LinkIcon className="h-3.5 w-3.5" />
                    リンク挿入
                  </button>
                  {(att.contentType ?? '').startsWith('image/') && (
                    <button
                      type="button"
                      onClick={() => insertAttachmentMarkup(att, true)}
                      className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
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
                    className="inline-flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
          {attachFiles.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">新規追加ファイルは保存時にアップロードされます。</p>
          )}
        </div>
      )}

      <div className="flex gap-2">
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
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {t('app.save')}
        </button>
        <button type="button" onClick={cancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
          {t('app.cancel')}
        </button>
      </div>
    </div>
  );
}
