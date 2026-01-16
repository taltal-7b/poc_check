import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

export const API_URL =
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  register: (data: {
    login: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  }) => api.post('/auth/register', data),

  login: (data: { login: string; password: string }) =>
    api.post('/auth/login', data),

  logout: () => api.post('/auth/logout'),

  getCurrentUser: () => api.get('/auth/me'),

  enableTwoFA: () => api.post('/auth/2fa/enable'),

  confirmTwoFA: (token: string) => api.post('/auth/2fa/confirm', { token }),

  verifyTwoFA: (token: string) => api.post('/auth/2fa/verify', { token }),

  disableTwoFA: () => api.post('/auth/2fa/disable'),
};

// Projects API
export const projectsApi = {
  getAll: (params?: any) => api.get('/projects', { params }),
  getById: (id: number) => api.get(`/projects/${id}`),
  create: (data: any) => api.post('/projects', data),
  update: (id: number, data: any) => api.put(`/projects/${id}`, data),
  delete: (id: number) => api.delete(`/projects/${id}`),
  getMembers: (id: number) => api.get(`/projects/${id}/members`),
  addMember: (id: number, data: any) => api.post(`/projects/${id}/members`, data),
  updateMember: (id: number, memberId: number, data: any) =>
    api.put(`/projects/${id}/members/${memberId}`, data),
  removeMember: (id: number, memberId: number) =>
    api.delete(`/projects/${id}/members/${memberId}`),
};

// Issues API
export const issuesApi = {
  getAll: (params?: any) => api.get('/issues', { params }),
  getById: (id: number) => api.get(`/issues/${id}`),
  create: (data: any) => api.post('/issues', data),
  update: (id: number, data: any) => api.put(`/issues/${id}`, data),
  delete: (id: number) => api.delete(`/issues/${id}`),
  getRelations: (id: number) => api.get(`/issues/${id}/relations`),
  addRelation: (id: number, data: any) =>
    api.post(`/issues/${id}/relations`, data),
  getWatchers: (id: number) => api.get(`/issues/${id}/watchers`),
  addWatcher: (id: number, userId: number) =>
    api.post(`/issues/${id}/watchers`, { userId }),
  removeWatcher: (id: number, userId: number) =>
    api.delete(`/issues/${id}/watchers/${userId}`),
  getTimeEntries: (id: number) => api.get(`/issues/${id}/time-entries`),
  addTimeEntry: (id: number, data: any) =>
    api.post(`/issues/${id}/time-entries`, data),
  getJournals: (id: number) => api.get(`/issues/${id}/journals`),
  addJournal: (id: number, data: any) =>
    api.post(`/issues/${id}/journals`, data),
  uploadIssueAttachments: (issueId: number, files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return api.post(`/issues/${issueId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  uploadJournalAttachments: (issueId: number, journalId: number, files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return api.post(`/issues/${issueId}/journals/${journalId}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getGanttData: (params?: any) => api.get('/issues/gantt', { params }),
};

// Gantt API
export const ganttApi = {
  getAll: (params?: any) => api.get('/issues/gantt', { params }),
  getByProject: (projectId: number, params?: any) => api.get(`/projects/${projectId}/issues/gantt`, { params }),
};

export const attachmentsApi = {
  delete: (id: number) => api.delete(`/attachments/${id}`),
  getDownloadUrl: (id: number) => `${API_URL}/attachments/${id}/download`,
};

// Users API
export const usersApi = {
  getAll: (params?: any) => api.get('/users', { params }),
  getById: (id: number) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: number, data: any) => api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
  toggleLock: (id: number) => api.post(`/users/${id}/lock`),
};

// Trackers API
export const trackersApi = {
  getAll: () => api.get('/trackers'),
};

// Issue Statuses API
export const issueStatusesApi = {
  getAll: () => api.get('/issue-statuses'),
};

// Issue Priorities API
export const issuePrioritiesApi = {
  getAll: () => api.get('/issue-priorities'),
};

// Time Entries API
export const timeEntriesApi = {
  getAll: (params?: any) => api.get('/time-entries', { params }),
  getById: (id: number) => api.get(`/time-entries/${id}`),
  create: (data: any) => api.post('/time-entries', data),
  update: (id: number, data: any) => api.put(`/time-entries/${id}`, data),
  delete: (id: number) => api.delete(`/time-entries/${id}`),
  getActivities: () => api.get('/time-entries/activities/list'),
  createActivity: (data: any) => api.post('/time-entries/activities', data),
  updateActivity: (id: number, data: any) =>
    api.put(`/time-entries/activities/${id}`, data),
  deleteActivity: (id: number) => api.delete(`/time-entries/activities/${id}`),
};

// Roles API
export const rolesApi = {
  getAll: () => api.get('/roles'),
  getById: (id: number) => api.get(`/roles/${id}`),
  create: (data: any) => api.post('/roles', data),
  update: (id: number, data: any) => api.put(`/roles/${id}`, data),
  delete: (id: number) => api.delete(`/roles/${id}`),
  getAvailablePermissions: () => api.get('/roles/permissions/available'),
};

// Groups API
export const groupsApi = {
  getAll: () => api.get('/groups'),
  getById: (id: number) => api.get(`/groups/${id}`),
  create: (data: any) => api.post('/groups', data),
  update: (id: number, data: any) => api.put(`/groups/${id}`, data),
  delete: (id: number) => api.delete(`/groups/${id}`),
  getUsers: (id: number) => api.get(`/groups/${id}/users`),
  addUser: (id: number, userId: number) =>
    api.post(`/groups/${id}/users`, { userId }),
  removeUser: (id: number, userId: number) =>
    api.delete(`/groups/${id}/users/${userId}`),
};

// Custom Fields API
export const customFieldsApi = {
  getAll: () => api.get('/custom-fields'),
  getById: (id: number) => api.get(`/custom-fields/${id}`),
  create: (data: any) => api.post('/custom-fields', data),
  update: (id: number, data: any) => api.put(`/custom-fields/${id}`, data),
  delete: (id: number) => api.delete(`/custom-fields/${id}`),
  associateWithProject: (data: any) =>
    api.post('/custom-fields/associate', data),
  getProjectCustomFields: (projectId: number, params?: any) =>
    api.get(`/projects/${projectId}/custom-fields`, { params }),
};

// Workflows API
export const workflowsApi = {
  getAll: (params?: any) => api.get('/workflows', { params }),
  getById: (id: number) => api.get(`/workflows/${id}`),
  create: (data: any) => api.post('/workflows', data),
  update: (id: number, data: any) => api.put(`/workflows/${id}`, data),
  delete: (id: number) => api.delete(`/workflows/${id}`),
  copy: (data: any) => api.post('/workflows/copy', data),
};

// News API
export const newsApi = {
  getAll: (params?: any) => api.get('/news', { params }),
  getById: (id: number) => api.get(`/news/${id}`),
  create: (data: any) => api.post('/news', data),
  update: (id: number, data: any) => api.put(`/news/${id}`, data),
  delete: (id: number) => api.delete(`/news/${id}`),
};
