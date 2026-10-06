import type { Request } from 'express';
import type { CashMovementType } from '@prisma/client';
import { prisma, type Tx, type Db } from '../utils/prisma.js';
import { conflict, notFound, unprocessable, forbidden } from '../utils/errors.js';
import { D, toDb, type DecimalInput } from '../utils/money.js';
import { AuditService } from './audit.service.js';
import { NotificationService } from './notification.service.js';
import { SettingsService } from './settings.service.js';
import { hasPermission } from '../middleware/auth.js';

export const CashService = {
  /** The caller's open register session in this branch, if any */
  currentSession(userId: string, branchId: string, db: Db = prisma) {
    return db.cashRegisterSession.findFirst({
      where: { openedById: userId, branchId, status: 'OPEN' },
      include: { register: true },
      orderBy: { openedAt: 'desc' },
    });
  },

  async requireSession(tx: Tx, userId: string, branchId: string) {
    const s = await this.currentSession(userId, branchId, tx);
    if (!s) throw unprocessable('REGISTER_NOT_OPEN', 'Aucune caisse ouverte. Ouvrez votre caisse avant de vendre.');
    return s;
  },

  async addMovement(tx: Tx, m: { sessionId: string; type: CashMovementType; amount: DecimalInput; userId: string; referenceType?: string; referenceId?: string; reference?: string; note?: string }) {
    if (D(m.amount).isZero() && m.type !== 'OPEN' && m.type !== 'CLOSE') return null;
    return tx.cashMovement.create({ data: { ...m, amount: toDb(m.amount) } });
  },

  async open(req: Request, registerId: string, openingAmount: number, note?: string) {
    const userId = req.auth!.userId;
    const branchId = req.branchId!;
    const register = await prisma.cashRegister.findFirst({ where: { id: registerId, branchId, status: 'ACTIVE' } });
    if (!register) throw notFound('REGISTER_NOT_FOUND', 'Caisse introuvable dans cette succursale');
    if (await this.currentSession(userId, branchId)) throw conflict('REGISTER_ALREADY_OPEN', 'Vous avez déjà une caisse ouverte');
    const busy = await prisma.cashRegisterSession.findFirst({ where: { registerId, status: 'OPEN' }, include: { openedBy: { select: { fullName: true } } } });
    if (busy) throw conflict('REGISTER_IN_USE', `Cette caisse est déjà ouverte par ${busy.openedBy.fullName}`);

    return prisma.$transaction(async (tx) => {
      const session = await tx.cashRegisterSession.create({
        data: { registerId, branchId, openedById: userId, openingAmount: toDb(openingAmount), openingNote: note },
      });
      await tx.cashMovement.create({ data: { sessionId: session.id, type: 'OPEN', amount: toDb(openingAmount), userId, note: 'Fond de caisse' } });
      await AuditService.log({ action: 'CASH_REGISTER_OPEN', module: 'cash', recordId: session.id, description: `Ouverture ${register.name} — fond ${openingAmount}` }, req, tx);
      return session;
    });
  },

  /** Expected cash = sum of all movements (opening + sales − refunds − expenses ± in/out) */
  async summary(sessionId: string, db: Db = prisma) {
    const session = await db.cashRegisterSession.findUnique({
      where: { id: sessionId },
      include: { register: true, openedBy: { select: { id: true, fullName: true } }, closedBy: { select: { fullName: true } } },
    });
    if (!session) throw notFound('SESSION_NOT_FOUND', 'Session de caisse introuvable');
    const byType = await db.cashMovement.groupBy({ by: ['type'], where: { sessionId }, _sum: { amount: true } });
    const get = (t: CashMovementType) => D(byType.find((b) => b.type === t)?._sum.amount);
    const expected = byType.filter((b) => b.type !== 'CLOSE').reduce((a, b) => a.plus(D(b._sum.amount)), D(0));

    // Non-cash takings during the session, by payment method
    const payments = await db.payment.groupBy({
      by: ['paymentMethodId', 'direction'], where: { registerSessionId: sessionId, status: 'COMPLETED' }, _sum: { amount: true }, _count: true,
    });
    const methods = await db.paymentMethod.findMany({ where: { id: { in: payments.map((p) => p.paymentMethodId) } } });
    const salesAgg = await db.sale.aggregate({ where: { registerSessionId: sessionId, status: { not: 'CANCELLED' } }, _sum: { total: true }, _count: true });

    return {
      session,
      opening: D(session.openingAmount).toFixed(),
      cashSales: get('SALE').toFixed(),
      cashRefunds: get('REFUND').toFixed(),
      cashExpenses: get('EXPENSE').toFixed(),
      cashIn: get('CASH_IN').toFixed(),
      cashOut: get('CASH_OUT').toFixed(),
      expected: (session.status === 'CLOSED' && session.expectedAmount ? D(session.expectedAmount) : expected).toFixed(),
      salesCount: salesAgg._count,
      salesTotal: D(salesAgg._sum.total).toFixed(),
      byMethod: methods.map((m) => {
        const inn = D(payments.find((p) => p.paymentMethodId === m.id && p.direction === 'IN')?._sum.amount);
        const out = D(payments.find((p) => p.paymentMethodId === m.id && p.direction === 'OUT')?._sum.amount);
        return { code: m.code, name: m.name, type: m.type, in: inn.toFixed(), out: out.toFixed(), net: inn.minus(out).toFixed() };
      }),
    };
  },

  async cashInOut(req: Request, sessionId: string, type: 'CASH_IN' | 'CASH_OUT', amount: number, note: string) {
    const session = await prisma.cashRegisterSession.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== 'OPEN') throw unprocessable('REGISTER_NOT_OPEN', 'Session de caisse fermée');
    if (session.openedById !== req.auth!.userId && !hasPermission(req, 'cash.manage')) throw forbidden();
    return prisma.$transaction(async (tx) => {
      if (type === 'CASH_OUT') {
        const s = await this.summary(sessionId, tx);
        if (D(s.expected).lt(amount)) throw unprocessable('INSUFFICIENT_CASH', `Espèces insuffisantes en caisse (${s.expected})`);
      }
      const mv = await this.addMovement(tx, { sessionId, type, amount: type === 'CASH_OUT' ? -amount : amount, userId: req.auth!.userId, note });
      await AuditService.log({ action: 'PAYMENT', module: 'cash', recordId: sessionId, description: `${type === 'CASH_IN' ? 'Entrée' : 'Sortie'} d'espèces ${amount} — ${note}` }, req, tx);
      return mv;
    });
  },

  async close(req: Request, sessionId: string, countedAmount: number, note?: string) {
    const session = await prisma.cashRegisterSession.findUnique({ where: { id: sessionId }, include: { register: true } });
    if (!session) throw notFound('SESSION_NOT_FOUND', 'Session de caisse introuvable');
    if (session.status !== 'OPEN') throw conflict('REGISTER_CLOSED', 'Cette caisse est déjà fermée');
    if (session.openedById !== req.auth!.userId && !hasPermission(req, 'cash.manage')) throw forbidden('Seul le caissier ou un gérant peut fermer cette caisse');

    const result = await prisma.$transaction(async (tx) => {
      const s = await this.summary(sessionId, tx);
      const expected = D(s.expected);
      const difference = D(countedAmount).minus(expected);
      await tx.cashMovement.create({ data: { sessionId, type: 'CLOSE', amount: toDb(0), userId: req.auth!.userId, note: `Compté ${countedAmount}, attendu ${expected.toFixed()}, écart ${difference.toFixed()}` } });
      const closed = await tx.cashRegisterSession.update({
        where: { id: sessionId },
        data: { status: 'CLOSED', closedById: req.auth!.userId, closedAt: new Date(), expectedAmount: toDb(expected), countedAmount: toDb(countedAmount), difference: toDb(difference), closingNote: note },
      });
      await AuditService.log({ action: 'CASH_REGISTER_CLOSE', module: 'cash', recordId: sessionId, description: `Clôture ${session.register.name} — attendu ${expected.toFixed()}, compté ${countedAmount}, écart ${difference.toFixed()}` }, req, tx);
      return { closed, difference };
    });

    const { cashDiscrepancyThreshold } = await SettingsService.get<{ cashDiscrepancyThreshold: number }>('notifications', session.branchId);
    if (result.difference.abs().gt(cashDiscrepancyThreshold ?? 0)) {
      await NotificationService.notify({
        branchId: session.branchId, type: 'CASH_DISCREPANCY', title: 'Écart de caisse',
        message: `${session.register.name} : écart de ${result.difference.toFixed()} FCFA à la clôture`, link: `/cash?session=${sessionId}`,
      });
    }
    return this.summary(sessionId);
  },
};
