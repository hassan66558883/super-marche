import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { badRequest, notFound, unprocessable } from '../utils/errors.js';
import { D, roundMoney, toDb } from '../utils/money.js';
import { paging } from '../utils/pagination.js';
import { AuditService } from './audit.service.js';
import { CashService } from './cash.service.js';
import { nextCode } from './customer.service.js';
import type { SupplierInput } from '../validators/customer.validators.js';
import type { supplierListQuery } from '../validators/stock.validators.js';
import type { z } from 'zod';

export const SupplierService = {
  async list(q: z.infer<typeof supplierListQuery>) {
    const where: Prisma.SupplierWhereInput = {
      ...(q.status !== 'ALL' ? { status: q.status } : {}),
      ...(q.withBalance === 'true' ? { balance: { gt: 0 } } : {}),
      ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { company: { contains: q.search, mode: 'insensitive' } }, { code: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }] } : {}),
    };
    const sortable = ['name', 'code', 'balance', 'createdAt'];
    const field = sortable.includes(q.sort ?? '') ? q.sort! : 'name';
    const [items, total] = await Promise.all([
      prisma.supplier.findMany({ where, orderBy: { [field]: q.sort ? q.order : 'asc' }, ...paging(q) }),
      prisma.supplier.count({ where }),
    ]);
    return { items, total };
  },

  async get(id: string) {
    const s = await prisma.supplier.findUnique({ where: { id } });
    if (!s) throw notFound('SUPPLIER_NOT_FOUND', 'Fournisseur introuvable');
    const [agg, open] = await Promise.all([
      prisma.purchaseOrder.aggregate({ where: { supplierId: id, status: { in: ['APPROVED', 'RECEIVED'] } }, _sum: { total: true }, _count: true }),
      prisma.purchaseOrder.count({ where: { supplierId: id, status: { in: ['PENDING', 'APPROVED'] } } }),
    ]);
    return { ...s, stats: { purchasesTotal: D(agg._sum.total).toFixed(), purchasesCount: agg._count, openOrders: open } };
  },

  async create(req: Request, input: SupplierInput) {
    const s = await prisma.supplier.create({ data: { ...input, code: await nextCode('FRN', 'supplier') } });
    await AuditService.log({ action: 'CREATE', module: 'suppliers', recordId: s.id, description: `Fournisseur créé : ${s.name}` }, req);
    return s;
  },

  async update(req: Request, id: string, input: SupplierInput) {
    if (!(await prisma.supplier.findUnique({ where: { id } }))) throw notFound('SUPPLIER_NOT_FOUND', 'Fournisseur introuvable');
    const s = await prisma.supplier.update({ where: { id }, data: input });
    await AuditService.log({ action: 'UPDATE', module: 'suppliers', recordId: id, description: `Fournisseur modifié : ${s.name}` }, req);
    return s;
  },

  async ledger(id: string, page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      prisma.supplierAccountEntry.findMany({ where: { supplierId: id }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.supplierAccountEntry.count({ where: { supplierId: id } }),
    ]);
    return { items, total };
  },

  /** We pay the supplier: ledger PAYMENT, balance down, allocated FIFO to received orders; optional cash out of the register. */
  async pay(req: Request, id: string, input: { amount: number; method: string; reference?: string | null; note?: string | null; fromRegister: boolean }) {
    const auth = req.auth!;
    const branchId = req.branchId!;
    const method = await prisma.paymentMethod.findFirst({ where: { code: input.method, isActive: true } });
    if (!method || method.type === 'CREDIT') throw badRequest('PAYMENT_METHOD_INVALID', 'Mode de paiement invalide');
    if (input.fromRegister && method.type !== 'CASH') throw badRequest('REGISTER_CASH_ONLY', 'Seules les espèces peuvent sortir de la caisse');
    const amount = roundMoney(D(input.amount));

    return prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ balance: Prisma.Decimal; name: string }[]>`SELECT balance, name FROM suppliers WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked) throw notFound('SUPPLIER_NOT_FOUND', 'Fournisseur introuvable');
      if (amount.gt(D(locked.balance))) throw unprocessable('OVERPAYMENT', `Le montant dépasse le solde dû au fournisseur (${D(locked.balance).toFixed()})`);

      if (input.fromRegister) {
        const session = await CashService.requireSession(tx, auth.userId, branchId);
        const s = await CashService.summary(session.id, tx);
        if (D(s.expected).lt(amount)) throw unprocessable('INSUFFICIENT_CASH', `Espèces insuffisantes en caisse (${s.expected})`);
        await CashService.addMovement(tx, { sessionId: session.id, type: 'CASH_OUT', amount: amount.neg(), userId: auth.userId, referenceType: 'SUPPLIER_PAYMENT', referenceId: id, note: `Paiement fournisseur ${locked.name}` });
      }

      // FIFO allocation to received orders not yet fully paid
      const orders = await tx.purchaseOrder.findMany({ where: { supplierId: id, status: { in: ['APPROVED', 'RECEIVED'] } }, orderBy: { createdAt: 'asc' } });
      let left = amount;
      for (const o of orders) {
        if (left.lte(0)) break;
        const unpaid = D(o.total).minus(D(o.amountPaid));
        if (unpaid.lte(0)) continue;
        const part = unpaid.lt(left) ? unpaid : left;
        await tx.purchaseOrder.update({ where: { id: o.id }, data: { amountPaid: { increment: toDb(part) } } });
        left = left.minus(part);
      }

      const s = await tx.supplier.update({ where: { id }, data: { balance: { decrement: toDb(amount) } } });
      const entry = await tx.supplierAccountEntry.create({
        data: {
          supplierId: id, branchId, type: 'PAYMENT', amount: amount.neg().toFixed(), balanceAfter: s.balance, paymentMethodId: method.id,
          reference: input.reference ?? null, description: [`Paiement ${method.name}`, input.note].filter(Boolean).join(' — '), userId: auth.userId,
        },
      });
      await AuditService.log({ action: 'PAYMENT', module: 'suppliers', recordId: id, description: `Paiement fournisseur ${s.name} : ${amount.toFixed()} FCFA (${method.name})` }, req, tx);
      return { supplier: s, entry };
    });
  },
};
