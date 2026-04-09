import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { useProject, useWikiPage, useCreateWikiPage, useUpdateWikiPage } from '../api/hooks';
import type { WikiPage as WikiPageType } from '../types';

function unwrap<T>(raw: unknown): T | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'object' && raw !== null && 'data' in raw && !Array.isArray(raw)) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export default function WikiEditPage() {
  const { t } = useTranslation();
  const { identifier, title: titleParam } = useParams<{ identifier: string; title?: string }>();
  const navigate = useNavigate();

  const { data: projectRaw } = useProject(identifier ?? '');
  const project =
    projectRaw && typeof projectRaw === 'object' && 'id' in projectRaw ? (projectRaw as { id: string }) : null;
  const projectId = project?.id ?? '';

  const isNew = !titleParam || titleParam === 'new';
  const decodedTitle = titleParam && titleParam !== 'new' ? decodeURIComponent(titleParam) : '';

  const pageQuery = useWikiPage(projectId, decodedTitle);
  const existing = unwrap<WikiPageType>(pageQuery.data);

  const [title, setTitle] = useState(decodedTitle);
  const [text, setText] = useState('');

  useEffect(() => {
    if (existing?.content?.text != null) setText(existing.content.text);
    if (decodedTitle) setTitle(decodedTitle);
  }, [existing?.content?.text, decodedTitle]);

  const create = useCreateWikiPage(projectId);
  const update = useUpdateWikiPage(projectId);

  const previewHtml = useMemo(() => {
    const raw = marked.parse(text, { async: false }) as string;
    return sanitizeHtml(raw);
  }, [text]);

  const save = async () => {
    if (!projectId) return;
    if (isNew) {
      if (!title.trim()) return;
      await create.mutateAsync({ title: title.trim(), text });
      navigate(`/projects/${identifier}/wiki/${encodeURIComponent(title.trim())}`);
    } else {
      await update.mutateAsync({ title: decodedTitle, text });
      navigate(`/projects/${identifier}/wiki/${encodeURIComponent(decodedTitle)}`);
    }
  };

  const cancel = () => {
    if (isNew) navigate(`/projects/${identifier}/wiki`);
    else navigate(`/projects/${identifier}/wiki/${encodeURIComponent(decodedTitle)}`);
  };

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t('wiki.editPage')}</h1>

      {isNew ? (
        <label className="block max-w-xl text-sm">
          <span className="text-gray-700">Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            placeholder="Page title"
          />
        </label>
      ) : (
        <p className="text-lg font-medium text-gray-800">{decodedTitle}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[480px]">
        <div className="flex flex-col rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
          <span className="text-xs font-medium text-gray-500 px-3 py-2 bg-gray-50 border-b">Markdown</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 min-h-[400px] w-full resize-none border-0 p-3 font-mono text-sm focus:ring-0"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
          <span className="text-xs font-medium text-gray-500 px-3 py-2 bg-gray-50 border-b">Preview</span>
          <div
            className="flex-1 min-h-[400px] overflow-auto p-3 text-sm text-gray-800 space-y-3 [&_h1]:text-xl [&_h1]:font-bold [&_pre]:bg-gray-100 [&_pre]:p-2 [&_pre]:rounded [&_a]:text-primary-700"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
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
