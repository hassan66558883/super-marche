import type { Request } from 'express';
import type { Prisma, PurchaseStatus } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { D, roundMoney, toDb } from '../utils/money.js';
import { paging, dayBounds } from '../utils/pagination.js';
import { hasPermission } from '../middleware/auth.js';
import { InventoryService } from './inventory.service.js';
import { SequenceService } from './sequence.service.js';
import { AuditService } from './audit.service.js';
import { NotificationService } from './notification.service.js';
import { assertLines, mergeLines } from './transfer.service.js';
import type { PurchaseInput, purchaseListQuery } from '../validators/stock.validators.js';
import type { z } from 'zod';

const include = {
  supplier: true,
  branch: { select: { id: true, code: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, purchasePrice: true, unit: { select: { code: true } } } }, variant: { select: { id: true, name: true, sku: true } } } },
} satisfies Prisma.PurchaseOrderInclude;

function computeLines(items: PurchaseInput['items']) {
  return mergeLines(items).map((i) => {
    const gross = roundMoney(D(i.unitCost).mul(i.quantity));
    const tax = roundMoney(gross.mul(D(i.taxRate)).div(100));
    return { productId: i.productId, variantId: i.variantId ?? null, quantity: toDb(i.quantity), unitCost: toDb(i.unitCost), taxRate: toDb(i.taxRate), taxAmount: toDb(tax), total: toDb(gross.plus(tax)), _gross: gross, _tax: tax };
  });
}
const totalsOf = (lines: ReturnType<typeof computeLines>) => {
  const subtotal = lines.reduce((a, l) => a.plus(l._gross), D(0));
  const tax = lines.reduce((a, l) => a.plus(l._tax), D(0));
  return { subtotal: toDb(subtotal), taxTotal: toDb(tax), total: toDb(subtotal.plus(tax)) };
};
const strip = (lines: ReturnType<typeof computeLines>) => lines.map(({ _gross, _tax, ...l }) => l); // eslint-disable-line @typescript-eslint/no-unused-vars

/**
 * Purchase orders: DRAFT → PENDING (submitted) → APPROVED → RECEIVED (possibly over several receipts).
 * Each receipt adds stock (PURCHASE movements), increases what we owe the supplier, and can update the purchase price.
 */
