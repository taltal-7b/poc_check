import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProjectSubNav from '../components/ProjectSubNav';
import RichTextEditor from '../components/RichTextEditor';
import { useAuthStore } from '../stores/auth';
import { useCreateProjectNews, useMembers, useProject, useUploadAttachments } from '../api/hooks';

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

export default function NewsNewPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);

  const { data: projectRaw } = useProject(identifier ?? '');
  const project = projectRaw?.data ?? null;
  const projectId = project?.id ?? '';
  const membersQuery = useMembers(projectId);

  const createNews = useCreateProjectNews(projectId);
  const uploadAttachments = useUploadAttachments();

  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canCreateNews = useMemo(() => {
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !identifier || !canCreateNews) return;
    if (!title.trim() || !description.trim()) return;
    setSaveMessage(null);
    try {
      let attachmentIds: string[] = [];
      if (attachFiles.length > 0) {
        const uploaded = await uploadAttachments.mutateAsync({ files: attachFiles });
        const rows = (uploaded.data?.attachments ?? []) as Array<{ id?: string }>;
        attachmentIds = rows.filter((x) => !!x.id).map((x) => String(x.id));
      }
      await createNews.mutateAsync({
        title: title.trim(),
        summary: summary.trim() || undefined,
        description: description.trim(),
        attachmentIds,
      });
      navigate(`/projects/${identifier}/news`);
    } catch (error: any) {
      const msg = error?.response?.data?.error?.message || t('app.error');
      setSaveMessage({ type: 'error', text: msg });
    }
  };

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-6">
      <ProjectSubNav identifier={identifier} />
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">{t('news.new')}</h1>
        {!canCreateNews && !membersQuery.isLoading ? (
          <p className="mt-4 text-sm text-red-600">ニュースを作成する権限がありません。</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            {saveMessage && <p className="text-sm text-red-600">{saveMessage.text}</p>}
            <label className="block text-sm">
              <span className="text-gray-700">
                タイトル <span className="text-red-600">*</span>
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="ニュースタイトルを入力"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">サマリー</span>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                placeholder="要約を入力（任意）"
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              />
            </label>
            <div className="text-sm">
              <span className="mb-1 block text-gray-700">
                説明 <span className="text-red-600">*</span>
              </span>
              <RichTextEditor
                value={description}
                onChange={setDescription}
                rows={12}
                placeholder="ニュース本文"
                files={attachFiles}
                onFilesChange={setAttachFiles}
                showAttachments={true}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createNews.isPending || uploadAttachments.isPending || !title.trim() || !description.trim()}
                className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {t('app.save')}
              </button>
              <button
                type="button"
                onClick={() => navigate(`/projects/${identifier}/news`)}
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
