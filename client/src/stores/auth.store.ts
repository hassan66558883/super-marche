import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CurrentUser } from '@/types/auth';

interface AuthState {
  accessToken: string | null;
  user: CurrentUser | null;
  branchId: string | null;
  status: 'unknown' | 'authenticated' | 'anonymous';
  setSession: (token: string, user: CurrentUser) => void;
  setUser: (user: CurrentUser) => void;
  setBranch: (branchId: string) => void;
  clear: () => void;
  can: (permission: string) => boolean;
}

/**
 * The access token lives in memory only (never localStorage). The refresh token is an
 * httpOnly cookie. Only the chosen branch is persisted so it survives reloads.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      branchId: null,
      status: 'unknown',
      setSession: (accessToken, user) => {
        const current = get().branchId;
        const valid = current && user.branches.some((b) => b.id === current);
        set({ accessToken, user, status: 'authenticated', branchId: valid ? current : user.defaultBranchId ?? user.branches[0]?.id ?? null });
      },
      setUser: (user) => set({ user }),
      setBranch: (branchId) => set({ branchId }),
      clear: () => set({ accessToken: null, user: null, status: 'anonymous' }),
      can: (permission) => Boolean(get().user?.permissions.includes(permission)),
    }),
    { name: 'technova-auth', partialize: (s) => ({ branchId: s.branchId }) },
  ),
);

export const useCan = (permission: string) => useAuthStore((s) => Boolean(s.user?.permissions.includes(permission)));
export const useCurrentBranch = () =>
  useAuthStore((s) => s.user?.branches.find((b) => b.id === s.branchId) ?? null);
