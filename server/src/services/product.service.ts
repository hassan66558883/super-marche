import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { conflict, notFound, badRequest } from '../utils/errors.js';
import { toDb, D } from '../utils/money.js';
import { paging } from '../utils/pagination.js';
import { generateInternalEan13 } from '../utils/barcode.js';
import { hasPermission } from '../middleware/auth.js';
import { AuditService } from './audit.service.js';
import { InventoryService } from './inventory.service.js';
import { SettingsService } from './settings.service.js';
import {
  productInclude, toProductView, branchDefaultTax, stockFilteredIds, type ProductWithRelations,
} from '../repositories/product.repository.js';
import type { ProductInput } from '../validators/catalog.validators.js';
import type { z } from 'zod';
import type { productListQuery, posSearchQuery } from '../validators/catalog.validators.js';

const searchWhere = (q: string): Prisma.ProductWhereInput => ({
  OR: [
    { name: { contains: q, mode: 'insensitive' } },
    { nameAr: { contains: q, mode: 'insensitive' } },
    { nameEn: { contains: q, mode: 'insensitive' } },
    { sku: { contains: q, mode: 'insensitive' } },
    { reference: { contains: q, mode: 'insensitive' } },
    { barcodes: { some: { barcode: q } } },
    { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } },
  ],
});

async function views(req: Request, products: ProductWithRelations[]) {
  const tax = await branchDefaultTax(req.branchId!);
  const showCost = hasPermission(req, 'products.view_cost');
  return products.map((p) => toProductView(p, tax, { showCost }));
}

