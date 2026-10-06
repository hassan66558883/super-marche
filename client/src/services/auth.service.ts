import { api, ApiError, configureApi, networkListeners, request } from './api';
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
    .catch((e) => {
      // Server unreachable: keep working offline with the profile of the last signed-in user
      const network = e instanceof ApiError && (e.status === 0 || (e.status >= 502 && e.status <= 504));
      const cached = network ? readOfflineProfile() : null;
      if (cached) useAuthStore.getState().setOfflineSession(cached);
      else useAuthStore.getState().clear();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const PROFILE_KEY = 'technova-offline-profile';
function readOfflineProfile(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    const v = raw ? (JSON.parse(raw) as { user: CurrentUser; savedAt: number }) : null;
    // A stale profile (more than 7 days) must sign in again
    return v && Date.now() - v.savedAt < 7 * 86_400_000 ? v.user : null;
  } catch { return null; }
}
useAuthStore.subscribe((state, prev) => {
  try {
    if (state.accessToken && state.user && (state.user !== prev.user || !prev.accessToken)) localStorage.setItem(PROFILE_KEY, JSON.stringify({ user: state.user, savedAt: Date.now() }));
    if (state.status === 'anonymous') localStorage.removeItem(PROFILE_KEY);
  } catch { /* storage disabled */ }
});
// Back online after an offline start: get a real access token
networkListeners.add((reachable) => {
  const s = useAuthStore.getState();
  if (reachable && s.offline && !refreshing) void refreshSession();
});

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
