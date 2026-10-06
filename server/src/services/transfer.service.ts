import type { Request } from 'express';
import type { Prisma, TransferStatus } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { D, toDb } from '../utils/money.js';
import { paging } from '../utils/pagination.js';
import { hasPermission } from '../middleware/auth.js';
import { InventoryService } from './inventory.service.js';
import { SequenceService } from './sequence.service.js';
import { AuditService } from './audit.service.js';
import { NotificationService } from './notification.service.js';
import type { TransferInput, transferListQuery } from '../validators/stock.validators.js';
import type { z } from 'zod';

const include = {
  fromBranch: { select: { id: true, code: true, name: true } },
  toBranch: { select: { id: true, code: true, name: true } },
  items: { include: { product: { select: { id: true, name: true, sku: true, unit: { select: { code: true } } } }, variant: { select: { id: true, name: true, sku: true } } } },
} satisfies Prisma.StockTransferInclude;

async function users(ids: (string | null)[]) {
  const list = await prisma.user.findMany({ where: { id: { in: ids.filter((x): x is string => !!x) } }, select: { id: true, fullName: true } });
  return (id: string | null) => list.find((u) => u.id === id)?.fullName ?? null;
}

/**
 * Inter-branch stock transfer:
 *   DRAFT → REQUESTED → APPROVED → IN_TRANSIT (stock leaves the source) → RECEIVED (stock enters the destination)
 * Cancel is possible until shipment. Every stock change is an inventory movement.
 */