export const ProductService = {
  async list(req: Request, q: z.infer<typeof productListQuery>) {
    const where: Prisma.ProductWhereInput = {
      ...(q.status !== 'ALL' ? { status: q.status } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.brandId ? { brandId: q.brandId } : {}),
      ...(q.quick ? { isQuick: q.quick === 'true' } : {}),
      ...(q.search ? searchWhere(q.search) : {}),
    };
    if (q.stock) where.id = { in: await stockFilteredIds(req.branchId!, q.stock) };
    const sortable = ['name', 'sku', 'sellingPrice', 'createdAt', 'updatedAt'] as const;
    const field = (sortable as readonly string[]).includes(q.sort ?? '') ? q.sort! : 'name';
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where, include: productInclude(req.branchId!), orderBy: { [field]: q.sort ? q.order : 'asc' }, ...paging(q),
      }),
      prisma.product.count({ where }),
    ]);
    return { items: await views(req, items), total };
  },

  /** POS grid + search: active products only, fast path for exact barcode/SKU hits */
  async posSearch(req: Request, q: z.infer<typeof posSearchQuery>) {
    const base: Prisma.ProductWhereInput = { status: 'ACTIVE' };
    if (q.q) {
      const exact = await this.findByCode(req, q.q);
      if (exact) return { items: [exact.product], total: 1, exact: { productId: exact.product.id, variantId: exact.variantId } };
      Object.assign(base, searchWhere(q.q));
    } else {
      if (q.categoryId) base.categoryId = q.categoryId;
      if (q.quick === 'true') base.isQuick = true;
    }
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where: base, include: productInclude(req.branchId!),
        orderBy: q.q ? [{ name: 'asc' }] : [{ isQuick: 'desc' }, { name: 'asc' }],
        ...paging(q),
      }),
      prisma.product.count({ where: base }),
    ]);
    return { items: await views(req, items), total, exact: null };
  },

  /** Exact lookup by barcode (product or variant) or SKU — used by the barcode scanner */
  async findByCode(req: Request, code: string) {
    const bc = await prisma.productBarcode.findUnique({ where: { barcode: code }, select: { productId: true, variantId: true } });
    let productId = bc?.productId;
    let variantId = bc?.variantId ?? null;
    if (!productId) {
      const bySku = await prisma.product.findFirst({ where: { sku: { equals: code, mode: 'insensitive' } }, select: { id: true } });
      if (bySku) productId = bySku.id;
      else {
        const v = await prisma.productVariant.findFirst({ where: { sku: { equals: code, mode: 'insensitive' } }, select: { id: true, productId: true } });
        if (v) { productId = v.productId; variantId = v.id; }
      }
    }
    if (!productId) return null;
    const p = await prisma.product.findFirst({ where: { id: productId, status: 'ACTIVE' }, include: productInclude(req.branchId!) });
    if (!p) return null;
    return { product: (await views(req, [p]))[0], variantId };
  },

  async get(req: Request, id: string) {
    const p = await prisma.product.findUnique({ where: { id }, include: productInclude(req.branchId!) });
    if (!p) throw notFound('PRODUCT_NOT_FOUND', 'Produit introuvable');
    return (await views(req, [p]))[0];
  },

  async create(req: Request, input: ProductInput) {
    await assertBarcodesFree(input);
    const id = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          ...productData(input),
          barcodes: { create: input.barcodes.map((barcode, i) => ({ barcode, isPrimary: i === 0 })) },
        },
      });
      for (const v of input.variants) {
        const variant = await tx.productVariant.create({ data: { productId: product.id, ...variantData(v) } });
        if (v.barcode) await tx.productBarcode.create({ data: { barcode: v.barcode, productId: product.id, variantId: variant.id, isPrimary: true } });
      }
      if (input.openingStock && input.openingStock > 0 && input.trackStock && !input.variants.length) {
        await InventoryService.move(tx, {
          branchId: req.branchId!, productId: product.id, quantity: input.openingStock, type: 'OPENING', userId: req.auth!.userId,
          unitCost: input.purchasePrice, referenceType: 'OPENING', reference: 'Stock initial',
        });
      }
      await AuditService.log({ action: 'CREATE', module: 'products', recordId: product.id, description: `Produit créé : ${product.name} (${product.sku})` }, req, tx);
      return product.id;
    });
    return this.get(req, id);
  },

  async update(req: Request, id: string, input: ProductInput) {
    const before = await prisma.product.findUnique({ where: { id }, include: { variants: true, barcodes: true } });
    if (!before) throw notFound('PRODUCT_NOT_FOUND', 'Produit introuvable');
    await assertBarcodesFree(input, id);

    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data: productData(input) });

      // Product-level barcodes: replace set
      await tx.productBarcode.deleteMany({ where: { productId: id, variantId: null, barcode: { notIn: input.barcodes } } });
      for (const [i, barcode] of input.barcodes.entries()) {
        await tx.productBarcode.upsert({ where: { barcode }, update: { isPrimary: i === 0 }, create: { barcode, productId: id, isPrimary: i === 0 } });
      }

      // Variants: update existing, create new, deactivate removed (history may reference them)
      const keep = new Set<string>();
      for (const v of input.variants) {
        const variant = v.id && before.variants.some((x) => x.id === v.id)
          ? await tx.productVariant.update({ where: { id: v.id }, data: variantData(v) })
          : await tx.productVariant.create({ data: { productId: id, ...variantData(v) } });
        keep.add(variant.id);
        await tx.productBarcode.deleteMany({ where: { variantId: variant.id, ...(v.barcode ? { barcode: { not: v.barcode } } : {}) } });
        if (v.barcode) {
          await tx.productBarcode.upsert({ where: { barcode: v.barcode }, update: { variantId: variant.id, productId: id }, create: { barcode: v.barcode, productId: id, variantId: variant.id, isPrimary: true } });
        }
      }
      const removed = before.variants.filter((v) => !keep.has(v.id)).map((v) => v.id);
      if (removed.length) await tx.productVariant.updateMany({ where: { id: { in: removed } }, data: { status: 'INACTIVE' } });

      const priceChanged = !D(before.sellingPrice).eq(input.sellingPrice) || !D(before.purchasePrice).eq(input.purchasePrice) || !D(before.wholesalePrice).eq(input.wholesalePrice ?? 0);
      if (priceChanged) {
        await AuditService.log({
          action: 'PRICE_CHANGE', module: 'products', recordId: id,
          description: `Prix modifié : ${before.name} ${D(before.sellingPrice).toFixed()} → ${input.sellingPrice}`,
          metadata: {
            before: { selling: D(before.sellingPrice).toFixed(), purchase: D(before.purchasePrice).toFixed(), wholesale: before.wholesalePrice ? D(before.wholesalePrice).toFixed() : null },
            after: { selling: String(input.sellingPrice), purchase: String(input.purchasePrice), wholesale: input.wholesalePrice != null ? String(input.wholesalePrice) : null },
          },
        }, req, tx);
      }
      await AuditService.log({ action: 'UPDATE', module: 'products', recordId: id, description: `Produit modifié : ${input.name}` }, req, tx);
    });
    return this.get(req, id);
  },

  /** Hard delete only if the product has never been used; otherwise deactivate (history must stay). */
  async remove(req: Request, id: string) {
    const p = await prisma.product.findUnique({ where: { id } });
    if (!p) throw notFound('PRODUCT_NOT_FOUND', 'Produit introuvable');
    const used = (await prisma.inventoryMovement.count({ where: { productId: id } })) + (await prisma.saleItem.count({ where: { productId: id } })) + (await prisma.purchaseItem.count({ where: { productId: id } }));
    if (used > 0) {
      await prisma.product.update({ where: { id }, data: { status: 'INACTIVE' } });
      await AuditService.log({ action: 'UPDATE', module: 'products', recordId: id, description: `Produit désactivé : ${p.name}` }, req);
      return { deleted: false, deactivated: true };
    }
    await prisma.$transaction([
      prisma.inventory.deleteMany({ where: { productId: id } }),
      prisma.product.delete({ where: { id } }),
    ]);
    await AuditService.log({ action: 'DELETE', module: 'products', recordId: id, description: `Produit supprimé : ${p.name} (${p.sku})` }, req);
    return { deleted: true, deactivated: false };
  },

  /** Next free internal EAN-13 (GS1 in-store prefix 20–29) */
  async generateBarcode() {
    const { internalPrefix } = await SettingsService.get<{ internalPrefix: string }>('barcode');
    const prefix = internalPrefix || '20';
    const last = await prisma.productBarcode.findFirst({ where: { barcode: { startsWith: prefix }, AND: [{ barcode: { not: { contains: '-' } } }] }, orderBy: { barcode: 'desc' } });
    let seq = last && /^\d{13}$/.test(last.barcode) ? Number(last.barcode.slice(2, 12)) + 1 : 1;
    for (;;) {
      const code = generateInternalEan13(seq, prefix);
      if (!(await prisma.productBarcode.findUnique({ where: { barcode: code } }))) return code;
      seq++;
    }
  },

  async nextSku(prefix: string) {
    const clean = prefix.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase() || 'PRD';
    const count = await prisma.product.count({ where: { sku: { startsWith: clean + '-' } } });
    let n = count + 1;
    for (;;) {
      const sku = `${clean}-${String(n).padStart(3, '0')}`;
      if (!(await prisma.product.findUnique({ where: { sku } }))) return sku;
      n++;
    }
  },
};

