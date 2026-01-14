import { useEffect, useMemo, useState } from 'react';
import { Copy, Edit, Plus, Trash2 } from 'lucide-react';
import {
  issueStatusesApi,
  rolesApi,
  trackersApi,
  workflowsApi,
} from '../../lib/api';
import Loading from '../../components/ui/Loading';

type WorkflowFormState = {
  roleId: string;
  trackerId: string;
  oldStatusId: string;
  newStatusId: string;
  author: boolean;
  assignee: boolean;
  fieldPermissions: string;
};

const emptyForm = (): WorkflowFormState => ({
  roleId: '',
  trackerId: '',
  oldStatusId: '',
  newStatusId: '',
  author: false,
  assignee: false,
  fieldPermissions: '{}',
});

export default function WorkflowsPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [trackers, setTrackers] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<WorkflowFormState>(emptyForm());

  const [filters, setFilters] = useState({ roleId: '', trackerId: '' });

  const [copyState, setCopyState] = useState({
    sourceTrackerId: '',
    targetTrackerId: '',
    sourceRoleId: '',
    targetRoleId: '',
  });
  const [copyError, setCopyError] = useState('');
  const [copySaving, setCopySaving] = useState(false);

  useEffect(() => {
    loadMasterData();
  }, []);

  useEffect(() => {
    loadRules();
  }, [filters]);

  const loadMasterData = async () => {
    try {
      const [rolesRes, trackersRes, statusesRes] = await Promise.all([
        rolesApi.getAll(),
        trackersApi.getAll(),
        issueStatusesApi.getAll(),
      ]);
      setRoles(rolesRes.data.data.roles || []);
      setTrackers(trackersRes.data.data.trackers || []);
      setStatuses(statusesRes.data.data.statuses || []);
    } catch (err) {
      console.error('Failed to load workflow master data:', err);
    }
  };

  const loadRules = async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = {};
      if (filters.roleId) params.roleId = filters.roleId;
      if (filters.trackerId) params.trackerId = filters.trackerId;
      const response = await workflowsApi.getAll(params);
      setRules(response.data.data.rules || []);
    } catch (err: any) {
      console.error('Failed to load workflow rules:', err);
      setError(err.response?.data?.message || 'Failed to load workflow rules.');
    } finally {
      setLoading(false);
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

    if (!formData.roleId || !formData.trackerId || !formData.oldStatusId || !formData.newStatusId) {
      setFormError('Role, tracker, old status, and new status are required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        roleId: Number(formData.roleId),
        trackerId: Number(formData.trackerId),
        oldStatusId: Number(formData.oldStatusId),
        newStatusId: Number(formData.newStatusId),
        author: formData.author,
        assignee: formData.assignee,
        fieldPermissions: formData.fieldPermissions || '{}',
      };

      if (editingId) {
        await workflowsApi.update(editingId, payload);
      } else {
        await workflowsApi.create(payload);
      }

      resetForm();
      loadRules();
    } catch (err: any) {
      console.error('Failed to save workflow rule:', err);
      setFormError(err.response?.data?.message || 'Failed to save workflow rule.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (rule: any) => {
    setEditingId(rule.id);
    setFormData({
      roleId: rule.roleId?.toString() || rule.role?.id?.toString() || '',
      trackerId: rule.trackerId?.toString() || rule.tracker?.id?.toString() || '',
      oldStatusId: rule.oldStatusId?.toString() || rule.oldStatus?.id?.toString() || '',
      newStatusId: rule.newStatusId?.toString() || rule.newStatus?.id?.toString() || '',
      author: !!rule.author,
      assignee: !!rule.assignee,
      fieldPermissions: rule.fieldPermissions || '{}',
    });
  };

  const handleDelete = async (ruleId: number) => {
    if (!confirm('Delete this workflow rule?')) return;
    try {
      await workflowsApi.delete(ruleId);
      loadRules();
    } catch (err) {
      console.error('Failed to delete workflow rule:', err);
      alert('Failed to delete workflow rule.');
    }
  };

  const handleCopy = async (event: React.FormEvent) => {
    event.preventDefault();
    setCopyError('');

    if (!copyState.sourceTrackerId || !copyState.targetTrackerId) {
      setCopyError('Source and target trackers are required.');
      return;
    }

    setCopySaving(true);
    try {
      await workflowsApi.copy({
        sourceTrackerId: Number(copyState.sourceTrackerId),
        targetTrackerId: Number(copyState.targetTrackerId),
        sourceRoleId: copyState.sourceRoleId ? Number(copyState.sourceRoleId) : undefined,
        targetRoleId: copyState.targetRoleId ? Number(copyState.targetRoleId) : undefined,
      });
      setCopyState({
        sourceTrackerId: '',
        targetTrackerId: '',
        sourceRoleId: '',
        targetRoleId: '',
      });
      loadRules();
    } catch (err: any) {
      console.error('Failed to copy workflow rules:', err);
      setCopyError(err.response?.data?.message || 'Failed to copy workflow rules.');
    } finally {
      setCopySaving(false);
    }
  };

  const roleOptions = useMemo(() => roles, [roles]);
  const trackerOptions = useMemo(() => trackers, [trackers]);
  const statusOptions = useMemo(() => statuses, [statuses]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Workflows</h1>
        <button className="btn btn-primary flex items-center space-x-2" onClick={resetForm}>
          <Plus className="w-4 h-4" />
          <span>New rule</span>
        </button>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          {editingId ? 'Edit workflow rule' : 'Create workflow rule'}
        </h2>
        {formError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <select
              value={formData.roleId}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, roleId: event.target.value }))
              }
              className="input"
              disabled={!!editingId}
            >
              <option value="">Select role</option>
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <select
              value={formData.trackerId}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, trackerId: event.target.value }))
              }
              className="input"
              disabled={!!editingId}
            >
              <option value="">Select tracker</option>
              {trackerOptions.map((tracker) => (
                <option key={tracker.id} value={tracker.id}>
                  {tracker.name}
                </option>
              ))}
            </select>
            <select
              value={formData.oldStatusId}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, oldStatusId: event.target.value }))
              }
              className="input"
              disabled={!!editingId}
            >
              <option value="">Select old status</option>
              {statusOptions.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
            <select
              value={formData.newStatusId}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, newStatusId: event.target.value }))
              }
              className="input"
              disabled={!!editingId}
            >
              <option value="">Select new status</option>
              {statusOptions.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center space-x-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.author}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, author: event.target.checked }))
                }
              />
              <span>Author only</span>
            </label>
            <label className="flex items-center space-x-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={formData.assignee}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, assignee: event.target.checked }))
                }
              />
              <span>Assignee only</span>
            </label>
          </div>

          <div>
            <label className="label">Field permissions (JSON)</label>
            <textarea
              value={formData.fieldPermissions}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, fieldPermissions: event.target.value }))
              }
              className="input"
              rows={3}
            />
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
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Copy rules</h2>
        {copyError && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
            {copyError}
          </div>
        )}
        <form onSubmit={handleCopy} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <select
            value={copyState.sourceTrackerId}
            onChange={(event) =>
              setCopyState((prev) => ({ ...prev, sourceTrackerId: event.target.value }))
            }
            className="input"
          >
            <option value="">Source tracker</option>
            {trackerOptions.map((tracker) => (
              <option key={tracker.id} value={tracker.id}>
                {tracker.name}
              </option>
            ))}
          </select>
          <select
            value={copyState.targetTrackerId}
            onChange={(event) =>
              setCopyState((prev) => ({ ...prev, targetTrackerId: event.target.value }))
            }
            className="input"
          >
            <option value="">Target tracker</option>
            {trackerOptions.map((tracker) => (
              <option key={tracker.id} value={tracker.id}>
                {tracker.name}
              </option>
            ))}
          </select>
          <select
            value={copyState.sourceRoleId}
            onChange={(event) =>
              setCopyState((prev) => ({ ...prev, sourceRoleId: event.target.value }))
            }
            className="input"
          >
            <option value="">Source role (optional)</option>
            {roleOptions.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <select
            value={copyState.targetRoleId}
            onChange={(event) =>
              setCopyState((prev) => ({ ...prev, targetRoleId: event.target.value }))
            }
            className="input"
          >
            <option value="">Target role (optional)</option>
            {roleOptions.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" className="btn btn-primary flex items-center space-x-2" disabled={copySaving}>
              <Copy className="w-4 h-4" />
              <span>{copySaving ? 'Copying...' : 'Copy rules'}</span>
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Workflow rules</h2>
          <div className="flex items-center space-x-3">
            <select
              value={filters.roleId}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, roleId: event.target.value }))
              }
              className="input w-48"
            >
              <option value="">All roles</option>
              {roleOptions.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <select
              value={filters.trackerId}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, trackerId: event.target.value }))
              }
              className="input w-48"
            >
              <option value="">All trackers</option>
              {trackerOptions.map((tracker) => (
                <option key={tracker.id} value={tracker.id}>
                  {tracker.name}
                </option>
              ))}
            </select>
          </div>
        </div>

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
                    Role
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tracker
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Transition
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rules
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No workflow rules found.
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-sm text-gray-900">
                        {rule.role?.name || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {rule.tracker?.name || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {rule.oldStatus?.name || '-'} → {rule.newStatus?.name || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-500">
                        {rule.author ? 'Author ' : ''}
                        {rule.assignee ? 'Assignee' : ''}
                        {!rule.author && !rule.assignee ? 'None' : ''}
                      </td>
                      <td className="px-4 py-2 text-right text-sm">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleEdit(rule)}
                            className="btn btn-secondary flex items-center space-x-1"
                          >
                            <Edit className="w-4 h-4" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDelete(rule.id)}
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
