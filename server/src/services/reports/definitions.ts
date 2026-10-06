import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma.js';
import { D, Decimal, roundMoney, CURRENCY_DECIMALS } from '../../utils/money.js';
import { eachDay, eachMonth } from './time.js';

export type ColType = 'text' | 'money' | 'qty' | 'int' | 'percent' | 'date' | 'datetime' | 'enum';
export interface Column { key: string; type: ColType }
export type Cell = string | number | null;
export type Row = Record<string, Cell>;

export interface ReportCtx {
  branchIds: string[];
  from: string;
  to: string;
  gte: Date;
  lt: Date;
  tz: string;
  viewCost: boolean;
}

export interface ReportData {
  columns: Column[];
  rows: Row[];
  /** Sum of each money/qty/int column unless listed in `noTotal` */
  totals?: Row;
  chart?: { kind: 'bar' | 'line' | 'pie'; x: string; y: string[] };
  /** Report is a snapshot (ignores the date range) */
  snapshot?: boolean;
}

export interface ReportDef {
  key: string;
  group: 'sales' | 'finance' | 'stock' | 'partners' | 'operations';
  /** Every listed permission is required */
  permissions: string[];
  /** Longest allowed range in days (day-by-day reports) */
  maxDays?: number;
  build: (ctx: ReportCtx) => Promise<ReportData>;
}

// ───────────── helpers ─────────────
const money = (v: unknown) => roundMoney(D(v as Prisma.Decimal.Value | null)).toFixed(CURRENCY_DECIMALS);
const qty = (v: unknown) => D(v as Prisma.Decimal.Value | null).toFixed();
const int = (v: unknown) => Number(v ?? 0);
const pct = (num: Prisma.Decimal.Value, den: Prisma.Decimal.Value) => (D(den).isZero() ? '0' : D(num).div(D(den)).mul(100).toFixed(1));
const branches = (alias: string, ctx: ReportCtx) => Prisma.sql`${Prisma.raw(alias)}.branch_id = ANY(${ctx.branchIds}::uuid[])`;
const inRange = (col: string, ctx: ReportCtx) => Prisma.sql`${Prisma.raw(col)} >= ${ctx.gte} AND ${Prisma.raw(col)} < ${ctx.lt}`;
const localDay = (col: string, ctx: ReportCtx, fmt = 'YYYY-MM-DD') => Prisma.sql`to_char(timezone(${ctx.tz}, timezone('UTC', ${Prisma.raw(col)})), ${fmt})`;
const cols = (spec: string): Column[] => spec.split(/\s+/).filter(Boolean).map((s) => { const [key, type = 'text'] = s.split(':'); return { key, type: type as ColType }; });
const withoutCost = (c: Column[], ctx: ReportCtx, costKeys: string[]) => (ctx.viewCost ? c : c.filter((x) => !costKeys.includes(x.key)));

export function sumTotals(columns: Column[], rows: Row[], skip: string[] = []): Row {
  const out: Row = {};
  for (const c of columns) {
    if (skip.includes(c.key) || !['money', 'qty', 'int'].includes(c.type)) continue;
    const s = rows.reduce((a, r) => a.plus(D((r[c.key] as string | number | null) ?? 0)), D(0));
    out[c.key] = c.type === 'int' ? s.toNumber() : c.type === 'money' ? money(s) : s.toFixed();
  }
  return out;
}

