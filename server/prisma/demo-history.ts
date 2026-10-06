/**
 * Demo history generator — fills a DEMO database with realistic past activity
 * (sales, returns, expenses, cash sessions) so the dashboard and reports have data.
 *
 *   npm run db:demo-history -- --days 60 --yes [--append]
 *
 * Everything goes through the real services (stock, cash, ledgers, audit stay consistent);
 * the rows of each operation are then moved back in time. It only ADDS data and refuses to
 * run in production or on a database that already has history.
 */
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/utils/prisma.js';
import type { AuthContext } from '../src/types.js';
import type { PermissionCode } from '../src/config/permissions.js';
import { SaleService } from '../src/services/sale.service.js';
import { CashService } from '../src/services/cash.service.js';
import { ExpenseService } from '../src/services/expense.service.js';
import { ReturnService } from '../src/services/return.service.js';
import { InventoryService } from '../src/services/inventory.service.js';
import { localMidnightUtc, localToday, addDaysIso } from '../src/services/reports/time.js';
import { computePricing } from '../src/services/pricing.service.js';

const args = process.argv.slice(2);
const DAYS = Number(args[args.indexOf('--days') + 1]) || 60;
const TZ = 'Africa/Ndjamena';

// Deterministic randomness so two runs on fresh databases give the same story
let seed = 20261006;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

async function contextFor(username: string): Promise<AuthContext> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { username },
    include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } }, branches: true },
  });
  const permissions = new Set(u.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code as PermissionCode)));
  return {
    userId: u.id, sessionId: 'demo-history', username: u.username, fullName: u.fullName,
    roles: u.roles.map((r) => r.role.code), permissions,
    maxDiscountPercent: Math.max(0, ...u.roles.map((r) => Number(r.role.maxDiscountPercent))),
    branchIds: u.branches.map((b) => b.branchId), allBranches: permissions.has('branches.all'), defaultBranchId: u.defaultBranchId,
  };
}

const fakeReq = (auth: AuthContext, branchId: string) =>
  ({ auth, branchId, ip: '127.0.0.1', get: () => 'demo-history', headers: {} }) as unknown as Request;

/**
 * Moves every row written since `since` to `at` (keeps their relative order).
 * Ledgers are append-only through database triggers; this demo-only tool lifts them inside its
 * own transaction (DDL is transactional in PostgreSQL, so no other connection ever sees them off).
 */