export const TransferService = {
  async list(req: Request, q: z.infer<typeof transferListQuery>) {
    const branchId = req.branchId!;
    const where: Prisma.StockTransferWhereInput = {
      ...(q.direction === 'out' ? { fromBranchId: branchId } : q.direction === 'in' ? { toBranchId: branchId } : { OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] }),
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { number: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.stockTransfer.findMany({ where, include: { fromBranch: include.fromBranch, toBranch: include.toBranch, _count: { select: { items: true } } }, orderBy: { createdAt: q.order }, ...paging(q) }),
      prisma.stockTransfer.count({ where }),
    ]);
    return { items, total };
  },

  async get(req: Request, id: string) {
    const t = await prisma.stockTransfer.findUnique({ where: { id }, include });
    if (!t || (!req.auth!.branchIds.includes(t.fromBranchId) && !req.auth!.branchIds.includes(t.toBranchId))) throw notFound('TRANSFER_NOT_FOUND', 'Transfert introuvable');
    const name = await users([t.createdById, t.approvedById, t.shippedById, t.receivedById]);
    // Source stock helps the approver decide
    const stock = await prisma.inventory.findMany({ where: { branchId: t.fromBranchId, productId: { in: t.items.map((i) => i.productId) } } });
    return {
      ...t,
      createdBy: name(t.createdById), approvedBy: name(t.approvedById), shippedBy: name(t.shippedById), receivedBy: name(t.receivedById),
      items: t.items.map((i) => ({ ...i, sourceStock: D(stock.find((s) => s.productId === i.productId && s.variantId === i.variantId)?.quantity).toFixed() })),
    };
  },

  async create(req: Request, input: TransferInput) {
    const fromBranchId = req.branchId!;
    if (input.toBranchId === fromBranchId) throw badRequest('SAME_BRANCH', 'Choisissez une succursale de destination différente');
    const to = await prisma.branch.findUnique({ where: { id: input.toBranchId } });
    if (!to || to.status !== 'ACTIVE') throw notFound('BRANCH_NOT_FOUND', 'Succursale de destination introuvable');
    await assertLines(input.items);
    const t = await prisma.$transaction(async (tx) => {
      const number = await SequenceService.next(tx, fromBranchId, 'TRANSFER');
      const created = await tx.stockTransfer.create({
        data: {
          number, fromBranchId, toBranchId: input.toBranchId, note: input.note, createdById: req.auth!.userId,
          status: input.submit ? 'REQUESTED' : 'DRAFT', requestedAt: input.submit ? new Date() : null,
          items: { create: mergeLines(input.items).map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: toDb(i.quantity) })) },
        },
      });
      await AuditService.log({ action: 'CREATE', module: 'transfers', recordId: created.id, description: `Transfert ${number} vers ${to.name} (${input.items.length} article(s))` }, req, tx);
      return created;
    });
    if (input.submit) void notifyPending(t.id);
    return this.get(req, t.id);
  },

  async update(req: Request, id: string, input: TransferInput) {
    const t = await this.loadForAction(req, id, ['DRAFT', 'REQUESTED'], 'from');
    if (t.createdById !== req.auth!.userId && !hasPermission(req, 'transfers.approve')) throw forbidden();
    await assertLines(input.items);
    await prisma.$transaction(async (tx) => {
      await tx.stockTransferItem.deleteMany({ where: { transferId: id } });
      await tx.stockTransfer.update({
        where: { id },
        data: {
          toBranchId: input.toBranchId, note: input.note,
          ...(input.submit && t.status === 'DRAFT' ? { status: 'REQUESTED', requestedAt: new Date() } : {}),
          items: { create: mergeLines(input.items).map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: toDb(i.quantity) })) },
        },
      });
      await AuditService.log({ action: 'UPDATE', module: 'transfers', recordId: id, description: `Transfert ${t.number} modifié` }, req, tx);
    });
    if (input.submit && t.status === 'DRAFT') void notifyPending(id);
    return this.get(req, id);
  },

  async loadForAction(req: Request, id: string, allowed: TransferStatus[], side: 'from' | 'to') {
    const t = await prisma.stockTransfer.findUnique({ where: { id }, include: { items: { include: { product: { select: { name: true } } } } } });
    if (!t) throw notFound('TRANSFER_NOT_FOUND', 'Transfert introuvable');
    const branch = side === 'from' ? t.fromBranchId : t.toBranchId;
    // Actions happen at the branch concerned: switch to it first (also for multi-branch admins)
    if (req.branchId !== branch) throw forbidden(side === 'from' ? 'Action réservée à la succursale d’origine' : 'Action réservée à la succursale de destination', 'BRANCH_FORBIDDEN');
    if (!allowed.includes(t.status)) throw conflict('INVALID_TRANSFER_STATUS', `Action impossible : transfert ${t.status}`);
    return t;
  },

  async approve(req: Request, id: string) {
    const t = await this.loadForAction(req, id, ['REQUESTED', 'DRAFT'], 'from');
    await prisma.$transaction(async (tx) => {
      const n = await tx.stockTransfer.updateMany({ where: { id, status: t.status }, data: { status: 'APPROVED', approvedById: req.auth!.userId, approvedAt: new Date(), requestedAt: t.requestedAt ?? new Date() } });
      if (!n.count) throw conflict('INVALID_TRANSFER_STATUS', 'Transfert déjà modifié');
      await AuditService.log({ action: 'APPROVE', module: 'transfers', recordId: id, description: `Transfert ${t.number} approuvé` }, req, tx);
    });
    return this.get(req, id);
  },

  /** Stock leaves the source branch (TRANSFER_OUT); fails entirely if any line is short. */
  async ship(req: Request, id: string) {
    const t = await this.loadForAction(req, id, ['APPROVED'], 'from');
    await prisma.$transaction(async (tx) => {
      const n = await tx.stockTransfer.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'IN_TRANSIT', shippedById: req.auth!.userId, shippedAt: new Date() } });
      if (!n.count) throw conflict('INVALID_TRANSFER_STATUS', 'Transfert déjà expédié');
      for (const it of t.items) {
        await InventoryService.move(tx, {
          branchId: t.fromBranchId, productId: it.productId, variantId: it.variantId, quantity: D(it.quantity).neg(), type: 'TRANSFER_OUT',
          userId: req.auth!.userId, referenceType: 'TRANSFER', referenceId: t.id, reference: t.number, productName: it.product.name,
        });
      }
      await AuditService.log({ action: 'UPDATE', module: 'transfers', recordId: id, description: `Transfert ${t.number} expédié` }, req, tx);
    });
    void NotificationService.notify({ branchId: t.toBranchId, type: 'PENDING_TRANSFER', title: 'Transfert en route', message: `${t.number} : ${t.items.length} article(s) à réceptionner`, link: `/transfers/${t.id}` });
    void InventoryService.checkAlerts(t.fromBranchId, t.items.map((i) => i.productId));
    return this.get(req, id);
  },

  /** Stock enters the destination (TRANSFER_IN) for the quantities actually received. */
  async receive(req: Request, id: string, input: { items: { itemId: string; receivedQuantity: number }[]; note?: string | null }) {
    const t = await this.loadForAction(req, id, ['IN_TRANSIT'], 'to');
    for (const r of input.items) {
      const it = t.items.find((x) => x.id === r.itemId);
      if (!it) throw notFound('TRANSFER_ITEM_NOT_FOUND', 'Ligne de transfert introuvable');
      if (D(r.receivedQuantity).gt(D(it.quantity))) throw badRequest('RECEIVED_EXCEEDS_SHIPPED', `Quantité reçue supérieure à la quantité expédiée pour « ${it.product.name} »`);
    }
    const shortages: string[] = [];
    await prisma.$transaction(async (tx) => {
      const n = await tx.stockTransfer.updateMany({
        where: { id, status: 'IN_TRANSIT' },
        data: { status: 'RECEIVED', receivedById: req.auth!.userId, receivedAt: new Date(), note: input.note ? [t.note, `Réception : ${input.note}`].filter(Boolean).join('\n') : t.note },
      });
      if (!n.count) throw conflict('INVALID_TRANSFER_STATUS', 'Transfert déjà réceptionné');
      for (const it of t.items) {
        const received = D(input.items.find((r) => r.itemId === it.id)?.receivedQuantity ?? it.quantity);
        await tx.stockTransferItem.update({ where: { id: it.id }, data: { receivedQuantity: toDb(received) } });
        if (received.lt(D(it.quantity))) shortages.push(`${it.product.name} : ${received.toString()}/${D(it.quantity).toString()}`);
        if (received.gt(0)) {
          await InventoryService.move(tx, {
            branchId: t.toBranchId, productId: it.productId, variantId: it.variantId, quantity: received, type: 'TRANSFER_IN',
            userId: req.auth!.userId, referenceType: 'TRANSFER', referenceId: t.id, reference: t.number,
          });
        }
      }
      await AuditService.log({
        action: 'RECEIVE', module: 'transfers', recordId: id, description: `Transfert ${t.number} réceptionné${shortages.length ? ` avec écarts (${shortages.join(', ')})` : ''}`,
        metadata: shortages.length ? { shortages } : undefined,
      }, req, tx);
    });
    return this.get(req, id);
  },

  async cancel(req: Request, id: string, reason: string) {
    const t = await this.loadForAction(req, id, ['DRAFT', 'REQUESTED', 'APPROVED'], 'from');
    await prisma.$transaction(async (tx) => {
      const n = await tx.stockTransfer.updateMany({ where: { id, status: t.status }, data: { status: 'CANCELLED', cancelledAt: new Date(), note: [t.note, `Annulé : ${reason}`].filter(Boolean).join('\n') } });
      if (!n.count) throw conflict('INVALID_TRANSFER_STATUS', 'Transfert déjà modifié');
      await AuditService.log({ action: 'CANCEL', module: 'transfers', recordId: id, description: `Transfert ${t.number} annulé : ${reason}` }, req, tx);
    });
    return this.get(req, id);
  },
};

