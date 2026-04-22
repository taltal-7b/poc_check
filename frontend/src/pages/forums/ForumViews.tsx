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
      return { canManageBoards: false, canManageProject: false, canAddMessages: false, canAddComments: false };
    }
    if (currentUser.admin) {
      return { canManageBoards: true, canManageProject: true, canAddMessages: true, canAddComments: true };
    }
    const me = (membersQuery.data?.data ?? []).find((m) => m.userId === currentUser.id);
    if (!me) return { canManageBoards: false, canManageProject: false, canAddMessages: false, canAddComments: false };
    const perms = new Set<string>();
    for (const mr of me.memberRoles ?? []) {
      for (const p of parsePermissions(mr.role?.permissions)) perms.add(p);
    }
    return {
      canManageBoards: perms.has('manage_boards'),
      canManageProject: perms.has('manage_project'),
      canAddMessages: perms.has('add_messages') || perms.has('manage_boards'),
      // 閲覧者(view_messages)にもコメント投稿を許可する。
      canAddComments: perms.has('view_messages') || perms.has('add_messages') || perms.has('manage_boards'),
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

function canUserEditOrDeleteTopic(
  message: Message,
  user: { id: string; admin: boolean } | null,
): boolean {
  if (!user) return false;
  if (user.admin) return true;
  return message.authorId === user.id;
}

function ForumTopicListTopicActions(props: {
  canEditTopic: boolean;
  editHref: string;
  deletePending: boolean;
  onDelete: () => void;
  alignEnd?: boolean;
  tEdit: string;
  tDelete: string;
}) {
  const { canEditTopic, editHref, deletePending, onDelete, alignEnd, tEdit, tDelete } = props;
  if (!canEditTopic) {
    return (
      <span className={`text-gray-400 ${alignEnd ? 'flex justify-end' : ''}`}>—</span>
    );
  }
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${alignEnd ? 'justify-end' : ''}`}>
      <Link
        to={editHref}
        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        {tEdit}
      </Link>
      <button
        type="button"
        disabled={deletePending}
        onClick={onDelete}
        className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        {tDelete}
      </button>
    </div>
  );
}

function buildTopicEditHref(basePath: string, params: URLSearchParams, from: 'list' | 'detail'): string {
  const qs = new URLSearchParams(params);
  qs.set('from', from);
  const query = qs.toString();
  return query ? `${basePath}?${query}` : basePath;
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

  const topicsQuery = useBoardTopicsPage(projectId, boardId ?? '', page, 10);
  const topics = topicsQuery.data?.data ?? [];
  const pagination = topicsQuery.data?.pagination;
  const canShowTopicActions = Boolean(
    currentUser && (currentUser.admin || topics.some((m) => m.authorId === currentUser.id)),
  );

  const deleteTopic = useMutation({
    mutationFn: async (topicId: string) => {
      await api.delete(`/projects/${projectId}/boards/${boardId}/messages/${topicId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boardTopics', projectId, boardId] });
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
        {canAddMessages && (
          <Link
            to={`/projects/${identifier}/forums/${boardId}/topics/new`}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            {t('forums.newTopic')}
          </Link>
        )}
      </div>
      {board?.description?.trim() ? (
        <aside className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm">
          <p className="font-medium text-gray-900">{t('forums.description')}</p>
          <div className="mt-1.5 leading-relaxed text-gray-900 whitespace-pre-wrap">{board.description}</div>
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
                  <th className="px-4 py-3 font-medium w-24 text-right">{t('forums.replyCount')}</th>
                  <th className="px-4 py-3 font-medium">{t('issues.author')}</th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap">{t('forums.lastUpdatedDate')}</th>
                  {canShowTopicActions && (
                    <th className="px-4 py-3 font-medium whitespace-nowrap w-40">{t('forums.actions')}</th>
                  )}
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
                    <td className="px-4 py-2 text-right tabular-nums">{m.replyCount ?? m._count?.replies ?? 0}</td>
                    <td className="px-4 py-2">{authorLabel(m)}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-gray-600">
                      {m.updatedAt ? format(parseISO(m.updatedAt), 'yyyy-MM-dd HH:mm') : '—'}
                    </td>
                    {canShowTopicActions && (
                      <td className="px-4 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <ForumTopicListTopicActions
                          canEditTopic={canUserEditOrDeleteTopic(m, currentUser)}
                          editHref={buildTopicEditHref(
                            `/projects/${identifier}/forums/${boardId}/topics/${m.id}/edit`,
                            searchParams,
                            'list',
                          )}
                          deletePending={deleteTopic.isPending}
                          onDelete={() => {
                            if (!window.confirm(t('forums.deleteTopicConfirm'))) return;
                            deleteTopic.mutate(m.id);
                          }}
                          alignEnd
                          tEdit={t('app.edit')}
                          tDelete={t('app.delete')}
                        />
                      </td>
                    )}
                  </tr>
                ))}
                {topics.length === 0 && (
                  <tr>
                    <td colSpan={canShowTopicActions ? 5 : 4} className="px-4 py-8 text-center text-gray-500">
                      {t('app.noData')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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

export function ForumEditTopic() {
  const { t } = useTranslation();
  const { identifier, boardId, topicId } = useParams<{ identifier: string; boardId: string; topicId: string }>();
  const navigate = useNavigate();
  const [editSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const projectRes = useProject(identifier ?? '');
  const project = projectRes.data?.data ?? null;
  const projectId = project?.id ?? '';

  const messageQuery = useBoardMessage(projectId, boardId ?? '', topicId ?? '');
  const root = messageQuery.data?.data ?? null;

  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!root) return;
    setSubject(root.subject ?? '');
    setContent(root.content ?? '');
  }, [root?.id, root?.subject, root?.content]);

  const canEditTopic = !!(root && currentUser && (currentUser.admin || root.authorId === currentUser.id));
  const from = editSearchParams.get('from');
  const backParams = new URLSearchParams(editSearchParams);
  backParams.delete('from');
  const backQuery = backParams.toString();
  const cancelTo =
    from === 'list'
      ? `/projects/${identifier}/forums/${boardId}${backQuery ? `?${backQuery}` : ''}`
      : `/projects/${identifier}/forums/${boardId}/topics/${topicId}`;

  const updateTopic = useMutation({
    mutationFn: async () => {
      await api.put(`/projects/${projectId}/boards/${boardId}/messages/${topicId}`, {
        subject: subject.trim(),
        content: content.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boardMessage', projectId, boardId, topicId] });
      qc.invalidateQueries({ queryKey: ['boardTopics', projectId, boardId] });
      navigate(`/projects/${identifier}/forums/${boardId}/topics/${topicId}`);
    },
  });

  if (!identifier || !boardId || !topicId || !projectId) return <p className="text-gray-500">{t('app.loading')}</p>;
  if (messageQuery.isLoading) return <p className="text-gray-500">{t('app.loading')}</p>;
  if (!root) return <p className="text-gray-500">{t('app.error')}</p>;
  if (!canEditTopic) return <p className="text-gray-600">{t('forums.noPermissionEditTopic')}</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <button
        type="button"
        onClick={() => navigate(`/projects/${identifier}/forums/${boardId}/topics/${topicId}`)}
        className="text-sm text-primary-700 hover:underline"
      >
        ← {t('forums.backToTopics')}
      </button>
      <h1 className="text-2xl font-bold text-gray-900">{t('forums.editTopic')}</h1>
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
            disabled={!subject.trim() || updateTopic.isPending}
            onClick={() => updateTopic.mutate()}
            className="rounded bg-primary-600 px-4 py-2 text-sm text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {t('app.save')}
          </button>
          <Link
            to={cancelTo}
            className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
          >
            {t('app.cancel')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ForumTopicReplyThread({
  replies,
  replyParentId,
  onSelectReplyParent,
  onCancelReply,
  replyDraft,
  onChangeReplyDraft,
  onSubmitReply,
  replying,
  canAddComments,
  currentUserId,
  editingCommentId,
  editingDraft,
  onStartEditComment,
  onChangeEditingDraft,
  onCancelEditComment,
  onSaveEditComment,
  onDeleteComment,
  deletingCommentId,
  savingCommentId,
  depth = 0,
}: {
  replies: Message[];
  replyParentId: string | null;
  onSelectReplyParent: (id: string) => void;
  onCancelReply: () => void;
  replyDraft: string;
  onChangeReplyDraft: (value: string) => void;
  onSubmitReply: () => void;
  replying: boolean;
  canAddComments: boolean;
  currentUserId?: string;
  editingCommentId: string | null;
  editingDraft: string;
  onStartEditComment: (comment: Message) => void;
  onChangeEditingDraft: (value: string) => void;
  onCancelEditComment: () => void;
  onSaveEditComment: () => void;
  onDeleteComment: (comment: Message) => void;
  deletingCommentId: string | null;
  savingCommentId: string | null;
  depth?: number;
}) {
  const { t } = useTranslation();
  if (!replies.length) return null;
  return (
    <ul className={depth === 0 ? 'space-y-3' : 'mt-2 space-y-3 border-l-2 border-gray-100 pl-3'}>
      {replies.map((r) => {
        const showReplyComposer = replyParentId === r.id;
        const isOwnComment = Boolean(currentUserId && r.authorId === currentUserId);
        const isEditing = editingCommentId === r.id;
        const rowDeleting = deletingCommentId === r.id;
        const rowSaving = savingCommentId === r.id;
        return (
          <li key={r.id} className={`rounded border border-gray-200 bg-white px-4 py-3 ${showReplyComposer ? 'ring-2 ring-primary-300' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-gray-500">
                {authorLabel(r)} · {r.createdAt ? format(parseISO(r.createdAt), 'yyyy-MM-dd HH:mm') : ''}
              </span>
              <div className="flex items-center gap-3">
                {canAddComments && (
                  <button
                    type="button"
                    onClick={() => onSelectReplyParent(r.id)}
                    className="text-xs text-primary-700 hover:underline"
                  >
                    {t('forums.reply')}
                  </button>
                )}
                {isOwnComment && (
                  <>
                    <button
                      type="button"
                      disabled={rowSaving || rowDeleting}
                      onClick={() => onStartEditComment(r)}
                      className="text-xs text-slate-700 hover:underline disabled:opacity-50"
                    >
                      {t('app.edit')}
                    </button>
                    <button
                      type="button"
                      disabled={rowSaving || rowDeleting}
                      onClick={() => onDeleteComment(r)}
                      className="text-xs text-red-700 hover:underline disabled:opacity-50"
                    >
                      {t('app.delete')}
                    </button>
                  </>
                )}
              </div>
            </div>
            {isEditing ? (
              <div className="mt-2 space-y-2">
                <textarea
                  value={editingDraft}
                  onChange={(e) => onChangeEditingDraft(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={rowSaving || !editingDraft.trim()}
                    onClick={onSaveEditComment}
                    className="rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {t('app.save')}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelEditComment}
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
                  >
                    {t('app.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="mt-2 text-sm text-gray-800 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(r.content ?? '') }}
              />
            )}

            {showReplyComposer && canAddComments && (
              <div className="mt-3 rounded border border-primary-200 bg-primary-50/40 p-3">
                <textarea
                  value={replyDraft}
                  onChange={(e) => onChangeReplyDraft(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder={t('forums.reply')}
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={replying || !replyDraft.trim()}
                    onClick={onSubmitReply}
                    className="rounded bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {t('forums.reply')}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelReply}
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
                  >
                    {t('app.cancel')}
                  </button>
                </div>
              </div>
            )}

            <ForumTopicReplyThread
              replies={r.replies ?? []}
              replyParentId={replyParentId}
              onSelectReplyParent={onSelectReplyParent}
              onCancelReply={onCancelReply}
              replyDraft={replyDraft}
              onChangeReplyDraft={onChangeReplyDraft}
              onSubmitReply={onSubmitReply}
              replying={replying}
              canAddComments={canAddComments}
              currentUserId={currentUserId}
              editingCommentId={editingCommentId}
              editingDraft={editingDraft}
              onStartEditComment={onStartEditComment}
              onChangeEditingDraft={onChangeEditingDraft}
              onCancelEditComment={onCancelEditComment}
              onSaveEditComment={onSaveEditComment}
              onDeleteComment={onDeleteComment}
              deletingCommentId={deletingCommentId}
              savingCommentId={savingCommentId}
              depth={depth + 1}
            />
          </li>
        );
      })}
    </ul>
  );
}

export function ForumTopicShow() {
  const { t } = useTranslation();
  const { identifier, boardId, topicId } = useParams<{ identifier: string; boardId: string; topicId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const projectRes = useProject(identifier ?? '');
  const project = projectRes.data?.data ?? null;
  const projectId = project?.id ?? '';
  const { canAddComments } = useForumPermissions(projectId);

  const messageQuery = useBoardMessage(projectId, boardId ?? '', topicId ?? '');
  const root = messageQuery.data?.data ?? null;
  const canEditTopic = !!(root && currentUser && (currentUser.admin || root.authorId === currentUser.id));

  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentDraft, setEditingCommentDraft] = useState('');

  const replyMutation = useMutation({
    mutationFn: async ({ content, parentId }: { content: string; parentId: string }) => {
      await api.post(`/projects/${projectId}/boards/${boardId}/messages/${parentId}/reply`, { content });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boardMessage', projectId, boardId, topicId] });
      qc.invalidateQueries({ queryKey: ['boardTopics', projectId, boardId] });
      setReplyDraft('');
      setReplyParentId(null);
    },
  });

  const editCommentMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      await api.put(`/projects/${projectId}/boards/${boardId}/messages/${commentId}`, { content });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boardMessage', projectId, boardId, topicId] });
      qc.invalidateQueries({ queryKey: ['boardTopics', projectId, boardId] });
      setEditingCommentId(null);
      setEditingCommentDraft('');
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      await api.delete(`/projects/${projectId}/boards/${boardId}/messages/${commentId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boardMessage', projectId, boardId, topicId] });
      qc.invalidateQueries({ queryKey: ['boardTopics', projectId, boardId] });
    },
  });

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
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-xl font-bold text-gray-900">{root.subject}</h1>
                {canEditTopic && (
                  <Link
                    to={buildTopicEditHref(
                      `/projects/${identifier}/forums/${boardId}/topics/${topicId}/edit`,
                      new URLSearchParams(),
                      'detail',
                    )}
                    className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    {t('app.edit')}
                  </Link>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {authorLabel(root)} · {root.createdAt ? format(parseISO(root.createdAt), 'yyyy-MM-dd HH:mm') : ''}
              </p>
            </div>
            <div className="p-5 bg-gray-50/50">
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700">説明</h3>
                <div
                  className="text-sm text-gray-800 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(root.content ?? '') }}
                />
              </section>
              <section className="mt-4 border-t border-gray-200 pt-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-700">コメント</h3>
                <ForumTopicReplyThread
                  replies={root.replies ?? []}
                  replyParentId={replyParentId}
                  onSelectReplyParent={setReplyParentId}
                  onCancelReply={() => {
                    setReplyParentId(null);
                    setReplyDraft('');
                  }}
                  replyDraft={replyDraft}
                  onChangeReplyDraft={setReplyDraft}
                  onSubmitReply={() => {
                    if (!replyParentId || !replyDraft.trim()) return;
                    replyMutation.mutate({ parentId: replyParentId, content: replyDraft.trim() });
                  }}
                  replying={replyMutation.isPending}
                  canAddComments={canAddComments}
                  currentUserId={currentUser?.id}
                  editingCommentId={editingCommentId}
                  editingDraft={editingCommentDraft}
                  onStartEditComment={(comment) => {
                    setEditingCommentId(comment.id);
                    setEditingCommentDraft(comment.content ?? '');
                  }}
                  onChangeEditingDraft={setEditingCommentDraft}
                  onCancelEditComment={() => {
                    setEditingCommentId(null);
                    setEditingCommentDraft('');
                  }}
                  onSaveEditComment={() => {
                    if (!editingCommentId || !editingCommentDraft.trim()) return;
                    editCommentMutation.mutate({
                      commentId: editingCommentId,
                      content: editingCommentDraft.trim(),
                    });
                  }}
                  onDeleteComment={(comment) => {
                    if (!window.confirm(t('forums.deleteCommentConfirm'))) return;
                    deleteCommentMutation.mutate(comment.id);
                  }}
                  deletingCommentId={deleteCommentMutation.isPending ? (deleteCommentMutation.variables ?? null) : null}
                  savingCommentId={editCommentMutation.isPending ? (editCommentMutation.variables?.commentId ?? null) : null}
                />
              </section>
            </div>
          </div>

          {canAddComments && !replyParentId && (
            <form
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              onSubmit={(e) => {
                e.preventDefault();
                if (!replyDraft.trim()) return;
                replyMutation.mutate({ parentId: topicId, content: replyDraft.trim() });
              }}
            >
              <h3 className="text-sm font-semibold text-gray-700 mb-2">コメント</h3>
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
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
