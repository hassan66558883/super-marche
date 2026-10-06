import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (AAAA-MM-JJ)');

export const reportQuery = z.object({
  from: day.optional(),
  to: day.optional(),
  scope: z.enum(['branch', 'all']).optional(),
  lang: z.enum(['fr', 'en', 'ar']).optional(),
});

export const reportExportQuery = reportQuery.extend({ format: z.enum(['pdf', 'xlsx', 'csv']) });

export const dashboardQuery = z.object({
  period: z.enum(['today', 'week', 'month']).default('today'),
  scope: z.enum(['branch', 'all']).optional(),
});
