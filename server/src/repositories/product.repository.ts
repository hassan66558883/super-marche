import { Prisma } from '@prisma/client';
import { prisma, type Db } from '../utils/prisma.js';
import { D } from '../utils/money.js';

export const productInclude = (branchId: string) =>
  ({
    category: { select: { id: true, name: true, nameAr: true, nameEn: true, icon: true, color: true, taxId: true, tax: true } },
    brand: { select: { id: true, name: true } },
    unit: { select: { id: true, code: true, name: true, nameAr: true, nameEn: true, allowDecimal: true } },
    tax: true,
    barcodes: { select: { id: true, barcode: true, variantId: true, isPrimary: true } },
    variants: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } },
    inventory: { where: { branchId }, select: { variantId: true, quantity: true, reserved: true } },
  }) satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: ReturnType<typeof productInclude> }>;

export interface TaxInfo { id: string; name: string; rate: string }

/** Tax resolution: product → category → branch default */
export function resolveTax(p: ProductWithRelations, branchDefault: TaxInfo | null): TaxInfo | null {
  const t = p.tax ?? p.category?.tax ?? null;
  if (t) return { id: t.id, name: t.name, rate: D(t.rate).toFixed() };
  return branchDefault;
}

export async function branchDefaultTax(branchId: string, db: Db = prisma): Promise<TaxInfo | null> {
  const b = await db.branch.findUnique({ where: { id: branchId }, include: { defaultTax: true } });
  return b?.defaultTax ? { id: b.defaultTax.id, name: b.defaultTax.name, rate: D(b.defaultTax.rate).toFixed() } : null;
}

/** API shape used by product lists, the POS grid and search */
export function toProductView(p: ProductWithRelations, branchTax: TaxInfo | null, opts: { showCost: boolean }) {
  const stockOf = (variantId: string | null) => {
    const inv = p.inventory.find((i) => i.variantId === variantId);
    return { quantity: D(inv?.quantity).toFixed(), reserved: D(inv?.reserved).toFixed() };
  };
  const total = p.variants.length
    ? p.variants.reduce((acc, v) => acc.plus(D(stockOf(v.id).quantity)), D(0))
    : D(stockOf(null).quantity);
  const tax = resolveTax(p, branchTax);
  return {
    id: p.id,
    name: p.name,
    nameAr: p.nameAr,
    nameEn: p.nameEn,
    sku: p.sku,
    reference: p.reference,
    description: p.description,
    imageUrl: p.imageUrl,
    status: p.status,
    priceMode: p.priceMode,
    sellingPrice: D(p.sellingPrice).toFixed(),
    wholesalePrice: p.wholesalePrice ? D(p.wholesalePrice).toFixed() : null,
    purchasePrice: opts.showCost ? D(p.purchasePrice).toFixed() : undefined,
    minStock: D(p.minStock).toFixed(),
    maxStock: p.maxStock ? D(p.maxStock).toFixed() : null,
    trackStock: p.trackStock,
    isQuick: p.isQuick,
    returnToStock: p.returnToStock,
    category: p.category ? { id: p.category.id, name: p.category.name, nameAr: p.category.nameAr, nameEn: p.category.nameEn, icon: p.category.icon, color: p.category.color } : null,
    brand: p.brand,
    unit: p.unit,
    taxId: p.taxId,
    tax,
    barcodes: p.barcodes.map((b) => ({ id: b.id, barcode: b.barcode, variantId: b.variantId, isPrimary: b.isPrimary })),
    barcode: p.barcodes.find((b) => b.isPrimary && !b.variantId)?.barcode ?? p.barcodes.find((b) => !b.variantId)?.barcode ?? null,
    stock: total.toFixed(),
    variants: p.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      sellingPrice: D(v.sellingPrice ?? p.sellingPrice).toFixed(),
      wholesalePrice: v.wholesalePrice ? D(v.wholesalePrice).toFixed() : p.wholesalePrice ? D(p.wholesalePrice).toFixed() : null,
      purchasePrice: opts.showCost ? D(v.purchasePrice ?? p.purchasePrice).toFixed() : undefined,
      barcode: p.barcodes.find((b) => b.variantId === v.id)?.barcode ?? null,
      stock: stockOf(v.id).quantity,
      status: v.status,
    })),
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}
export type ProductView = ReturnType<typeof toProductView>;

/** Product ids at or below min stock (or out of stock) in a branch */
export async function stockFilteredIds(branchId: string, mode: 'low' | 'out' | 'in'): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM products p
    LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = ${branchId}::uuid
    WHERE p.track_stock = true
    GROUP BY p.id, p.min_stock
    HAVING ${mode === 'out' ? Prisma.sql`COALESCE(SUM(i.quantity),0) <= 0`
      : mode === 'low' ? Prisma.sql`COALESCE(SUM(i.quantity),0) > 0 AND COALESCE(SUM(i.quantity),0) <= p.min_stock`
      : Prisma.sql`COALESCE(SUM(i.quantity),0) > p.min_stock`}`;
  return rows.map((r) => r.id);
}