export const PurchaseService = {
  async list(req: Request, q: z.infer<typeof purchaseListQuery>) {
    const where: Prisma.PurchaseOrderWhereInput = {
      branchId: req.branchId!,
      ...(q.status ? { status: q.status } : {}),
      ...(q.supplierId ? { supplierId: q.supplierId } : {}),
      ...(dayBounds(q.from, q.to) ? { createdAt: dayBounds(q.from, q.to) } : {}),
      ...(q.search ? { OR: [{ number: { contains: q.search, mode: 'insensitive' } }, { supplier: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.purchaseOrder.findMany({ where, include: { supplier: { select: { id: true, name: true, code: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: q.order }, ...paging(q) }),
      prisma.purchaseOrder.count({ where }),
    ]);
    return { items, total };
  },

  async get(req: Request, id: string) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id }, include });
    if (!po || !req.auth!.branchIds.includes(po.branchId)) throw notFound('PURCHASE_NOT_FOUND', 'Bon de commande introuvable');
    const users = await prisma.user.findMany({ where: { id: { in: [po.createdById, po.approvedById, po.receivedById].filter((x): x is string => !!x) } }, select: { id: true, fullName: true } });
    const name = (uid: string | null) => users.find((u) => u.id === uid)?.fullName ?? null;
    return { ...po, createdBy: name(po.createdById), approvedBy: name(po.approvedById), receivedBy: name(po.receivedById) };
  },

  async create(req: Request, input: PurchaseInput) {
    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier || supplier.status !== 'ACTIVE') throw notFound('SUPPLIER_NOT_FOUND', 'Fournisseur introuvable');
    await assertLines(input.items);
    const lines = computeLines(input.items);
    const po = await prisma.$transaction(async (tx) => {
      const number = await SequenceService.next(tx, req.branchId!, 'PURCHASE');
      const created = await tx.purchaseOrder.create({
        data: {
          number, supplierId: supplier.id, branchId: req.branchId!, status: input.submit ? 'PENDING' : 'DRAFT', ...totalsOf(lines),
          expectedAt: input.expectedAt ? new Date(`${input.expectedAt}T00:00:00`) : null, note: input.note, createdById: req.auth!.userId,
          items: { create: strip(lines) },
        },
      });
      await AuditService.log({ action: 'CREATE', module: 'purchases', recordId: created.id, description: `Bon de commande ${number} — ${supplier.name} — ${D(created.total).toFixed()} FCFA` }, req, tx);
      return created;
    });
    if (input.submit) void notifySubmitted(po.id);
    return this.get(req, po.id);
  },

  async update(req: Request, id: string, input: PurchaseInput) {
    const po = await this.load(req, id, ['DRAFT', 'PENDING']);
    if (input.supplierId !== po.supplierId) {
      const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier || supplier.status !== 'ACTIVE') throw notFound('SUPPLIER_NOT_FOUND', 'Fournisseur introuvable');
    }
    await assertLines(input.items);
    const lines = computeLines(input.items);
    await prisma.$transaction(async (tx) => {
      await tx.purchaseItem.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: input.supplierId, ...totalsOf(lines), expectedAt: input.expectedAt ? new Date(`${input.expectedAt}T00:00:00`) : null, note: input.note,
          ...(input.submit && po.status === 'DRAFT' ? { status: 'PENDING' } : {}),
          items: { create: strip(lines) },
        },
      });
      await AuditService.log({ action: 'UPDATE', module: 'purchases', recordId: id, description: `Bon de commande ${po.number} modifié` }, req, tx);
    });
    if (input.submit && po.status === 'DRAFT') void notifySubmitted(id);
    return this.get(req, id);
  },

  async load(req: Request, id: string, allowed: PurchaseStatus[]) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { items: { include: { product: true, variant: true } }, supplier: true } });
    if (!po || !req.auth!.branchIds.includes(po.branchId)) throw notFound('PURCHASE_NOT_FOUND', 'Bon de commande introuvable');
    if (!allowed.includes(po.status)) throw conflict('INVALID_PURCHASE_STATUS', `Action impossible : commande ${po.status}`);
    return po;
  },

  async submit(req: Request, id: string) {
    const po = await this.load(req, id, ['DRAFT']);
    await prisma.purchaseOrder.update({ where: { id }, data: { status: 'PENDING' } });
    await AuditService.log({ action: 'UPDATE', module: 'purchases', recordId: id, description: `Bon de commande ${po.number} soumis pour approbation` }, req);
    void notifySubmitted(id);
    return this.get(req, id);
  },

  async approve(req: Request, id: string) {
    const po = await this.load(req, id, ['PENDING', 'DRAFT']);
    if (po.createdById === req.auth!.userId && !hasPermission(req, 'settings.manage')) {
      // Segregation of duties: the requester cannot approve their own order (admins excepted)
      throw forbidden('Vous ne pouvez pas approuver votre propre commande', 'SELF_APPROVAL');
    }
    await prisma.$transaction(async (tx) => {
      const n = await tx.purchaseOrder.updateMany({ where: { id, status: po.status }, data: { status: 'APPROVED', approvedById: req.auth!.userId, approvedAt: new Date() } });
      if (!n.count) throw conflict('INVALID_PURCHASE_STATUS', 'Commande déjà modifiée');
      await AuditService.log({ action: 'APPROVE', module: 'purchases', recordId: id, description: `Bon de commande ${po.number} approuvé (${D(po.total).toFixed()} FCFA)` }, req, tx);
    });
    return this.get(req, id);
  },

  async receive(req: Request, id: string, input: { items: { itemId: string; quantity: number }[]; updateCost: boolean; note?: string | null }) {
    const po = await this.load(req, id, ['APPROVED']);
    const lines = input.items.filter((r) => r.quantity > 0).map((r) => {
      const it = po.items.find((x) => x.id === r.itemId);
      if (!it) throw notFound('PURCHASE_ITEM_NOT_FOUND', 'Ligne de commande introuvable');
      const remaining = D(it.quantity).minus(D(it.receivedQuantity));
      if (D(r.quantity).gt(remaining)) throw badRequest('RECEIVE_EXCEEDS_ORDERED', `Quantité supérieure au reste à recevoir pour « ${it.product.name} » (${remaining.toString()})`);
      return { it, qty: D(r.quantity) };
    });
    if (!lines.length) throw badRequest('NOTHING_TO_RECEIVE', 'Aucune quantité à réceptionner');

    await prisma.$transaction(async (tx) => {
      let value = D(0);
      for (const { it, qty } of lines) {
        const n = await tx.$executeRaw`UPDATE purchase_items SET received_quantity = received_quantity + ${qty.toFixed()}::numeric
          WHERE id = ${it.id}::uuid AND received_quantity + ${qty.toFixed()}::numeric <= quantity`;
        if (!n) throw conflict('RECEIVE_EXCEEDS_ORDERED', `Réception concurrente détectée pour « ${it.product.name} »`);
        await InventoryService.move(tx, {
          branchId: po.branchId, productId: it.productId, variantId: it.variantId, quantity: qty, type: 'PURCHASE', userId: req.auth!.userId,
          unitCost: it.unitCost, referenceType: 'PURCHASE', referenceId: po.id, reference: po.number,
        });
        const lineValue = roundMoney(D(it.unitCost).mul(qty).mul(D(100).plus(D(it.taxRate))).div(100));
        value = value.plus(lineValue);
        if (input.updateCost) {
          const prev = it.variant ? D(it.variant.purchasePrice ?? it.product.purchasePrice) : D(it.product.purchasePrice);
          if (!prev.eq(D(it.unitCost))) {
            if (it.variantId) await tx.productVariant.update({ where: { id: it.variantId }, data: { purchasePrice: it.unitCost } });
            else await tx.product.update({ where: { id: it.productId }, data: { purchasePrice: it.unitCost } });
            await AuditService.log({ action: 'PRICE_CHANGE', module: 'products', recordId: it.productId, description: `Prix d’achat ${it.product.name} : ${prev.toFixed()} → ${D(it.unitCost).toFixed()} (${po.number})`, metadata: { field: 'purchasePrice', before: prev.toFixed(), after: D(it.unitCost).toFixed() } }, req, tx);
          }
        }
      }
      // We now owe the supplier for what was received
      const s = await tx.supplier.update({ where: { id: po.supplierId }, data: { balance: { increment: toDb(value) } } });
      await tx.supplierAccountEntry.create({
        data: { supplierId: po.supplierId, branchId: po.branchId, type: 'PURCHASE', amount: toDb(value), balanceAfter: s.balance, purchaseOrderId: po.id, reference: po.number, description: `Réception ${po.number}${input.note ? ` — ${input.note}` : ''}`, userId: req.auth!.userId },
      });
      const items = await tx.purchaseItem.findMany({ where: { purchaseOrderId: id } });
      const complete = items.every((i) => D(i.receivedQuantity).gte(D(i.quantity)));
      await tx.purchaseOrder.update({ where: { id }, data: complete ? { status: 'RECEIVED', receivedAt: new Date(), receivedById: req.auth!.userId } : { receivedById: req.auth!.userId } });
      await AuditService.log({ action: 'RECEIVE', module: 'purchases', recordId: id, description: `Réception ${po.number} — ${value.toFixed()} FCFA${complete ? ' (complète)' : ' (partielle)'}` }, req, tx);
    }, { timeout: 20_000 });
    void InventoryService.checkAlerts(po.branchId, lines.map((l) => l.it.productId));
    return this.get(req, id);
  },

  async cancel(req: Request, id: string, reason: string) {
    const po = await this.load(req, id, ['DRAFT', 'PENDING', 'APPROVED']);
    if (po.items.some((i) => D(i.receivedQuantity).gt(0))) throw conflict('PURCHASE_PARTIALLY_RECEIVED', 'Commande partiellement réceptionnée : elle ne peut plus être annulée');
    await prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), note: [po.note, `Annulée : ${reason}`].filter(Boolean).join('\n') } });
      await AuditService.log({ action: 'CANCEL', module: 'purchases', recordId: id, description: `Bon de commande ${po.number} annulé : ${reason}` }, req, tx);
    });
    return this.get(req, id);
  },
};

async function notifySubmitted(id: string) {
  const po = await prisma.purchaseOrder.findUnique({ where: { id }, include: { supplier: true } });
  if (!po) return;
  await NotificationService.notify({
    branchId: po.branchId, type: 'PENDING_PURCHASE', title: 'Commande à approuver',
    message: `${po.number} — ${po.supplier.name} — ${D(po.total).toFixed()} FCFA`, link: `/purchases/${po.id}`, dedupKey: `purchase:${po.id}:pending`,
  });
}
