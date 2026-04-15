import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { useProject, useWikiPage, useCreateWikiPage, useUpdateWikiPage, useMembers } from '../api/hooks';
import { useAuthStore } from '../stores/auth';
import type { WikiPage as WikiPageType } from '../types';

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
  const project =
    projectRaw && typeof projectRaw === 'object' && 'id' in projectRaw ? (projectRaw as { id: string }) : null;
  const projectId = project?.id ?? '';
  const membersQuery = useMembers(projectId);
  const members = membersQuery.data?.data ?? [];

  const isNew = !titleParam || titleParam === 'new';
  const decodedTitle = titleParam && titleParam !== 'new' ? decodeURIComponent(titleParam) : '';

  const pageQuery = useWikiPage(projectId, decodedTitle);
  const existing = unwrap<WikiPageType>(pageQuery.data);

  const [title, setTitle] = useState(decodedTitle);
  const [text, setText] = useState('');
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (existing?.content?.text != null) setText(existing.content.text);
    if (decodedTitle) setTitle(decodedTitle);
  }, [existing?.content?.text, decodedTitle]);

  useEffect(() => {
    // Always default to edit mode when opening/changing page
    setPreviewEnabled(false);
  }, [identifier, titleParam]);

  useEffect(() => {
    setSaveMessage(null);
  }, [titleParam]);

  const create = useCreateWikiPage(projectId);
  const update = useUpdateWikiPage(projectId);

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

  const previewHtml = useMemo(() => {
    const raw = marked.parse(text, { async: false }) as string;
    return sanitizeHtml(raw);
  }, [text]);

  const save = async () => {
    if (!projectId) return;
    try {
      if (isNew) {
        if (!title.trim()) return;
        await create.mutateAsync({ title: title.trim(), text });
        setSaveMessage({ type: 'success', text: 'Wikiページを保存しました。' });
        navigate(`/projects/${identifier}/wiki/${encodeURIComponent(title.trim())}`);
      } else {
        await update.mutateAsync({ title: decodedTitle, text });
        setSaveMessage({ type: 'success', text: 'Wikiページを保存しました。' });
        navigate(`/projects/${identifier}/wiki/${encodeURIComponent(decodedTitle)}`);
      }
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

      {isNew ? (
        <label className="block max-w-xl text-sm">
          <span className="text-gray-700">タイトル</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="ページタイトル"
          />
        </label>
      ) : (
        <p className="text-lg font-medium text-gray-800">{decodedTitle}</p>
      )}

      <div className="flex items-center justify-end">
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
          <button
            type="button"
            onClick={() => setPreviewEnabled(false)}
            className={`px-3 py-1.5 text-sm ${!previewEnabled ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            編集
          </button>
          <button
            type="button"
            onClick={() => setPreviewEnabled(true)}
            className={`px-3 py-1.5 text-sm border-l border-gray-300 ${previewEnabled ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            プレビュー
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 min-h-[480px]">
        <div className="flex flex-col rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
          <span className="text-xs font-medium text-gray-500 px-3 py-2 bg-gray-50 border-b">
            {previewEnabled ? 'プレビュー' : 'Markdown'}
          </span>
          {previewEnabled ? (
            <div
              className="flex-1 min-h-[400px] overflow-auto p-3 text-sm text-gray-800 space-y-3 [&_h1]:text-xl [&_h1]:font-bold [&_pre]:bg-gray-100 [&_pre]:p-2 [&_pre]:rounded [&_a]:text-primary-700"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 min-h-[400px] w-full resize-none border-0 p-3 font-mono text-sm focus:ring-0"
              spellCheck={false}
            />
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={create.isPending || update.isPending || (isNew && !title.trim())}
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
