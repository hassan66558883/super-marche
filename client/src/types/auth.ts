export interface BranchSummary {
  id: string;
  code: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  isHeadOffice: boolean;
}

export interface CurrentUser {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  phone: string | null;
  locale: 'fr' | 'ar' | 'en';
  theme: 'light' | 'dark' | 'system';
  roles: { code: string; name: string }[];
  permissions: string[];
  maxDiscountPercent: number;
  branches: BranchSummary[];
  defaultBranchId: string | null;
}
