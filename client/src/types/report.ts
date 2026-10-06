export type ColType = 'text' | 'money' | 'qty' | 'int' | 'percent' | 'date' | 'datetime' | 'enum';
export type Cell = string | number | null;

export interface ReportColumn { key: string; type: ColType; label: string }

export interface ReportCatalogItem { key: string; group: 'sales' | 'finance' | 'stock' | 'partners' | 'operations'; maxDays: number; allowed: boolean }

export interface Report {
  key: string;
  title: string;
  columns: ReportColumn[];
  valueLabels: Record<string, string>;
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
  chart?: { kind: 'bar' | 'line' | 'pie'; x: string; y: string[] };
  snapshot?: boolean;
  from: string;
  to: string;
  tz: string;
  branchLabel: string | null;
  company: string;
  generatedAt: string;
  generatedBy: string;
}

export interface ReportParams { from?: string; to?: string; scope?: 'branch' | 'all'; lang?: string }

export type DashboardPeriod = 'today' | 'week' | 'month';

export interface Dashboard {
  period: DashboardPeriod;
  from: string;
  to: string;
  scope: 'branch' | 'all';
  salesVisible: boolean;
  kpis: {
    sales?: string; grossSales?: string; returns?: string; discounts?: string; profit?: string;
    transactions?: number; avgBasket?: string; cash?: string; card?: string; mobileMoney?: string;
    credit?: string; creditCount?: number; lowStock: number; outOfStock: number;
  };
  payments: { code: string; name: string; type: string; amount: string }[];
  topProducts: { id: string; name: string; qty: string; revenue: string }[];
  topCategories: { name: string | null; revenue: string }[];
  byHour: { hour: number; transactions: number; sales: string }[];
  byBranch: { id: string; name: string; transactions: number; sales: string }[];
  trend: { day: string; transactions: number; sales: string; profit?: string }[];
  recent: {
    id: string; invoiceNumber: string; createdAt: string; total: string; status: string; paymentStatus: string;
    customer: { name: string } | null; cashier: { fullName: string };
  }[];
}
