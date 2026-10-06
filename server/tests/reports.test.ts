import { beforeAll, describe, expect, it } from 'vitest';
import type request from 'supertest';
import ExcelJS from 'exceljs';
import { login, prisma, productId, type Session } from './helpers.js';
import { REPORT_KEYS } from '../src/services/reports/definitions.js';
import { visualTokens } from '../src/services/reports/export.js';
import { localRange, localToday, eachDay } from '../src/services/reports/time.js';

let admin: Session;
let manager: Session;
let cashier: Session;
let stock: Session;
let comptable: Session;

const binary = (t: request.Test) =>
  t.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

async function ensureOpenRegister(s: Session) {
  const cur = await s.get('/api/cash/current');
  if (cur.body.data) return;
  const regs = await s.get('/api/cash/registers');
  const free = regs.body.data.find((r: { openSession: unknown }) => !r.openSession);
  expect((await s.post('/api/cash/open', { registerId: free.id, amount: 5000 })).status).toBe(201);
}

beforeAll(async () => {
  [admin, manager, cashier, stock, comptable] = await Promise.all([
    login('admin'), login('manager', 'NDJ'), login('cashier'), login('stock'), login('comptable'),
  ]);
});

describe('Report time helpers', () => {
  it('maps a local business day to UTC bounds in N’Djamena (UTC+1)', () => {
    const { gte, lt } = localRange('2026-03-10', '2026-03-10', 'Africa/Ndjamena');
    expect(gte.toISOString()).toBe('2026-03-09T23:00:00.000Z');
    expect(lt.toISOString()).toBe('2026-03-10T23:00:00.000Z');
    expect(localToday('Africa/Ndjamena', new Date('2026-03-10T23:30:00Z'))).toBe('2026-03-11');
    expect(eachDay('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
  });

  it('lays out mixed Arabic/Latin text in visual order', () => {
    expect(visualTokens('Ventes du jour')).toEqual(['Ventes', 'du', 'jour']);
    expect(visualTokens('تقييم المخزون')).toEqual(['المخزون', 'تقييم']);
    expect(visualTokens('أنشئ في 06/10/2026 بواسطة Mahamat Abakar')).toEqual(['Mahamat', 'Abakar', 'بواسطة', '06/10/2026', 'في', 'أنشئ']);
    expect(visualTokens('الفترة: 01/09/2026 → 06/10/2026')).toEqual(['06/10/2026', '←', '01/09/2026', 'الفترة:']);
  });
});

describe('Reports', () => {
  it('runs all 19 reports for an administrator', async () => {
    expect(REPORT_KEYS).toHaveLength(19);
    for (const key of REPORT_KEYS) {
      const res = await admin.get(`/api/reports/${key}?scope=all`);
      expect(res.status, key).toBe(200);
      expect(res.body.data.key).toBe(key);
      expect(res.body.data.columns.length, key).toBeGreaterThan(1);
      expect(res.body.data.columns.every((c: { label: string }) => c.label)).toBe(true);
      expect(Array.isArray(res.body.data.rows)).toBe(true);
    }
  });

  it('lists the catalogue with per-user availability', async () => {
    const res = await stock.get('/api/reports');
    expect(res.status).toBe(200);
    const byKey = Object.fromEntries(res.body.data.map((r: { key: string; allowed: boolean }) => [r.key, r.allowed]));
    expect(byKey['low-stock']).toBe(true);
    expect(byKey['daily-sales']).toBe(false);
    expect(byKey.profit).toBe(false);
  });

  it('refuses users without the right permissions', async () => {
    expect((await cashier.get('/api/reports/daily-sales')).status).toBe(403);
    expect((await stock.get('/api/reports/daily-sales')).status).toBe(403);
    expect((await stock.get('/api/reports/profit')).status).toBe(403);
    expect((await stock.get('/api/reports/inventory-valuation/export?format=csv')).status).toBe(403);
    expect((await manager.get('/api/reports/daily-sales?scope=all')).status).toBe(403);
    expect((await admin.get('/api/reports/nope')).status).toBe(404);
  });

  it('hides cost columns from users who cannot see costs', async () => {
    const res = await stock.get('/api/reports/inventory-valuation');
    expect(res.status).toBe(200);
    const keys = res.body.data.columns.map((c: { key: string }) => c.key);
    expect(keys).toContain('retailValue');
    expect(keys).not.toContain('costValue');
    expect(keys).not.toContain('unitCost');
    const withCost = await comptable.get('/api/reports/sales-by-product');
    expect(withCost.body.data.columns.map((c: { key: string }) => c.key)).toContain('profit');
  });

  it('validates the period', async () => {
    expect((await admin.get('/api/reports/daily-sales?from=2026-05-01&to=2026-04-01')).body.code).toBe('INVALID_RANGE');
    expect((await admin.get('/api/reports/daily-sales?from=2024-01-01&to=2026-04-01')).body.code).toBe('RANGE_TOO_LARGE');
    expect((await admin.get('/api/reports/daily-sales?from=01/04/2026')).status).toBe(400);
  });

  it('reflects a new sale in daily sales, product sales, tax and payment reports', async () => {
    await ensureOpenRegister(manager);
    const today = (await manager.get('/api/reports/daily-sales')).body.data.to as string;
    const q = `?from=${today}&to=${today}`;
    const before = await Promise.all(['daily-sales', 'sales-by-product', 'tax', 'payment-methods'].map((k) => manager.get(`/api/reports/${k}${q}`)));
    const p = await prisma.product.findUniqueOrThrow({ where: { sku: 'ALI-005' } });
    await prisma.inventory.updateMany({ where: { productId: p.id, branchId: manager.branchId, variantId: null }, data: { quantity: 100 } });
    const sale = await manager.post('/api/sales', { items: [{ productId: await productId('ALI-005'), quantity: 2 }], payments: [{ method: 'CASH', amount: 100000 }] });
    expect(sale.status).toBe(201);
    const total = Number(sale.body.data.total);
    const tax = Number(sale.body.data.taxTotal);
    const after = await Promise.all(['daily-sales', 'sales-by-product', 'tax', 'payment-methods'].map((k) => manager.get(`/api/reports/${k}${q}`)));

    const day = (r: request.Response) => r.body.data.rows.find((x: { day: string }) => x.day === today);
    expect(day(after[0]).transactions - day(before[0]).transactions).toBe(1);
    expect(Number(day(after[0]).gross) - Number(day(before[0]).gross)).toBe(total);
    expect(Number(after[0].body.data.totals.net) - Number(before[0].body.data.totals.net)).toBe(total);

    const prod = (r: request.Response) => r.body.data.rows.find((x: { sku: string }) => x.sku === 'ALI-005') ?? { qtySold: '0', revenue: '0' };
    expect(Number(prod(after[1]).qtySold) - Number(prod(before[1]).qtySold)).toBe(2);
    expect(Number(prod(after[1]).revenue) - Number(prod(before[1]).revenue)).toBe(total);

    expect(Number(after[2].body.data.totals.tax) - Number(before[2].body.data.totals.tax)).toBe(tax);
    expect(Number(after[3].body.data.totals.net) - Number(before[3].body.data.totals.net)).toBe(total);
  });

  it('computes profit as revenue excluding tax minus cost minus expenses', async () => {
    const res = await comptable.get('/api/reports/profit');
    expect(res.status).toBe(200);
    for (const r of res.body.data.rows) {
      expect(Number(r.profit)).toBe(Number(r.revenueNet) - Number(r.cost));
      expect(Number(r.netProfit)).toBe(Number(r.profit) - Number(r.expenses));
    }
  });
});

describe('Report exports', () => {
  it('exports CSV with a BOM, the French separator and a totals row', async () => {
    const res = await binary(manager.get('/api/reports/sales-by-product/export?format=csv'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="sales-by-product_.*\.csv"/);
    const text = (res.body as Buffer).toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text.split('\r\n')[0]).toContain('SKU;Produit;');
    expect(text).toContain('Totaux;');
  });

  it('exports a real XLSX workbook', async () => {
    const res = await binary(manager.get('/api/reports/daily-sales/export?format=xlsx&lang=en'));
    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(res.body as Buffer).buffer as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws.name).toBe('Daily sales');
    expect(ws.getRow(5).getCell(1).value).toBe('Day');
    expect(typeof ws.getRow(6).getCell(2).value).toBe('number');
  });

  it('exports a PDF in Arabic and records the export in the audit log', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'EXPORT', userId: admin.userId } });
    const res = await binary(admin.get('/api/reports/low-stock/export?format=pdf&lang=ar&scope=all'));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(await prisma.auditLog.count({ where: { action: 'EXPORT', userId: admin.userId } })).toBe(before + 1);
  });
});

describe('Dashboard', () => {
  it('returns KPIs, charts and recent sales', async () => {
    const res = await manager.get('/api/dashboard?period=today');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.salesVisible).toBe(true);
    expect(Number(d.kpis.transactions)).toBeGreaterThan(0);
    expect(d.kpis.profit).toBeDefined();
    expect(d.byHour).toHaveLength(24);
    expect(d.trend).toHaveLength(30);
    expect(d.recent.length).toBeGreaterThan(0);
    expect(Number(d.kpis.avgBasket)).toBe(Math.round(Number(d.kpis.grossSales) / d.kpis.transactions));
  });

  it('limits a stock manager to stock figures', async () => {
    const res = await stock.get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.data.salesVisible).toBe(false);
    expect(res.body.data.kpis.sales).toBeUndefined();
    expect(typeof res.body.data.kpis.lowStock).toBe('number');
  });

  it('is not available to cashiers', async () => {
    expect((await cashier.get('/api/dashboard')).status).toBe(403);
  });
});
