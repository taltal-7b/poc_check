import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { MessageSquare, MessagesSquare } from 'lucide-react';
import { useProject, useBoards, useBoardMessages } from '../api/hooks';
import api from '../api/client';
import type { Board, Message } from '../types';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

function authorLabel(m: Message) {
  const u = m.author;
  return u ? `${u.firstname} ${u.lastname}`.trim() || u.login : m.authorId;
}

export default function ForumsPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const qc = useQueryClient();

  const { data: projectRaw } = useProject(identifier ?? '');
  const project =
    projectRaw && typeof projectRaw === 'object' && 'id' in projectRaw ? (projectRaw as { id: string }) : null;
  const projectId = project?.id ?? '';

  const boardsRaw = useBoards(projectId);
  const boards = useMemo(() => unwrapList<Board>(boardsRaw.data), [boardsRaw.data]);

  const [boardId, setBoardId] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);

  const messagesRaw = useBoardMessages(projectId, boardId ?? '');
  const messages = useMemo(() => unwrapList<Message>(messagesRaw.data), [messagesRaw.data]);

  const topics = useMemo(() => messages.filter((m) => !m.parentId), [messages]);
  const selectedTopic = useMemo(() => topics.find((m) => m.id === topicId), [topics, topicId]);

  const threadReplies = useMemo(() => {
    if (!topicId) return [];
    return messages.filter((m) => m.parentId === topicId);
  }, [messages, topicId]);

  const [replyBody, setReplyBody] = useState('');

  const replyMutation = useMutation({
    mutationFn: async (body: { content: string; parentId: string | null }) => {
      if (!boardId) return;
      await api.post(`/projects/${projectId}/boards/${boardId}/messages`, {
        subject: selectedTopic?.subject ? `Re: ${selectedTopic.subject}` : 'Reply',
        content: body.content,
        parentId: body.parentId,
      });
    },
    onSuccess: () => {
      if (boardId) qc.invalidateQueries({ queryKey: ['messages', boardId] });
      setReplyBody('');
    },
  });

  const insertQuote = (content: string | null) => {
    if (!content) return;
    const lines = content.split('\n').map((l) => `> ${l}`);
    setReplyBody((b) => `${lines.join('\n')}\n\n${b}`);
  };

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <MessagesSquare size={26} />
        {t('forums.title')}
      </h1>

      {!boardId ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                setBoardId(b.id);
                setTopicId(null);
              }}
              className="rounded-lg border border-gray-200 bg-white p-5 text-left shadow-sm hover:border-primary-400 transition"
            >
              <h2 className="font-semibold text-gray-900">{b.name}</h2>
              {b.description && <p className="mt-1 text-sm text-gray-600 line-clamp-2">{b.description}</p>}
              <p className="mt-3 text-xs text-gray-500">
                <MessageSquare size={14} className="inline mr-1" />
                {(b as Board & { _count?: { messages?: number } })._count?.messages ?? '—'} topics
              </p>
            </button>
          ))}
          {boards.length === 0 && <p className="text-gray-500 col-span-full">{t('app.noData')}</p>}
        </div>
      ) : !topicId ? (
        <div>
          <button type="button" onClick={() => setBoardId(null)} className="mb-4 text-sm text-primary-700 hover:underline">
            ← {t('app.back')}
          </button>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">{t('issues.author')}</th>
                  <th className="px-4 py-3 font-medium">Replies</th>
                  <th className="px-4 py-3 font-medium">Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topics.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setTopicId(m.id)}>
                    <td className="px-4 py-2 font-medium text-primary-700">{m.subject}</td>
                    <td className="px-4 py-2">{authorLabel(m)}</td>
                    <td className="px-4 py-2">{m._count?.replies ?? m.replies?.length ?? 0}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{m.createdAt ? format(parseISO(m.createdAt), 'yyyy-MM-dd HH:mm') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {topics.length === 0 && <p className="p-6 text-center text-gray-500">{t('app.noData')}</p>}
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setTopicId(null)}
            className="mb-4 text-sm text-primary-700 hover:underline"
          >
            ← {t('app.back')}
          </button>
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
            {selectedTopic && (
              <div className="p-5">
                <h2 className="text-xl font-bold text-gray-900">{selectedTopic.subject}</h2>
                <p className="text-xs text-gray-500 mt-1">
                  {authorLabel(selectedTopic)} · {selectedTopic.createdAt ? format(parseISO(selectedTopic.createdAt), 'yyyy-MM-dd HH:mm') : ''}
                </p>
                <div className="mt-4 text-sm text-gray-800 whitespace-pre-wrap">{selectedTopic.content}</div>
                <button
                  type="button"
                  onClick={() => insertQuote(selectedTopic.content)}
                  className="mt-3 text-xs text-primary-700 hover:underline"
                >
                  {t('forums.quote')}
                </button>
              </div>
            )}
            {threadReplies.map((r) => (
              <div key={r.id} className="p-5 pl-8 bg-gray-50/50">
                <p className="text-xs text-gray-500">
                  {authorLabel(r)} · {r.createdAt ? format(parseISO(r.createdAt), 'yyyy-MM-dd HH:mm') : ''}
                </p>
                <div className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{r.content}</div>
                <button type="button" onClick={() => insertQuote(r.content)} className="mt-2 text-xs text-primary-700 hover:underline">
                  {t('forums.quote')}
                </button>
              </div>
            ))}
          </div>

          <form
            className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (!replyBody.trim()) return;
              replyMutation.mutate({ content: replyBody.trim(), parentId: topicId });
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
        </div>
      )}
    </div>
  );
}
