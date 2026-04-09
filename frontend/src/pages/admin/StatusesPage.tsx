import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useStatuses, useCreateIssueStatus, useUpdateIssueStatus, useDeleteIssueStatus, useIssueStatusUsage } from '../../api/hooks';
import type { IssueStatus } from '../../types';

function DeleteConfirmContent({ id, onCancel }: { id: string; onCancel: () => void }) {
  const { t } = useTranslation();
  const { data: usageRes, isLoading, isError } = useIssueStatusUsage(id);
  const usage = usageRes?.data;
  const msg =
    isLoading
      ? t('app.loading')
      : isError
        ? t('statuses.deleteWarningUnknown')
        : usage?.inUse
          ? t('statuses.deleteWarningInUse', { count: usage.count })
          : t('app.confirm');

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">{msg}</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={onCancel}>
          {t('app.cancel')}
        </button>
        <button type="submit" className="rounded bg-red-600 px-4 py-2 text-sm text-white">
          {t('app.delete')}
        </button>
      </div>
    </div>
  );
}

export default function StatusesPage() {
  const { t } = useTranslation();
  const { data: statusesRes, isLoading, isError } = useStatuses();
  const statuses = statusesRes?.data ?? [];
  const createStatus = useCreateIssueStatus();
  const updateStatus = useUpdateIssueStatus();
  const deleteStatus = useDeleteIssueStatus();

  const sorted = useMemo(() => [...statuses].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [statuses]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IssueStatus | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<IssueStatus | null>(null);
  const [name, setName] = useState('');
  const [isClosed, setIsClosed] = useState(false);
  const [position, setPosition] = useState(1);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setIsClosed(false);
    setPosition(sorted.length + 1);
    setModalOpen(true);
  };

  const openEdit = (s: IssueStatus) => {
    setEditing(s);
    setName(s.name);
    setIsClosed(s.isClosed);
    setPosition(s.position);
    setModalOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await updateStatus.mutateAsync({ id: editing.id, name, isClosed, position });
    } else {
      await createStatus.mutateAsync({ name, isClosed, position });
    }
    setModalOpen(false);
  };

  const submitDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteTarget) return;
    await deleteStatus.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{t('statuses.title')}</h1>
        <button type="button" onClick={openCreate} className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
          {t('statuses.new')}
        </button>
      </div>

      {isLoading && <p className="text-gray-500">{t('app.loading')}</p>}
      {isError && <p className="text-red-600">{t('app.error')}</p>}

      {!isLoading && !isError && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('projects.name')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('statuses.isClosed')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('trackers.position')}</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">{t('app.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-gray-500">
                    {t('app.noData')}
                  </td>
                </tr>
              ) : (
                sorted.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{s.name}</td>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={s.isClosed} readOnly className="pointer-events-none" aria-label={t('statuses.isClosed')} />
                    </td>
                    <td className="px-3 py-2 text-gray-600">{s.position}</td>
                    <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                      <button type="button" className="text-primary-600 hover:underline" onClick={() => openEdit(s)}>
                        {t('app.edit')}
                      </button>
                      <button type="button" className="text-red-600 hover:underline" onClick={() => setDeleteTarget(s)}>
                        {t('app.delete')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modalOpen} onClose={() => setModalOpen(false)} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{editing ? t('app.edit') : t('statuses.new')}</DialogTitle>
            <form className="mt-4 space-y-3" onSubmit={submit}>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('projects.name')}</label>
                <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isClosed} onChange={e => setIsClosed(e.target.checked)} />
                {t('statuses.isClosed')}
              </label>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('trackers.position')}</label>
                <input type="number" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={position} min={1} onChange={e => setPosition(Number(e.target.value))} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={() => setModalOpen(false)}>
                  {t('app.cancel')}
                </button>
                <button type="submit" className="rounded bg-primary-600 px-4 py-2 text-sm text-white" disabled={createStatus.isPending || updateStatus.isPending}>
                  {editing ? t('app.save') : t('app.create')}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black/40" aria-hidden />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{t('app.delete')}</DialogTitle>
            {deleteTarget && (
              <form className="mt-4" onSubmit={submitDelete}>
                <DeleteConfirmContent id={deleteTarget.id} onCancel={() => setDeleteTarget(null)} />
              </form>
            )}
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
