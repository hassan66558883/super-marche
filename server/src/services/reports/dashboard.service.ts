import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma.js';
import { D, toStr } from '../../utils/money.js';
import { forbidden } from '../../utils/errors.js';
import { hasPermission } from '../../middleware/auth.js';
import { timezone } from './report.service.js';
import { addDaysIso, eachDay, localRange, localToday } from './time.js';

export type DashboardPeriod = 'today' | 'week' | 'month';

const str = (v: Prisma.Decimal | null | undefined) => toStr(v);

export const DashboardService = {
  async get(req: Request, { period = 'today', scope }: { period?: DashboardPeriod; scope?: 'branch' | 'all' }) {
    const all = scope === 'all';
    if (all && !hasPermission(req, 'branches.all')) throw forbidden('Accès refusé aux autres succursales', 'BRANCH_FORBIDDEN');
    const ids = all ? req.auth!.branchIds : [req.branchId!];
    const viewCost = hasPermission(req, 'products.view_cost');
    // Roles without company-wide sales visibility (e.g. stock manager) only get the stock figures
    const viewSales = hasPermission(req, 'sales.view_all');
    const tz = await timezone(req.branchId);
    const today = localToday(tz);
    const from = period === 'today' ? today : period === 'week' ? addDaysIso(today, -6) : `${today.slice(0, 8)}01`;
    const { gte, lt } = localRange(from, today, tz);
    const trendFrom = addDaysIso(today, -29);
    const trendRange = localRange(trendFrom, today, tz);
    const live = Prisma.sql`s.status <> 'CANCELLED' AND s.branch_id = ANY(${ids}::uuid[])`;
    const period$ = Prisma.sql`s.created_at >= ${gte} AND s.created_at < ${lt}`;
    const localTs = (col: string) => Prisma.sql`timezone(${tz}, timezone('UTC', ${Prisma.raw(col)}))`;

    const [kpi, rets, payments, credit, stock, topProducts, topCategories, byHour, byBranch, trendSales, trendRets, recent] = await Promise.all([
      prisma.$queryRaw<[{ n: bigint; gross: Prisma.Decimal | null; tax: Prisma.Decimal | null; cost: Prisma.Decimal | null; disc: Prisma.Decimal | null }]>`
        SELECT count(*) AS n, sum(s.total) AS gross, sum(s.tax_total) AS tax, sum(s.cost_total) AS cost, sum(s.discount_total) AS disc FROM sales s WHERE ${live} AND ${period$}`,
      prisma.$queryRaw<[{ total: Prisma.Decimal | null; net: Prisma.Decimal | null; cost: Prisma.Decimal | null }]>`
        SELECT sum(ri.total) AS total, sum(ri.total - ri.tax_amount) AS net, sum(CASE WHEN ri.restocked THEN ri.quantity * si.unit_cost ELSE 0 END) AS cost
        FROM returns r JOIN return_items ri ON ri.return_id = r.id JOIN sale_items si ON si.id = ri.sale_item_id
        WHERE r.status = 'COMPLETED' AND r.branch_id = ANY(${ids}::uuid[]) AND r.created_at >= ${gte} AND r.created_at < ${lt}`,
      prisma.$queryRaw<{ code: string; name: string; type: string; amount: Prisma.Decimal }[]>`
        SELECT m.code, m.name, m.type::text AS type,
               coalesce(sum(CASE WHEN p.direction = 'IN' THEN p.amount ELSE -p.amount END), 0) AS amount
        FROM payments p JOIN payment_methods m ON m.id = p.payment_method_id
        WHERE p.status = 'COMPLETED' AND p.branch_id = ANY(${ids}::uuid[]) AND p.created_at >= ${gte} AND p.created_at < ${lt}
        GROUP BY m.code, m.name, m.type, m.sort_order ORDER BY m.sort_order`,
      // Credit sales = amounts charged to customer accounts at checkout (stays true after later repayments)
      prisma.$queryRaw<[{ amount: Prisma.Decimal | null; n: bigint }]>`
        SELECT sum(e.amount) AS amount, count(DISTINCT e.sale_id) AS n FROM customer_accounts e JOIN sales s ON s.id = e.sale_id
        WHERE e.type = 'SALE' AND e.amount > 0 AND ${live} AND ${period$}`,
      prisma.$queryRaw<[{ low: bigint; out: bigint }]>`
        SELECT count(*) FILTER (WHERE inv.quantity > 0 AND inv.quantity <= p.min_stock) AS low, count(*) FILTER (WHERE inv.quantity <= 0) AS out
        FROM inventory inv JOIN products p ON p.id = inv.product_id
        WHERE inv.branch_id = ANY(${ids}::uuid[]) AND p.track_stock AND p.status = 'ACTIVE'`,
      prisma.$queryRaw<{ id: string; name: string; qty: Prisma.Decimal; revenue: Prisma.Decimal }[]>`
        SELECT i.product_id AS id, i.product_name AS name, sum(i.quantity - i.returned_quantity) AS qty, sum(i.total) AS revenue
        FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE ${live} AND ${period$}
        GROUP BY i.product_id, i.product_name ORDER BY revenue DESC LIMIT 8`,
      prisma.$queryRaw<{ name: string | null; revenue: Prisma.Decimal }[]>`
        SELECT c.name, sum(i.total) AS revenue FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN products p ON p.id = i.product_id LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${live} AND ${period$} GROUP BY c.name ORDER BY revenue DESC LIMIT 6`,
      prisma.$queryRaw<{ h: number; n: bigint; total: Prisma.Decimal }[]>`
        SELECT extract(hour FROM ${localTs('s.created_at')})::int AS h, count(*) AS n, sum(s.total) AS total FROM sales s WHERE ${live} AND ${period$} GROUP BY 1`,
      prisma.$queryRaw<{ id: string; name: string; n: bigint; total: Prisma.Decimal | null }[]>`
        SELECT b.id, b.name, count(s.id) AS n, sum(s.total) AS total FROM branches b
        LEFT JOIN sales s ON s.branch_id = b.id AND s.status <> 'CANCELLED' AND ${period$}
        WHERE b.id = ANY(${ids}::uuid[]) GROUP BY b.id, b.name ORDER BY total DESC NULLS LAST`,
      prisma.$queryRaw<{ d: string; n: bigint; total: Prisma.Decimal; net: Prisma.Decimal; cost: Prisma.Decimal }[]>`
        SELECT to_char(${localTs('s.created_at')}, 'YYYY-MM-DD') AS d, count(*) AS n, sum(s.total) AS total, sum(s.total - s.tax_total) AS net, sum(s.cost_total) AS cost
        FROM sales s WHERE ${live} AND s.created_at >= ${trendRange.gte} AND s.created_at < ${trendRange.lt} GROUP BY 1`,
      prisma.$queryRaw<{ d: string; total: Prisma.Decimal; net: Prisma.Decimal; cost: Prisma.Decimal }[]>`
        SELECT to_char(${localTs('r.created_at')}, 'YYYY-MM-DD') AS d, sum(ri.total) AS total, sum(ri.total - ri.tax_amount) AS net,
               sum(CASE WHEN ri.restocked THEN ri.quantity * si.unit_cost ELSE 0 END) AS cost
        FROM returns r JOIN return_items ri ON ri.return_id = r.id JOIN sale_items si ON si.id = ri.sale_item_id
        WHERE r.status = 'COMPLETED' AND r.branch_id = ANY(${ids}::uuid[]) AND r.created_at >= ${trendRange.gte} AND r.created_at < ${trendRange.lt} GROUP BY 1`,
      prisma.sale.findMany({
        where: { branchId: { in: ids } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, invoiceNumber: true, createdAt: true, total: true, status: true, paymentStatus: true, customer: { select: { name: true } }, cashier: { select: { fullName: true } } },
      }),
    ]);

    const k = kpi[0];
    const r = rets[0];
    const gross = D(k.gross);
    const returns = D(r.total);
    const n = Number(k.n);
    const profit = D(k.gross).minus(D(k.tax)).minus(D(k.cost)).minus(D(r.net)).plus(D(r.cost));
    const byType = (type: string) => payments.filter((p) => p.type === type).reduce((a, p) => a.plus(D(p.amount)), D(0));

    const trend = eachDay(trendFrom, today).map((d) => {
      const s = trendSales.find((x) => x.d === d);
      const rr = trendRets.find((x) => x.d === d);
      const row: Record<string, string | number> = { day: d, transactions: Number(s?.n ?? 0), sales: toStr(D(s?.total).minus(D(rr?.total))) };
      if (viewCost) row.profit = toStr(D(s?.net).minus(D(s?.cost)).minus(D(rr?.net)).plus(D(rr?.cost)));
      return row;
    });

    const stockKpis = { lowStock: Number(stock[0].low), outOfStock: Number(stock[0].out) };
    if (!viewSales) {
      return { period, from, to: today, tz, scope: all ? 'all' : 'branch', salesVisible: false, kpis: stockKpis, payments: [], topProducts: [], topCategories: [], byHour: [], byBranch: [], trend: [], recent: [] };
    }
    return {
      period, from, to: today, tz, scope: all ? 'all' : 'branch', salesVisible: true,
      kpis: {
        sales: toStr(gross.minus(returns)),
        grossSales: str(k.gross),
        returns: toStr(returns),
        discounts: str(k.disc),
        profit: viewCost ? toStr(profit) : undefined,
        transactions: n,
        avgBasket: n ? toStr(gross.div(n).toDecimalPlaces(0)) : '0',
        cash: toStr(byType('CASH')),
        card: toStr(byType('CARD')),
        mobileMoney: toStr(byType('MOBILE_MONEY')),
        credit: str(credit[0].amount),
        creditCount: Number(credit[0].n),
        ...stockKpis,
      },
      payments: payments.filter((p) => !D(p.amount).isZero()).map((p) => ({ code: p.code, name: p.name, type: p.type, amount: str(p.amount) })),
      topProducts: topProducts.map((p) => ({ id: p.id, name: p.name, qty: toStr(p.qty), revenue: str(p.revenue) })),
      topCategories: topCategories.map((c) => ({ name: c.name, revenue: str(c.revenue) })),
      byHour: Array.from({ length: 24 }, (_, h) => {
        const x = byHour.find((b) => b.h === h);
        return { hour: h, transactions: Number(x?.n ?? 0), sales: str(x?.total) };
      }),
      byBranch: byBranch.map((b) => ({ id: b.id, name: b.name, transactions: Number(b.n), sales: str(b.total) })),
      trend,
      recent: recent.map((s) => ({ ...s, total: str(s.total) })),
    };
  },
};
