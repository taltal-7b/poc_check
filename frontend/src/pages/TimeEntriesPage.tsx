import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { format, parseISO } from 'date-fns';
import {
  useProject,
  useTimeEntries,
  useCreateTimeEntry,
  useEnumerations,
} from '../api/hooks';
import type { TimeEntry } from '../types';

function unwrapList<T>(raw: unknown): T[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as T[];
  if (typeof raw === 'object' && raw !== null && 'data' in raw && Array.isArray((raw as { data: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

export default function TimeEntriesPage() {
  const { t } = useTranslation();
  const { identifier } = useParams<{ identifier: string }>();
  const { data: projectRaw } = useProject(identifier ?? '');
  const project =
    projectRaw && typeof projectRaw === 'object' && 'id' in projectRaw
      ? (projectRaw as { id: string })
      : null;

  const today = format(new Date(), 'yyyy-MM-dd');
  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [modalOpen, setModalOpen] = useState(false);

  const params = useMemo(
    () =>
      project
        ? {
            project_id: project.id,
            from,
            to,
          }
        : undefined,
    [project, from, to],
  );

  const { data: entriesRaw, isLoading } = useTimeEntries(params);
  const entries = useMemo(() => unwrapList<TimeEntry>(entriesRaw), [entriesRaw]);

  const { data: activitiesRaw } = useEnumerations('TimeEntryActivity');
  const activities = useMemo(() => unwrapList<{ id: string; name: string }>(activitiesRaw), [activitiesRaw]);

  const createEntry = useCreateTimeEntry();

  const totalHours = useMemo(() => entries.reduce((s, e) => s + (Number(e.hours) || 0), 0), [entries]);

  const [form, setForm] = useState({
    hours: '',
    activityId: '',
    spentOn: today,
    comments: '',
    issueId: '',
  });

  const submitLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    const hours = parseFloat(form.hours);
    if (!form.activityId || Number.isNaN(hours)) return;
    await createEntry.mutateAsync({
      projectId: project.id,
      activityId: form.activityId,
      hours,
      spentOn: form.spentOn,
      comments: form.comments || null,
      issueId: form.issueId.trim() || null,
    });
    setModalOpen(false);
    setForm({ hours: '', activityId: '', spentOn: today, comments: '', issueId: '' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('timeEntries.title')}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {t('timeEntries.report')}: <span className="font-semibold text-primary-700">{totalHours.toFixed(2)}</span>{' '}
            {t('timeEntries.hours')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          {t('timeEntries.new')}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">{t('issues.startDate')}</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">{t('issues.dueDate')}</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-gray-300 px-2 py-1.5 text-sm" />
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-3 font-medium">{t('timeEntries.spentOn')}</th>
              <th className="px-4 py-3 font-medium">{t('issues.author')}</th>
              <th className="px-4 py-3 font-medium">{t('timeEntries.activity')}</th>
              <th className="px-4 py-3 font-medium">Issue #</th>
              <th className="px-4 py-3 font-medium">{t('timeEntries.hours')}</th>
              <th className="px-4 py-3 font-medium">{t('timeEntries.comment')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {t('app.loading')}
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {t('app.noData')}
                </td>
              </tr>
            ) : (
              entries.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {row.spentOn ? format(parseISO(row.spentOn), 'yyyy-MM-dd') : '—'}
                  </td>
                  <td className="px-4 py-2">
                    {row.user ? `${row.user.firstname} ${row.user.lastname}`.trim() || row.user.login : row.userId}
                  </td>
                  <td className="px-4 py-2">{row.activity?.name ?? row.activityId}</td>
                  <td className="px-4 py-2 font-mono text-xs">{row.issueId ?? '—'}</td>
                  <td className="px-4 py-2">{row.hours}</td>
                  <td className="px-4 py-2 text-gray-600 max-w-xs truncate" title={row.comments ?? ''}>
                    {row.comments ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('timeEntries.new')}</DialogTitle>
            <form onSubmit={submitLog} className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-gray-700">{t('timeEntries.hours')} *</span>
                <input
                  required
                  type="number"
                  step="0.25"
                  min="0"
                  value={form.hours}
                  onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">{t('timeEntries.activity')} *</span>
                <select
                  required
                  value={form.activityId}
                  onChange={(e) => setForm((f) => ({ ...f, activityId: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">{t('app.required')}</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">{t('timeEntries.spentOn')}</span>
                <input
                  type="date"
                  value={form.spentOn}
                  onChange={(e) => setForm((f) => ({ ...f, spentOn: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">{t('timeEntries.comment')}</span>
                <textarea
                  value={form.comments}
                  onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="text-gray-700">Issue #</span>
                <input
                  value={form.issueId}
                  onChange={(e) => setForm((f) => ({ ...f, issueId: e.target.value }))}
                  placeholder="optional"
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                  {t('app.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createEntry.isPending}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {t('app.save')}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
