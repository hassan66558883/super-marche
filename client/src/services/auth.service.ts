import { api, configureApi, request } from './api';
import { useAuthStore } from '@/stores/auth.store';
import type { CurrentUser } from '@/types/auth';

interface AuthResult {
  accessToken: string;
  user: CurrentUser;
}

let refreshing: Promise<string | null> | null = null;

/** Single-flight refresh: concurrent 401s share one refresh request. */
export function refreshSession(): Promise<string | null> {
  refreshing ??= request<AuthResult>('/auth/refresh', { method: 'POST', skipAuthRetry: true })
    .then((r) => {
      useAuthStore.getState().setSession(r.data.accessToken, r.data.user);
      return r.data.accessToken;
    })
    .catch(() => {
      useAuthStore.getState().clear();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

configureApi({
  getToken: () => useAuthStore.getState().accessToken,
  getBranchId: () => useAuthStore.getState().branchId,
  refresh: refreshSession,
  onAuthFailure: () => useAuthStore.getState().clear(),
});

export const AuthApi = {
  async login(identifier: string, password: string, rememberMe: boolean) {
    const r = await api.post<AuthResult>('/auth/login', { identifier, password, rememberMe });
    useAuthStore.getState().setSession(r.accessToken, r.user);
    return r.user;
  },
  async logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      useAuthStore.getState().clear();
    }
  },
  me: () => api.get<CurrentUser>('/auth/me'),
  updatePreferences: async (prefs: Partial<Pick<CurrentUser, 'locale' | 'theme' | 'defaultBranchId'>>) => {
    const user = await api.patch<CurrentUser>('/auth/me/preferences', prefs);
    useAuthStore.getState().setUser(user);
    return user;
  },
  changePassword: (currentPassword: string, newPassword: string) => api.post('/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (identifier: string) => api.post<{ message: string }>('/auth/forgot-password', { identifier }),
  resetPassword: (token: string, newPassword: string) => api.post('/auth/reset-password', { token, newPassword }),
  sessions: () => api.get<{ id: string; userAgent: string | null; ipAddress: string | null; createdAt: string; lastUsedAt: string; current: boolean }[]>('/auth/sessions'),
  revokeSession: (id: string) => api.delete(`/auth/sessions/${id}`),
};
