import { z } from 'zod';
import { pageQuery, dateRange } from '../utils/pagination.js';

const qty = z.coerce.number().min(0).max(1e9);
const posQty = z.coerce.number().positive().max(1e9);
const money = z.coerce.number().min(0).max(1e12);
const optText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

export const adjustInput = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional().nullable(),
  /** SET: new counted quantity · DELTA: signed change · DAMAGE: quantity lost (positive) */
  mode: z.enum(['SET', 'DELTA', 'DAMAGE']),
  quantity: z.coerce.number().min(-1e9).max(1e9),
  note: z.string().trim().min(3, 'Indiquez le motif').max(300),
});
export type AdjustInput = z.infer<typeof adjustInput>;

export const movementQuery = pageQuery.merge(dateRange).extend({
  productId: z.string().uuid().optional(),
  type: z.enum(['PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'DAMAGE', 'OPENING']).optional(),
});

const lineInput = z.object({ productId: z.string().uuid(), variantId: z.string().uuid().optional().nullable(), quantity: posQty });

export const transferInput = z.object({
  toBranchId: z.string().uuid(),
  items: z.array(lineInput).min(1).max(300),
  note: optText(500),
  submit: z.boolean().default(true),
});
export type TransferInput = z.infer<typeof transferInput>;

export const transferListQuery = pageQuery.extend({
  status: z.enum(['DRAFT', 'REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED']).optional(),
  direction: z.enum(['in', 'out', 'all']).default('all'),
});

export const receiveTransferInput = z.object({
  items: z.array(z.object({ itemId: z.string().uuid(), receivedQuantity: qty })).min(1),
  note: optText(500),
});

export const purchaseInput = z.object({
  supplierId: z.string().uuid(),
  items: z.array(lineInput.extend({ unitCost: money, taxRate: z.coerce.number().min(0).max(100).default(0) })).min(1).max(300),
  expectedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: optText(500),
  submit: z.boolean().default(false),
});
export type PurchaseInput = z.infer<typeof purchaseInput>;

export const purchaseListQuery = pageQuery.merge(dateRange).extend({
  status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'RECEIVED', 'CANCELLED']).optional(),
  supplierId: z.string().uuid().optional(),
});

export const receivePurchaseInput = z.object({
  items: z.array(z.object({ itemId: z.string().uuid(), quantity: qty })).min(1),
  updateCost: z.boolean().default(true),
  note: optText(500),
});

export const supplierPaymentInput = z.object({
  amount: z.coerce.number().positive().max(1e12),
  method: z.string().trim().min(1).max(40),
  reference: optText(120),
  note: optText(300),
  /** Cash taken from the caller's open register */
  fromRegister: z.boolean().default(false),
});

export const supplierListQuery = pageQuery.extend({
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
  withBalance: z.enum(['true', 'false']).optional(),
});
