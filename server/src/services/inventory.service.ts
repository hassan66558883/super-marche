import type { MovementType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma, type Tx } from '../utils/prisma.js';
import { D, toDb, type DecimalInput } from '../utils/money.js';
import { unprocessable } from '../utils/errors.js';
import { NotificationService } from './notification.service.js';

export interface MoveInput {
  branchId: string;
  productId: string;
  variantId?: string | null;
  /** Signed: positive adds stock, negative removes it */
  quantity: DecimalInput;
  type: MovementType;
  userId: string;
  unitCost?: DecimalInput | null;
  referenceType?: string;
  referenceId?: string;
  reference?: string;
  note?: string;
  /** Skip the non-negative check (setting pos.allowNegativeStock, or corrective adjustments) */
  allowNegative?: boolean;
  /** For error messages */
  productName?: string;
}

/**
 * The ONLY code path that changes inventory.quantity. Must run inside a transaction:
 * the conditional UPDATE is atomic, so two concurrent sales can never oversell,
 * and the movement row is written in the same transaction.
 */
export const InventoryService = {
  async move(tx: Tx, m: MoveInput) {
    const delta = D(m.quantity);
    if (delta.isZero()) return null;
    const variantId = m.variantId ?? null;

    await tx.$executeRaw`
      INSERT INTO inventory (id, branch_id, product_id, variant_id, quantity, reserved, updated_at)
      VALUES (gen_random_uuid(), ${m.branchId}::uuid, ${m.productId}::uuid, ${variantId}::uuid, 0, 0, now())
      ON CONFLICT (branch_id, product_id, variant_id) DO NOTHING`;

    const guard = delta.isNegative() && !m.allowNegative;
    const rows = await tx.$queryRaw<{ quantity: Prisma.Decimal }[]>`
      UPDATE inventory SET quantity = quantity + ${delta.toFixed()}::numeric, updated_at = now()
      WHERE branch_id = ${m.branchId}::uuid AND product_id = ${m.productId}::uuid
        AND variant_id IS NOT DISTINCT FROM ${variantId}::uuid
        ${guard ? Prisma.sql`AND quantity + ${delta.toFixed()}::numeric >= 0` : Prisma.empty}
      RETURNING quantity`;

    if (!rows.length) {
      const inv = await tx.inventory.findFirst({ where: { branchId: m.branchId, productId: m.productId, variantId } });
      throw unprocessable('INSUFFICIENT_STOCK', `Stock insuffisant${m.productName ? ` pour « ${m.productName} »` : ''} (disponible: ${D(inv?.quantity).toString()})`, {
        productId: m.productId,
        variantId,
        available: D(inv?.quantity).toString(),
        requested: delta.abs().toString(),
      });
    }

    return tx.inventoryMovement.create({
      data: {
        branchId: m.branchId,
        productId: m.productId,
        variantId,
        type: m.type,
        quantity: toDb(delta),
        balanceAfter: rows[0].quantity,
        unitCost: m.unitCost != null ? toDb(m.unitCost) : null,
        referenceType: m.referenceType,
        referenceId: m.referenceId,
        reference: m.reference,
        note: m.note,
        userId: m.userId,
      },
    });
  },

  async getQuantity(db: Tx | typeof prisma, branchId: string, productId: string, variantId: string | null = null) {
    const inv = await db.inventory.findFirst({ where: { branchId, productId, variantId } });
    return D(inv?.quantity);
  },

  /** After a commit: raise low/out-of-stock alerts for the touched products (deduplicated). */
  async checkAlerts(branchId: string, productIds: string[]) {
    if (!productIds.length) return;
    const rows = await prisma.$queryRaw<{ product_id: string; name: string; quantity: Prisma.Decimal; min_stock: Prisma.Decimal }[]>`
      SELECT p.id AS product_id, p.name, COALESCE(SUM(i.quantity), 0) AS quantity, p.min_stock
      FROM products p LEFT JOIN inventory i ON i.product_id = p.id AND i.branch_id = ${branchId}::uuid
      WHERE p.id = ANY(${productIds}::uuid[]) AND p.track_stock = true
      GROUP BY p.id`;
    for (const r of rows) {
      const q = D(r.quantity);
      if (q.lte(0)) {
        await NotificationService.notify({
          branchId, type: 'OUT_OF_STOCK', title: 'Rupture de stock', message: `${r.name} est en rupture de stock`,
          dedupKey: `out:${branchId}:${r.product_id}`, link: `/inventory?productId=${r.product_id}`,
        });
      } else if (q.lte(D(r.min_stock))) {
        await NotificationService.notify({
          branchId, type: 'LOW_STOCK', title: 'Stock faible', message: `${r.name} : ${q.toString()} restant(s) (min. ${D(r.min_stock).toString()})`,
          dedupKey: `low:${branchId}:${r.product_id}`, link: `/inventory?productId=${r.product_id}`,
        });
      }
    }
  },
};
