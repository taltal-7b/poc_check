import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';
import ProjectSubNav from '../components/ProjectSubNav';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { useAuthStore } from '../stores/auth';
import { useProject, useProjectNews, useProjectNewsItem, useMembers } from '../api/hooks';
import api from '../api/client';
import { renderMarkdown } from '../components/RichTextEditor';
import type { News, Comment } from '../types';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

export default function NewsPage() {
  const { t } = useTranslation();
  const { identifier, newsId } = useParams<{ identifier?: string; newsId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const { data: projectRaw } = useProject(identifier ?? '');
  const project = projectRaw?.data ?? null;

  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const projectList = useProjectNews(project?.id ?? '', { page, per_page: 10 });
  const membersQuery = useMembers(project?.id ?? '');
  const detailQuery = useProjectNewsItem(project?.id ?? '', newsId ?? '');
  const items = useMemo(() => unwrapList<News>(projectList.data), [projectList.data]);

  const [replyParentId, setReplyParentId] = useState<string | null>(null);

  const addComment = useMutation({
    mutationFn: async ({ newsId, content, parentId }: { newsId: string; content: string; parentId?: string | null }) => {
      await api.post(`/news/${newsId}/comments`, { content, parentId: parentId ?? undefined });
    },
    onSuccess: () => {
      if (identifier && project) {
        qc.invalidateQueries({ queryKey: ['news', project.id] });
        if (newsId) qc.invalidateQueries({ queryKey: ['newsItem', project.id, newsId] });
      }
    },
  });

  const deleteComment = useMutation({
    mutationFn: async ({ newsId, commentId }: { newsId: string; commentId: string }) => {
      await api.delete(`/news/${newsId}/comments/${commentId}`);
    },
    onSuccess: (_data, vars) => {
      setReplyParentId((prev) => (prev === vars.commentId ? null : prev));
      if (identifier && project) {
        qc.invalidateQueries({ queryKey: ['news', project.id] });
        if (newsId) qc.invalidateQueries({ queryKey: ['newsItem', project.id, newsId] });
      }
    },
  });
  const deleteNews = useMutation({
    mutationFn: async (id: string) => {
      if (!project?.id) return;
      await api.delete(`/projects/${project.id}/news/${id}`);
    },
    onSuccess: () => {
      if (!project?.id) return;
      qc.invalidateQueries({ queryKey: ['news', project.id] });
      if (newsId) navigate(`/projects/${identifier}/news`);
    },
  });

  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  const parsePermissions = (raw: unknown): string[] => {
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
  };

  const canCreateNews = useMemo(() => {
    if (!identifier || !project?.id) return false;
    if (currentUser?.admin) return true;
    if (!currentUser?.id) return false;
    const meMember = (membersQuery.data?.data ?? []).find((m) => m.userId === currentUser.id);
    if (!meMember) return false;
    const perms = new Set<string>();
    for (const mr of meMember.memberRoles ?? []) {
      for (const p of parsePermissions(mr.role?.permissions)) perms.add(p);
    }
    return perms.has('manage_news');
  }, [identifier, project?.id, currentUser, membersQuery.data]);

  const authorName = (author?: { firstname: string; lastname: string; login: string }) =>
    author ? `${author.lastname} ${author.firstname}`.trim() || author.login : '-';
  const pagination = projectList.data?.pagination;
  const totalPages = pagination?.totalPages ?? 1;

  const deletingCommentId =
    deleteComment.isPending && deleteComment.variables ? deleteComment.variables.commentId : null;

  return (
    <div className="space-y-6">
      {identifier && <ProjectSubNav identifier={identifier} />}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{t('news.title')}</h1>
        {canCreateNews && !newsId && (
          <Link
            to={`/projects/${identifier}/news/new`}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            {t('news.new')}
          </Link>
        )}
      </div>

      {!newsId ? (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          {projectList.isLoading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm text-gray-500">{t('app.loading')}</div>
          ) : items.length === 0 ? (
            <div className="p-6 text-gray-500">{t('app.noData')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">{t('documents.titleField')}</th>
                    <th className="px-4 py-2 font-medium">{t('news.summary')}</th>
                    <th className="px-4 py-2 font-medium">{t('users.createdAt')}</th>
                    <th className="px-4 py-2 font-medium">{t('forums.lastMessage')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map((n) => (
                    <tr key={n.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <Link to={`/projects/${identifier}/news/${n.id}`} className="text-primary-700 hover:underline font-medium">
                          {n.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-gray-700">{n.summary?.trim() ? n.summary : '-'}</td>
                      <td className="px-4 py-2">{n.createdAt ? format(parseISO(n.createdAt), 'yyyy-MM-dd HH:mm') : '-'}</td>
                      <td className="px-4 py-2">{n.updatedAt ? format(parseISO(n.updatedAt), 'yyyy-MM-dd HH:mm') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-sm">
              <span className="text-gray-600">
                {pagination?.total ?? 0} {t('forums.topics')} {((page - 1) * 10) + 1} - {Math.min(page * 10, pagination?.total ?? page * 10)} {t('forums.topics')}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('page', String(page - 1));
                    setSearchParams(next);
                  }}
                  className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
                >
                  {t('forums.prev')}
                </button>
                <span className="text-gray-700">{page} / {totalPages}</span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('page', String(page + 1));
                    setSearchParams(next);
                  }}
                  className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
                >
                  {t('forums.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          {detailQuery.isLoading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm text-gray-500">{t('app.loading')}</div>
          ) : !detailQuery.data?.data ? (
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm text-gray-500">{t('app.error')}</div>
          ) : (
            <NewsDetail
              item={detailQuery.data.data}
              canManageNews={canCreateNews}
              onEdit={() => navigate(`/projects/${identifier}/news/${detailQuery.data!.data.id}/edit`)}
              onDelete={() => {
                if (!window.confirm('Delete this news?')) return;
                deleteNews.mutate(detailQuery.data!.data.id);
              }}
              deleting={deleteNews.isPending}
              authorName={authorName}
              currentUserId={currentUser?.id}
              commentDraft={commentDraft[detailQuery.data.data.id] ?? ''}
              onChangeComment={(v) => setCommentDraft((d) => ({ ...d, [detailQuery.data!.data.id]: v }))}
              replyParentId={replyParentId}
              onSelectReplyParent={setReplyParentId}
              onCancelReply={() => setReplyParentId(null)}
              onSubmitComment={() => {
                const text = (commentDraft[detailQuery.data!.data.id] ?? '').trim();
                if (!text) return;
                addComment.mutate({
                  newsId: detailQuery.data!.data.id,
                  content: text,
                  parentId: replyParentId,
                });
                setCommentDraft((d) => ({ ...d, [detailQuery.data!.data.id]: '' }));
                setReplyParentId(null);
              }}
              addingComment={addComment.isPending}
              isAdmin={Boolean(currentUser?.admin)}
              deletingCommentId={deletingCommentId}
              onDeleteComment={(c) => {
                const hasReplies = (c.replies?.length ?? 0) > 0;
                const msg = hasReplies ? t('news.deleteCommentConfirmWithReplies') : t('news.deleteCommentConfirm');
                if (!window.confirm(msg)) return;
                deleteComment.mutate({ newsId: detailQuery.data!.data.id, commentId: c.id });
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function NewsCommentThread({
  comments,
  authorName,
  replyParentId,
  onSelectReplyParent,
  onCancelReply,
  commentDraft,
  onChangeComment,
  onSubmitComment,
  addingComment,
  currentUserId,
  isAdmin,
  onDeleteComment,
  deletingCommentId,
  depth = 0,
}: {
  comments: Comment[];
  authorName: (author?: { firstname: string; lastname: string; login: string }) => string;
  replyParentId: string | null;
  onSelectReplyParent: (id: string) => void;
  onCancelReply: () => void;
  commentDraft: string;
  onChangeComment: (value: string) => void;
  onSubmitComment: () => void;
  addingComment: boolean;
  currentUserId?: string;
  isAdmin: boolean;
  onDeleteComment: (c: Comment) => void;
  deletingCommentId: string | null;
  depth?: number;
}) {
  const { t } = useTranslation();
  if (comments.length === 0) {
    if (depth === 0) {
      return <p className="mt-2 text-sm text-gray-500">{t('app.noData')}</p>;
    }
    return null;
  }
  return (
    <ul className={depth === 0 ? 'mt-2 space-y-2' : 'mt-2 space-y-2 border-l-2 border-gray-100 pl-3'}>
      {comments.map((c) => {
        const isMine = Boolean(currentUserId && c.authorId === currentUserId);
        const showReplyComposer = replyParentId === c.id;
        const canDelete = isMine || isAdmin;
        const rowBusy = deletingCommentId === c.id;
        return (
          <li
            key={c.id}
            className={`flex flex-col gap-1 rounded border border-gray-200 bg-white px-3 py-2 text-sm ${
              replyParentId === c.id ? 'ring-2 ring-primary-300' : ''
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-gray-500 text-xs">
                {authorName(c.author)} | {c.createdAt ? format(parseISO(c.createdAt), 'yyyy-MM-dd HH:mm') : ''}
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  disabled={rowBusy}
                  onClick={() => onSelectReplyParent(c.id)}
                  className="shrink-0 text-xs text-primary-600 hover:underline disabled:opacity-50"
                >
                  {t('forums.reply')}
                </button>
                {canDelete && (
                  <button
                    type="button"
                    disabled={rowBusy}
                    onClick={() => onDeleteComment(c)}
                    className="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    {t('app.delete')}
                  </button>
                )}
              </div>
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-gray-800">{c.content}</p>
            {showReplyComposer && (
              <div className="mt-3 space-y-2 rounded border border-primary-200 bg-primary-50/60 px-3 py-3">
                <div className="flex items-center justify-between gap-2 text-xs text-primary-900">
                  <span>{authorName(c.author)} {t('forums.reply')}</span>
                  <button type="button" onClick={onCancelReply} className="text-primary-700 underline">
                    {t('app.cancel')}
                  </button>
                </div>
                <textarea
                  value={commentDraft}
                  onChange={(e) => onChangeComment(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder={`${t('forums.reply')}...`}
                />
                <button
                  type="button"
                  disabled={addingComment}
                  onClick={onSubmitComment}
                  className="rounded bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {t('forums.reply')}
                </button>
              </div>
            )}
            {(c.replies?.length ?? 0) > 0 && (
              <NewsCommentThread
                comments={c.replies!}
                authorName={authorName}
                replyParentId={replyParentId}
                onSelectReplyParent={onSelectReplyParent}
                onCancelReply={onCancelReply}
                commentDraft={commentDraft}
                onChangeComment={onChangeComment}
                onSubmitComment={onSubmitComment}
                addingComment={addingComment}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onDeleteComment={onDeleteComment}
                deletingCommentId={deletingCommentId}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NewsDetail({
  item,
  canManageNews,
  onEdit,
  onDelete,
  deleting,
  authorName,
  currentUserId,
  commentDraft,
  onChangeComment,
  replyParentId,
  onSelectReplyParent,
  onCancelReply,
  onSubmitComment,
  addingComment,
  isAdmin,
  onDeleteComment,
  deletingCommentId,
}: {
  item: News;
  canManageNews: boolean;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
  authorName: (author?: { firstname: string; lastname: string; login: string }) => string;
  currentUserId?: string;
  commentDraft: string;
  onChangeComment: (value: string) => void;
  replyParentId: string | null;
  onSelectReplyParent: (id: string) => void;
  onCancelReply: () => void;
  onSubmitComment: () => void;
  addingComment: boolean;
  isAdmin: boolean;
  onDeleteComment: (c: Comment) => void;
  deletingCommentId: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-900">{item.title}</h2>
          {canManageNews && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                <Pencil className="h-4 w-4" />
                {t('app.edit')}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={onDelete}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {t('app.delete')}
              </button>
            </div>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-500">
          {authorName(item.author)} | {item.createdAt ? format(parseISO(item.createdAt), 'yyyy-MM-dd HH:mm') : '-'}
        </p>
        {item.summary && <p className="mt-2 text-sm text-gray-600">{item.summary}</p>}
      </div>
      <div className="px-6 py-5">
        <div
          className="text-sm text-gray-800 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(item.description ?? item.summary ?? '') }}
        />
        {(item.attachments?.length ?? 0) > 0 && (
          <section className="mt-4 rounded border border-gray-200 bg-white px-3 py-3">
            <h3 className="text-sm font-semibold text-gray-700">{t('settings.attachments')}</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {item.attachments!.map((att) => (
                <li key={att.id}>
                  <a
                    href={`/api/v1/attachments/${att.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-700 hover:underline"
                  >
                    {att.filename}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="border-t border-gray-100 px-6 py-4">
        <h3 className="text-sm font-semibold text-gray-700">{t('news.comments')}</h3>
        <NewsCommentThread
          comments={item.comments ?? []}
          authorName={authorName}
          replyParentId={replyParentId}
          onSelectReplyParent={onSelectReplyParent}
          onCancelReply={onCancelReply}
          commentDraft={commentDraft}
          onChangeComment={onChangeComment}
          onSubmitComment={onSubmitComment}
          addingComment={addingComment}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onDeleteComment={onDeleteComment}
          deletingCommentId={deletingCommentId}
        />
        {!replyParentId && (
          <div className="mt-3 flex flex-col gap-2">
            <textarea
              value={commentDraft}
              onChange={(e) => onChangeComment(e.target.value)}
              rows={2}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder={t('news.addComment')}
            />
            <button
              type="button"
              disabled={addingComment}
              onClick={onSubmitComment}
              className="self-start rounded bg-primary-600 px-3 py-1.5 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {t('news.addComment')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
