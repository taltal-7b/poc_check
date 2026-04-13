import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useProjects, useDeleteProject } from '../api/hooks';
import { useAuthStore } from '../stores/auth';
import type { Project } from '../types';

type Tab = 'active' | 'archived' | 'closed' | 'all';

const STATUS_ACTIVE = 1;
const STATUS_ARCHIVED = 2;
const STATUS_CLOSED = 3;

function statusLabel(t: (k: string) => string, status: number) {
  if (status === STATUS_ARCHIVED) return t('projects.status.archived');
  if (status === STATUS_CLOSED) return t('projects.status.closed');
  return t('projects.status.active');
}

function statusBadgeClass(status: number) {
  if (status === STATUS_ARCHIVED) return 'bg-amber-100 text-amber-800 ring-amber-600/20';
  if (status === STATUS_CLOSED) return 'bg-slate-200 text-slate-700 ring-slate-600/10';
  return 'bg-emerald-100 text-emerald-800 ring-emerald-600/20';
}

export default function ProjectsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.user?.admin);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [tab, setTab] = useState<Tab>('active');
  const [deleteMenuOpen, setDeleteMenuOpen] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const deleteMutation = useDeleteProject();

  const params = useMemo(() => {
    if (tab === 'all') return undefined;
    if (tab === 'active') return { status: STATUS_ACTIVE };
    if (tab === 'archived') return { status: STATUS_ARCHIVED };
    return { status: STATUS_CLOSED };
  }, [tab]);

  const { data, isLoading, isError } = useProjects(params);

  const projects: Project[] = data?.data ?? [];

  const canManageProject = (project: Project): boolean => {
    if (isAdmin) return true;
    if (!user) return false;
    return project.createdByUserId === user.id;
  };

  const handleDelete = async (projectId: string) => {
    if (!deleteConfirm) return;
    await deleteMutation.mutateAsync(projectId);
    setDeleteConfirm(null);
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'active', label: t('projects.status.active') },
    { key: 'archived', label: t('projects.status.archived') },
    { key: 'closed', label: t('projects.status.closed') },
    { key: 'all', label: t('search.scope.all') },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{t('projects.title')}</h1>
        {isAuthenticated && (
          <Link
            to="/projects/new"
            className="inline-flex justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-primary-700"
          >
            {t('projects.new')}
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              tab === key
                ? 'bg-primary-600 text-white shadow'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-slate-500">{t('app.loading')}</p>}
      {isError && <p className="text-red-600">{t('app.error')}</p>}

      {!isLoading && !isError && projects.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">{t('app.noData')}</p>
      )}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <li key={p.id} className="relative">
            <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={`/projects/${p.identifier}`}
                  className="flex-1 hover:text-primary-600"
                >
                  <h2 className="text-lg font-semibold text-slate-900">{p.name}</h2>
                </Link>
                <span
                  className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(p.status)}`}
                >
                  {statusLabel(t, p.status)}
                </span>
              </div>
              <p className="mt-1 font-mono text-xs text-slate-500">{p.identifier}</p>
              {p.description && <p className="mt-3 line-clamp-3 flex-1 text-sm text-slate-600">{p.description}</p>}

              {/* 権限がある場合のみボタンを表示 */}
              {canManageProject(p) && (
                <div className="mt-4 flex gap-2 border-t border-slate-200 pt-3">
                  <Link
                    to={`/projects/${p.identifier}/edit`}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-4 w-4" />
                    {t('app.edit')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      if (deleteConfirm === p.id) {
                        handleDelete(p.id);
                      } else {
                        setDeleteConfirm(p.id);
                      }
                    }}
                    className={`inline-flex items-center justify-center rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                      deleteConfirm === p.id
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}

              {/* 削除確認 */}
              {deleteConfirm === p.id && (
                <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm">
                  <p className="font-medium text-red-900">本当に削除しますか？</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id)}
                      disabled={deleteMutation.isPending}
                      className="flex-1 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? '削除中...' : '削除'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(null)}
                      className="flex-1 rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
