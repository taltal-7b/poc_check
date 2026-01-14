import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, Edit, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  issuesApi,
  projectsApi,
  timeEntriesApi,
  usersApi,
} from '../../lib/api';
import Loading from '../../components/ui/Loading';
import Pagination from '../../components/ui/Pagination';
import { useAuthStore } from '../../stores/authStore';

type TimeEntryFormState = {
  projectId: string;
  issueId: string;
  userId: string;
  hours: string;
  activityId: string;
  spentOn: string;
  comments: string;
};

type ActivityFormState = {
  id: number | null;
  name: string;
  position: string;
  isDefault: boolean;
};

const emptyTimeEntryForm = (): TimeEntryFormState => ({
  projectId: '',
  issueId: '',
  userId: '',
  hours: '',
  activityId: '',
  spentOn: new Date().toISOString().slice(0, 10),
  comments: '',
});

const emptyActivityForm = (): ActivityFormState => ({
  id: null,
  name: '',
  position: '1',
  isDefault: false,
});

export default function TimeEntriesPage() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [entries, setEntries] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalHours, setTotalHours] = useState('0.00');

  const [filters, setFilters] = useState({
    projectId: '',
    issueId: '',
    userId: '',
    from: '',
    to: '',
  });

  const [formData, setFormData] = useState<TimeEntryFormState>(
    emptyTimeEntryForm()
  );
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [activityForm, setActivityForm] = useState<ActivityFormState>(
    emptyActivityForm()
  );
  const [activityError, setActivityError] = useState('');
  const [activitySaving, setActivitySaving] = useState(false);

  const isAdmin = !!user?.admin;

  const issueOptions = useMemo(() => {
    if (!issues.length) return [];
    return issues.map((issue) => ({
      value: issue.id,
      label: `#${issue.id} ${issue.subject}`,
    }));
  }, [issues]);

  useEffect(() => {
    loadMasterData();
  }, []);

  useEffect(() => {
    loadTimeEntries();
  }, [page, filters]);

  useEffect(() => {
    if (searchParams.get('openForm') === 'true') {
      setShowForm(true);
      searchParams.delete('openForm');
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!formData.projectId) {
      setIssues([]);
      return;
    }
    loadIssuesForProject(formData.projectId);
  }, [formData.projectId]);

  const loadMasterData = async () => {
    try {
      const [projectsRes, activitiesRes] = await Promise.all([
        projectsApi.getAll(),
        timeEntriesApi.getActivities(),
      ]);
      setProjects(projectsRes.data.data.projects || []);
      setActivities(activitiesRes.data.data.activities || []);

      if (isAdmin) {
        const usersRes = await usersApi.getAll({ limit: 200 });
        setUsers(usersRes.data.data.users || []);
      }
    } catch (err) {
      console.error('Failed to load master data:', err);
    }
  };

  const loadIssuesForProject = async (projectId: string) => {
    try {
      const response = await issuesApi.getAll({ projectId, limit: 200 });
      setIssues(response.data.data.issues || []);
    } catch (err) {
      console.error('Failed to load project issues:', err);
      setIssues([]);
    }
  };

  const loadTimeEntries = async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { page, limit: 25 };
      if (filters.projectId) params.projectId = filters.projectId;
      if (filters.issueId) params.issueId = filters.issueId;
      if (filters.userId) params.userId = filters.userId;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;

      const response = await timeEntriesApi.getAll(params);
      const { timeEntries, pagination, totalHours: hours } =
        response.data.data;

      setEntries(timeEntries || []);
      setTotalPages(pagination.pages || 1);
      setTotalHours(hours || '0.00');
    } catch (err: any) {
      console.error('Failed to load time entries:', err);
      setError(
        err.response?.data?.message || 'Failed to load time entries.'
      );
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData(emptyTimeEntryForm());
    setEditingId(null);
    setFormError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');

    if (!formData.projectId || !formData.hours || !formData.activityId) {
      setFormError('Project, hours, and activity are required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        projectId: Number(formData.projectId),
        issueId: formData.issueId ? Number(formData.issueId) : null,
        hours: Number(formData.hours),
        activityId: Number(formData.activityId),
        spentOn: formData.spentOn,
        comments: formData.comments,
        userId: isAdmin && formData.userId ? Number(formData.userId) : undefined,
      };

      if (editingId) {
        await timeEntriesApi.update(editingId, payload);
      } else {
        await timeEntriesApi.create(payload);
      }

      resetForm();
      setShowForm(false);
      loadTimeEntries();
    } catch (err: any) {
      console.error('Failed to save time entry:', err);
      setFormError(
        err.response?.data?.message || 'Failed to save time entry.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (entry: any) => {
    setEditingId(entry.id);
    setShowForm(true);
    setFormData({
      projectId: entry.projectId?.toString() || '',
      issueId: entry.issueId?.toString() || '',
      userId: entry.user?.id?.toString() || '',
      hours: entry.hours?.toString() || '',
      activityId: entry.activityId?.toString() || '',
      spentOn: entry.spentOn ? entry.spentOn.slice(0, 10) : '',
      comments: entry.comments || '',
    });
  };

  const handleDelete = async (entryId: number) => {
    if (!confirm('Delete this time entry?')) return;
    try {
      await timeEntriesApi.delete(entryId);
      loadTimeEntries();
    } catch (err) {
      console.error('Failed to delete time entry:', err);
      alert('Failed to delete time entry.');
    }
  };

  const handleActivitySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setActivityError('');

    if (!activityForm.name.trim()) {
      setActivityError('Activity name is required.');
      return;
    }

    setActivitySaving(true);
    try {
      const payload = {
        name: activityForm.name.trim(),
        position: Number(activityForm.position) || 1,
        isDefault: activityForm.isDefault,
      };

      if (activityForm.id) {
        await timeEntriesApi.updateActivity(activityForm.id, payload);
      } else {
        await timeEntriesApi.createActivity(payload);
      }

      setActivityForm(emptyActivityForm());
      loadMasterData();
    } catch (err: any) {
      console.error('Failed to save activity:', err);
      setActivityError(
        err.response?.data?.message || 'Failed to save activity.'
      );
    } finally {
      setActivitySaving(false);
    }
  };

  const handleActivityEdit = (activity: any) => {
    setActivityForm({
      id: activity.id,
      name: activity.name || '',
      position: activity.position?.toString() || '1',
      isDefault: !!activity.isDefault,
    });
  };

  const handleActivityDelete = async (activityId: number) => {
    if (!confirm('Delete this activity?')) return;
    try {
      await timeEntriesApi.deleteActivity(activityId);
      loadMasterData();
    } catch (err) {
      console.error('Failed to delete activity:', err);
      alert('Failed to delete activity.');
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ja-JP');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Clock className="w-7 h-7 text-primary-600" />
          <h1 className="text-3xl font-bold text-gray-900">Time Entries</h1>
        </div>
        <button
          onClick={() => setShowForm((prev) => !prev)}
          className="btn btn-primary flex items-center space-x-2"
        >
          <Plus className="w-4 h-4" />
          <span>{showForm ? 'Close form' : 'Log time'}</span>
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {editingId ? 'Edit Time Entry' : 'Log Time'}
          </h2>
          {formError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {formError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Project *</label>
                <select
                  value={formData.projectId}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      projectId: event.target.value,
                      issueId: '',
                    }))
                  }
                  className="input"
                  required
                >
                  <option value="">Select project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Activity *</label>
                <select
                  value={formData.activityId}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      activityId: event.target.value,
                    }))
                  }
                  className="input"
                  required
                >
                  <option value="">Select activity</option>
                  {activities.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.name}
                      {activity.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Issue</label>
                {issueOptions.length ? (
                  <select
                    value={formData.issueId}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        issueId: event.target.value,
                      }))
                    }
                    className="input"
                  >
                    <option value="">No issue</option>
                    {issueOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="number"
                    min={1}
                    value={formData.issueId}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        issueId: event.target.value,
                      }))
                    }
                    className="input"
                    placeholder="Issue ID (optional)"
                  />
                )}
              </div>
              <div>
                <label className="label">Date *</label>
                <input
                  type="date"
                  value={formData.spentOn}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      spentOn: event.target.value,
                    }))
                  }
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="label">Hours *</label>
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={formData.hours}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      hours: event.target.value,
                    }))
                  }
                  className="input"
                  required
                />
              </div>
              {isAdmin && (
                <div>
                  <label className="label">User</label>
                  <select
                    value={formData.userId}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        userId: event.target.value,
                      }))
                    }
                    className="input"
                  >
                    <option value="">Use current user</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName} ({u.login})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className="label">Comments</label>
              <textarea
                value={formData.comments}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    comments: event.target.value,
                  }))
                }
                className="input"
                rows={3}
              />
            </div>

            <div className="flex justify-end space-x-3">
              {editingId && (
                <button
                  type="button"
                  onClick={() => resetForm()}
                  className="btn btn-secondary"
                  disabled={saving}
                >
                  Cancel edit
                </button>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
          <button
            onClick={() =>
              setFilters({ projectId: '', issueId: '', userId: '', from: '', to: '' })
            }
            className="btn btn-secondary flex items-center space-x-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reset</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <select
            value={filters.projectId}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                projectId: event.target.value,
              }))
            }
            className="input"
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            value={filters.issueId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, issueId: event.target.value }))
            }
            className="input"
            placeholder="Issue ID"
          />
          {isAdmin && (
            <select
              value={filters.userId}
              onChange={(event) =>
                setFilters((prev) => ({
                  ...prev,
                  userId: event.target.value,
                }))
              }
              className="input"
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.firstName} {u.lastName} ({u.login})
                </option>
              ))}
            </select>
          )}
          <input
            type="date"
            value={filters.from}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, from: event.target.value }))
            }
            className="input"
          />
          <input
            type="date"
            value={filters.to}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, to: event.target.value }))
            }
            className="input"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="py-12">
            <Loading />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Issue
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Activity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hours
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Comments
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {entries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-6 py-12 text-center text-gray-500"
                      >
                        No time entries found.
                      </td>
                    </tr>
                  ) : (
                    entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(entry.spentOn)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {entry.project?.name || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {entry.issue ? (
                            <span>
                              #{entry.issue.id} {entry.issue.subject}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {entry.user
                            ? `${entry.user.firstName} ${entry.user.lastName}`
                            : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {entry.activity?.name || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {entry.hours}h
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          <div className="max-w-xs truncate">
                            {entry.comments || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex justify-end space-x-2">
                            <button
                              onClick={() => handleEdit(entry)}
                              className="btn btn-secondary flex items-center space-x-1"
                            >
                              <Edit className="w-4 h-4" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleDelete(entry.id)}
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
            {totalPages > 1 && (
              <div className="border-t border-gray-200">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {!loading && (
        <div className="text-sm text-gray-600 text-center">
          Total hours: {totalHours}h
        </div>
      )}

      {isAdmin && (
        <div className="card">
          <div className="flex items-center space-x-2 mb-4">
            <Clock className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Activity Management
            </h2>
          </div>
          {activityError && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">
              {activityError}
            </div>
          )}
          <form onSubmit={handleActivitySubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="text"
                value={activityForm.name}
                onChange={(event) =>
                  setActivityForm((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                className="input"
                placeholder="Activity name"
                required
              />
              <input
                type="number"
                min={1}
                value={activityForm.position}
                onChange={(event) =>
                  setActivityForm((prev) => ({
                    ...prev,
                    position: event.target.value,
                  }))
                }
                className="input"
                placeholder="Position"
              />
              <label className="flex items-center space-x-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={activityForm.isDefault}
                  onChange={(event) =>
                    setActivityForm((prev) => ({
                      ...prev,
                      isDefault: event.target.checked,
                    }))
                  }
                />
                <span>Default</span>
              </label>
            </div>
            <div className="flex justify-end space-x-3">
              {activityForm.id && (
                <button
                  type="button"
                  onClick={() => setActivityForm(emptyActivityForm())}
                  className="btn btn-secondary"
                  disabled={activitySaving}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={activitySaving}
              >
                {activitySaving
                  ? 'Saving...'
                  : activityForm.id
                  ? 'Update'
                  : 'Add'}
              </button>
            </div>
          </form>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Position
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Default
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {activities.map((activity) => (
                  <tr key={activity.id}>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {activity.name}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {activity.position}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {activity.isDefault ? 'Yes' : 'No'}
                    </td>
                    <td className="px-4 py-2 text-right text-sm">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleActivityEdit(activity)}
                          className="btn btn-secondary"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleActivityDelete(activity.id)}
                          className="btn btn-secondary text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!activities.length && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-sm text-gray-500"
                    >
                      No activities found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
