import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { badRequest, conflict, notFound, unprocessable } from '../utils/errors.js';
import { D, roundMoney, toDb } from '../utils/money.js';
import { paging } from '../utils/pagination.js';
import { AuditService } from './audit.service.js';
import { CashService } from './cash.service.js';
import type { ExpenseInput, expenseListQuery } from '../validators/expense.validators.js';

const include = { category: { select: { id: true, code: true, name: true } } } satisfies Prisma.ExpenseInclude;

async function withUserNames<T extends { userId: string; voidedById: string | null }>(rows: T[]) {
  const ids = [...new Set(rows.flatMap((r) => [r.userId, r.voidedById]).filter((x): x is string => !!x))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } }) : [];
  const name = (id: string | null) => users.find((u) => u.id === id)?.fullName ?? null;
  return rows.map((r) => ({ ...r, userName: name(r.userId), voidedByName: name(r.voidedById) }));
}

/**
 * Operating expenses. Never deleted: a mistaken entry is voided (with a reason).
 * Cash paid out of a register is recorded as an EXPENSE cash movement so the register count stays right.
 */
export const ExpenseService = {
  async list(req: Request, q: z.infer<typeof expenseListQuery>) {
    const where: Prisma.ExpenseWhereInput = {
      branchId: req.branchId!,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.from || q.to ? { expenseDate: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00Z`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T00:00:00Z`) } : {}) } } : {}),
      ...(q.search ? { OR: [{ description: { contains: q.search, mode: 'insensitive' } }, { reference: { contains: q.search, mode: 'insensitive' } }] } : {}),
    };
    const [items, total, sum] = await Promise.all([
      prisma.expense.findMany({ where, include, orderBy: [{ expenseDate: q.order }, { createdAt: q.order }], ...paging(q) }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({ where: { ...where, status: 'RECORDED' }, _sum: { amount: true } }),
    ]);
    return { items: await withUserNames(items), total, totalAmount: D(sum._sum.amount).toFixed() };
  },

  async get(req: Request, id: string) {
    const e = await prisma.expense.findFirst({ where: { id, branchId: req.branchId! }, include });
    if (!e) throw notFound('EXPENSE_NOT_FOUND', 'Dépense introuvable');
    return (await withUserNames([e]))[0];
  },

  async create(req: Request, input: ExpenseInput) {
    const auth = req.auth!;
    const branchId = req.branchId!;
    const category = await prisma.expenseCategory.findUnique({ where: { id: input.categoryId } });
    if (!category || category.status !== 'ACTIVE') throw notFound('EXPENSE_CATEGORY_NOT_FOUND', 'Catégorie de dépense introuvable');
    const method = await prisma.paymentMethod.findFirst({ where: { code: input.method, isActive: true } });
    if (!method || method.type === 'CREDIT') throw badRequest('PAYMENT_METHOD_INVALID', 'Mode de paiement invalide');
    if (input.fromRegister && method.type !== 'CASH') throw badRequest('REGISTER_CASH_ONLY', 'Seules les espèces peuvent sortir de la caisse');
    const amount = roundMoney(D(input.amount));
    const today = new Date().toISOString().slice(0, 10);
    if (input.expenseDate && input.expenseDate > today) throw badRequest('EXPENSE_DATE_FUTURE', 'La date de la dépense ne peut pas être dans le futur');

    const expense = await prisma.$transaction(async (tx) => {
      let registerSessionId: string | null = null;
      if (input.fromRegister) {
        const session = await CashService.requireSession(tx, auth.userId, branchId);
        // Lock the session row so two concurrent payouts cannot both pass the cash check
        await tx.$queryRaw`SELECT id FROM cash_register_sessions WHERE id = ${session.id}::uuid FOR UPDATE`;
        const s = await CashService.summary(session.id, tx);
        if (D(s.expected).lt(amount)) throw unprocessable('INSUFFICIENT_CASH', `Espèces insuffisantes en caisse (${s.expected})`);
        registerSessionId = session.id;
      }
      const e = await tx.expense.create({
        data: {
          branchId, categoryId: category.id, amount: toDb(amount), description: input.description, reference: input.reference,
          expenseDate: new Date(`${input.expenseDate ?? today}T00:00:00Z`), paymentMethodCode: method.code, registerSessionId, userId: auth.userId,
        },
        include,
      });
      if (registerSessionId) {
        await CashService.addMovement(tx, {
          sessionId: registerSessionId, type: 'EXPENSE', amount: amount.neg(), userId: auth.userId,
          referenceType: 'EXPENSE', referenceId: e.id, note: `${category.name} — ${input.description}`,
        });
      }
      await AuditService.log({ action: 'CREATE', module: 'expenses', recordId: e.id, description: `Dépense ${category.name} : ${amount.toFixed()} FCFA — ${input.description}` }, req, tx);
      return e;
    });
    return (await withUserNames([expense]))[0];
  },

  /** Void a mistaken entry. If the cash came out of a register that is still open, the cash goes back in. */
  async void(req: Request, id: string, reason: string) {
    const auth = req.auth!;
    const e = await prisma.expense.findFirst({ where: { id, branchId: req.branchId! }, include });
    if (!e) throw notFound('EXPENSE_NOT_FOUND', 'Dépense introuvable');
    if (e.status === 'VOID') throw conflict('EXPENSE_ALREADY_VOID', 'Dépense déjà annulée');

    await prisma.$transaction(async (tx) => {
      const n = await tx.expense.updateMany({ where: { id, status: 'RECORDED' }, data: { status: 'VOID', voidReason: reason, voidedById: auth.userId, voidedAt: new Date() } });
      if (!n.count) throw conflict('EXPENSE_ALREADY_VOID', 'Dépense déjà annulée');
      if (e.registerSessionId) {
        const session = await tx.cashRegisterSession.findUnique({ where: { id: e.registerSessionId } });
        if (session?.status === 'OPEN') {
          await CashService.addMovement(tx, {
            sessionId: session.id, type: 'EXPENSE', amount: D(e.amount), userId: auth.userId,
            referenceType: 'EXPENSE_VOID', referenceId: e.id, note: `Annulation dépense : ${reason}`,
          });
        }
      }
      await AuditService.log({ action: 'CANCEL', module: 'expenses', recordId: id, description: `Dépense annulée (${D(e.amount).toFixed()} FCFA — ${e.category.name}) : ${reason}` }, req, tx);
    });
    return this.get(req, id);
  },

  categories(all = false) {
    return prisma.expenseCategory.findMany({ where: all ? {} : { status: 'ACTIVE' }, orderBy: { name: 'asc' } });
  },

  async createCategory(req: Request, input: { name: string; status: 'ACTIVE' | 'INACTIVE' }) {
    const base = input.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'CAT';
    let code = base;
    for (let i = 2; await prisma.expenseCategory.findUnique({ where: { code } }); i++) code = `${base}_${i}`;
    const c = await prisma.expenseCategory.create({ data: { code, name: input.name, status: input.status } });
    await AuditService.log({ action: 'CREATE', module: 'expenses', recordId: c.id, description: `Catégorie de dépense créée : ${c.name}` }, req);
    return c;
  },

  async updateCategory(req: Request, id: string, input: { name: string; status: 'ACTIVE' | 'INACTIVE' }) {
    if (!(await prisma.expenseCategory.findUnique({ where: { id } }))) throw notFound('EXPENSE_CATEGORY_NOT_FOUND', 'Catégorie de dépense introuvable');
    const c = await prisma.expenseCategory.update({ where: { id }, data: input });
    await AuditService.log({ action: 'UPDATE', module: 'expenses', recordId: id, description: `Catégorie de dépense modifiée : ${c.name}` }, req);
    return c;
  },
};
