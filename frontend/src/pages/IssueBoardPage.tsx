import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import ProjectSubNav from '../components/ProjectSubNav';
import { useAllProjectIssues, useProject, useStatuses, useUpdateIssue } from '../api/hooks';
import { useAuthStore } from '../stores/auth';
import type { Issue, IssueStatus } from '../types';

const priorityClass: Record<number, string> = {
  1: 'bg-slate-100 text-slate-600',
  2: 'bg-sky-100 text-sky-700',
  3: 'bg-amber-100 text-amber-800',
  4: 'bg-orange-100 text-orange-800',
  5: 'bg-red-100 text-red-700',
};

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

function shortDate(value: string | null | undefined) {
  if (!value) return null;
  try {
    return format(parseISO(value), 'M/d');
  } catch {
    return null;
  }
}

function userName(issue: Issue) {
  if (!issue.assignee) return '未担当';
  return `${issue.assignee.lastname ?? ''} ${issue.assignee.firstname ?? ''}`.trim() || issue.assignee.login;
}

export default function IssueBoardPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const projectId = identifier ?? '';
  const currentUser = useAuthStore((s) => s.user);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const autoScrollSpeedRef = useRef(0);
  const [dragIssueId, setDragIssueId] = useState<string | null>(null);
  const [dropStatusId, setDropStatusId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const projectQuery = useProject(projectId, {
    enabled: !!projectId && !!currentUser?.id,
    cacheScope: currentUser?.id ?? 'signed-out',
  });
  const issuesQuery = useAllProjectIssues(projectId, { sort: 'updatedAt', order: 'desc' }, { enabled: !!projectId });
  const statusesQuery = useStatuses();
  const updateIssue = useUpdateIssue();

  const project = projectQuery.data?.data;
  const canMoveIssues = Boolean(project?.permissions?.canEditIssue || currentUser?.admin);
  const statuses = useMemo(
    () => unwrapList<IssueStatus>(statusesQuery.data).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'ja')),
    [statusesQuery.data],
  );
  const issues = useMemo(
    () => unwrapList<Issue>(issuesQuery.data).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [issuesQuery.data],
  );
  const issuesByStatus = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of issues) {
      const list = map.get(issue.statusId) ?? [];
      list.push(issue);
      map.set(issue.statusId, list);
    }
    return map;
  }, [issues]);

  const moveIssue = async (issueId: string, statusId: string) => {
    const issue = issues.find((item) => item.id === issueId);
    if (!issue || issue.statusId === statusId || !canMoveIssues) return;
    setMessage(null);
    setDropStatusId(statusId);
    try {
      await updateIssue.mutateAsync({ id: issue.id, statusId });
    } catch (error: any) {
      setMessage(error?.response?.data?.error?.message || 'ステータスの更新に失敗しました');
    } finally {
      setDropStatusId(null);
      setDragIssueId(null);
    }
  };

  const stopAutoScroll = useCallback(() => {
    autoScrollSpeedRef.current = 0;
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }, []);

  const startAutoScroll = useCallback((speed: number) => {
    autoScrollSpeedRef.current = speed;
    if (speed === 0) {
      stopAutoScroll();
      return;
    }
    if (autoScrollFrameRef.current !== null) return;

    const tick = () => {
      const board = boardRef.current;
      if (!board || autoScrollSpeedRef.current === 0) {
        autoScrollFrameRef.current = null;
        return;
      }
      board.scrollLeft += autoScrollSpeedRef.current;
      autoScrollFrameRef.current = window.requestAnimationFrame(tick);
    };

    autoScrollFrameRef.current = window.requestAnimationFrame(tick);
  }, [stopAutoScroll]);

  const updateAutoScroll = useCallback((clientX: number) => {
    const board = boardRef.current;
    if (!board || !dragIssueId) {
      stopAutoScroll();
      return;
    }

    const rect = board.getBoundingClientRect();
    const edgeSize = 96;
    const maxSpeed = 24;
    const leftDistance = clientX - rect.left;
    const rightDistance = rect.right - clientX;

    if (leftDistance >= 0 && leftDistance < edgeSize) {
      startAutoScroll(-Math.ceil(((edgeSize - leftDistance) / edgeSize) * maxSpeed));
      return;
    }
    if (rightDistance >= 0 && rightDistance < edgeSize) {
      startAutoScroll(Math.ceil(((edgeSize - rightDistance) / edgeSize) * maxSpeed));
      return;
    }
    stopAutoScroll();
  }, [dragIssueId, startAutoScroll, stopAutoScroll]);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const isLoading = projectQuery.isLoading || issuesQuery.isLoading || statusesQuery.isLoading;
  const isError = projectQuery.isError || issuesQuery.isError || statusesQuery.isError;

  return (
    <div className="space-y-6">
      {projectId && <ProjectSubNav identifier={projectId} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">チケットボード</h1>
          {project && <p className="mt-1 text-sm text-slate-500">{project.name}</p>}
        </div>
        {!canMoveIssues && !isLoading && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">閲覧のみ</span>
        )}
      </div>

      {message && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>}
      {isLoading && <p className="text-slate-500">読み込み中...</p>}
      {isError && <p className="text-red-600">読み込みに失敗しました</p>}

      {!isLoading && !isError && (
        <div
          ref={boardRef}
          onDragOver={(event) => updateAutoScroll(event.clientX)}
          onDragLeave={stopAutoScroll}
          className="flex gap-4 overflow-x-auto pb-3"
        >
          {statuses.map((status) => {
            const columnIssues = issuesByStatus.get(status.id) ?? [];
            const isDropTarget = dragIssueId && dropStatusId === status.id;
            return (
              <section
                key={status.id}
                onDragOver={(event) => {
                  if (!canMoveIssues) return;
                  event.preventDefault();
                  updateAutoScroll(event.clientX);
                  setDropStatusId((current) => (current === status.id ? current : status.id));
                }}
                onDragLeave={() => setDropStatusId((current) => (current === status.id ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  stopAutoScroll();
                  if (dragIssueId) void moveIssue(dragIssueId, status.id);
                }}
                className={`w-80 shrink-0 rounded-lg border bg-slate-50 ${
                  isDropTarget ? 'border-primary-400 ring-2 ring-primary-100' : 'border-slate-200'
                }`}
              >
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-t-lg border-b border-slate-200 bg-white px-3 py-2">
                  <h2 className="truncate text-sm font-semibold text-slate-800">{status.name}</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{columnIssues.length}</span>
                </div>
                <ul className="space-y-2 p-3">
                  {columnIssues.map((issue) => (
                    <li
                      key={issue.id}
                      draggable={canMoveIssues}
                      onDragStart={() => setDragIssueId(issue.id)}
                      onDragEnd={() => {
                        stopAutoScroll();
                        setDragIssueId(null);
                        setDropStatusId(null);
                      }}
                      className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition ${
                        canMoveIssues ? 'cursor-grab active:cursor-grabbing' : ''
                      } ${dragIssueId === issue.id ? 'opacity-60' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link to={`/projects/${projectId}/issues/${issue.id}`} className="text-sm font-semibold text-primary-700 hover:underline">
                          #{issue.number} {issue.subject}
                        </Link>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${priorityClass[issue.priority] ?? priorityClass[2]}`}>
                          {t(`issues.priorities.${issue.priority}` as const)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>{issue.tracker?.name ?? '-'}</span>
                        <span>{userName(issue)}</span>
                        {shortDate(issue.dueDate) && <span>期日 {shortDate(issue.dueDate)}</span>}
                      </div>
                    </li>
                  ))}
                  {columnIssues.length === 0 && (
                    <li className="rounded-lg border border-dashed border-slate-300 bg-white/60 px-3 py-6 text-center text-sm text-slate-400">
                      チケットなし
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
