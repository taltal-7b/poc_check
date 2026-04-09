import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useEnumerations, useCreateEnumeration, useUpdateEnumeration, useDeleteEnumeration } from '../../api/hooks';
import type { Enumeration } from '../../types';

const TAB_TYPES = [
  { id: 'priorities', apiType: 'IssuePriority', labelKey: 'enumerations.priorities' as const },
  { id: 'documents', apiType: 'DocumentCategory', labelKey: 'enumerations.documentCategories' as const },
  { id: 'time', apiType: 'TimeEntryActivity', labelKey: 'enumerations.timeActivities' as const },
];

export default function EnumerationsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState(0);
  const apiType = TAB_TYPES[tab].apiType;

  const { data: itemsRes, isLoading, isError } = useEnumerations(apiType);
  const items = itemsRes?.data ?? [];
  const createEnum = useCreateEnumeration();
  const updateEnum = useUpdateEnumeration();
  const deleteEnum = useDeleteEnumeration();

  const sorted = useMemo(() => [...items].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [items]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Enumeration | null>(null);
  const [name, setName] = useState('');
  const [position, setPosition] = useState(1);
  const [isDefault, setIsDefault] = useState(false);
  const [active, setActive] = useState(true);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setPosition(sorted.length + 1);
    setIsDefault(false);
    setActive(true);
    setModalOpen(true);
  };

  const openEdit = (e: Enumeration) => {
    setEditing(e);
    setName(e.name);
    setPosition(e.position);
    setIsDefault(e.isDefault);
    setActive(e.active);
    setModalOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await updateEnum.mutateAsync({ id: editing.id, name, position, isDefault, active });
    } else {
      await createEnum.mutateAsync({ type: apiType, name, position, isDefault, active });
    }
    setModalOpen(false);
  };

  const setAsDefault = async (row: Enumeration) => {
    await updateEnum.mutateAsync({ id: row.id, isDefault: true });
  };

  const toggleActive = async (row: Enumeration) => {
    await updateEnum.mutateAsync({ id: row.id, active: !row.active });
  };

  const confirmDelete = async (row: Enumeration) => {
    if (!window.confirm(t('app.confirm'))) return;
    await deleteEnum.mutateAsync(row.id);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-gray-900">{t('enumerations.pageTitle')}</h1>

      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {TAB_TYPES.map((tb, i) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setTab(i)}
            className={`rounded-t px-4 py-2 text-sm font-medium ${tab === i ? 'bg-white border border-b-0 border-gray-200 text-primary-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={openCreate} className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
          {t('app.create')}
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
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('trackers.position')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('enumerations.isDefault')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('enumerations.active')}</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">{t('app.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                    {t('app.noData')}
                  </td>
                </tr>
              ) : (
                sorted.map(row => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                    <td className="px-3 py-2 text-gray-600">{row.position}</td>
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input type="radio" name={`default-${apiType}`} checked={row.isDefault} onChange={() => void setAsDefault(row)} />
                      </label>
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" className={`rounded px-2 py-1 text-xs font-medium ${row.active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`} onClick={() => void toggleActive(row)}>
                        {row.active ? t('enumerations.active') : t('app.no')}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                      <button type="button" className="text-primary-600 hover:underline" onClick={() => openEdit(row)}>
                        {t('app.edit')}
                      </button>
                      <button type="button" className="text-red-600 hover:underline" onClick={() => void confirmDelete(row)}>
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
            <DialogTitle className="text-lg font-semibold text-gray-900">{editing ? t('app.edit') : t('app.create')}</DialogTitle>
            <form className="mt-4 space-y-3" onSubmit={submit}>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('projects.name')}</label>
                <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('trackers.position')}</label>
                <input type="number" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={position} min={1} onChange={e => setPosition(Number(e.target.value))} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)} />
                {t('enumerations.isDefault')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
                {t('enumerations.active')}
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={() => setModalOpen(false)}>
                  {t('app.cancel')}
                </button>
                <button type="submit" className="rounded bg-primary-600 px-4 py-2 text-sm text-white" disabled={createEnum.isPending || updateEnum.isPending}>
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
