import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { MessagesSquare, Pencil, Trash2 } from 'lucide-react';
import { useAuthStore } from '../../stores/auth';
import { useBoards, useBoardMessage, useBoardTopicsPage, useMembers, useProject } from '../../api/hooks';
import api from '../../api/client';
import { renderMarkdown } from '../../components/RichTextEditor';
import type { Board, Message } from '../../types';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

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

function authorLabel(m: Pick<Message, 'authorId' | 'author'>) {
  const u = m.author;
  return u ? `${u.lastname} ${u.firstname}`.trim() || u.login : m.authorId;
}

function useForumPermissions(projectId: string) {
  const currentUser = useAuthStore((s) => s.user);
  const membersQuery = useMembers(projectId);
  return useMemo(() => {
    if (!projectId || !currentUser?.id) {
      return { canManageBoards: false, canManageProject: false, canAddMessages: false };
    }
    if (currentUser.admin) {
      return { canManageBoards: true, canManageProject: true, canAddMessages: true };
    }
    const me = (membersQuery.data?.data ?? []).find((m) => m.userId === currentUser.id);
    if (!me) return { canManageBoards: false, canManageProject: false, canAddMessages: false };
    const perms = new Set<string>();
    for (const mr of me.memberRoles ?? []) {
      for (const p of parsePermissions(mr.role?.permissions)) perms.add(p);
    }
    return {
      canManageBoards: perms.has('manage_boards'),
      canManageProject: perms.has('manage_project'),
      canAddMessages: perms.has('add_messages') || perms.has('manage_boards'),
    };
  }, [projectId, currentUser, membersQuery.data]);
}

function canUserEditOrDeleteBoard(
  board: Board | undefined,
  user: { id: string; admin: boolean } | null,
  p: { canManageBoards: boolean; canManageProject: boolean },
): boolean {
  if (!board || !user) return false;
  if (user.admin) return true;
  if (board.createdByUserId && board.createdByUserId === user.id) return true;
  return p.canManageBoards || p.canManageProject;
}

