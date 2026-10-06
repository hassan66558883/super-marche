import { api } from './api';
import type {
  AdminPaymentMethod, AdminUser, AuditEntry, BranchInput, ManagedBranch, Permission, Role, RoleInput, UserInput,
} from '@/types/admin';

type Q = Record<string, string | number | undefined>;

export const UsersApi = {
  list: (q: Q) => api.page<AdminUser>('/users', q),
  create: (b: UserInput) => api.post<AdminUser>('/users', b),
  update: (id: string, b: UserInput) => api.put<AdminUser>(`/users/${id}`, b),
  setStatus: (id: string, status: 'ACTIVE' | 'INACTIVE') => api.post<AdminUser>(`/users/${id}/status`, { status }),
  resetPassword: (id: string, password: string) => api.post<{ ok: true }>(`/users/${id}/password`, { password }),
};

export const RolesApi = {
  list: () => api.get<Role[]>('/roles'),
  permissions: () => api.get<Permission[]>('/roles/permissions'),
  create: (b: RoleInput) => api.post<Role>('/roles', b),
  update: (id: string, b: RoleInput) => api.put<Role>(`/roles/${id}`, b),
  remove: (id: string) => api.delete<{ ok: true }>(`/roles/${id}`),
};

export const AuditApi = {
  list: (q: Q) => api.page<AuditEntry>('/audit', q),
  meta: () => api.get<{ modules: string[]; users: { id: string; fullName: string }[] }>('/audit/meta'),
};

export const BranchAdminApi = {
  list: () => api.get<ManagedBranch[]>('/branches/manage'),
  create: (b: BranchInput) => api.post<ManagedBranch>('/branches', b),
  update: (id: string, b: BranchInput) => api.put<ManagedBranch>(`/branches/${id}`, b),
  addRegister: (branchId: string, b: { name: string; status: 'ACTIVE' | 'INACTIVE' }) => api.post(`/branches/${branchId}/registers`, b),
  updateRegister: (branchId: string, id: string, b: { name: string; status: 'ACTIVE' | 'INACTIVE' }) => api.put(`/branches/${branchId}/registers/${id}`, b),
};

export const PaymentMethodAdminApi = {
  list: () => api.get<AdminPaymentMethod[]>('/admin/payment-methods'),
  create: (b: Omit<AdminPaymentMethod, 'id'>) => api.post<AdminPaymentMethod>('/admin/payment-methods', b),
  update: (id: string, b: Omit<AdminPaymentMethod, 'id'>) => api.put<AdminPaymentMethod>(`/admin/payment-methods/${id}`, b),
};

export const SettingsApi = {
  /** `branch` saves an override for the current branch (e.g. its own printer). */
  update: <T,>(key: string, value: T, scope?: 'branch') => api.put<T>(`/settings/${key}${scope ? `?scope=${scope}` : ''}`, value),
};

export const PrintApi = {
  escpos: (bytes: Uint8Array) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return api.post<{ bytes: number }>('/print/escpos', { data: btoa(bin) });
  },
};
