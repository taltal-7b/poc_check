import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import RichTextEditor from '../components/RichTextEditor';
import { useAuthStore } from '../stores/auth';
import { useMembers, useProject, useProjectNewsItem, useUpdateProjectNews } from '../api/hooks';

function parsePermissions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export default function NewsEditPage() {
  const { t } = useTranslation();
  const { identifier, newsId } = useParams<{ identifier: string; newsId: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);

  const { data: projectRaw } = useProject(identifier ?? '');
  const project = projectRaw?.data ?? null;
  const projectId = project?.id ?? '';
  const membersQuery = useMembers(projectId);
  const newsQuery = useProjectNewsItem(projectId, newsId ?? '');
  const updateNews = useUpdateProjectNews(projectId);

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [saveMessage, setSaveMessage] = useState<{ type: 'error'; text: string } | null>(null);

  const canManageNews = useMemo(() => {
    if (!currentUser?.id) return false;
    if (currentUser.admin) return true;
    const me = (membersQuery.data?.data ?? []).find((m) => m.userId === currentUser.id);
    if (!me) return false;
    const perms = new Set<string>();
    for (const mr of me.memberRoles ?? []) {
      for (const p of parsePermissions(mr.role?.permissions)) perms.add(p);
    }
    return perms.has('manage_news');
  }, [currentUser, membersQuery.data]);

  useEffect(() => {
    const item = newsQuery.data?.data;
    if (!item) return;
    setTitle(item.title ?? '');
    setSummary(item.summary ?? '');
    setDescription(item.description ?? '');
  }, [newsQuery.data]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !identifier || !newsId || !canManageNews) return;
    if (!title.trim() || !description.trim()) return;
    setSaveMessage(null);
    try {
      await updateNews.mutateAsync({
        id: newsId,
        title: title.trim(),
        summary: summary.trim() || null,
        description: description.trim(),
      });
      navigate(`/projects/${identifier}/news/${newsId}`);
    } catch (error: any) {
      const msg = error?.response?.data?.error?.message || t('app.error');
      setSaveMessage({ type: 'error', text: msg });
    }
  };

  if (!identifier || !newsId) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-6">
      <ProjectSubNav identifier={identifier} />
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">ニュースを編集</h1>
        {!canManageNews && !membersQuery.isLoading ? (
          <p className="mt-4 text-sm text-red-600">ニュースを編集する権限がありません。</p>
        ) : newsQuery.isLoading ? (
          <p className="mt-4 text-sm text-gray-500">{t('app.loading')}</p>
        ) : !newsQuery.data?.data ? (
          <p className="mt-4 text-sm text-red-600">{t('app.error')}</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            {saveMessage && <p className="text-sm text-red-600">{saveMessage.text}</p>}
            <label className="block text-sm">
              <span className="text-gray-700">タイトル <span className="text-red-600">*</span></span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">サマリー</span>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <div className="text-sm">
              <span className="mb-1 block text-gray-700">説明 <span className="text-red-600">*</span></span>
              <RichTextEditor
                value={description}
                onChange={setDescription}
                rows={12}
                placeholder="ニュース本文"
                showAttachments={false}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={updateNews.isPending || !title.trim() || !description.trim()}
                className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {t('app.save')}
              </button>
              <button
                type="button"
                onClick={() => navigate(`/projects/${identifier}/news/${newsId}`)}
                className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                {t('app.cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
