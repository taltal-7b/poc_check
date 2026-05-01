import type { CustomField, IssueCustomFieldValue } from '../types';

type Field = CustomField | IssueCustomFieldValue;

export interface CustomFieldOption {
  value: string;
  label: string;
}

export interface IssueCustomFieldReferenceOptions {
  users?: CustomFieldOption[];
  issues?: CustomFieldOption[];
  attachments?: CustomFieldOption[];
}

interface Props {
  fields: Field[];
  values: Record<string, string | string[]>;
  onChange: (fieldId: string, value: string | string[]) => void;
  labelClassName?: string;
  inputClassName?: string;
  referenceOptions?: IssueCustomFieldReferenceOptions;
  onUploadFiles?: (files: File[], fieldId: string) => Promise<CustomFieldOption[]>;
}

function fieldValues(field: Field): CustomFieldOption[] {
  const raw = field.possibleValues;
  const values = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === 'string'
      ? raw.split(/\r?\n|\|/).map((v) => v.trim()).filter(Boolean)
      : [];
  return values.map((entry) => {
    const match = entry.match(/^([^=:\s]+)\s*[=:]\s*(.+)$/);
    return match ? { value: match[1], label: match[2] } : { value: entry, label: entry };
  });
}

function stringValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function arrayValue(value: string | string[] | undefined): string[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function uniqueOptions(options: CustomFieldOption[]): CustomFieldOption[] {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

function isDateInputValue(value: string): boolean {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function ReferenceSelect({
  field,
  options,
  current,
  required,
  inputClassName,
  onChange,
}: {
  field: Field;
  options: CustomFieldOption[];
  current: string | string[] | undefined;
  required: boolean;
  inputClassName: string;
  onChange: (value: string | string[]) => void;
}) {
  if (field.multiple) {
    const selected = arrayValue(current);
    return (
      <select
        multiple
        value={selected}
        onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((option) => option.value))}
        required={required}
        className={`${inputClassName} min-h-28`}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  return (
    <select
      value={stringValue(current)}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className={inputClassName}
    >
      <option value="">-</option>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

export default function IssueCustomFieldInputs({
  fields,
  values,
  onChange,
  labelClassName = 'mb-1 block text-sm font-medium text-slate-700',
  inputClassName = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm',
  referenceOptions,
  onUploadFiles,
}: Props) {
  if (!fields.length) return null;

  return (
    <>
      {fields.map((field) => {
        const requiredMark = field.isRequired ? <span className="ml-0.5 text-red-500">*</span> : null;
        const current = values[field.id];
        const options = fieldValues(field);

        if (field.fieldFormat === 'bool') {
          return (
            <label key={field.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={['1', 'true', 'yes', 'on'].includes(stringValue(current).toLowerCase())}
                onChange={(e) => onChange(field.id, e.target.checked ? '1' : '0')}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              {field.name}{requiredMark}
            </label>
          );
        }

        if ((field.fieldFormat === 'list' || field.fieldFormat === 'key_value') && field.multiple) {
          const selected = arrayValue(current);
          return (
            <fieldset key={field.id}>
              <legend className={labelClassName}>{field.name}{requiredMark}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selected.includes(option.value)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...selected, option.value]
                          : selected.filter((v) => v !== option.value);
                        onChange(field.id, next);
                      }}
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }

        if (field.fieldFormat === 'list' || field.fieldFormat === 'key_value') {
          return (
            <div key={field.id}>
              <label className={labelClassName}>{field.name}{requiredMark}</label>
              <select
                value={stringValue(current)}
                onChange={(e) => onChange(field.id, e.target.value)}
                required={field.isRequired}
                className={inputClassName}
              >
                <option value="">-</option>
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          );
        }

        const referenceMap: Record<string, CustomFieldOption[] | undefined> = {
          user: referenceOptions?.users,
          issue: referenceOptions?.issues,
          attachment: referenceOptions?.attachments,
        };
        const referenceValues = referenceMap[field.fieldFormat]
          ? uniqueOptions(referenceMap[field.fieldFormat])
          : undefined;
        if (referenceValues) {
          return (
            <div key={field.id}>
              <label className={labelClassName}>{field.name}{requiredMark}</label>
              <ReferenceSelect
                field={field}
                options={referenceValues}
                current={current}
                required={field.isRequired}
                inputClassName={inputClassName}
                onChange={(value) => onChange(field.id, value)}
              />
              {field.fieldFormat === 'attachment' && onUploadFiles && (
                <input
                  type="file"
                  multiple={field.multiple}
                  onChange={async (e) => {
                    const files = Array.from(e.target.files ?? []);
                    if (!files.length) return;
                    const uploaded = await onUploadFiles(files, field.id);
                    const currentValues = field.multiple ? arrayValue(current) : [];
                    onChange(field.id, field.multiple ? [...currentValues, ...uploaded.map((file) => file.value)] : uploaded[0]?.value ?? '');
                    e.target.value = '';
                  }}
                  className="mt-2 block w-full text-sm text-slate-600"
                />
              )}
            </div>
          );
        }

        if (field.fieldFormat === 'progress') {
          const currentText = stringValue(current);
          const progress = /^\d+$/.test(currentText) ? Math.min(100, Math.max(0, Number(currentText))) : 0;
          return (
            <div key={field.id}>
              <label className={labelClassName}>{field.name}{requiredMark}</label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={10}
                  value={progress}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  required={field.isRequired}
                  className="flex-1 accent-primary-600"
                />
                <span className="w-12 text-right text-sm font-semibold text-slate-900">{progress}%</span>
              </div>
            </div>
          );
        }

        const currentText = stringValue(current);
        const type =
          field.fieldFormat === 'date' && isDateInputValue(currentText) ? 'date' :
          field.fieldFormat === 'link' ? 'url' :
          'text';
        const inputMode =
          field.fieldFormat === 'int' ? 'numeric' :
          field.fieldFormat === 'float' ? 'decimal' :
          undefined;

        if (field.fieldFormat === 'text') {
          return (
            <div key={field.id}>
              <label className={labelClassName}>{field.name}{requiredMark}</label>
              <textarea
                value={currentText}
                onChange={(e) => onChange(field.id, e.target.value)}
                required={field.isRequired}
                rows={4}
                className={inputClassName}
              />
            </div>
          );
        }

        return (
          <div key={field.id}>
            <label className={labelClassName}>{field.name}{requiredMark}</label>
            <input
              type={type}
              inputMode={inputMode}
              value={currentText}
              onChange={(e) => onChange(field.id, e.target.value)}
              required={field.isRequired}
              className={inputClassName}
            />
          </div>
        );
      })}
    </>
  );
}
