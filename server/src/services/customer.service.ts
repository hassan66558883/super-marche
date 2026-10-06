import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma.js';
import { badRequest, notFound, unprocessable } from '../utils/errors.js';
import { toDb, D, roundMoney } from '../utils/money.js';
import { CashService } from './cash.service.js';
import { paging } from '../utils/pagination.js';
import { AuditService } from './audit.service.js';
import type { CustomerInput, customerListQuery } from '../validators/customer.validators.js';
import type { z } from 'zod';

async function nextCode(prefix: 'CLI' | 'FRN', model: 'customer' | 'supplier') {
  // Highest numeric suffix; codes edited by hand (e.g. CLI-VIP1) are ignored
  const table = model === 'customer' ? 'customers' : 'suppliers';
  const rows = await prisma.$queryRawUnsafe<{ n: number | null }[]>(
    `SELECT MAX(CAST(substring(code from '^${prefix}-([0-9]+)$') AS INTEGER)) AS n FROM ${table}`,
  );
  const n = (rows[0]?.n ?? 0) + 1;
  return `${prefix}-${String(n).padStart(4, '0')}`;
}
export { nextCode };

export const CustomerService = {
  async list(q: z.infer<typeof customerListQuery>) {
    const where: Prisma.CustomerWhereInput = {
      ...(q.status !== 'ALL' ? { status: q.status } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.withBalance === 'true' ? { balance: { gt: 0 } } : {}),
      ...(q.search
        ? { OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { phone: { contains: q.search.replace(/\s/g, '') } },
            { phone: { contains: q.search } },
            { code: { contains: q.search, mode: 'insensitive' } },
            { email: { contains: q.search, mode: 'insensitive' } },
          ] }
        : {}),
    };
    const sortable = ['name', 'code', 'balance', 'createdAt'] as const;
    const field = (sortable as readonly string[]).includes(q.sort ?? '') ? q.sort! : 'name';
    const [items, total] = await Promise.all([
      prisma.customer.findMany({ where, orderBy: [{ type: 'asc' }, { [field]: q.sort ? q.order : 'asc' }], ...paging(q) }),
      prisma.customer.count({ where }),
    ]);
    return { items, total };
  },

  async get(id: string) {
    const c = await prisma.customer.findUnique({ where: { id } });
    if (!c) throw notFound('CUSTOMER_NOT_FOUND', 'Client introuvable');
    const [salesAgg, openInvoices] = await Promise.all([
      prisma.sale.aggregate({ where: { customerId: id, status: { not: 'CANCELLED' } }, _sum: { total: true }, _count: true }),
      prisma.sale.count({ where: { customerId: id, amountDue: { gt: 0 }, status: { not: 'CANCELLED' } } }),
    ]);
    return {
      ...c,
      availableCredit: D(c.creditLimit).minus(D(c.balance)).toFixed(),
      stats: { totalPurchases: D(salesAgg._sum.total).toFixed(), salesCount: salesAgg._count, openInvoices },
    };
  },

  async create(req: Request, input: CustomerInput) {
    const c = await prisma.customer.create({ data: { ...input, code: await nextCode('CLI', 'customer'), creditLimit: toDb(input.creditLimit) } });
    await AuditService.log({ action: 'CREATE', module: 'customers', recordId: c.id, description: `Client créé : ${c.name}` }, req);
    return c;
  },

  async update(req: Request, id: string, input: CustomerInput) {
    const before = await prisma.customer.findUnique({ where: { id } });
    if (!before) throw notFound('CUSTOMER_NOT_FOUND', 'Client introuvable');
    const c = await prisma.customer.update({ where: { id }, data: { ...input, creditLimit: toDb(input.creditLimit) } });
    await AuditService.log({
      action: 'UPDATE', module: 'customers', recordId: id, description: `Client modifié : ${c.name}`,
      metadata: !D(before.creditLimit).eq(input.creditLimit) ? { creditLimit: { before: D(before.creditLimit).toFixed(), after: String(input.creditLimit) } } : undefined,
    }, req);
    return c;
  },

  async ledger(id: string, page: number, pageSize: number) {
    const [items, total] = await Promise.all([
      prisma.customerAccountEntry.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.customerAccountEntry.count({ where: { customerId: id } }),
    ]);
    const saleIds = items.map((e) => e.saleId).filter((x): x is string => !!x);
    const sales = await prisma.sale.findMany({ where: { id: { in: saleIds } }, select: { id: true, invoiceNumber: true } });
    return { items: items.map((e) => ({ ...e, invoiceNumber: sales.find((s) => s.id === e.saleId)?.invoiceNumber ?? null })), total };
  },

  async invoices(id: string, onlyOpen: boolean) {
    return prisma.sale.findMany({
      where: { customerId: id, ...(onlyOpen ? { amountDue: { gt: 0 }, status: { not: 'CANCELLED' } } : {}) },
      select: { id: true, invoiceNumber: true, createdAt: true, total: true, amountPaid: true, amountDue: true, dueDate: true, status: true, paymentStatus: true, branch: { select: { code: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  },

  /**
   * Customer pays down their credit balance. The amount is allocated FIFO to open invoices
   * (oldest first), each allocation is a Payment row linked to its sale, and the ledger
   * records a single PAYMENT entry. Cash goes into the caller's open register.
   */
  async receivePayment(req: Request, id: string, input: { amount: number; method: string; reference?: string | null; note?: string | null }) {
    const auth = req.auth!;
    const branchId = req.branchId!;
    const method = await prisma.paymentMethod.findFirst({ where: { code: input.method, isActive: true } });
    if (!method || method.type === 'CREDIT') throw badRequest('PAYMENT_METHOD_INVALID', 'Mode de paiement invalide');
    const amount = roundMoney(D(input.amount));
    if (amount.lte(0)) throw badRequest('INVALID_AMOUNT', 'Montant invalide');

    return prisma.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ balance: Prisma.Decimal }[]>`SELECT balance FROM customers WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked) throw notFound('CUSTOMER_NOT_FOUND', 'Client introuvable');
      if (amount.gt(D(locked.balance))) throw unprocessable('OVERPAYMENT', `Le montant dépasse le solde dû (${D(locked.balance).toFixed()})`);
      const session = method.type === 'CASH' ? await CashService.requireSession(tx, auth.userId, branchId) : await CashService.currentSession(auth.userId, branchId, tx);

      const open = await tx.sale.findMany({ where: { customerId: id, amountDue: { gt: 0 }, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'asc' } });
      let left = amount;
      const allocations: { invoiceNumber: string; amount: string }[] = [];
      let firstPaymentId: string | null = null;
      for (const s of open) {
        if (left.lte(0)) break;
        const part = D(s.amountDue).lt(left) ? D(s.amountDue) : left;
        const due = D(s.amountDue).minus(part);
        await tx.sale.update({ where: { id: s.id }, data: { amountPaid: { increment: toDb(part) }, amountDue: toDb(due), paymentStatus: due.lte(0) ? 'PAID' : 'PARTIAL' } });
        const pay = await tx.payment.create({
          data: { branchId, saleId: s.id, customerId: id, paymentMethodId: method.id, registerSessionId: session?.id ?? null, amount: toDb(part), reference: input.reference ?? null, userId: auth.userId },
        });
        firstPaymentId ??= pay.id;
        allocations.push({ invoiceNumber: s.invoiceNumber, amount: part.toFixed() });
        left = left.minus(part);
      }
      if (left.gt(0)) {
        // Balance not tied to an invoice (manual adjustments)
        const pay = await tx.payment.create({
          data: { branchId, customerId: id, paymentMethodId: method.id, registerSessionId: session?.id ?? null, amount: toDb(left), reference: input.reference ?? null, userId: auth.userId },
        });
        firstPaymentId ??= pay.id;
      }
      const c = await tx.customer.update({ where: { id }, data: { balance: { decrement: toDb(amount) } } });
      const entry = await tx.customerAccountEntry.create({
        data: {
          customerId: id, branchId, type: 'PAYMENT', amount: amount.neg().toFixed(), balanceAfter: c.balance, paymentId: firstPaymentId,
          description: [`Paiement ${method.name}`, input.reference, input.note].filter(Boolean).join(' — '), userId: auth.userId,
        },
      });
      if (method.type === 'CASH' && session) {
        await CashService.addMovement(tx, { sessionId: session.id, type: 'CASH_IN', amount, userId: auth.userId, referenceType: 'CUSTOMER_PAYMENT', referenceId: entry.id, reference: c.code, note: `Règlement client ${c.name}` });
      }
      await AuditService.log({
        action: 'PAYMENT', module: 'customers', recordId: id, description: `Paiement de ${c.name} : ${amount.toFixed()} FCFA (${method.name})`,
        metadata: { allocations, method: method.code },
      }, req, tx);
      return { customer: c, entry, allocations };
    });
  },
};
