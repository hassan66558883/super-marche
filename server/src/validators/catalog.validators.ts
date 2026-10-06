import { z } from 'zod';
import { pageQuery } from '../utils/pagination.js';

const money = z.coerce.number().min(0).max(1e12);
const qty = z.coerce.number().min(0).max(1e9);
const optStr = (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const optId = z.string().uuid().optional().nullable().or(z.literal('').transform(() => null));

export const barcodeSchema = z.string().trim().min(3).max(64).regex(/^[A-Za-z0-9\-_.]+$/, 'Code-barres invalide');

export const variantInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  sku: z.string().trim().min(1).max(60),
  sellingPrice: money.optional().nullable(),
  wholesalePrice: money.optional().nullable(),
  purchasePrice: money.optional().nullable(),
  barcode: barcodeSchema.optional().nullable().or(z.literal('').transform(() => null)),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const productInput = z.object({
  name: z.string().trim().min(1).max(160),
  nameAr: optStr(160),
  nameEn: optStr(160),
  sku: z.string().trim().min(1).max(60),
  reference: optStr(60),
  categoryId: optId,
  brandId: optId,
  unitId: optId,
  taxId: optId,
  priceMode: z.enum(['INCLUSIVE', 'EXCLUSIVE']).default('INCLUSIVE'),
  purchasePrice: money.default(0),
  sellingPrice: money,
  wholesalePrice: money.optional().nullable(),
  minStock: qty.default(0),
  maxStock: qty.optional().nullable(),
  trackStock: z.boolean().default(true),
  isQuick: z.boolean().default(false),
  returnToStock: z.boolean().default(true),
  imageUrl: z.string().trim().url().max(500).optional().nullable().or(z.literal('').transform(() => null)),
  description: optStr(2000),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  barcodes: z.array(barcodeSchema).max(20).default([]),
  variants: z.array(variantInput).max(50).default([]),
  /** Optional opening stock for the current branch (creates an OPENING movement) */
  openingStock: qty.optional(),
});
export type ProductInput = z.infer<typeof productInput>;

export const productListQuery = pageQuery.extend({
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ALL']).default('ACTIVE'),
  quick: z.enum(['true', 'false']).optional(),
  stock: z.enum(['low', 'out', 'in']).optional(),
});

export const posSearchQuery = z.object({
  q: z.string().trim().max(120).default(''),
  categoryId: z.string().uuid().optional(),
  quick: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(80),
  nameAr: optStr(80),
  nameEn: optStr(80),
  icon: optStr(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  parentId: optId,
  taxId: optId,
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const brandInput = z.object({ name: z.string().trim().min(1).max(80), status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE') });

export const unitInput = z.object({
  code: z.string().trim().min(1).max(10).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1).max(40),
  nameAr: optStr(40),
  nameEn: optStr(40),
  allowDecimal: z.boolean().default(false),
});

export const taxInput = z.object({
  name: z.string().trim().min(1).max(60),
  code: z.string().trim().min(1).max(20).transform((v) => v.toUpperCase()),
  rate: z.coerce.number().min(0).max(100),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
