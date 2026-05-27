import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { Pencil, Trash2 } from 'lucide-react';
import { useTrackers, useStatuses, useCreateTracker, useUpdateTracker, useDeleteTracker } from '../../api/hooks';
import AppSelect from '../../components/AppSelect';
import type { Tracker } from '../../types';

const STANDARD_FIELDS = [
  { key: 'description', label: '説明', requiredAllowed: true },
  { key: 'assignee', label: '担当者', requiredAllowed: true },
  { key: 'category', label: 'カテゴリ', requiredAllowed: true },
  { key: 'parent', label: '親チケット', requiredAllowed: true },
  { key: 'startDate', label: '開始日', requiredAllowed: true },
  { key: 'dueDate', label: '期日', requiredAllowed: true },
  { key: 'estimatedHours', label: '予定工数', requiredAllowed: true },
  { key: 'doneRatio', label: '進捗率', requiredAllowed: false },
  { key: 'repository', label: 'リポジトリ', requiredAllowed: true },
] as const;

type StandardFieldKey = (typeof STANDARD_FIELDS)[number]['key'];
type StandardFieldState = Record<StandardFieldKey, { enabled: boolean; required: boolean }>;

function defaultStandardFields(): StandardFieldState {
  return Object.fromEntries(
    STANDARD_FIELDS.map((field) => [field.key, { enabled: true, required: false }]),
  ) as StandardFieldState;
}

function standardFieldsFromTracker(tracker: Tracker | null): StandardFieldState {
  const values = defaultStandardFields();
  for (const setting of tracker?.standardFields ?? []) {
    if (setting.fieldKey in values) {
      const key = setting.fieldKey as StandardFieldKey;
      values[key] = {
        enabled: setting.enabled,
        required: setting.enabled ? setting.required : false,
      };
    }
  }
  return values;
}

export default function TrackersPage() {
  const { t } = useTranslation();
  const { data: trackersRes, isLoading, isError } = useTrackers();
  const { data: statusesRes } = useStatuses();
  const trackers = trackersRes?.data ?? [];
  const statuses = statusesRes?.data ?? [];
  const createTracker = useCreateTracker();
  const updateTracker = useUpdateTracker();
  const deleteTracker = useDeleteTracker();

  const sortedStatuses = useMemo(() => [...statuses].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [statuses]);

  const ordered = useMemo(
    () => [...trackers].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [trackers],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Tracker | null>(null);
  const [name, setName] = useState('');
  const [defaultStatusId, setDefaultStatusId] = useState('');
  const [description, setDescription] = useState('');
  const [positionInput, setPositionInput] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'basic' | 'fields'>('basic');
  const [standardFields, setStandardFields] = useState<StandardFieldState>(() => defaultStandardFields());

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDefaultStatusId(sortedStatuses[0]?.id ?? '');
    setDescription('');
    setPositionInput(ordered.length + 1);
    setStandardFields(defaultStandardFields());
    setActiveTab('basic');
    setModalOpen(true);
  };

  const openEdit = (tr: Tracker) => {
    setEditing(tr);
    setName(tr.name);
    setDefaultStatusId(tr.defaultStatusId ?? '');
    setDescription(tr.description ?? '');
    setPositionInput(tr.position);
    setStandardFields(standardFieldsFromTracker(tr));
    setActiveTab('basic');
    setModalOpen(true);
  };

  const setStandardField = (key: StandardFieldKey, patch: Partial<{ enabled: boolean; required: boolean }>) => {
    setStandardFields((prev) => {
      const current = prev[key];
      const enabled = patch.enabled ?? current.enabled;
      return {
        ...prev,
        [key]: {
          enabled,
          required: enabled ? (patch.required ?? current.required) : false,
        },
      };
    });
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
        standardFields: STANDARD_FIELDS.map((field) => ({
          fieldKey: field.key,
          enabled: standardFields[field.key].enabled,
          required: field.requiredAllowed && standardFields[field.key].enabled ? standardFields[field.key].required : false,
        })),
      });
    } else {
      await createTracker.mutateAsync({
        name,
        defaultStatusId: defaultStatusId || null,
        description: description || null,
        position: positionInput,
        standardFields: STANDARD_FIELDS.map((field) => ({
          fieldKey: field.key,
          enabled: standardFields[field.key].enabled,
          required: field.requiredAllowed && standardFields[field.key].enabled ? standardFields[field.key].required : false,
        })),
      });
    }
    setModalOpen(false);
  };

  const confirmDelete = async (tr: Tracker) => {
    if (!window.confirm(t('app.confirm'))) return;
    await deleteTracker.mutateAsync(tr.id);
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
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">{t('trackers.name')}</th>
                <th className="px-4 py-3 font-medium">{t('trackers.defaultStatus')}</th>
                <th className="px-4 py-3 font-medium">{t('trackers.position')}</th>
                <th className="px-4 py-3 text-center font-medium">{t('app.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ordered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    {t('app.noData')}
                  </td>
                </tr>
              ) : (
                ordered.map(tr => (
                  <tr key={tr.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{tr.name}</td>
                    <td className="px-4 py-2 text-gray-700">{statusName(tr.defaultStatusId)}</td>
                    <td className="px-4 py-2 text-gray-600">{tr.position}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(tr)}
                          className="rounded p-1 text-blue-600 hover:bg-blue-50"
                          title={t('app.edit')}
                          aria-label={t('app.edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmDelete(tr)}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                          title={t('app.delete')}
                          aria-label={t('app.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
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
          <DialogPanel className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <DialogTitle className="text-lg font-semibold text-gray-900">{editing ? t('app.edit') : t('trackers.new')}</DialogTitle>
            <form className="mt-4 space-y-4" onSubmit={submit}>
              <div className="flex border-b border-gray-200">
                {[
                  { id: 'basic' as const, label: '基本' },
                  { id: 'fields' as const, label: '標準フィールド' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`border-b-2 px-4 py-2 text-sm font-medium ${
                      activeTab === tab.id
                        ? 'border-primary-600 text-primary-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {activeTab === 'basic' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      {t('trackers.name')}<span className="ml-1 text-red-500">*</span>
                    </label>
                    <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t('trackers.defaultStatus')}</label>
                    <AppSelect
                      value={defaultStatusId}
                      onChange={setDefaultStatusId}
                      options={[{ value: '', label: '-' }, ...sortedStatuses.map((item) => ({ value: item.id, label: item.name }))]}
                      ariaLabel={t('trackers.defaultStatus')}
                      className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t('projects.description')}</label>
                    <textarea className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">{t('trackers.position')}</label>
                    <input type="number" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={positionInput} min={1} onChange={e => setPositionInput(Number(e.target.value))} />
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600">
                      <tr>
                        <th className="px-4 py-3 font-medium">フィールド</th>
                        <th className="px-4 py-3 text-center font-medium">使用</th>
                        <th className="px-4 py-3 text-center font-medium">必須</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {STANDARD_FIELDS.map((field) => (
                        <tr key={field.key}>
                          <td className="px-4 py-3 font-medium text-gray-900">{field.label}</td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={standardFields[field.key].enabled}
                              onChange={(e) => setStandardField(field.key, { enabled: e.target.checked })}
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={standardFields[field.key].required}
                              disabled={!field.requiredAllowed || !standardFields[field.key].enabled}
                              onChange={(e) => setStandardField(field.key, { required: e.target.checked })}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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