// ───────────── sales over time ─────────────
async function salesOverTime(ctx: ReportCtx, fmt: 'YYYY-MM-DD' | 'YYYY-MM'): Promise<ReportData> {
  const sales = await prisma.$queryRaw<{ k: string; n: bigint; gross: Prisma.Decimal; disc: Prisma.Decimal; tax: Prisma.Decimal; cost: Prisma.Decimal }[]>`
    SELECT ${localDay('s.created_at', ctx, fmt)} AS k, count(*) AS n, sum(s.total) AS gross, sum(s.discount_total) AS disc, sum(s.tax_total) AS tax, sum(s.cost_total) AS cost
    FROM sales s WHERE s.status <> 'CANCELLED' AND ${branches('s', ctx)} AND ${inRange('s.created_at', ctx)} GROUP BY 1`;
  const rets = await prisma.$queryRaw<{ k: string; total: Prisma.Decimal }[]>`
    SELECT ${localDay('r.created_at', ctx, fmt)} AS k, sum(r.total) AS total FROM returns r WHERE r.status = 'COMPLETED' AND ${branches('r', ctx)} AND ${inRange('r.created_at', ctx)} GROUP BY 1`;
  const keys = fmt === 'YYYY-MM' ? eachMonth(ctx.from, ctx.to) : eachDay(ctx.from, ctx.to);
  const rows = keys.map((k) => {
    const s = sales.find((x) => x.k === k);
    const r = D(rets.find((x) => x.k === k)?.total);
    const n = int(s?.n);
    return {
      [fmt === 'YYYY-MM' ? 'month' : 'day']: k, transactions: n, gross: money(s?.gross), discounts: money(s?.disc), tax: money(s?.tax),
      returns: money(r), net: money(D(s?.gross).minus(r)), avgBasket: n ? money(D(s?.gross).div(n).toDecimalPlaces(0)) : '0',
    };
  });
  const columns = cols(`${fmt === 'YYYY-MM' ? 'month' : 'day:date'} transactions:int gross:money discounts:money tax:money returns:money net:money avgBasket:money`);
  const totals = sumTotals(columns, rows, ['avgBasket']);
  totals.avgBasket = Number(totals.transactions) ? money(D(totals.gross as string).div(Number(totals.transactions)).toDecimalPlaces(0)) : '0';
  return { columns, rows, totals, chart: { kind: fmt === 'YYYY-MM' ? 'bar' : 'line', x: fmt === 'YYYY-MM' ? 'month' : 'day', y: ['net'] } };
}

