import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import {
  useCreateCustomField,
  useCustomFields,
  useDeleteCustomField,
  useProjects,
  useTrackers,
  useUpdateCustomField,
} from '../../api/hooks';
import AppSelect from '../../components/AppSelect';
import type { CustomField } from '../../types';

const FIELD_FORMATS = [
  'string',
  'text',
  'int',
  'float',
  'list',
  'key_value',
  'date',
  'bool',
  'link',
  'user',
  'issue',
  'attachment',
  'progress',
] as const;

const FIELD_FORMAT_LABELS: Record<string, string> = {
  string: 'テキスト',
  text: '長いテキスト',
  int: '整数',
  float: '小数',
  list: 'リスト',
  key_value: 'キー・バリュー リスト',
  date: '日付',
  bool: '真偽値',
  link: 'リンク',
  user: 'ユーザー',
  issue: 'チケット',
  attachment: 'ファイル',
  progress: '進捗バー',
};

function fieldFormatLabel(value: string): string {
  return FIELD_FORMAT_LABELS[value] ?? value;
}

function possibleValuesText(field: CustomField): string {
  if (Array.isArray(field.possibleValues)) return field.possibleValues.join('\n');
  return field.possibleValues ? String(field.possibleValues).split('|').join('\n') : '';
}

function supportsPossibleValues(format: string): boolean {
  return format === 'list' || format === 'key_value';
}