function mergeLines<T extends { productId: string; variantId?: string | null; quantity: number }>(items: T[]) {
  const map = new Map<string, T & { quantity: number }>();
  for (const i of items) {
    const k = `${i.productId}:${i.variantId ?? ''}`;
    const prev = map.get(k);
    map.set(k, prev ? { ...prev, quantity: D(prev.quantity).plus(i.quantity).toNumber() } : { ...i });
  }
  return [...map.values()];
}

async function assertLines(items: { productId: string; variantId?: string | null }[]) {
  const products = await prisma.product.findMany({ where: { id: { in: items.map((i) => i.productId) } }, include: { variants: true } });
  for (const i of items) {
    const p = products.find((x) => x.id === i.productId);
    if (!p) throw notFound('PRODUCT_NOT_FOUND', 'Produit introuvable');
    if (!p.trackStock) throw badRequest('STOCK_NOT_TRACKED', `Le stock de « ${p.name} » n’est pas suivi`);
    if (i.variantId && !p.variants.some((v) => v.id === i.variantId)) throw notFound('VARIANT_NOT_FOUND', 'Variante introuvable');
    if (!i.variantId && p.variants.some((v) => v.status === 'ACTIVE')) throw badRequest('VARIANT_REQUIRED', `Choisissez une variante pour « ${p.name} »`);
  }
}

async function notifyPending(id: string) {
  const t = await prisma.stockTransfer.findUnique({ where: { id }, include: { toBranch: true } });
  if (!t) return;
  await NotificationService.notify({ branchId: t.fromBranchId, type: 'PENDING_TRANSFER', title: 'Transfert à approuver', message: `${t.number} vers ${t.toBranch.name}`, link: `/transfers/${t.id}`, dedupKey: `transfer:${t.id}:requested` });
}

export { mergeLines, assertLines };