// ───────────── definitions ─────────────
export const REPORTS: ReportDef[] = [
  { key: 'daily-sales', group: 'sales', permissions: ['sales.view_all'], maxDays: 366, build: (ctx) => salesOverTime(ctx, 'YYYY-MM-DD') },
  { key: 'monthly-sales', group: 'sales', permissions: ['sales.view_all'], build: (ctx) => salesOverTime(ctx, 'YYYY-MM') },

  {
    key: 'sales-by-cashier', group: 'sales', permissions: ['sales.view_all'],
    async build(ctx) {
      const data = await prisma.$queryRaw<{ name: string; n: bigint; c: bigint; gross: Prisma.Decimal; disc: Prisma.Decimal }[]>`
        SELECT u.full_name AS name, count(*) FILTER (WHERE s.status <> 'CANCELLED') AS n, count(*) FILTER (WHERE s.status = 'CANCELLED') AS c,
               coalesce(sum(s.total) FILTER (WHERE s.status <> 'CANCELLED'), 0) AS gross, coalesce(sum(s.discount_total) FILTER (WHERE s.status <> 'CANCELLED'), 0) AS disc
        FROM sales s JOIN users u ON u.id = s.cashier_id WHERE ${branches('s', ctx)} AND ${inRange('s.created_at', ctx)}
        GROUP BY u.full_name ORDER BY gross DESC`;
      const columns = cols('cashier transactions:int gross:money discounts:money avgBasket:money cancelled:int');
      const rows = data.map((d) => ({ cashier: d.name, transactions: int(d.n), gross: money(d.gross), discounts: money(d.disc), avgBasket: int(d.n) ? money(D(d.gross).div(int(d.n)).toDecimalPlaces(0)) : '0', cancelled: int(d.c) }));
      return { columns, rows, totals: sumTotals(columns, rows, ['avgBasket']), chart: { kind: 'bar', x: 'cashier', y: ['gross'] } };
    },
  },

  {
    key: 'sales-by-branch', group: 'sales', permissions: ['sales.view_all'],
    async build(ctx) {
      const data = await prisma.$queryRaw<{ name: string; n: bigint; gross: Prisma.Decimal; tax: Prisma.Decimal; cost: Prisma.Decimal; ret: Prisma.Decimal }[]>`
        SELECT b.name, count(s.id) AS n, coalesce(sum(s.total), 0) AS gross, coalesce(sum(s.tax_total), 0) AS tax, coalesce(sum(s.cost_total), 0) AS cost,
               (SELECT coalesce(sum(r.total), 0) FROM returns r WHERE r.status = 'COMPLETED' AND r.branch_id = b.id AND ${inRange('r.created_at', ctx)}) AS ret
        FROM branches b LEFT JOIN sales s ON s.branch_id = b.id AND s.status <> 'CANCELLED' AND ${inRange('s.created_at', ctx)}
        WHERE b.id = ANY(${ctx.branchIds}::uuid[]) GROUP BY b.id, b.name ORDER BY gross DESC`;
      const columns = withoutCost(cols('branch transactions:int gross:money tax:money returns:money net:money profit:money'), ctx, ['profit']);
      const rows = data.map((d) => ({
        branch: d.name, transactions: int(d.n), gross: money(d.gross), tax: money(d.tax), returns: money(d.ret), net: money(D(d.gross).minus(D(d.ret))),
        profit: money(D(d.gross).minus(D(d.tax)).minus(D(d.cost))),
      }));
      return { columns, rows, totals: sumTotals(columns, rows), chart: { kind: 'bar', x: 'branch', y: ['net'] } };
    },
  },

  {
    key: 'sales-by-product', group: 'sales', permissions: ['sales.view_all'],
    async build(ctx) {
      const data = await prisma.$queryRaw<{ sku: string; name: string; q: Prisma.Decimal; rq: Prisma.Decimal; rev: Prisma.Decimal; net: Prisma.Decimal; cost: Prisma.Decimal }[]>`
        SELECT i.sku, i.product_name AS name, sum(i.quantity) AS q, sum(i.returned_quantity) AS rq, sum(i.total) AS rev, sum(i.net_amount) AS net, sum(i.unit_cost * i.quantity) AS cost
        FROM sale_items i JOIN sales s ON s.id = i.sale_id
        WHERE s.status <> 'CANCELLED' AND ${branches('s', ctx)} AND ${inRange('s.created_at', ctx)}
        GROUP BY i.sku, i.product_name ORDER BY rev DESC LIMIT 1000`;
      const columns = withoutCost(cols('sku product qtySold:qty qtyReturned:qty revenue:money revenueNet:money cost:money profit:money margin:percent'), ctx, ['cost', 'profit', 'margin']);
      const rows = data.map((d) => {
        const profit = D(d.net).minus(D(d.cost));
        return { sku: d.sku, product: d.name, qtySold: qty(d.q), qtyReturned: qty(d.rq), revenue: money(d.rev), revenueNet: money(d.net), cost: money(d.cost), profit: money(profit), margin: pct(profit, d.net) };
      });
      return { columns, rows, totals: sumTotals(columns, rows), chart: { kind: 'bar', x: 'product', y: ['revenue'] } };
    },
  },

  {
    key: 'sales-by-category', group: 'sales', permissions: ['sales.view_all'],
    async build(ctx) {
      const data = await prisma.$queryRaw<{ name: string | null; q: Prisma.Decimal; rev: Prisma.Decimal; net: Prisma.Decimal; cost: Prisma.Decimal; n: bigint }[]>`
        SELECT c.name, sum(i.quantity) AS q, sum(i.total) AS rev, sum(i.net_amount) AS net, sum(i.unit_cost * i.quantity) AS cost, count(DISTINCT s.id) AS n
        FROM sale_items i JOIN sales s ON s.id = i.sale_id JOIN products p ON p.id = i.product_id LEFT JOIN categories c ON c.id = p.category_id
        WHERE s.status <> 'CANCELLED' AND ${branches('s', ctx)} AND ${inRange('s.created_at', ctx)}
        GROUP BY c.name ORDER BY rev DESC`;
      const columns = withoutCost(cols('category transactions:int qtySold:qty revenue:money revenueNet:money cost:money profit:money margin:percent'), ctx, ['cost', 'profit', 'margin']);
      const rows = data.map((d) => {
        const profit = D(d.net).minus(D(d.cost));
        return { category: d.name ?? '—', transactions: int(d.n), qtySold: qty(d.q), revenue: money(d.rev), revenueNet: money(d.net), cost: money(d.cost), profit: money(profit), margin: pct(profit, d.net) };
      });
      return { columns, rows, totals: sumTotals(columns, rows, ['transactions']), chart: { kind: 'pie', x: 'category', y: ['revenue'] } };
    },
  },

  {
    key: 'profit', group: 'finance', permissions: ['sales.view_all', 'products.view_cost'], maxDays: 366,
    async build(ctx) {
      const sales = await prisma.$queryRaw<{ k: string; net: Prisma.Decimal; cost: Prisma.Decimal }[]>`
        SELECT ${localDay('s.created_at', ctx)} AS k, sum(s.total - s.tax_total) AS net, sum(s.cost_total) AS cost
        FROM sales s WHERE s.status <> 'CANCELLED' AND ${branches('s', ctx)} AND ${inRange('s.created_at', ctx)} GROUP BY 1`;
      // Returns give back revenue (excl. tax); restocked goods give back their cost, damaged goods are a loss
      const rets = await prisma.$queryRaw<{ k: string; net: Prisma.Decimal; cost: Prisma.Decimal }[]>`
        SELECT ${localDay('r.created_at', ctx)} AS k, sum(ri.total - ri.tax_amount) AS net, sum(CASE WHEN ri.restocked THEN ri.quantity * si.unit_cost ELSE 0 END) AS cost
        FROM returns r JOIN return_items ri ON ri.return_id = r.id JOIN sale_items si ON si.id = ri.sale_item_id
        WHERE r.status = 'COMPLETED' AND ${branches('r', ctx)} AND ${inRange('r.created_at', ctx)} GROUP BY 1`;
      const exps = await prisma.$queryRaw<{ k: string; amount: Prisma.Decimal }[]>`
        SELECT to_char(e.expense_date, 'YYYY-MM-DD') AS k, sum(e.amount) AS amount FROM expenses e
        WHERE e.status = 'RECORDED' AND ${branches('e', ctx)} AND e.expense_date >= ${ctx.from}::date AND e.expense_date <= ${ctx.to}::date GROUP BY 1`;
      const rows = eachDay(ctx.from, ctx.to).map((k) => {
        const s = sales.find((x) => x.k === k); const r = rets.find((x) => x.k === k);
        const revenue = D(s?.net).minus(D(r?.net)); const cost = D(s?.cost).minus(D(r?.cost));
        const profit = revenue.minus(cost); const exp = D(exps.find((x) => x.k === k)?.amount);
        return { day: k, revenueNet: money(revenue), cost: money(cost), profit: money(profit), margin: pct(profit, revenue), expenses: money(exp), netProfit: money(profit.minus(exp)) };
      });
      const columns = cols('day:date revenueNet:money cost:money profit:money margin:percent expenses:money netProfit:money');
      const totals = sumTotals(columns, rows);
      totals.margin = pct(totals.profit as string, totals.revenueNet as string);
      return { columns, rows, totals, chart: { kind: 'line', x: 'day', y: ['profit', 'netProfit'] } };
    },
  },

  {
    key: 'tax', group: 'finance', permissions: ['sales.view_all'],
    async build(ctx) {
      const sold = await prisma.$queryRaw<{ rate: Prisma.Decimal; base: Prisma.Decimal; tax: Prisma.Decimal; total: Prisma.Decimal }[]>`
        SELECT i.tax_rate AS rate, sum(i.net_amount) AS base, sum(i.tax_amount) AS tax, sum(i.total) AS total
        FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE s.status <> 'CANCELLED' AND ${branches('s', ctx)} AND ${inRange('s.created_at', ctx)} GROUP BY i.tax_rate ORDER BY i.tax_rate DESC`;
      const returned = await prisma.$queryRaw<{ rate: Prisma.Decimal; tax: Prisma.Decimal }[]>`
        SELECT si.tax_rate AS rate, sum(ri.tax_amount) AS tax FROM return_items ri JOIN returns r ON r.id = ri.return_id JOIN sale_items si ON si.id = ri.sale_item_id
        WHERE r.status = 'COMPLETED' AND ${branches('r', ctx)} AND ${inRange('r.created_at', ctx)} GROUP BY si.tax_rate`;
      const columns = cols('rate:percent base:money tax:money total:money taxReturned:money netTax:money');
      const rows = sold.map((d) => {
        const back = D(returned.find((r) => D(r.rate).eq(D(d.rate)))?.tax);
        return { rate: D(d.rate).toFixed(), base: money(d.base), tax: money(d.tax), total: money(d.total), taxReturned: money(back), netTax: money(D(d.tax).minus(back)) };
      });
      return { columns, rows, totals: sumTotals(columns, rows) };
    },
  },

  {
    key: 'payment-methods', group: 'finance', permissions: ['sales.view_all'],
    async build(ctx) {
      const data = await prisma.$queryRaw<{ name: string; n: bigint; inn: Prisma.Decimal; out: Prisma.Decimal }[]>`
        SELECT m.name, count(*) FILTER (WHERE p.direction = 'IN') AS n,
               coalesce(sum(p.amount) FILTER (WHERE p.direction = 'IN'), 0) AS inn, coalesce(sum(p.amount) FILTER (WHERE p.direction = 'OUT'), 0) AS out
        FROM payments p JOIN payment_methods m ON m.id = p.payment_method_id
        WHERE p.status = 'COMPLETED' AND ${branches('p', ctx)} AND ${inRange('p.created_at', ctx)} GROUP BY m.name, m.sort_order ORDER BY m.sort_order`;
      const columns = cols('method count:int amountIn:money amountOut:money net:money');
      const rows = data.map((d) => ({ method: d.name, count: int(d.n), amountIn: money(d.inn), amountOut: money(d.out), net: money(D(d.inn).minus(D(d.out))) }));
      return { columns, rows, totals: sumTotals(columns, rows), chart: { kind: 'pie', x: 'method', y: ['net'] } };
    },
  },

  {
    key: 'customer-balances', group: 'partners', permissions: ['customers.view'],
    async build(ctx) {
      const data = await prisma.$queryRaw<{ code: string; name: string; phone: string | null; limit: Prisma.Decimal; balance: Prisma.Decimal; overdue: Prisma.Decimal | null; oldest: Date | null }[]>`
        SELECT c.code, c.name, c.phone, c.credit_limit AS "limit", c.balance,
               (SELECT sum(s.amount_due) FROM sales s WHERE s.customer_id = c.id AND s.status <> 'CANCELLED' AND s.amount_due > 0 AND s.due_date < now()) AS overdue,
               (SELECT min(s.due_date) FROM sales s WHERE s.customer_id = c.id AND s.status <> 'CANCELLED' AND s.amount_due > 0) AS oldest
        FROM customers c WHERE c.balance > 0 ORDER BY c.balance DESC`;
      void ctx;
      const columns = cols('code name phone creditLimit:money balance:money overdue:money oldestDue:date');
      const rows = data.map((d) => ({ code: d.code, name: d.name, phone: d.phone, creditLimit: money(d.limit), balance: money(d.balance), overdue: money(d.overdue), oldestDue: d.oldest ? d.oldest.toISOString().slice(0, 10) : null }));
      return { columns, rows, totals: sumTotals(columns, rows, ['creditLimit']), snapshot: true };
    },
  },

  {
    key: 'supplier-balances', group: 'partners', permissions: ['suppliers.view'],
    async build() {
      const data = await prisma.$queryRaw<{ code: string; name: string; phone: string | null; balance: Prisma.Decimal; total: Prisma.Decimal | null; last: Date | null }[]>`
        SELECT s.code, s.name, s.phone, s.balance,
               (SELECT sum(po.total) FROM purchase_orders po WHERE po.supplier_id = s.id AND po.status IN ('APPROVED', 'RECEIVED')) AS total,
               (SELECT max(e.created_at) FROM supplier_accounts e WHERE e.supplier_id = s.id AND e.type = 'PAYMENT') AS last
        FROM suppliers s WHERE s.balance > 0 OR s.status = 'ACTIVE' ORDER BY s.balance DESC, s.name`;
      const columns = cols('code name phone purchasesTotal:money balance:money lastPayment:date');
      const rows = data.map((d) => ({ code: d.code, name: d.name, phone: d.phone, purchasesTotal: money(d.total), balance: money(d.balance), lastPayment: d.last ? d.last.toISOString().slice(0, 10) : null }));
      return { columns, rows, totals: sumTotals(columns, rows), snapshot: true };
    },
  },

  {
    key: 'inventory-valuation', group: 'stock', permissions: ['inventory.view'],
    async build(ctx) {
      const data = await prisma.$queryRaw<{ sku: string; name: string; cat: string | null; q: Prisma.Decimal; cost: Prisma.Decimal; price: Prisma.Decimal }[]>`
        SELECT coalesce(v.sku, p.sku) AS sku, p.name || coalesce(' — ' || v.name, '') AS name, c.name AS cat, sum(inv.quantity) AS q,
               coalesce(v.purchase_price, p.purchase_price) AS cost, coalesce(v.selling_price, p.selling_price) AS price
        FROM inventory inv JOIN products p ON p.id = inv.product_id LEFT JOIN product_variants v ON v.id = inv.variant_id LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${branches('inv', ctx)} AND p.track_stock AND p.status = 'ACTIVE'
        GROUP BY 1, 2, 3, 5, 6 HAVING sum(inv.quantity) <> 0 ORDER BY sum(inv.quantity) * coalesce(v.purchase_price, p.purchase_price) DESC`;
      const columns = withoutCost(cols('sku product category quantity:qty unitCost:money costValue:money unitPrice:money retailValue:money'), ctx, ['unitCost', 'costValue']);
      const rows = data.map((d) => ({
        sku: d.sku, product: d.name, category: d.cat ?? '—', quantity: qty(d.q), unitCost: money(d.cost), costValue: money(D(d.q).mul(D(d.cost))),
        unitPrice: money(d.price), retailValue: money(D(d.q).mul(D(d.price))),
      }));
      return { columns, rows, totals: sumTotals(columns, rows, ['unitCost', 'unitPrice']), snapshot: true };
    },
  },

  {
    key: 'stock-movement', group: 'stock', permissions: ['inventory.view'],
    async build(ctx) {
      const data = await prisma.$queryRaw<Record<string, Prisma.Decimal | string>[]>`
        SELECT p.sku, p.name || coalesce(' — ' || v.name, '') AS name,
          coalesce(sum(m.quantity) FILTER (WHERE m.type IN ('PURCHASE', 'OPENING')), 0) AS "inPurchase",
          coalesce(sum(m.quantity) FILTER (WHERE m.type = 'RETURN'), 0) AS "inReturn",
          coalesce(sum(m.quantity) FILTER (WHERE m.type = 'TRANSFER_IN'), 0) AS "inTransfer",
          coalesce(sum(m.quantity) FILTER (WHERE m.type = 'SALE'), 0) AS "outSale",
          coalesce(sum(m.quantity) FILTER (WHERE m.type = 'TRANSFER_OUT'), 0) AS "outTransfer",
          coalesce(sum(m.quantity) FILTER (WHERE m.type = 'DAMAGE'), 0) AS damage,
          coalesce(sum(m.quantity) FILTER (WHERE m.type = 'ADJUSTMENT'), 0) AS adjustment,
          sum(m.quantity) AS "netChange"
        FROM inventory_movements m JOIN products p ON p.id = m.product_id LEFT JOIN product_variants v ON v.id = m.variant_id
        WHERE ${branches('m', ctx)} AND ${inRange('m.created_at', ctx)}
        GROUP BY p.sku, p.name, v.name ORDER BY p.name LIMIT 2000`;
      const columns = cols('sku product inPurchase:qty inReturn:qty inTransfer:qty outSale:qty outTransfer:qty damage:qty adjustment:qty netChange:qty');
      const rows = data.map((d) => Object.fromEntries(columns.map((c) => [c.key, c.key === 'sku' ? (d.sku as string) : c.key === 'product' ? (d.name as string) : qty(d[c.key])])));
      return { columns, rows, totals: sumTotals(columns, rows) };
    },
  },

  {
    key: 'low-stock', group: 'stock', permissions: ['inventory.view'],
    async build(ctx) {
      const data = await prisma.$queryRaw<{ sku: string; name: string; cat: string | null; q: Prisma.Decimal; min: Prisma.Decimal; max: Prisma.Decimal | null; branch: string }[]>`
        SELECT coalesce(v.sku, p.sku) AS sku, p.name || coalesce(' — ' || v.name, '') AS name, c.name AS cat, b.name AS branch, inv.quantity AS q, p.min_stock AS min, p.max_stock AS max
        FROM inventory inv JOIN products p ON p.id = inv.product_id LEFT JOIN product_variants v ON v.id = inv.variant_id JOIN branches b ON b.id = inv.branch_id LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${branches('inv', ctx)} AND p.track_stock AND p.status = 'ACTIVE' AND inv.quantity > 0 AND inv.quantity <= p.min_stock
        ORDER BY inv.quantity / NULLIF(p.min_stock, 0), p.name`;
      const columns = cols('sku product category branch stock:qty minStock:qty reorder:qty');
      const rows = data.map((d) => {
        const target = d.max && D(d.max).gt(0) ? D(d.max) : D(d.min).mul(2);
        return { sku: d.sku, product: d.name, category: d.cat ?? '—', branch: d.branch, stock: qty(d.q), minStock: qty(d.min), reorder: qty(Decimal.max(target.minus(D(d.q)), 0)) };
      });
      return { columns, rows, totals: sumTotals(columns, rows, ['stock', 'minStock']), snapshot: true };
    },
  },

  {
    key: 'out-of-stock', group: 'stock', permissions: ['inventory.view'],
    async build(ctx) {
      const data = await prisma.$queryRaw<{ sku: string; name: string; cat: string | null; branch: string; q: Prisma.Decimal; last: Date | null }[]>`
        SELECT coalesce(v.sku, p.sku) AS sku, p.name || coalesce(' — ' || v.name, '') AS name, c.name AS cat, b.name AS branch, inv.quantity AS q,
               (SELECT max(m.created_at) FROM inventory_movements m WHERE m.product_id = p.id AND m.variant_id IS NOT DISTINCT FROM inv.variant_id AND m.branch_id = inv.branch_id AND m.type = 'SALE') AS last
        FROM inventory inv JOIN products p ON p.id = inv.product_id LEFT JOIN product_variants v ON v.id = inv.variant_id JOIN branches b ON b.id = inv.branch_id LEFT JOIN categories c ON c.id = p.category_id
        WHERE ${branches('inv', ctx)} AND p.track_stock AND p.status = 'ACTIVE' AND inv.quantity <= 0
        ORDER BY last DESC NULLS LAST, p.name`;
      const columns = cols('sku product category branch stock:qty lastSale:datetime');
      const rows = data.map((d) => ({ sku: d.sku, product: d.name, category: d.cat ?? '—', branch: d.branch, stock: qty(d.q), lastSale: d.last ? d.last.toISOString() : null }));
      return { columns, rows, snapshot: true };
    },
  },

  {
    key: 'purchases', group: 'operations', permissions: ['purchases.view'],
    async build(ctx) {
      const data = await prisma.$queryRaw<{ number: string; created: Date; supplier: string; status: string; total: Prisma.Decimal; rec: Prisma.Decimal; paid: Prisma.Decimal }[]>`
        SELECT po.number, po.created_at AS created, s.name AS supplier, po.status::text AS status, po.total, po.amount_paid AS paid,
               (SELECT coalesce(sum(CASE WHEN pi.quantity > 0 THEN pi.total * pi.received_quantity / pi.quantity ELSE 0 END), 0) FROM purchase_items pi WHERE pi.purchase_order_id = po.id) AS rec
        FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
        WHERE ${branches('po', ctx)} AND ${inRange('po.created_at', ctx)} ORDER BY po.created_at DESC`;
      const columns = cols('number date:datetime supplier status:enum total:money received:money paid:money due:money');
      const rows = data.map((d) => ({
        number: d.number, date: d.created.toISOString(), supplier: d.supplier, status: d.status, total: money(d.total), received: money(d.rec), paid: money(d.paid),
        due: money(['APPROVED', 'RECEIVED'].includes(d.status) ? Decimal.max(D(d.rec).minus(D(d.paid)), 0) : 0),
      }));
      return { columns, rows, totals: sumTotals(columns, rows) };
    },
  },

  {
    key: 'returns', group: 'operations', permissions: ['sales.view_all'],
    async build(ctx) {
      const data = await prisma.$queryRaw<{ number: string; created: Date; invoice: string; customer: string | null; reason: string; n: bigint; total: Prisma.Decimal; user: string }[]>`
        SELECT r.number, r.created_at AS created, s.invoice_number AS invoice, c.name AS customer, r.reason::text AS reason, r.total, u.full_name AS user,
               (SELECT count(*) FROM return_items ri WHERE ri.return_id = r.id) AS n
        FROM returns r JOIN sales s ON s.id = r.sale_id LEFT JOIN customers c ON c.id = s.customer_id JOIN users u ON u.id = r.user_id
        WHERE r.status = 'COMPLETED' AND ${branches('r', ctx)} AND ${inRange('r.created_at', ctx)} ORDER BY r.created_at DESC`;
      const columns = cols('number date:datetime invoice customer reason:enum items:int total:money user');
      const rows = data.map((d) => ({ number: d.number, date: d.created.toISOString(), invoice: d.invoice, customer: d.customer, reason: d.reason, items: int(d.n), total: money(d.total), user: d.user }));
      return { columns, rows, totals: sumTotals(columns, rows) };
    },
  },

  {
    key: 'expenses', group: 'finance', permissions: ['expenses.view'],
    async build(ctx) {
      const data = await prisma.$queryRaw<{ d: Date; cat: string; description: string | null; method: string; user: string; amount: Prisma.Decimal }[]>`
        SELECT e.expense_date AS d, c.name AS cat, e.description, coalesce(m.name, e.payment_method_code) AS method, u.full_name AS user, e.amount
        FROM expenses e JOIN expense_categories c ON c.id = e.category_id JOIN users u ON u.id = e.user_id LEFT JOIN payment_methods m ON m.code = e.payment_method_code
        WHERE e.status = 'RECORDED' AND ${branches('e', ctx)} AND e.expense_date >= ${ctx.from}::date AND e.expense_date <= ${ctx.to}::date
        ORDER BY e.expense_date DESC, e.created_at DESC`;
      const columns = cols('date:date category description method user amount:money');
      const rows = data.map((d) => ({ date: d.d.toISOString().slice(0, 10), category: d.cat, description: d.description, method: d.method, user: d.user, amount: money(d.amount) }));
      return { columns, rows, totals: sumTotals(columns, rows), chart: { kind: 'pie', x: 'category', y: ['amount'] } };
    },
  },

  {
    key: 'cash-register', group: 'finance', permissions: ['cash.view'],
    async build(ctx) {
      const data = await prisma.$queryRaw<{ reg: string; branch: string; user: string; opened: Date; closed: Date | null; opening: Prisma.Decimal; cash: Prisma.Decimal; expected: Prisma.Decimal | null; counted: Prisma.Decimal | null; diff: Prisma.Decimal | null; status: string; live: Prisma.Decimal }[]>`
        SELECT r.name AS reg, b.name AS branch, u.full_name AS user, cs.opened_at AS opened, cs.closed_at AS closed, cs.opening_amount AS opening,
               cs.expected_amount AS expected, cs.counted_amount AS counted, cs.difference AS diff, cs.status::text AS status,
               (SELECT coalesce(sum(m.amount), 0) FROM cash_movements m WHERE m.session_id = cs.id AND m.type = 'SALE') AS cash,
               (SELECT coalesce(sum(m.amount), 0) FROM cash_movements m WHERE m.session_id = cs.id AND m.type <> 'CLOSE') AS live
        FROM cash_register_sessions cs JOIN cash_registers r ON r.id = cs.register_id JOIN branches b ON b.id = cs.branch_id JOIN users u ON u.id = cs.opened_by_id
        WHERE ${branches('cs', ctx)} AND ${inRange('cs.opened_at', ctx)} ORDER BY cs.opened_at DESC`;
      const columns = cols('register branch cashier openedAt:datetime closedAt:datetime opening:money cashSales:money expected:money counted:money difference:money status:enum');
      const rows = data.map((d) => ({
        register: d.reg, branch: d.branch, cashier: d.user, openedAt: d.opened.toISOString(), closedAt: d.closed?.toISOString() ?? null, opening: money(d.opening),
        cashSales: money(d.cash), expected: money(d.expected ?? d.live), counted: d.counted == null ? null : money(d.counted), difference: d.diff == null ? null : money(d.diff), status: d.status,
      }));
      return { columns, rows, totals: sumTotals(columns, rows, ['opening', 'expected', 'counted']) };
    },
  },
];

export const REPORT_KEYS = REPORTS.map((r) => r.key);
