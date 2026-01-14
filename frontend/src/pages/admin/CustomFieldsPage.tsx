import { useEffect, useState } from 'react';
import { Edit, Plus, Trash2 } from 'lucide-react';
import {
  customFieldsApi,
  projectsApi,
  trackersApi,
} from '../../lib/api';
import Loading from '../../components/ui/Loading';

type CustomFieldFormState = {
  name: string;
  fieldFormat: string;
  description: string;
  possibleValues: string;
  defaultValue: string;
  minLength: string;
  maxLength: string;
  regexp: string;
  position: string;
  isRequired: boolean;
  isForAll: boolean;
  isFilter: boolean;
  searchable: boolean;
  multiple: boolean;
  visible: boolean;
};

const emptyForm = (): CustomFieldFormState => ({
  name: '',
  fieldFormat: 'string',
  description: '',
  possibleValues: '',
  defaultValue: '',
  minLength: '',
  maxLength: '',
  regexp: '',
  position: '1',
  isRequired: false,
  isForAll: true,
  isFilter: true,
  searchable: true,
  multiple: false,
  visible: true,
});

const fieldFormatOptions = [
  'string',
  'text',
  'int',
  'float',
  'list',
  'date',
  'bool',
];

export default function CustomFieldsPage() {
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [trackers, setTrackers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<CustomFieldFormState>(emptyForm());

  const [associateState, setAssociateState] = useState({
    customFieldId: '',
    projectId: '',
    trackerId: '',
  });
  const [associateError, setAssociateError] = useState('');
  const [associateSaving, setAssociateSaving] = useState(false);

  useEffect(() => {
    loadCustomFields();
    loadMasterData();
  }, []);

  const loadCustomFields = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await customFieldsApi.getAll();
      setCustomFields(response.data.data.customFields || []);
    } catch (err: any) {
      console.error('Failed to load custom fields:', err);
      setError(err.response?.data?.message || 'Failed to load custom fields.');
    } finally {
      setLoading(false);
    }
  };

  const loadMasterData = async () => {
    try {
      const [projectsRes, trackersRes] = await Promise.all([
        projectsApi.getAll(),
        trackersApi.getAll(),
      ]);
      setProjects(projectsRes.data.data.projects || []);
      setTrackers(trackersRes.data.data.trackers || []);
    } catch (err) {
      console.error('Failed to load master data:', err);
    }
  };

  const resetForm = () => {
    setFormData(emptyForm());
    setEditingId(null);
    setFormError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Name is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        fieldFormat: formData.fieldFormat,
        description: formData.description.trim(),
        possibleValues: formData.possibleValues.trim(),
        defaultValue: formData.defaultValue.trim(),
        minLength: formData.minLength ? Number(formData.minLength) : null,
        maxLength: formData.maxLength ? Number(formData.maxLength) : null,
        regexp: formData.regexp.trim(),
        position: Number(formData.position) || 1,
        isRequired: formData.isRequired,
        isForAll: formData.isForAll,
        isFilter: formData.isFilter,
        searchable: formData.searchable,
        multiple: formData.multiple,
        visible: formData.visible,
      };

      if (editingId) {
        await customFieldsApi.update(editingId, payload);
      } else {
        await customFieldsApi.create(payload);
      }

      resetForm();
      loadCustomFields();
    } catch (err: any) {
      console.error('Failed to save custom field:', err);
      setFormError(err.response?.data?.message || 'Failed to save custom field.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (field: any) => {
    setEditingId(field.id);
    setFormData({
      name: field.name || '',
      fieldFormat: field.fieldFormat || 'string',
      description: field.description || '',
      possibleValues: field.possibleValues || '',
      defaultValue: field.defaultValue || '',
      minLength: field.minLength?.toString() || '',
      maxLength: field.maxLength?.toString() || '',
      regexp: field.regexp || '',
      position: field.position?.toString() || '1',
      isRequired: !!field.isRequired,
      isForAll: !!field.isForAll,
      isFilter: !!field.isFilter,
      searchable: !!field.searchable,
      multiple: !!field.multiple,
      visible: !!field.visible,
    });
  };

  const handleDelete = async (fieldId: number) => {
    if (!confirm('Delete this custom field?')) return;
    try {
      await customFieldsApi.delete(fieldId);
      loadCustomFields();
    } catch (err) {
      console.error('Failed to delete custom field:', err);
      alert('Failed to delete custom field.');
    }
  };

  const handleAssociate = async (event: React.FormEvent) => {
    event.preventDefault();
    setAssociateError('');

    if (!associateState.customFieldId || !associateState.projectId || !associateState.trackerId) {
      setAssociateError('Custom field, project, and tracker are required.');
      return;
    }

    setAssociateSaving(true);
    try {
      await customFieldsApi.associateWithProject({
        customFieldId: Number(associateState.customFieldId),
        projectId: Number(associateState.projectId),
        trackerId: Number(associateState.trackerId),
      });
      setAssociateState({ customFieldId: '', projectId: '', trackerId: '' });
    } catch (err: any) {
      console.error('Failed to associate custom field:', err);
      setAssociateError(err.response?.data?.message || 'Failed to associate custom field.');
    } finally {
      setAssociateSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Custom Fields</h1>
        <button className="btn btn-primary flex items-center space-x-2" onClick={resetForm}>
          <Plus className="w-4 h-4" />
          <span>New field</span>
        </button>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {editingId ? 'Edit custom field' : 'Create custom field'}
        </h2>
        {formError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, name: event.target.value }))
                }
                className="input"
                required
              />
            </div>
            <div>
              <label className="label">Field format</label>
              <select
                value={formData.fieldFormat}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    fieldFormat: event.target.value,
                  }))
                }
                className="input"
              >
                {fieldFormatOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Position</label>
              <input
                type="number"
                min={1}
                value={formData.position}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    position: event.target.value,
                  }))
                }
                className="input"
              />
            </div>
            <div>
              <label className="label">Default value</label>
              <input
                type="text"
                value={formData.defaultValue}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    defaultValue: event.target.value,
                  }))
                }
                className="input"
              />
            </div>
            <div>
              <label className="label">Possible values (comma separated)</label>
              <input
                type="text"
                value={formData.possibleValues}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    possibleValues: event.target.value,
                  }))
                }
                className="input"
              />
            </div>
            <div>
              <label className="label">Validation regexp</label>
              <input
                type="text"
                value={formData.regexp}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    regexp: event.target.value,
                  }))
                }
                className="input"
              />
            </div>
            <div>
              <label className="label">Min length</label>
              <input
                type="number"
                min={0}
                value={formData.minLength}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    minLength: event.target.value,
                  }))
                }
                className="input"
              />
            </div>
            <div>
              <label className="label">Max length</label>
              <input
                type="number"
                min={0}
                value={formData.maxLength}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    maxLength: event.target.value,
                  }))
                }
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              value={formData.description}
              onChange={(event) =>
                setFormData((prev) => ({
                  ...prev,
                  description: event.target.value,
                }))
              }
              className="input"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="flex items-center space-x-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.isRequired}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    isRequired: event.target.checked,
                  }))
                }
              />
              <span>Required</span>
            </label>
            <label className="flex items-center space-x-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.isForAll}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    isForAll: event.target.checked,
                  }))
                }
              />
              <span>For all projects</span>
            </label>
            <label className="flex items-center space-x-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.isFilter}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    isFilter: event.target.checked,
                  }))
                }
              />
              <span>Filterable</span>
            </label>
            <label className="flex items-center space-x-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.searchable}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    searchable: event.target.checked,
                  }))
                }
              />
              <span>Searchable</span>
            </label>
            <label className="flex items-center space-x-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.multiple}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    multiple: event.target.checked,
                  }))
                }
              />
              <span>Multiple values</span>
            </label>
            <label className="flex items-center space-x-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.visible}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    visible: event.target.checked,
                  }))
                }
              />
              <span>Visible</span>
            </label>
          </div>

          <div className="flex justify-end space-x-3">
            {editingId && (
              <button type="button" onClick={resetForm} className="btn btn-secondary" disabled={saving}>
                Cancel edit
              </button>
            )}
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Project association</h2>
        {associateError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {associateError}
          </div>
        )}
        <form onSubmit={handleAssociate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <select
            value={associateState.customFieldId}
            onChange={(event) =>
              setAssociateState((prev) => ({
                ...prev,
                customFieldId: event.target.value,
              }))
            }
            className="input"
          >
            <option value="">Select custom field</option>
            {customFields.map((field) => (
              <option key={field.id} value={field.id}>
                {field.name}
              </option>
            ))}
          </select>
          <select
            value={associateState.projectId}
            onChange={(event) =>
              setAssociateState((prev) => ({
                ...prev,
                projectId: event.target.value,
              }))
            }
            className="input"
          >
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <select
            value={associateState.trackerId}
            onChange={(event) =>
              setAssociateState((prev) => ({
                ...prev,
                trackerId: event.target.value,
              }))
            }
            className="input"
          >
            <option value="">Select tracker</option>
            {trackers.map((tracker) => (
              <option key={tracker.id} value={tracker.id}>
                {tracker.name}
              </option>
            ))}
          </select>
          <div className="md:col-span-3 flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={associateSaving}>
              {associateSaving ? 'Saving...' : 'Associate'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Custom fields</h2>
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {error}
          </div>
        )}
        {loading ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Format
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Required
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {customFields.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No custom fields found.
                    </td>
                  </tr>
                ) : (
                  customFields.map((field) => (
                    <tr key={field.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-900">{field.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{field.fieldFormat}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {field.isRequired ? 'Yes' : 'No'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">{field.position}</td>
                      <td className="px-4 py-2 text-right text-sm">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(field)}
                            className="btn btn-secondary flex items-center space-x-1"
                          >
                            <Edit className="w-4 h-4" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDelete(field.id)}
                            className="btn btn-secondary text-red-600 hover:bg-red-50 flex items-center space-x-1"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>Delete</span>
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
      </div>
    </div>
  );
}
