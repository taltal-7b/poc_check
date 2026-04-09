import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useCustomFields, useTrackers, useCreateCustomField, useUpdateCustomField, useDeleteCustomField } from '../../api/hooks';
import type { CustomField } from '../../types';

const FIELD_FORMATS = ['string', 'text', 'int', 'float', 'list', 'date', 'bool'] as const;
const CUSTOM_FIELD_TYPES = ['IssueCustomField', 'ProjectCustomField', 'UserCustomField', 'VersionCustomField', 'DocumentCustomField', 'TimeEntryCustomField'] as const;

export default function CustomFieldsPage() {
  const { t } = useTranslation();
  const { data: fieldsRes, isLoading, isError } = useCustomFields();
  const { data: trackersRes } = useTrackers();
  const fields = fieldsRes?.data ?? [];
  const trackers = trackersRes?.data ?? [];
  const createField = useCreateCustomField();
  const updateField = useUpdateCustomField();
  const deleteField = useDeleteCustomField();

  const sortedTrackers = useMemo(() => [...trackers].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [trackers]);
  const sortedFields = useMemo(() => [...fields].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [fields]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [type, setType] = useState<string>('IssueCustomField');
  const [name, setName] = useState('');
  const [fieldFormat, setFieldFormat] = useState<string>('string');
  const [isRequired, setIsRequired] = useState(false);
  const [isFilter, setIsFilter] = useState(false);
  const [searchable, setSearchable] = useState(false);
  const [multiple, setMultiple] = useState(false);
  const [position, setPosition] = useState(1);
  const [defaultValue, setDefaultValue] = useState('');
  const [possibleValuesText, setPossibleValuesText] = useState('');
  const [trackerIds, setTrackerIds] = useState<Set<string>>(new Set());

  const openCreate = () => {
    setEditing(null);
    setType('IssueCustomField');
    setName('');
    setFieldFormat('string');
    setIsRequired(false);
    setIsFilter(false);
    setSearchable(false);
    setMultiple(false);
    setPosition(sortedFields.length + 1);
    setDefaultValue('');
    setPossibleValuesText('');
    setTrackerIds(new Set());
    setModalOpen(true);
  };

  const openEdit = (f: CustomField) => {
    setEditing(f);
    setType(f.type);
    setName(f.name);
    setFieldFormat(f.fieldFormat);
    setIsRequired(f.isRequired);
    setIsFilter(!!f.isFilter);
    setSearchable(!!f.searchable);
    setMultiple(!!f.multiple);
    setPosition(f.position);
    setDefaultValue(f.defaultValue ?? '');
    setPossibleValuesText(f.possibleValues ? f.possibleValues.split('\n').join('\n') : '');
    setTrackerIds(new Set(f.trackerIds ?? []));
    setModalOpen(true);
  };

  const toggleTracker = (id: string) => {
    setTrackerIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const possibleValues =
      fieldFormat === 'list'
        ? possibleValuesText
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean)
            .join('\n')
        : null;
    const body: Record<string, unknown> = {
      type,
      name,
      fieldFormat,
      isRequired,
      isFilter,
      searchable,
      multiple,
      position,
      defaultValue: defaultValue || null,
      possibleValues,
    };
    if (type === 'IssueCustomField') {
      body.trackerIds = [...trackerIds];
    }
    if (editing) {
      await updateField.mutateAsync({ id: editing.id, ...body });
    } else {
      await createField.mutateAsync(body);
    }
    setModalOpen(false);
  };

  const confirmDelete = async (f: CustomField) => {
    if (!window.confirm(t('app.confirm'))) return;
    await deleteField.mutateAsync(f.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-gray-900">{t('customFields.title')}</h1>
        <button type="button" onClick={openCreate} className="rounded bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
          {t('customFields.new')}
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
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('customFields.type')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('customFields.fieldFormat')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('customFields.isRequired')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('trackers.position')}</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">{t('app.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedFields.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                    {t('app.noData')}
                  </td>
                </tr>
              ) : (
                sortedFields.map(f => (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{f.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">{f.type}</td>
                    <td className="px-3 py-2 text-gray-700">{f.fieldFormat}</td>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={f.isRequired} readOnly className="pointer-events-none" />
                    </td>
                    <td className="px-3 py-2 text-gray-600">{f.position}</td>
                    <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                      <button type="button" className="text-primary-600 hover:underline" onClick={() => openEdit(f)}>
                        {t('app.edit')}
                      </button>
                      <button type="button" className="text-red-600 hover:underline" onClick={() => confirmDelete(f)}>
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
          <DialogPanel className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{editing ? t('app.edit') : t('customFields.new')}</DialogTitle>
            <form className="mt-4 space-y-3" onSubmit={submit}>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('customFields.type')}</label>
                <select className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={type} onChange={e => setType(e.target.value)} disabled={!!editing}>
                  {CUSTOM_FIELD_TYPES.map(ct => (
                    <option key={ct} value={ct}>
                      {ct}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('projects.name')}</label>
                <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('customFields.fieldFormat')}</label>
                <select className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={fieldFormat} onChange={e => setFieldFormat(e.target.value)}>
                  {FIELD_FORMATS.map(ff => (
                    <option key={ff} value={ff}>
                      {ff}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isRequired} onChange={e => setIsRequired(e.target.checked)} />
                {t('customFields.isRequired')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isFilter} onChange={e => setIsFilter(e.target.checked)} />
                {t('customFields.isFilter')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={searchable} onChange={e => setSearchable(e.target.checked)} />
                {t('customFields.searchable')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={multiple} onChange={e => setMultiple(e.target.checked)} />
                {t('customFields.multiple')}
              </label>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('trackers.position')}</label>
                <input type="number" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={position} min={1} onChange={e => setPosition(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('customFields.defaultValue')}</label>
                <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={defaultValue} onChange={e => setDefaultValue(e.target.value)} />
              </div>
              {fieldFormat === 'list' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">{t('customFields.possibleValues')}</label>
                  <textarea className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm" rows={5} value={possibleValuesText} onChange={e => setPossibleValuesText(e.target.value)} />
                </div>
              )}
              {type === 'IssueCustomField' && (
                <fieldset className="rounded border border-gray-200 p-3">
                  <legend className="px-1 text-sm font-medium text-gray-800">{t('customFields.trackers')}</legend>
                  <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                    {sortedTrackers.map(tr => (
                      <label key={tr.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={trackerIds.has(tr.id)} onChange={() => toggleTracker(tr.id)} />
                        {tr.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="rounded border border-gray-300 px-4 py-2 text-sm" onClick={() => setModalOpen(false)}>
                  {t('app.cancel')}
                </button>
                <button type="submit" className="rounded bg-primary-600 px-4 py-2 text-sm text-white" disabled={createField.isPending || updateField.isPending}>
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