async function backdate(since: Date, at: Date) {
  const shift = Prisma.sql`${at.getTime() - Date.now()} * interval '1 millisecond'`;
  const tables: [string, string[]][] = [
    ['sales', ['created_at', 'updated_at']],
    ['payments', ['created_at']],
    ['returns', ['created_at']],
    ['inventory_movements', ['created_at']],
    ['cash_movements', ['created_at']],
    ['customer_accounts', ['created_at']],
    ['expenses', ['created_at', 'updated_at']],
    ['audit_logs', ['created_at']],
    ['notifications', ['created_at']],
  ];
  await prisma.$transaction(async (tx) => {
    for (const [table, cols] of tables) {
      await tx.$executeRawUnsafe(`ALTER TABLE "${table}" DISABLE TRIGGER USER`);
      const assignments = cols.map((c) => Prisma.sql`${Prisma.raw(c)} = ${Prisma.raw(c)} + ${shift}`);
      await tx.$executeRaw`UPDATE ${Prisma.raw(`"${table}"`)} SET ${Prisma.join(assignments)} WHERE created_at >= ${since}`;
      await tx.$executeRawUnsafe(`ALTER TABLE "${table}" ENABLE TRIGGER USER`);
    }
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to generate demo data in production');
  if (!args.includes('--yes')) throw new Error('Demo history adds ~thousands of rows. Re-run with --yes to confirm.');
  const today = localToday(TZ);
  const old = await prisma.sale.count({ where: { createdAt: { lt: localMidnightUtc(addDaysIso(today, -1), TZ) } } });
  if (old > 0 && !args.includes('--append')) {
    throw new Error(`This database already has ${old} older sales — demo history is only for empty demo databases (use --append to add to an existing demo history).`);
  }

  const branches = await prisma.branch.findMany({ where: { status: 'ACTIVE' }, include: { registers: true, defaultTax: { select: { rate: true } } } });
  // Preferred operator per branch; anyone whose own register is open (live use) is skipped
  const operators: Record<string, string[]> = { NDJ: ['cashier', 'manager', 'admin'], NDS: ['manager', 'admin'], MOU: ['cashier2', 'admin'] };
  const admin = await contextFor('admin');
  const products = await prisma.product.findMany({
    where: { status: 'ACTIVE', variants: { none: {} } },
    select: { id: true, sku: true, name: true, sellingPrice: true, purchasePrice: true, priceMode: true, tax: { select: { rate: true } }, category: { select: { tax: { select: { rate: true } } } } },
  });
  const customers = await prisma.customer.findMany({ where: { status: 'ACTIVE', type: { not: 'WALK_IN' }, creditLimit: { gt: 0 } } });
  const categories = await prisma.expenseCategory.findMany({ where: { status: 'ACTIVE' } });
  const popular = products.filter((_, i) => i % 3 === 0); // a third of the catalogue sells most

  // Opening stock for the period, dated before the first day (once, even if a run is repeated)
  const start = new Date();
  const stocked = await prisma.inventoryMovement.count({ where: { reference: 'DEMO-STOCK' } });
  for (const b of stocked ? [] : branches) {
    for (const p of products) {
      await prisma.$transaction((tx) => InventoryService.move(tx, {
        branchId: b.id, productId: p.id, quantity: between(300, 900), type: 'PURCHASE', userId: admin.userId,
        unitCost: p.purchasePrice, reference: 'DEMO-STOCK', note: 'Stock initial (données de démonstration)',
      }));
    }
  }
  await backdate(start, localMidnightUtc(addDaysIso(today, -DAYS - 1), TZ));

  let sales = 0;
  for (let d = DAYS; d >= 1; d--) {
    const day = addDaysIso(today, -d);
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    const midnight = localMidnightUtc(day, TZ).getTime();
    const at = (h: number, m: number) => new Date(midnight + (h * 60 + m) * 60000);
    for (const b of branches) {
      const busyUsers = (await prisma.cashRegisterSession.findMany({ where: { branchId: b.id, status: 'OPEN' }, select: { openedById: true, registerId: true } }));
      let user: AuthContext | null = null;
      for (const name of operators[b.code] ?? ['admin']) {
        const c = await contextFor(name);
        if (c.branchIds.includes(b.id) && !busyUsers.some((x) => x.openedById === c.userId)) { user = c; break; }
      }
      const register = b.registers.find((r) => !busyUsers.some((x) => x.registerId === r.id));
      if (!user || !register) continue;
      const req = fakeReq(user, b.id);
      // Busier on Friday/Saturday, quieter on Sunday, the head office sells most
      const base = b.isHeadOffice ? 26 : 14;
      const count = Math.round(base * (dow === 5 || dow === 6 ? 1.4 : dow === 0 ? 0.6 : 1) * (0.8 + rnd() * 0.4));

      let since = new Date();
      const opened = await CashService.open(req, register.id, pick([25000, 30000, 50000]), 'Ouverture');
      const sessionId = opened.id;
      await backdate(since, at(7, between(30, 55)));
      await prisma.cashRegisterSession.update({ where: { id: sessionId }, data: { openedAt: at(7, 45) } });

      const created: { id: string; items: { id: string; quantity: Prisma.Decimal }[] }[] = [];
      for (let i = 0; i < count; i++) {
        // Morning and evening peaks
        const hour = pick([8, 9, 10, 10, 11, 11, 12, 13, 15, 16, 17, 17, 18, 18, 19, 20]);
        const lines = Array.from({ length: between(1, 5) }, () => ({ productId: pick(rnd() < 0.7 ? popular : products).id, quantity: between(1, rnd() < 0.85 ? 3 : 12) }));
        const items = Object.values(lines.reduce<Record<string, { productId: string; quantity: number }>>((a, l) => {
          a[l.productId] = { productId: l.productId, quantity: (a[l.productId]?.quantity ?? 0) + l.quantity }; return a;
        }, {}));
        // Same pricing as the server (product tax, else category tax, else branch default)
        const cartDiscount = rnd() < 0.05 ? { type: 'PERCENT' as const, value: 3 } : null;
        const branchRate = b.defaultTax?.rate ?? 0;
        const estimate = computePricing(items.map((it, k) => {
          const p = products.find((x) => x.id === it.productId)!;
          return { key: String(k), unitPrice: p.sellingPrice, quantity: it.quantity, taxRate: p.tax?.rate ?? p.category?.tax?.rate ?? branchRate, priceMode: p.priceMode };
        }), cartDiscount).total.toNumber();
        const roll = rnd();
        const customer = roll > 0.93 && customers.length && user.permissions.has('sales.credit') ? pick(customers) : null;
        const payments = customer
          ? [{ method: 'CREDIT', amount: estimate }]
          : roll < 0.62 ? [{ method: 'CASH', amount: Math.ceil(estimate * 1.2 / 500) * 500 }]
            : roll < 0.8 ? [{ method: pick(['AIRTEL_MONEY', 'AIRTEL_MONEY', 'MOOV_MONEY']), amount: estimate, reference: `MM${between(100000, 999999)}` }]
              : [{ method: 'CARD', amount: estimate, reference: `CB${between(1000, 9999)}` }];
        since = new Date();
        try {
          const { sale } = await SaleService.create(req, {
            items, payments, customerId: customer?.id ?? null, priceList: 'RETAIL',
            cartDiscount,
            dueDate: customer ? addDaysIso(day, 30) : null,
          } as Parameters<typeof SaleService.create>[1]);
          created.push(sale);
          sales++;
          await backdate(since, at(hour, between(0, 59)));
        } catch (e) {
          // Credit limit reached or similar business refusal: the customer pays cash instead
          if (!['CREDIT_LIMIT_EXCEEDED', 'CREDIT_DENIED', 'INSUFFICIENT_STOCK'].includes((e as { code?: string }).code ?? '')) throw e;
        }
      }

      // A few returns and expenses per day
      if (created.length && rnd() < 0.35) {
        const s = pick(created);
        const it = s.items[0];
        since = new Date();
        await ReturnService.create(req, s.id, {
          reason: pick(['DAMAGED', 'CUSTOMER_REQUEST', 'WRONG_PRODUCT'] as const), refundMethod: 'CASH',
          items: [{ saleItemId: it.id, quantity: 1, restock: rnd() < 0.7 }], note: 'Retour client',
        } as Parameters<typeof ReturnService.create>[2]).catch(() => undefined);
        await backdate(since, at(16, between(0, 59)));
      }
      if (categories.length && rnd() < 0.6) {
        since = new Date();
        const cat = pick(categories);
        await ExpenseService.create(fakeReq(user, b.id), {
          categoryId: cat.id, amount: pick([1500, 2500, 5000, 7500, 10000, 15000]), description: `${cat.name} — ${day}`,
          expenseDate: day, method: 'CASH', fromRegister: true,
        } as Parameters<typeof ExpenseService.create>[1]).catch(() => undefined);
        await backdate(since, at(14, between(0, 59)));
      }

      // Close with the usual small differences
      const expected = Number((await CashService.summary(sessionId)).expected);
      const diff = rnd() < 0.8 ? 0 : pick([-1000, -500, 500, -2500]);
      since = new Date();
      await CashService.close(req, sessionId, Math.max(0, expected + diff), diff ? 'Écart constaté à la clôture' : undefined);
      await backdate(since, at(21, between(0, 30)));
      await prisma.cashRegisterSession.update({ where: { id: sessionId }, data: { closedAt: at(21, 15) } });
    }
    process.stdout.write(`\r${day}: ${sales} ventes`);
  }
  console.log(`\nTerminé : ${sales} ventes sur ${DAYS} jours.`);
}

main()
  .catch((e) => { console.error(process.env.DEBUG ? e : e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
