import { api } from './api';
import type { Dashboard, DashboardPeriod, Report, ReportCatalogItem, ReportParams } from '@/types/report';

export const ReportsApi = {
  catalog: () => api.get<ReportCatalogItem[]>('/reports'),
  run: (key: string, p: ReportParams) => api.get<Report>(`/reports/${key}`, { ...p }),
  export: (key: string, format: 'pdf' | 'xlsx' | 'csv', p: ReportParams) => api.download(`/reports/${key}/export`, { ...p, format }, `${key}.${format}`),
  dashboard: (period: DashboardPeriod, scope?: 'branch' | 'all') => api.get<Dashboard>('/dashboard', { period, scope }),
};
