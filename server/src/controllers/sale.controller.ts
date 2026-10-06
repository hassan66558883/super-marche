import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { SaleService } from '../services/sale.service.js';
import { HeldSaleService, ReturnService } from '../services/return.service.js';
import { CashService } from '../services/cash.service.js';
import { CustomerService } from '../services/customer.service.js';
import { parseBody, parseQuery } from '../middleware/validate.js';
import { cancelInput, holdInput, returnInput, saleInput, saleListQuery } from '../validators/sale.validators.js';
import { customerPaymentInput } from '../validators/customer.validators.js';
import { created, ok, pageMeta } from '../utils/http.js';
import { pageQuery, dateRange, paging, dayBounds } from '../utils/pagination.js';
import { hasPermission } from '../middleware/auth.js';
import { forbidden, notFound } from '../utils/errors.js';

/** Cost prices and margins are only visible with products.view_cost (cashiers never see them). */
function redact<T extends { costTotal?: unknown; items?: { unitCost?: unknown }[] }>(req: Request, sale: T): T {
  if (hasPermission(req, 'products.view_cost')) return sale;
  const { costTotal: _c, ...rest } = sale;
  return { ...rest, items: sale.items?.map(({ unitCost: _u, ...i }) => i) } as T;
}

export const SaleController = {
  async create(req: Request, res: Response) {
    const { sale, duplicate } = await SaleService.create(req, parseBody(saleInput, req));
    return duplicate ? ok(res, redact(req, sale), { duplicate: true }) : created(res, redact(req, sale));
  },
  async list(req: Request, res: Response) {
    const q = parseQuery(saleListQuery, req);
    const { items, total, sums } = await SaleService.list(req, q);
    return ok(res, items.map((i) => redact(req, i)), { ...pageMeta(q.page, q.pageSize, total), sums });
  },
  async get(req: Request, res: Response) {
    return ok(res, redact(req, await SaleService.get(req, String(req.params.id))));
  },
  async byInvoice(req: Request, res: Response) {
    return ok(res, redact(req, await SaleService.findByInvoice(req, String(req.params.number))));
  },
  async cancel(req: Request, res: Response) {
    return ok(res, redact(req, await SaleService.cancel(req, String(req.params.id), parseBody(cancelInput, req).reason)));
  },
  async createReturn(req: Request, res: Response) {
    return created(res, await ReturnService.create(req, String(req.params.id), parseBody(returnInput, req)));
  },
};

export const ReturnController = {
  async list(req: Request, res: Response) {
    const q = parseQuery(pageQuery.merge(dateRange), req);
    const { items, total } = await ReturnService.list(req, q);
    return ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
  async get(req: Request, res: Response) {
    const r = await ReturnService.get(req, String(req.params.id));
    return ok(res, { ...r, sale: redact(req, r.sale) });
  },
};

export const HeldSaleController = {
  async list(req: Request, res: Response) { return ok(res, await HeldSaleService.list(req)); },
  async create(req: Request, res: Response) { return created(res, await HeldSaleService.create(req, parseBody(holdInput, req))); },
  async take(req: Request, res: Response) { return ok(res, await HeldSaleService.take(req, String(req.params.id))); },
};

export const PaymentMethodController = {
  async list(_req: Request, res: Response) {
    return ok(res, await prisma.paymentMethod.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }));
  },
};

export const CustomerPaymentController = {
  async create(req: Request, res: Response) {
    return created(res, await CustomerService.receivePayment(req, String(req.params.id), parseBody(customerPaymentInput, req)));
  },
};

const amountNote = z.object({ amount: z.coerce.number().min(0).max(1e12), note: z.string().trim().max(300).optional() });

export const CashController = {
  async registers(req: Request, res: Response) {
    const regs = await prisma.cashRegister.findMany({
      where: { branchId: req.branchId!, status: 'ACTIVE' }, orderBy: { name: 'asc' },
      include: { sessions: { where: { status: 'OPEN' }, include: { openedBy: { select: { id: true, fullName: true } } } } },
    });
    return ok(res, regs.map(({ sessions, ...r }) => ({ ...r, openSession: sessions[0] ?? null })));
  },
  async current(req: Request, res: Response) {
    const s = await CashService.currentSession(req.auth!.userId, req.branchId!);
    return ok(res, s ? await CashService.summary(s.id) : null);
  },
  async open(req: Request, res: Response) {
    const b = parseBody(amountNote.extend({ registerId: z.string().uuid() }), req);
    const s = await CashService.open(req, b.registerId, b.amount, b.note);
    return created(res, await CashService.summary(s.id));
  },
  async summary(req: Request, res: Response) {
    const s = await CashService.summary(String(req.params.id));
    if (s.session.branchId !== req.branchId) throw notFound('SESSION_NOT_FOUND', 'Session de caisse introuvable');
    if (s.session.openedById !== req.auth!.userId && !hasPermission(req, 'cash.view')) throw forbidden();
    const movements = await prisma.cashMovement.findMany({ where: { sessionId: s.session.id }, orderBy: { createdAt: 'asc' } });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(movements.map((m) => m.userId))] } }, select: { id: true, fullName: true } });
    return ok(res, { ...s, movements: movements.map((m) => ({ ...m, userName: users.find((u) => u.id === m.userId)?.fullName ?? null })) });
  },
  async cashIn(req: Request, res: Response) {
    const b = parseBody(amountNote.extend({ amount: z.coerce.number().positive(), note: z.string().trim().min(2).max(300) }), req);
    return created(res, await CashService.cashInOut(req, String(req.params.id), 'CASH_IN', b.amount, b.note));
  },
  async cashOut(req: Request, res: Response) {
    const b = parseBody(amountNote.extend({ amount: z.coerce.number().positive(), note: z.string().trim().min(2).max(300) }), req);
    return created(res, await CashService.cashInOut(req, String(req.params.id), 'CASH_OUT', b.amount, b.note));
  },
  async close(req: Request, res: Response) {
    const b = parseBody(amountNote, req);
    return ok(res, await CashService.close(req, String(req.params.id), b.amount, b.note));
  },
  async sessions(req: Request, res: Response) {
    const q = parseQuery(pageQuery.merge(dateRange).extend({ status: z.enum(['OPEN', 'CLOSED']).optional() }), req);
    const where = {
      branchId: req.branchId!,
      ...(q.status ? { status: q.status } : {}),
      ...(hasPermission(req, 'cash.manage') || hasPermission(req, 'cash.view') ? {} : { openedById: req.auth!.userId }),
      ...(dayBounds(q.from, q.to) ? { openedAt: dayBounds(q.from, q.to) } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.cashRegisterSession.findMany({
        where, orderBy: { openedAt: q.order }, ...paging(q),
        include: { register: { select: { name: true } }, openedBy: { select: { fullName: true } }, closedBy: { select: { fullName: true } } },
      }),
      prisma.cashRegisterSession.count({ where }),
    ]);
    return ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
};
