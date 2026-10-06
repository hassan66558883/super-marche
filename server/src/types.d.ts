import type { PermissionCode } from './config/permissions.js';

export interface AuthContext {
  userId: string;
  sessionId: string;
  username: string;
  fullName: string;
  roles: string[];
  permissions: Set<PermissionCode>;
  maxDiscountPercent: number;
  branchIds: string[];
  allBranches: boolean;
  defaultBranchId: string | null;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      branchId?: string;
    }
  }
}

export {};
