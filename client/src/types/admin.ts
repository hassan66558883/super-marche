export interface BranchRef { id: string; code: string; name: string }
export interface RoleRef { id: string; code: string; name: string }

export interface AdminUser {
  id: string; username: string; email: string | null; fullName: string; phone: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'LOCKED'; locked: boolean; locale: 'fr' | 'ar' | 'en';
  defaultBranchId: string | null; lastLoginAt: string | null; createdAt: string;
  roles: RoleRef[]; branches: BranchRef[];
}

export interface UserInput {
  username: string; email?: string | null; fullName: string; phone?: string | null;
  roleIds: string[]; branchIds: string[]; defaultBranchId: string; locale: 'fr' | 'ar' | 'en'; password?: string;
}

export interface Role {
  id: string; code: string; name: string; description: string | null; isSystem: boolean;
  maxDiscountPercent: string; userCount: number; permissions: string[];
}
export interface RoleInput { code: string; name: string; description?: string | null; maxDiscountPercent: number; permissions: string[] }
export interface Permission { code: string; module: string; description: string }

export interface AuditEntry {
  id: string; action: string; module: string; recordId: string | null; description: string | null;
  metadata: unknown; ipAddress: string | null; userAgent: string | null; createdAt: string;
  branchId: string | null; branchName: string | null;
  user: { id: string; fullName: string; username: string } | null;
}

export interface ManagedBranch {
  id: string; code: string; name: string; address: string | null; city: string | null; phone: string | null; email: string | null;
  isHeadOffice: boolean; status: 'ACTIVE' | 'INACTIVE'; defaultTaxId: string | null;
  defaultTax: { id: string; name: string; rate: string } | null;
  registers: { id: string; name: string; status: 'ACTIVE' | 'INACTIVE' }[];
  _count: { users: number };
}
export interface BranchInput { code: string; name: string; address?: string | null; city?: string | null; phone?: string | null; email?: string | null; defaultTaxId?: string | null; status: 'ACTIVE' | 'INACTIVE' }

export interface AdminPaymentMethod { id: string; code: string; name: string; type: string; provider: string | null; isActive: boolean; sortOrder: number }
