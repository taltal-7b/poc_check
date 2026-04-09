import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useTrackers, useStatuses, useCreateTracker, useUpdateTracker, useDeleteTracker, useReorderTrackers } from '../../api/hooks';
import type { Tracker } from '../../types';

export default function TrackersPage() {
  const { t } = useTranslation();
  const { data: trackersRes, isLoading, isError } = useTrackers();
  const { data: statusesRes } = useStatuses();
  const trackers = trackersRes?.data ?? [];
  const statuses = statusesRes?.data ?? [];
  const createTracker = useCreateTracker();
  const updateTracker = useUpdateTracker();
  const deleteTracker = useDeleteTracker();
  const reorderTrackers = useReorderTrackers();

  const sortedStatuses = useMemo(() => [...statuses].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [statuses]);

  const [ordered, setOrdered] = useState<Tracker[]>([]);
  useEffect(() => {
    setOrdered([...trackers].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)));
  }, [trackers]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Tracker | null>(null);
  const [name, setName] = useState('');
  const [defaultStatusId, setDefaultStatusId] = useState('');
  const [description, setDescription] = useState('');
  const [positionInput, setPositionInput] = useState<number>(1);
  const [dragId, setDragId] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDefaultStatusId(sortedStatuses[0]?.id ?? '');
    setDescription('');
    setPositionInput(ordered.length + 1);
    setModalOpen(true);
  };

  const openEdit = (tr: Tracker) => {
    setEditing(tr);
    setName(tr.name);
    setDefaultStatusId(tr.defaultStatusId ?? '');
    setDescription(tr.description ?? '');
    setPositionInput(tr.position);
    setModalOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await updateTracker.mutateAsync({
        id: editing.id,
        name,
        defaultStatusId: defaultStatusId || null,
        description: description || null,
        position: positionInput,
      });
    } else {
      await createTracker.mutateAsync({
        name,
        defaultStatusId: defaultStatusId || null,
        description: description || null,
        position: positionInput,
      });
    }
    setModalOpen(false);
  };

  const confirmDelete = async (tr: Tracker) => {
    if (!window.confirm(t('app.confirm'))) return;
    await deleteTracker.mutateAsync(tr.id);
  };

  const applyOrder = async (next: Tracker[]) => {
    setOrdered(next);
    await reorderTrackers.mutateAsync({ ids: next.map(x => x.id) });
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const idx = ordered.findIndex(x => x.id === dragId);
    const tidx = ordered.findIndex(x => x.id === targetId);
    if (idx < 0 || tidx < 0) return;
    const copy = [...ordered];
    const [moved] = copy.splice(idx, 1);
    copy.splice(tidx, 0, moved);
    void applyOrder(copy);
    setDragId(null);
  };

  const statusName = (id: string | null) => sortedStatuses.find(s => s.id === id)?.name ?? '—';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{t('trackers.title')}</h1>
        <button type="button" onClick={openCreate} className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
          {t('trackers.new')}
        </button>
      </div>

      {isLoading && <p className="text-gray-500">{t('app.loading')}</p>}
      {isError && <p className="text-red-600">{t('app.error')}</p>}

      {!isLoading && !isError && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-8 px-2 py-2" aria-label="Reorder" />
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('projects.name')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('trackers.defaultStatus')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('trackers.position')}</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">{t('app.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ordered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                    {t('app.noData')}
                  </td>
                </tr>
              ) : (
                ordered.map(tr => (
                  <tr
                    key={tr.id}
                    draggable
                    onDragStart={() => setDragId(tr.id)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => onDrop(tr.id)}
                    className="hover:bg-gray-50"
                  >
                    <td className="px-2 py-2 text-gray-400 cursor-grab select-none" title="Drag">
                      ::
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">{tr.name}</td>
                    <td className="px-3 py-2 text-gray-700">{statusName(tr.defaultStatusId)}</td>
                    <td className="px-3 py-2 text-gray-600">{tr.position}</td>
                    <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                      <button type="button" className="text-primary-600 hover:underline" onClick={() => openEdit(tr)}>
                        {t('app.edit')}
                      </button>
                      <button type="button" className="text-red-600 hover:underline" onClick={() => confirmDelete(tr)}>
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
            <DialogTitle className="text-lg font-semibold text-gray-900">{editing ? t('app.edit') : t('trackers.new')}</DialogTitle>
            <form className="mt-4 space-y-3" onSubmit={submit}>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('projects.name')}</label>
                <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('trackers.defaultStatus')}</label>
                <select className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={defaultStatusId} onChange={e => setDefaultStatusId(e.target.value)}>
                  <option value="">—</option>
                  {sortedStatuses.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('projects.description')}</label>
                <textarea className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('trackers.position')}</label>
                <input type="number" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={positionInput} min={1} onChange={e => setPositionInput(Number(e.target.value))} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={() => setModalOpen(false)}>
                  {t('app.cancel')}
                </button>
                <button type="submit" className="rounded bg-primary-600 px-4 py-2 text-sm text-white" disabled={createTracker.isPending || updateTracker.isPending}>
                  {editing ? t('app.save') : t('app.create')}
                </button>
              </div>
            </form>
          </DialogPanel>
        </div>
      </Dialog>
    </div>
  );
}
