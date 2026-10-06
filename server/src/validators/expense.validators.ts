import { z } from 'zod';
import { pageQuery, dateRange } from '../utils/pagination.js';

const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

export const expenseInput = z.object({
  categoryId: z.string().uuid(),
  amount: z.coerce.number().positive().max(1e12),
  description: z.string().trim().min(2, 'Décrivez la dépense').max(300),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  method: z.string().trim().min(1).max(40).default('CASH'),
  reference: optText(120),
  /** Cash taken from the caller's open register (CASH only) */
  fromRegister: z.boolean().default(false),
});
export type ExpenseInput = z.infer<typeof expenseInput>;

export const expenseListQuery = pageQuery.merge(dateRange).extend({
  categoryId: z.string().uuid().optional(),
  status: z.enum(['RECORDED', 'VOID']).optional(),
  userId: z.string().uuid().optional(),
});

export const voidExpenseInput = z.object({ reason: z.string().trim().min(3, 'Indiquez le motif').max(300) });

export const expenseCategoryInput = z.object({
  name: z.string().trim().min(2).max(80),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
