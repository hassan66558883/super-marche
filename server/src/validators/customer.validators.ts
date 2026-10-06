import { z } from 'zod';
import { pageQuery } from '../utils/pagination.js';

const optStr = (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const customerInput = z.object({
  type: z.enum(['WALK_IN', 'REGISTERED', 'BUSINESS']).default('REGISTERED'),
  name: z.string().trim().min(1).max(120),
  phone: optStr(40),
  email: z.string().trim().email().max(120).optional().nullable().or(z.literal('').transform(() => null)),
  address: optStr(300),
  taxId: optStr(60),
  creditLimit: z.coerce.number().min(0).max(1e12).default(0),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
  notes: optStr(1000),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export type CustomerInput = z.infer<typeof customerInput>;

export const customerListQuery = pageQuery.extend({
  type: z.enum(['WALK_IN', 'REGISTERED', 'BUSINESS']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
  withBalance: z.enum(['true', 'false']).optional(),
});

export const supplierInput = z.object({
  name: z.string().trim().min(1).max(120),
  company: optStr(160),
  phone: optStr(40),
  email: z.string().trim().email().max(120).optional().nullable().or(z.literal('').transform(() => null)),
  address: optStr(300),
  taxId: optStr(60),
  paymentTerms: optStr(80),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export type SupplierInput = z.infer<typeof supplierInput>;

export const customerPaymentInput = z.object({
  amount: z.coerce.number().positive().max(1e12),
  method: z.string().trim().min(1).max(40),
  reference: optStr(120),
  note: optStr(300),
});