function productData(i: ProductInput) {
  return {
    name: i.name, nameAr: i.nameAr, nameEn: i.nameEn, sku: i.sku, reference: i.reference,
    categoryId: i.categoryId ?? null, brandId: i.brandId ?? null, unitId: i.unitId ?? null, taxId: i.taxId ?? null,
    priceMode: i.priceMode, purchasePrice: toDb(i.purchasePrice), sellingPrice: toDb(i.sellingPrice),
    wholesalePrice: i.wholesalePrice != null ? toDb(i.wholesalePrice) : null,
    minStock: toDb(i.minStock), maxStock: i.maxStock != null ? toDb(i.maxStock) : null,
    trackStock: i.trackStock, isQuick: i.isQuick, returnToStock: i.returnToStock, imageUrl: i.imageUrl,
    description: i.description, status: i.status,
  };
}

function variantData(v: ProductInput['variants'][number]) {
  return {
    name: v.name, sku: v.sku, status: v.status,
    sellingPrice: v.sellingPrice != null ? toDb(v.sellingPrice) : null,
    wholesalePrice: v.wholesalePrice != null ? toDb(v.wholesalePrice) : null,
    purchasePrice: v.purchasePrice != null ? toDb(v.purchasePrice) : null,
  };
}

async function assertBarcodesFree(input: ProductInput, productId?: string) {
  const codes = [...input.barcodes, ...input.variants.map((v) => v.barcode).filter((b): b is string => !!b)];
  if (new Set(codes).size !== codes.length) throw badRequest('DUPLICATE_BARCODE', 'Code-barres en double dans le formulaire');
  if (!codes.length) return;
  const taken = await prisma.productBarcode.findMany({ where: { barcode: { in: codes }, ...(productId ? { productId: { not: productId } } : {}) }, include: { product: { select: { name: true } } } });
  if (taken.length) throw conflict('BARCODE_IN_USE', `Code-barres déjà utilisé : ${taken[0].barcode} (${taken[0].product.name})`);
}
