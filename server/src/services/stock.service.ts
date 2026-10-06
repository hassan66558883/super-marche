import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { badRequest, notFound } from '../utils/errors.js';
import { D } from '../utils/money.js';
import { paging, dayBounds } from '../utils/pagination.js';
import { hasPermission } from '../middleware/auth.js';
import { InventoryService } from './inventory.service.js';
import { AuditService } from './audit.service.js';
import type { AdjustInput, movementQuery } from '../validators/stock.validators.js';
import type { z } from 'zod';

export const StockService = {
  /** Branch stock KPIs: SKU count, valuation at cost and retail, low and out-of-stock counts */
  async summary(req: Request) {
    const branchId = req.branchId!;
    const [row] = await prisma.$queryRaw<{ skus: bigint; units: Prisma.Decimal; cost_value: Prisma.Decimal; retail_value: Prisma.Decimal; low: bigint; out: bigint }[]>`
      WITH stock AS (
        SELECT p.id, p.min_stock, p.purchase_price, p.selling_price, COALESCE(SUM(i.quantity), 0) AS qty,
               COALESCE(SUM(i.quantity * COALESCE(v.purchase_price, p.purchase_price)), 0) AS cost_value,
               COALESCE(SUM(i.quantity * COALESCE(v.selling_price, p.selling_price)), 0) AS retail_value
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = ${branchId}::uuid
        LEFT JOIN product_variants v ON v.id = i.variant_id
        WHERE p.status = 'ACTIVE' AND p.track_stock = true
        GROUP BY p.id
      )
      SELECT COUNT(*) AS skus, COALESCE(SUM(qty), 0) AS units,
             COALESCE(SUM(GREATEST(cost_value, 0)), 0) AS cost_value, COALESCE(SUM(GREATEST(retail_value, 0)), 0) AS retail_value,
             COUNT(*) FILTER (WHERE qty > 0 AND qty <= min_stock) AS low, COUNT(*) FILTER (WHERE qty <= 0) AS out
      FROM stock`;
    return {
      skus: Number(row.skus), units: D(row.units).toFixed(),
      costValue: hasPermission(req, 'products.view_cost') ? D(row.cost_value).toFixed(0) : null,
      retailValue: D(row.retail_value).toFixed(0), low: Number(row.low), out: Number(row.out),
    };
  },

  /** Manual stock change. Always a movement (never an UPDATE of the quantity alone). */
  async adjust(req: Request, input: AdjustInput) {
    const auth = req.auth!;
    const branchId = req.branchId!;
    const product = await prisma.product.findUnique({ where: { id: input.productId }, include: { variants: true } });
    if (!product) throw notFound('PRODUCT_NOT_FOUND', 'Produit introuvable');
    if (!product.trackStock) throw badRequest('STOCK_NOT_TRACKED', 'Le stock de ce produit n’est pas suivi');
    const variantId = input.variantId ?? null;
    if (variantId && !product.variants.some((v) => v.id === variantId)) throw notFound('VARIANT_NOT_FOUND', 'Variante introuvable');
    if (!variantId && product.variants.some((v) => v.status === 'ACTIVE')) throw badRequest('VARIANT_REQUIRED', 'Choisissez une variante');

    return prisma.$transaction(async (tx) => {
      // Lock the row so a concurrent sale cannot slip between reading and writing
      const [cur] = await tx.$queryRaw<{ quantity: Prisma.Decimal }[]>`
        SELECT quantity FROM inventory WHERE branch_id = ${branchId}::uuid AND product_id = ${product.id}::uuid
          AND variant_id IS NOT DISTINCT FROM ${variantId}::uuid FOR UPDATE`;
      const current = D(cur?.quantity);
      let delta: ReturnType<typeof D>;
      if (input.mode === 'SET') {
        if (input.quantity < 0) throw badRequest('INVALID_QUANTITY', 'La quantité comptée ne peut pas être négative');
        delta = D(input.quantity).minus(current);
      } else if (input.mode === 'DAMAGE') {
        if (input.quantity <= 0) throw badRequest('INVALID_QUANTITY', 'Quantité invalide');
        delta = D(input.quantity).neg();
      } else {
        delta = D(input.quantity);
      }
      if (delta.isZero()) throw badRequest('NO_CHANGE', 'Aucune variation de stock');
      const variant = variantId ? product.variants.find((v) => v.id === variantId) : null;
      const mv = await InventoryService.move(tx, {
        branchId, productId: product.id, variantId, quantity: delta, type: input.mode === 'DAMAGE' ? 'DAMAGE' : 'ADJUSTMENT', userId: auth.userId,
        unitCost: variant?.purchasePrice ?? product.purchasePrice, referenceType: 'ADJUSTMENT', note: input.note, productName: product.name,
      });
      await AuditService.log({
        action: 'STOCK_ADJUSTMENT', module: 'inventory', recordId: product.id,
        description: `${input.mode === 'DAMAGE' ? 'Casse/perte' : 'Ajustement'} ${product.name}${variant ? ` (${variant.name})` : ''} : ${current.toString()} → ${current.plus(delta).toString()} — ${input.note}`,
        metadata: { before: current.toFixed(), after: current.plus(delta).toFixed(), delta: delta.toFixed(), mode: input.mode, variantId },
      }, req, tx);
      return mv;
    }).then(async (mv) => { void InventoryService.checkAlerts(branchId, [product.id]); return mv; });
  },

  async movements(req: Request, q: z.infer<typeof movementQuery>) {
    const where: Prisma.InventoryMovementWhereInput = {
      branchId: req.branchId!,
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(dayBounds(q.from, q.to) ? { createdAt: dayBounds(q.from, q.to) } : {}),
      ...(q.search ? { OR: [{ reference: { contains: q.search, mode: 'insensitive' } }, { product: { name: { contains: q.search, mode: 'insensitive' } } }, { product: { sku: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.inventoryMovement.findMany({
        where, orderBy: { createdAt: q.order }, ...paging(q),
        include: { product: { select: { id: true, name: true, sku: true } }, variant: { select: { name: true } } },
      }),
      prisma.inventoryMovement.count({ where }),
    ]);
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(items.map((i) => i.userId))] } }, select: { id: true, fullName: true } });
    const showCost = hasPermission(req, 'products.view_cost');
    return {
      items: items.map((m) => ({ ...m, unitCost: showCost ? m.unitCost : null, userName: users.find((u) => u.id === m.userId)?.fullName ?? '' })),
      total,
    };
  },
};