export function ForumBoardIndex() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const projectRes = useProject(identifier ?? '');
  const project = projectRes.data?.data ?? null;
  const projectId = project?.id ?? '';
  const boardsRaw = useBoards(projectId);
  const boards = useMemo(() => unwrapList<Board>(boardsRaw.data), [boardsRaw.data]);
  const { canManageBoards, canManageProject } = useForumPermissions(projectId);
  const canCreateBoard = canManageBoards || canManageProject;

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessagesSquare size={26} aria-hidden />
          {t('forums.title')}
        </h1>
        {canCreateBoard && (
          <Link
            to={`/projects/${identifier}/forums/new`}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            {t('forums.newBoard')}
          </Link>
        )}
      </div>

      {boardsRaw.isLoading ? (
        <p className="text-gray-500">{t('app.loading')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">{t('forums.boardName')}</th>
                <th className="px-4 py-3 font-medium">{t('forums.description')}</th>
                <th className="px-4 py-3 font-medium w-28">{t('forums.topicCount')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {boards.map((b) => (
                <tr
                  key={b.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/projects/${identifier}/forums/${b.id}`)}
                >
                  <td className="px-4 py-2 font-medium text-primary-700">{b.name}</td>
                  <td className="px-4 py-2 text-gray-700 max-w-md truncate">{b.description?.trim() ? b.description : '—'}</td>
                  <td className="px-4 py-2 text-gray-800">{b.topicCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {boards.length === 0 && <p className="p-6 text-center text-gray-500">{t('app.noData')}</p>}
        </div>
      )}
    </div>
  );
}

export function ForumNewBoard() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const projectRes = useProject(identifier ?? '');
  const project = projectRes.data?.data ?? null;
  const projectId = project?.id ?? '';
  const { canManageBoards, canManageProject } = useForumPermissions(projectId);
  const canCreateBoard = canManageBoards || canManageProject;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const createBoard = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${projectId}/boards`, { name: name.trim(), description: description.trim() || undefined });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boards', projectId] });
      navigate(`/projects/${identifier}/forums`);
    },
  });

  if (!identifier || !projectId) return <p className="text-gray-500">{t('app.loading')}</p>;
  if (!canCreateBoard) {
    return <p className="text-gray-600">{t('forums.noPermissionBoard')}</p>;
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t('forums.newBoard')}</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('forums.boardName')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('forums.description')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!name.trim() || createBoard.isPending}
            onClick={() => createBoard.mutate()}
            className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {t('app.create')}
          </button>
          <Link to={`/projects/${identifier}/forums`} className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            {t('app.cancel')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ForumEditBoard() {
  const { t } = useTranslation();
  const { identifier, boardId } = useParams<{ identifier: string; boardId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const projectRes = useProject(identifier ?? '');
  const project = projectRes.data?.data ?? null;
  const projectId = project?.id ?? '';
  const boardsRaw = useBoards(projectId);
  const boards = useMemo(() => unwrapList<Board>(boardsRaw.data), [boardsRaw.data]);
  const board = boards.find((b) => b.id === boardId);
  const forumPerms = useForumPermissions(projectId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!board) return;
    setName(board.name);
    setDescription(board.description ?? '');
  }, [board?.id, board?.name, board?.description]);

  const updateBoard = useMutation({
    mutationFn: async () => {
      await api.put(`/projects/${projectId}/boards/${boardId}`, {
        name: name.trim(),
        description: description.trim().length ? description.trim() : null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boards', projectId] });
      navigate(`/projects/${identifier}/forums/${boardId}`);
    },
  });

  if (!identifier || !boardId || !projectId) return <p className="text-gray-500">{t('app.loading')}</p>;
  if (boardsRaw.isLoading && !board) return <p className="text-gray-500">{t('app.loading')}</p>;
  if (!board) return <p className="text-gray-500">{t('app.error')}</p>;
  if (!canUserEditOrDeleteBoard(board, currentUser, forumPerms)) {
    return <p className="text-gray-600">{t('forums.noPermissionEditBoard')}</p>;
  }

  return (
    <div className="max-w-xl space-y-4">
      <button
        type="button"
        onClick={() => navigate(`/projects/${identifier}/forums/${boardId}`)}
        className="text-sm text-primary-700 hover:underline"
      >
        ← {t('forums.backToTopics')}
      </button>
      <h1 className="text-2xl font-bold text-gray-900">{t('forums.editBoard')}</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('forums.boardName')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('forums.description')}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!name.trim() || updateBoard.isPending}
            onClick={() => updateBoard.mutate()}
            className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {t('app.save')}
          </button>
          <Link
            to={`/projects/${identifier}/forums/${boardId}`}
            className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            {t('app.cancel')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ForumTopicList() {
  const { t } = useTranslation();
  const { identifier, boardId } = useParams<{ identifier: string; boardId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  const projectRes = useProject(identifier ?? '');
  const project = projectRes.data?.data ?? null;
  const projectId = project?.id ?? '';
  const boardsRaw = useBoards(projectId);
  const boards = useMemo(() => unwrapList<Board>(boardsRaw.data), [boardsRaw.data]);
  const board = boards.find((b) => b.id === boardId);
  const forumPerms = useForumPermissions(projectId);
  const { canAddMessages } = forumPerms;
  const canEditBoard = canUserEditOrDeleteBoard(board, currentUser, forumPerms);

  const topicsQuery = useBoardTopicsPage(projectId, boardId ?? '', page, 25);
  const topics = topicsQuery.data?.data ?? [];
  const pagination = topicsQuery.data?.pagination;

  const deleteBoard = useMutation({
    mutationFn: async () => {
      await api.delete(`/projects/${projectId}/boards/${boardId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boards', projectId] });
      navigate(`/projects/${identifier}/forums`);
    },
  });

  if (!identifier || !boardId) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(`/projects/${identifier}/forums`)}
        className="text-sm text-primary-700 hover:underline"
      >
        ← {t('forums.backToBoards')}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{board?.name ?? t('forums.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canEditBoard && (
            <Link
              to={`/projects/${identifier}/forums/${boardId}/edit`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Pencil className="h-4 w-4" aria-hidden />
              {t('app.edit')}
            </Link>
          )}
          {canEditBoard && (
            <button
              type="button"
              disabled={deleteBoard.isPending}
              onClick={() => {
                if (!window.confirm(t('forums.deleteBoardConfirm'))) return;
                deleteBoard.mutate();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {t('app.delete')}
            </button>
          )}
          {canAddMessages && (
            <Link
              to={`/projects/${identifier}/forums/${boardId}/topics/new`}
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            >
              {t('forums.newTopic')}
            </Link>
          )}
        </div>
      </div>
      {board?.description?.trim() ? (
        <aside className="rounded-xl border-2 border-primary-300/80 bg-gradient-to-br from-primary-50 via-white to-slate-50 px-5 py-4 shadow-md ring-1 ring-primary-100">
          <p className="text-xs font-bold uppercase tracking-wider text-primary-800">{t('forums.description')}</p>
          <div className="mt-2 text-base font-medium leading-relaxed text-slate-900 whitespace-pre-wrap">{board.description}</div>
        </aside>
      ) : null}

      {topicsQuery.isLoading ? (
        <p className="text-gray-500">{t('app.loading')}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('forums.subject')}</th>
                  <th className="px-4 py-3 font-medium">{t('issues.author')}</th>
                  <th className="px-4 py-3 font-medium w-24">{t('forums.replies')}</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">{t('forums.lastMessage')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topics.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`/projects/${identifier}/forums/${boardId}/topics/${m.id}`)}
                  >
                    <td className="px-4 py-2 font-medium text-primary-700">{m.subject}</td>
                    <td className="px-4 py-2">{authorLabel(m)}</td>
                    <td className="px-4 py-2">{m.replyCount ?? m._count?.replies ?? 0}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-600">
                      {m.updatedAt ? format(parseISO(m.updatedAt), 'yyyy-MM-dd HH:mm') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {topics.length === 0 && <p className="p-6 text-center text-gray-500">{t('app.noData')}</p>}
          </div>
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                {pagination.total} {t('forums.topics')} · {pagination.page} / {pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('page', String(page - 1));
                    setSearchParams(next);
                  }}
                  className="rounded border border-gray-300 px-3 py-1 disabled:opacity-50"
                >
                  {t('forums.prev')}
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    next.set('page', String(page + 1));
                    setSearchParams(next);
                  }}
                  className="rounded border border-gray-300 px-3 py-1 disabled:opacity-50"
                >
                  {t('forums.next')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ForumNewTopic() {
  const { t } = useTranslation();
  const { identifier, boardId } = useParams<{ identifier: string; boardId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const projectRes = useProject(identifier ?? '');
  const project = projectRes.data?.data ?? null;
  const projectId = project?.id ?? '';
  const { canAddMessages } = useForumPermissions(projectId);

  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');

  const createTopic = useMutation({
    mutationFn: async () => {
      await api.post(`/projects/${projectId}/boards/${boardId}/messages`, {
        subject: subject.trim(),
        content: content.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boardTopics', projectId, boardId] });
      navigate(`/projects/${identifier}/forums/${boardId}`);
    },
  });

  if (!identifier || !boardId || !projectId) return <p className="text-gray-500">{t('app.loading')}</p>;
  if (!canAddMessages) return <p className="text-gray-600">{t('forums.noPermissionMessage')}</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <button
        type="button"
        onClick={() => navigate(`/projects/${identifier}/forums/${boardId}`)}
        className="text-sm text-primary-700 hover:underline"
      >
        ← {t('forums.backToTopics')}
      </button>
      <h1 className="text-2xl font-bold text-gray-900">{t('forums.newTopic')}</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('forums.subject')}</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{t('issues.description')}</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={8}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!subject.trim() || createTopic.isPending}
            onClick={() => createTopic.mutate()}
            className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {t('app.create')}
          </button>
          <Link
            to={`/projects/${identifier}/forums/${boardId}`}
            className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            {t('app.cancel')}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ForumTopicShow() {
  const { t } = useTranslation();
  const { identifier, boardId, topicId } = useParams<{ identifier: string; boardId: string; topicId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const projectRes = useProject(identifier ?? '');
  const project = projectRes.data?.data ?? null;
  const projectId = project?.id ?? '';
  const { canAddMessages } = useForumPermissions(projectId);

  const messageQuery = useBoardMessage(projectId, boardId ?? '', topicId ?? '');
  const root = messageQuery.data?.data ?? null;

  const [replyBody, setReplyBody] = useState('');

  const replyMutation = useMutation({
    mutationFn: async (content: string) => {
      await api.post(`/projects/${projectId}/boards/${boardId}/messages/${topicId}/reply`, { content });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boardMessage', projectId, boardId, topicId] });
      qc.invalidateQueries({ queryKey: ['boardTopics', projectId, boardId] });
      setReplyBody('');
    },
  });

  const insertQuote = (text: string | null | undefined) => {
    if (!text) return;
    const lines = text.split('\n').map((l) => `> ${l}`);
    setReplyBody((b) => `${lines.join('\n')}\n\n${b}`);
  };

  if (!identifier || !boardId || !topicId) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => navigate(`/projects/${identifier}/forums/${boardId}`)}
        className="text-sm text-primary-700 hover:underline"
      >
        ← {t('forums.backToTopics')}
      </button>

      {messageQuery.isLoading ? (
        <p className="text-gray-500">{t('app.loading')}</p>
      ) : !root ? (
        <p className="text-gray-500">{t('app.error')}</p>
      ) : (
        <>
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            <div className="p-5">
              <h1 className="text-xl font-bold text-gray-900">{root.subject}</h1>
              <p className="text-xs text-gray-500 mt-1">
                {authorLabel(root)} · {root.createdAt ? format(parseISO(root.createdAt), 'yyyy-MM-dd HH:mm') : ''}
              </p>
              <div
                className="mt-4 text-sm text-gray-800 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(root.content ?? '') }}
              />
              <button
                type="button"
                onClick={() => insertQuote(root.content)}
                className="mt-3 text-xs text-primary-700 hover:underline"
              >
                {t('forums.quote')}
              </button>
            </div>
            {(root.replies ?? []).map((r) => (
              <div key={r.id} className="p-5 pl-8 bg-gray-50/50">
                <p className="text-xs text-gray-500">
                  {authorLabel(r)} · {r.createdAt ? format(parseISO(r.createdAt), 'yyyy-MM-dd HH:mm') : ''}
                </p>
                <div
                  className="mt-2 text-sm text-gray-800 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(r.content ?? '') }}
                />
                <button type="button" onClick={() => insertQuote(r.content)} className="mt-2 text-xs text-primary-700 hover:underline">
                  {t('forums.quote')}
                </button>
              </div>
            ))}
          </div>

          {canAddMessages && (
            <form
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              onSubmit={(e) => {
                e.preventDefault();
                if (!replyBody.trim()) return;
                replyMutation.mutate(replyBody.trim());
              }}
            >
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{t('forums.reply')}</h3>
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={5}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
              />
              <button
                type="submit"
                disabled={replyMutation.isPending}
                className="mt-2 rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {t('forums.reply')}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
