import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

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
};

// Users API
export const usersApi = {
  getAll: (params?: any) => api.get('/users', { params }),
  getById: (id: number) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: number, data: any) => api.put(`/users/${id}`, data),
  delete: (id: number) => api.delete(`/users/${id}`),
};
