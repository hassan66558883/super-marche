import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { badRequest, conflict, forbidden, notFound, unprocessable } from '../utils/errors.js';
import { D, roundMoney, toDb } from '../utils/money.js';
import { paging, dayBounds } from '../utils/pagination.js';
import { InventoryService } from './inventory.service.js';
import { CashService } from './cash.service.js';
import { SequenceService } from './sequence.service.js';
import { AuditService } from './audit.service.js';
import { saleDetailInclude } from './sale.service.js';
import type { ReturnInput } from '../validators/sale.validators.js';

export const returnInclude = {
  items: { include: { saleItem: { select: { productName: true, sku: true } } } },
  sale: { select: { id: true, invoiceNumber: true, customer: { select: { id: true, name: true } } } },
  user: { select: { fullName: true } },
  branch: true,
  payments: { include: { paymentMethod: { select: { code: true, name: true } } } },
} satisfies Prisma.ReturnInclude;

export const ReturnService = {
  /**
   * Returns items from a sale. The original sale is never deleted or rewritten line by line:
   * a Return document is created, quantities returned are tracked on the sale items,
   * stock comes back through RETURN movements, and the refund is recorded as an OUT payment.
   * Outstanding credit on the invoice is reduced first; the rest is refunded with `refundMethod`.
   */
  async create(req: Request, saleId: string, input: ReturnInput) {
    const auth = req.auth!;
    const sale = await prisma.sale.findUnique({ where: { id: saleId }, include: { items: true } });
    if (!sale || !auth.branchIds.includes(sale.branchId)) throw notFound('SALE_NOT_FOUND', 'Vente introuvable');
    if (sale.status === 'CANCELLED' || sale.status === 'REFUNDED') throw conflict('SALE_NOT_RETURNABLE', 'Cette vente est annulée ou déjà entièrement remboursée');

    const method = await prisma.paymentMethod.findFirst({ where: { code: input.refundMethod, isActive: true } });
    if (!method || method.type === 'CREDIT') throw badRequest('PAYMENT_METHOD_INVALID', 'Mode de remboursement invalide');

    const seen = new Set<string>();
    const lines = input.items.map((r) => {
      if (seen.has(r.saleItemId)) throw badRequest('DUPLICATE_LINE', 'Article en double dans le retour');
      seen.add(r.saleItemId);
      const it = sale.items.find((x) => x.id === r.saleItemId);
      if (!it) throw notFound('SALE_ITEM_NOT_FOUND', 'Article introuvable sur cette facture');
      const remaining = D(it.quantity).minus(D(it.returnedQuantity));
      if (D(r.quantity).gt(remaining)) throw unprocessable('RETURN_QTY_EXCEEDED', `Quantité retournée supérieure à la quantité restante pour « ${it.productName} » (${remaining.toFixed()})`);
      return { r, it, remaining };
    });

    return prisma.$transaction(async (tx) => {
      const number = await SequenceService.next(tx, sale.branchId, 'RETURN');
      let total = D(0);
      let taxTotal = D(0);
      const itemsData: Prisma.ReturnItemCreateManyReturnInput[] = [];

      for (const { r, it, remaining } of lines) {
        // Previously refunded amounts for this line; returning the remainder absorbs rounding
        const prior = await tx.returnItem.aggregate({ where: { saleItemId: it.id, return: { status: 'COMPLETED' } }, _sum: { total: true, taxAmount: true } });
        const ratio = D(r.quantity).div(D(it.quantity));
        const full = D(r.quantity).eq(remaining);
        const lineTotal = full ? D(it.total).minus(D(prior._sum.total)) : roundMoney(D(it.total).mul(ratio));
        const lineTax = full ? D(it.taxAmount).minus(D(prior._sum.taxAmount)) : roundMoney(D(it.taxAmount).mul(ratio));

        // Atomic guard against concurrent returns of the same line
        const n = await tx.$executeRaw`
          UPDATE sale_items SET returned_quantity = returned_quantity + ${toDb(r.quantity)}::numeric
          WHERE id = ${it.id}::uuid AND returned_quantity + ${toDb(r.quantity)}::numeric <= quantity`;
        if (!n) throw conflict('RETURN_QTY_EXCEEDED', `Retour concurrent détecté pour « ${it.productName} »`);

        const product = await tx.product.findUniqueOrThrow({ where: { id: it.productId }, select: { trackStock: true, returnToStock: true } });
        const restock = (r.restock ?? (input.reason !== 'DAMAGED' && product.returnToStock)) && product.trackStock;
        if (restock) {
          await InventoryService.move(tx, {
            branchId: sale.branchId, productId: it.productId, variantId: it.variantId, quantity: D(r.quantity), type: 'RETURN', userId: auth.userId,
            unitCost: it.unitCost, referenceType: 'RETURN', reference: number, note: `Retour ${sale.invoiceNumber}`,
          });
        }
        total = total.plus(lineTotal);
        taxTotal = taxTotal.plus(lineTax);
        itemsData.push({
          saleItemId: it.id, productId: it.productId, variantId: it.variantId, quantity: toDb(r.quantity),
          unitPrice: toDb(roundMoney(lineTotal.div(D(r.quantity)))), taxAmount: toDb(lineTax), total: toDb(lineTotal), restocked: !!restock,
        });
      }

      // Split refund between outstanding credit and money back
      const creditPart = D(sale.amountDue).gt(0) ? (D(sale.amountDue).lt(total) ? D(sale.amountDue) : total) : D(0);
      const moneyBack = total.minus(creditPart);
      const session = moneyBack.gt(0) && method.type === 'CASH' ? await CashService.requireSession(tx, auth.userId, sale.branchId) : await CashService.currentSession(auth.userId, sale.branchId, tx);

      const ret = await tx.return.create({
        data: {
          number, saleId: sale.id, branchId: sale.branchId, userId: auth.userId, registerSessionId: session?.id ?? null,
          reason: input.reason, note: input.note, subtotal: toDb(total.minus(taxTotal)), taxTotal: toDb(taxTotal), total: toDb(total),
          items: { createMany: { data: itemsData } },
        },
      });

      if (moneyBack.gt(0)) {
        await tx.payment.create({
          data: { branchId: sale.branchId, saleId: sale.id, returnId: ret.id, customerId: sale.customerId, paymentMethodId: method.id, registerSessionId: session?.id ?? null, direction: 'OUT', amount: toDb(moneyBack), userId: auth.userId },
        });
        if (method.type === 'CASH' && session) {
          await CashService.addMovement(tx, { sessionId: session.id, type: 'REFUND', amount: moneyBack.neg(), userId: auth.userId, referenceType: 'RETURN', referenceId: ret.id, reference: number });
        }
      }
      if (creditPart.gt(0) && sale.customerId) {
        const c = await tx.customer.update({ where: { id: sale.customerId }, data: { balance: { decrement: toDb(creditPart) } } });
        await tx.customerAccountEntry.create({
          data: { customerId: sale.customerId, branchId: sale.branchId, type: 'REFUND', amount: creditPart.neg().toFixed(), balanceAfter: c.balance, saleId: sale.id, description: `Retour ${number} sur ${sale.invoiceNumber}`, userId: auth.userId },
        });
      }

      const items = await tx.saleItem.findMany({ where: { saleId: sale.id }, select: { quantity: true, returnedQuantity: true } });
      const allReturned = items.every((i) => D(i.returnedQuantity).gte(D(i.quantity)));
      const newDue = D(sale.amountDue).minus(creditPart);
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: allReturned ? 'REFUNDED' : 'PARTIALLY_REFUNDED', refundedTotal: { increment: toDb(total) }, amountDue: toDb(newDue),
          ...(newDue.lte(0) ? { paymentStatus: 'PAID' } : {}),
        },
      });

      await AuditService.log({
        action: 'RETURN', module: 'sales', recordId: ret.id,
        description: `Retour ${number} sur ${sale.invoiceNumber} — ${total.toFixed()} FCFA (${input.reason})`,
        metadata: { saleId: sale.id, total: total.toFixed(), refunded: moneyBack.toFixed(), creditReduced: creditPart.toFixed(), method: method.code },
      }, req, tx);

      return tx.return.findUniqueOrThrow({ where: { id: ret.id }, include: returnInclude });
    }, { timeout: 20_000 });
  },

  async list(req: Request, q: { page: number; pageSize: number; search?: string; from?: string; to?: string; order: 'asc' | 'desc' }) {
    const where: Prisma.ReturnWhereInput = {
      branchId: req.branchId!,
      ...(dayBounds(q.from, q.to) ? { createdAt: dayBounds(q.from, q.to) } : {}),
      ...(q.search ? { OR: [{ number: { contains: q.search, mode: 'insensitive' } }, { sale: { invoiceNumber: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.return.findMany({ where, include: returnInclude, orderBy: { createdAt: q.order }, ...paging(q) }),
      prisma.return.count({ where }),
    ]);
    return { items, total };
  },

  async get(req: Request, id: string) {
    const r = await prisma.return.findUnique({ where: { id }, include: { ...returnInclude, sale: { include: saleDetailInclude } } });
    if (!r || !req.auth!.branchIds.includes(r.branchId)) throw notFound('RETURN_NOT_FOUND', 'Retour introuvable');
    return r;
  },
};

export const HeldSaleService = {
  list(req: Request) {
    return prisma.heldSale.findMany({ where: { branchId: req.branchId!, userId: req.auth!.userId }, orderBy: { createdAt: 'desc' } });
  },
  async create(req: Request, input: { label: string; customerId?: string | null; cart: Record<string, unknown>; itemCount: number; total: number }) {
    const count = await prisma.heldSale.count({ where: { branchId: req.branchId!, userId: req.auth!.userId } });
    if (count >= 20) throw unprocessable('TOO_MANY_HELD', 'Trop de ventes en attente (20 max)');
    return prisma.heldSale.create({
      data: { branchId: req.branchId!, userId: req.auth!.userId, label: input.label, customerId: input.customerId ?? null, cart: input.cart as Prisma.InputJsonValue, itemCount: input.itemCount, total: toDb(input.total) },
    });
  },
  /** Resuming removes the parked cart (it is not a financial record) */
  async take(req: Request, id: string) {
    const h = await prisma.heldSale.findUnique({ where: { id } });
    if (!h || h.branchId !== req.branchId) throw notFound('HELD_NOT_FOUND', 'Vente en attente introuvable');
    if (h.userId !== req.auth!.userId) throw forbidden('Cette vente en attente appartient à un autre caissier');
    await prisma.heldSale.delete({ where: { id } });
    return h;
  },
};
