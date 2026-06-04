import axios from 'axios';
import { useAuthStore } from '../stores/auth';
import { buildLoginNavigateTo } from '../utils/return-path';

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

let refreshAccessTokenPromise: Promise<string> | null = null;

api.interceptors.request.use((cfg) => {
  const token = useAuthStore.getState().accessToken;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  const lang = localStorage.getItem('language') || 'ja';
  cfg.headers['Accept-Language'] = lang;
  return cfg;
});

function isPublicAuthRequestUrl(url: string | undefined): boolean {
  if (!url) return false;
  return (
    url.startsWith('/auth/login') ||
    url.startsWith('/auth/register') ||
    url.startsWith('/auth/password')
  );
}

function redirectToLoginPreservingReturn(): void {
  const path = window.location.pathname;
  if (path === '/login' || path === '/register' || path.startsWith('/password/')) return;
  window.location.assign(buildLoginNavigateTo(`${path}${window.location.search}`));
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  refreshAccessTokenPromise ??= axios
    .post('/api/v1/auth/refresh', { refreshToken })
    .then((res) => {
      const { accessToken, refreshToken: nextRefreshToken } = res.data.data;
      useAuthStore.getState().setTokens(accessToken, nextRefreshToken ?? refreshToken);
      return accessToken;
    })
    .finally(() => {
      refreshAccessTokenPromise = null;
    });

  return refreshAccessTokenPromise;
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry) {
      if (isPublicAuthRequestUrl(String(original.url ?? ''))) {
        return Promise.reject(error);
      }
      original._retry = true;
      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        try {
          const accessToken = await refreshAccessToken(refreshToken);
          original.headers = original.headers ?? {};
          original.headers.Authorization = `Bearer ${accessToken}`;
          return api(original);
        } catch {
          useAuthStore.getState().logout();
        }
      } else {
        useAuthStore.getState().logout();
      }
      redirectToLoginPreservingReturn();
      return Promise.reject(error);
    }
    return Promise.reject(error);
  },
);

export default api;
