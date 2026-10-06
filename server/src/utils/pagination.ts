import { z } from 'zod';
import { businessTz } from './tz.js';
import { localMidnightUtc, addDaysIso } from '../services/reports/time.js';

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(120).optional(),
  sort: z.string().max(40).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type PageQuery = z.infer<typeof pageQuery>;

export const paging = (q: { page: number; pageSize: number }) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

/** Whitelisted sort → Prisma orderBy */
export function orderBy<T extends string>(sort: string | undefined, order: 'asc' | 'desc', allowed: readonly T[], fallback: T) {
  const field = (allowed as readonly string[]).includes(sort ?? '') ? (sort as T) : fallback;
  return { [field]: order } as Record<T, 'asc' | 'desc'>;
}

export const dateRange = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Inclusive business-day range (in the business time zone) → [gte, lt) UTC bounds */
export function dayBounds(from?: string, to?: string) {
  const gte = from ? localMidnightUtc(from, businessTz()) : undefined;
  const lt = to ? localMidnightUtc(addDaysIso(to, 1), businessTz()) : undefined;
  return gte || lt ? { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } : undefined;
}

export const uuid = z.string().uuid();
export const optionalUuid = z.string().uuid().optional().or(z.literal('').transform(() => undefined));
