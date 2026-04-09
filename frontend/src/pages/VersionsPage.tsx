import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronRight, Flag } from 'lucide-react';
import { useProject, useVersions, useProjectIssues } from '../api/hooks';
import api from '../api/client';
import type { Version, Issue } from '../types';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

function statusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s.includes('close')) return 'bg-gray-200 text-gray-800';
  if (s.includes('lock')) return 'bg-amber-100 text-amber-900';
  return 'bg-emerald-100 text-emerald-900';
}

export default function VersionsPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const qc = useQueryClient();

  const { data: projectRaw } = useProject(identifier ?? '');
  const project =
    projectRaw && typeof projectRaw === 'object' && 'id' in projectRaw ? (projectRaw as { id: string }) : null;
  const projectId = project?.id ?? '';

  const versionsRaw = useVersions(projectId);
  const versions = useMemo(() => unwrapList<Version>(versionsRaw.data), [versionsRaw.data]);

  const issuesRaw = useProjectIssues(projectId);
  const allIssues = useMemo(() => unwrapList<Issue>(issuesRaw.data), [issuesRaw.data]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const byVersion = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const v of versions) map.set(v.id, []);
    for (const i of allIssues) {
      if (i.versionId && map.has(i.versionId)) map.get(i.versionId)!.push(i);
    }
    return map;
  }, [versions, allIssues]);

  const closeVersion = useMutation({
    mutationFn: async (versionId: string) => {
      await api.put(`/projects/${projectId}/versions/${versionId}`, { status: 'closed' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['versions', projectId] }),
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!identifier) return <p className="text-gray-500">{t('app.noData')}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Flag size={26} />
        {t('versions.roadmap')}
      </h1>

      <ul className="space-y-3">
        {versions.map((v) => {
          const issues = byVersion.get(v.id) ?? [];
          const done = issues.filter((i) => i.doneRatio >= 100 || i.status?.isClosed).length;
          const total = issues.length;
          const pct = total ? Math.round((done / total) * 100) : 0;
          const isOpen = expanded.has(v.id);

          return (
            <li key={v.id} className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={() => toggle(v.id)} className="flex items-center gap-2 text-left min-w-0 flex-1">
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <span className="font-semibold text-gray-900 truncate">{v.name}</span>
                </button>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {v.dueDate && (
                    <span className="text-gray-600">{format(parseISO(v.dueDate), 'yyyy-MM-dd')}</span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(v.status)}`}>
                    {v.status}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {done}/{total} {t('issues.doneRatio')}
                  </span>
                </div>
                <div className="w-full sm:w-48 shrink-0">
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full bg-primary-600 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={closeVersion.isPending}
                  onClick={() => closeVersion.mutate(v.id)}
                  className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('versions.status.closed')}
                </button>
              </div>
              {isOpen && (
                <ul className="border-t border-gray-100 bg-gray-50/80 divide-y divide-gray-100">
                  {issues.length === 0 ? (
                    <li className="px-4 py-3 text-sm text-gray-500">{t('app.noData')}</li>
                  ) : (
                    issues.map((i) => (
                      <li key={i.id} className="px-4 py-2 text-sm">
                        <Link to={`/projects/${identifier}/issues/${i.id}`} className="text-primary-700 hover:underline">
                          #{i.id.slice(0, 8)} — {i.subject}
                        </Link>
                        <span className="ml-2 text-gray-500">{i.doneRatio}%</span>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {versions.length === 0 && <p className="text-gray-500">{t('app.noData')}</p>}
    </div>
  );
}