export default function CustomFieldsPage() {
  const { t } = useTranslation();
  const { data: fieldsRes, isLoading, isError } = useCustomFields();
  const { data: trackersRes } = useTrackers();
  const { data: projectsRes } = useProjects();
  const fields = fieldsRes?.data ?? [];
  const trackers = trackersRes?.data ?? [];
  const projects = projectsRes?.data ?? [];
  const createField = useCreateCustomField();
  const updateField = useUpdateCustomField();
  const deleteField = useDeleteCustomField();

  const sortedTrackers = useMemo(
    () => [...trackers].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [trackers],
  );
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [fields],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [name, setName] = useState('');
  const [fieldFormat, setFieldFormat] = useState<string>('string');
  const [isRequired, setIsRequired] = useState(false);
  const [isFilter, setIsFilter] = useState(false);
  const [searchable, setSearchable] = useState(false);
  const [multiple, setMultiple] = useState(false);
  const [isForAll, setIsForAll] = useState(true);
  const [position, setPosition] = useState(1);
  const [defaultValue, setDefaultValue] = useState('');
  const [possibleValues, setPossibleValues] = useState('');
  const [trackerIds, setTrackerIds] = useState<Set<string>>(new Set());
  const [projectIds, setProjectIds] = useState<Set<string>>(new Set());

  const openCreate = () => {
    setEditing(null);
    setName('');
    setFieldFormat('string');
    setIsRequired(false);
    setIsFilter(false);
    setSearchable(false);
    setMultiple(false);
    setIsForAll(true);
    setPosition(sortedFields.length + 1);
    setDefaultValue('');
    setPossibleValues('');
    setTrackerIds(new Set());
    setProjectIds(new Set());
    setModalOpen(true);
  };

  const openEdit = (field: CustomField) => {
    setEditing(field);
    setName(field.name);
    setFieldFormat(field.fieldFormat);
    setIsRequired(field.isRequired);
    setIsFilter(!!field.isFilter);
    setSearchable(!!field.searchable);
    setMultiple(!!field.multiple);
    setIsForAll(field.isForAll ?? true);
    setPosition(field.position);
    setDefaultValue(field.defaultValue ?? '');
    setPossibleValues(possibleValuesText(field));
    setTrackerIds(new Set(field.trackerIds ?? []));
    setProjectIds(new Set(field.projectIds ?? []));
    setModalOpen(true);
  };

  const toggleTracker = (id: string) => {
    setTrackerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleProject = (id: string) => {
    setProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedPossibleValues = supportsPossibleValues(fieldFormat)
      ? possibleValues
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean)
          .join('\n')
      : null;
    const body = {
      type: 'IssueCustomField',
      name,
      fieldFormat,
      isRequired,
      isFilter,
      searchable,
      multiple,
      isForAll,
      position,
      defaultValue: defaultValue || null,
      possibleValues: normalizedPossibleValues,
      trackerIds: [...trackerIds],
      projectIds: isForAll ? [] : [...projectIds],
    };
    if (editing) {
      await updateField.mutateAsync({ id: editing.id, ...body });
    } else {
      await createField.mutateAsync(body);
    }
    setModalOpen(false);
  };

  const confirmDelete = async (field: CustomField) => {
    if (!window.confirm(t('app.confirm'))) return;
    await deleteField.mutateAsync(field.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{t('customFields.title')}</h1>
          <p className="mt-1 text-sm text-gray-600">カスタムフィールドはチケットでのみ利用できます。</p>
        </div>
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
                <th className="px-3 py-2 text-left font-medium text-gray-600">カスタムフィールド名</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('customFields.fieldFormat')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('customFields.isRequired')}</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">{t('trackers.position')}</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">{t('app.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedFields.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                    {t('app.noData')}
                  </td>
                </tr>
              ) : (
                sortedFields.map((field) => (
                  <tr key={field.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{field.name}</td>
                    <td className="px-3 py-2 text-gray-700">{fieldFormatLabel(field.fieldFormat)}</td>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={field.isRequired} readOnly className="pointer-events-none" />
                    </td>
                    <td className="px-3 py-2 text-gray-600">{field.position}</td>
                    <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                      <button type="button" className="text-primary-600 hover:underline" onClick={() => openEdit(field)}>
                        {t('app.edit')}
                      </button>
                      <button type="button" className="text-red-600 hover:underline" onClick={() => confirmDelete(field)}>
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
                <label className="block text-sm font-medium text-gray-700">カスタムフィールド名</label>
                <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('customFields.fieldFormat')}</label>
                <AppSelect
                  value={fieldFormat}
                  onChange={setFieldFormat}
                  options={FIELD_FORMATS.map((format) => ({ value: format, label: fieldFormatLabel(format) }))}
                  ariaLabel={t('customFields.fieldFormat')}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
                {t('customFields.isRequired')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isFilter} onChange={(e) => setIsFilter(e.target.checked)} />
                {t('customFields.isFilter')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={searchable} onChange={(e) => setSearchable(e.target.checked)} />
                {t('customFields.searchable')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />
                {t('customFields.multiple')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isForAll} onChange={(e) => setIsForAll(e.target.checked)} />
                すべてのプロジェクトで使用
              </label>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('trackers.position')}</label>
                <input type="number" className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" value={position} min={1} onChange={(e) => setPosition(Number(e.target.value))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">{t('customFields.defaultValue')}</label>
                <input
                  type={fieldFormat === 'progress' ? 'number' : 'text'}
                  min={fieldFormat === 'progress' ? 0 : undefined}
                  max={fieldFormat === 'progress' ? 100 : undefined}
                  step={fieldFormat === 'progress' ? 10 : undefined}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  value={defaultValue}
                  onChange={(e) => setDefaultValue(e.target.value)}
                />
              </div>
              {supportsPossibleValues(fieldFormat) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    {fieldFormat === 'key_value' ? '候補値（1行に1つ、key=value 形式も可）' : t('customFields.possibleValues')}
                  </label>
                  <textarea className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm" rows={5} value={possibleValues} onChange={(e) => setPossibleValues(e.target.value)} />
                </div>
              )}
              <fieldset className="rounded border border-gray-200 p-3">
                <legend className="px-1 text-sm font-medium text-gray-800">{t('customFields.trackers')}</legend>
                <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                  {sortedTrackers.map((tracker) => (
                    <label key={tracker.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={trackerIds.has(tracker.id)} onChange={() => toggleTracker(tracker.id)} />
                      {tracker.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              {!isForAll && (
                <fieldset className="rounded border border-gray-200 p-3">
                  <legend className="px-1 text-sm font-medium text-gray-800">使用するプロジェクト</legend>
                  <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
                    {projects.map((project) => (
                      <label key={project.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={projectIds.has(project.id)} onChange={() => toggleProject(project.id)} />
                        {project.name}
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
