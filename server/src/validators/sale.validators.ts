import { z } from 'zod';
import { pageQuery, dateRange } from '../utils/pagination.js';

const money = z.coerce.number().min(0).max(1e12);

export const saleItemInput = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  quantity: z.coerce.number().positive().max(1e6),
  /** Override of the catalog price — requires sales.price_override */
  unitPrice: money.optional().nullable(),
  discountType: z.enum(['PERCENT', 'FIXED']).optional().nullable(),
  discountValue: money.optional().nullable(),
  /** Override the resolved tax for this line — requires sales.price_override */
  taxId: z.string().uuid().optional().nullable(),
});

export const salePaymentInput = z.object({
  method: z.string().trim().min(1).max(40), // payment_methods.code
  amount: money,
  reference: z.string().trim().max(120).optional().nullable(),
});

export const saleInput = z.object({
  clientRef: z.string().trim().min(8).max(80).optional(),
  customerId: z.string().uuid().optional().nullable(),
  items: z.array(saleItemInput).min(1, 'Le panier est vide').max(500),
  cartDiscount: z.object({ type: z.enum(['PERCENT', 'FIXED']), value: money }).optional().nullable(),
  payments: z.array(salePaymentInput).min(1, 'Aucun paiement').max(10),
  priceList: z.enum(['RETAIL', 'WHOLESALE']).default('RETAIL'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  /** When the sale was rung up offline (sync); informational only */
  offlineCreatedAt: z.string().datetime().optional().nullable(),
});
export type SaleInput = z.infer<typeof saleInput>;

export const saleListQuery = pageQuery.merge(dateRange).extend({
  status: z.enum(['COMPLETED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED']).optional(),
  paymentStatus: z.enum(['PAID', 'PARTIAL', 'CREDIT']).optional(),
  cashierId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  /** Customer invoices with money still owed (PARTIAL or CREDIT) */
  unpaid: z.enum(['true', 'false']).optional(),
  /** Unpaid invoices past their due date */
  overdue: z.enum(['true', 'false']).optional(),
  registerSessionId: z.string().uuid().optional(),
});

export const cancelInput = z.object({ reason: z.string().trim().min(3).max(500) });

export const holdInput = z.object({
  label: z.string().trim().min(1).max(80),
  customerId: z.string().uuid().optional().nullable(),
  cart: z.record(z.unknown()),
  itemCount: z.coerce.number().int().min(0),
  total: money,
});

export const returnInput = z.object({
  reason: z.enum(['DAMAGED', 'WRONG_PRODUCT', 'CUSTOMER_REQUEST', 'OTHER']),
  note: z.string().trim().max(500).optional().nullable(),
  refundMethod: z.string().trim().min(1).max(40).default('CASH'),
  items: z.array(z.object({
    saleItemId: z.string().uuid(),
    quantity: z.coerce.number().positive(),
    restock: z.boolean().optional(),
  })).min(1),
});
export type ReturnInput = z.infer<typeof returnInput>;
