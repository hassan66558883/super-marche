import { beforeAll, describe, expect, it } from 'vitest';
import { login, prisma, productId, stockOf, type Session } from './helpers.js';

let cashier: Session;
let manager: Session;

async function ensureOpenRegister(s: Session) {
  const cur = await s.get('/api/cash/current');
  if (cur.body.data) return cur.body.data.session.id as string;
  const regs = await s.get('/api/cash/registers');
  const free = regs.body.data.find((r: { openSession: unknown }) => !r.openSession);
  const res = await s.post('/api/cash/open', { registerId: free.id, amount: 10000, note: 'test' });
  expect(res.status).toBe(201);
  return res.body.data.session.id as string;
}

async function setStock(sku: string, qty: number, branchCode = 'NDJ') {
  const p = await prisma.product.findUniqueOrThrow({ where: { sku } });
  const b = await prisma.branch.findUniqueOrThrow({ where: { code: branchCode } });
  await prisma.inventory.updateMany({ where: { productId: p.id, branchId: b.id, variantId: null }, data: { quantity: qty } });
}

beforeAll(async () => {
  cashier = await login('cashier');
  manager = await login('manager', 'NDJ');
});

describe('Cash register', () => {
  it('refuses a sale while the register is closed', async () => {
    const res = await cashier.post('/api/sales', { items: [{ productId: await productId('BOI-001'), quantity: 1 }], payments: [{ method: 'CASH', amount: 500 }] });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('REGISTER_NOT_OPEN');
  });

  it('opens a register for the cashier', async () => {
    const id = await ensureOpenRegister(cashier);
    expect(id).toBeTruthy();
    const again = await cashier.post('/api/cash/open', { registerId: (await prisma.cashRegisterSession.findUniqueOrThrow({ where: { id } })).registerId, amount: 0 });
    expect(again.status).toBe(409);
  });
});

describe('Sales', () => {
  beforeAll(async () => {
    await ensureOpenRegister(cashier);
    await ensureOpenRegister(manager);
  });

  it('completes a cash sale, deducts stock, computes change and numbers the invoice', async () => {
    await setStock('BOI-001', 50);
    const res = await cashier.post('/api/sales', {
      clientRef: 'test-sale-0001',
      items: [{ productId: await productId('BOI-001'), quantity: 3 }],
      payments: [{ method: 'CASH', amount: 2000 }],
    });
    expect(res.status).toBe(201);
    const sale = res.body.data;
    expect(sale.invoiceNumber).toMatch(/^NDJ-\d{4}-\d{6}$/);
    expect(sale.total).toBe('1500');
    expect(sale.changeGiven).toBe('500');
    expect(sale.paymentStatus).toBe('PAID');
    expect(sale.payments[0].amount).toBe('1500');
    expect(await stockOf('BOI-001')).toBe(47);
    const mv = await prisma.inventoryMovement.findFirst({ where: { referenceId: sale.id } });
    expect(Number(mv?.quantity)).toBe(-3);
    expect(Number(mv?.balanceAfter)).toBe(47);
  });

  it('is idempotent on clientRef (offline retries never double-sell)', async () => {
    const res = await cashier.post('/api/sales', {
      clientRef: 'test-sale-0001',
      items: [{ productId: await productId('BOI-001'), quantity: 3 }],
      payments: [{ method: 'CASH', amount: 2000 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.meta.duplicate).toBe(true);
    expect(await stockOf('BOI-001')).toBe(47);
  });

  it('rolls back everything when one line has insufficient stock', async () => {
    await setStock('BOI-002', 10);
    await setStock('BOI-003', 1);
    const salesBefore = await prisma.sale.count();
    const movementsBefore = await prisma.inventoryMovement.count();
    const paymentsBefore = await prisma.payment.count();
    const cashBefore = await prisma.cashMovement.count();
    const res = await cashier.post('/api/sales', {
      items: [{ productId: await productId('BOI-002'), quantity: 2 }, { productId: await productId('BOI-003'), quantity: 5 }],
      payments: [{ method: 'CASH', amount: 10000 }],
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf('BOI-002')).toBe(10);
    expect(await stockOf('BOI-003')).toBe(1);
    expect(await prisma.sale.count()).toBe(salesBefore);
    expect(await prisma.inventoryMovement.count()).toBe(movementsBefore);
    expect(await prisma.payment.count()).toBe(paymentsBefore);
    expect(await prisma.cashMovement.count()).toBe(cashBefore);
  });

  it('rejects insufficient payment', async () => {
    const res = await cashier.post('/api/sales', { items: [{ productId: await productId('BOI-002'), quantity: 1 }], payments: [{ method: 'CASH', amount: 100 }] });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_PAYMENT');
  });

  it('does not give change on card payments', async () => {
    const res = await cashier.post('/api/sales', { items: [{ productId: await productId('BOI-002'), quantity: 1 }], payments: [{ method: 'CARD', amount: 5000 }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OVERPAYMENT_NON_CASH');
  });

  it('accepts split payments (cash + mobile money)', async () => {
    const res = await cashier.post('/api/sales', {
      items: [{ productId: await productId('BOI-002'), quantity: 2 }],
      payments: [{ method: 'AIRTEL_MONEY', amount: 1200, reference: 'AM123' }, { method: 'CASH', amount: 1000 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe('2000');
    expect(res.body.data.changeGiven).toBe('200');
    const amounts = res.body.data.payments.map((p: { amount: string }) => p.amount).sort();
    expect(amounts).toEqual(['1200', '800']);
  });

  it('enforces the cashier discount limit (5%)', async () => {
    const pid = await productId('BOI-002');
    const ok = await cashier.post('/api/sales', { items: [{ productId: pid, quantity: 1, discountType: 'PERCENT', discountValue: 5 }], payments: [{ method: 'CASH', amount: 1000 }] });
    expect(ok.status).toBe(201);
    expect(ok.body.data.total).toBe('950');
    const tooMuch = await cashier.post('/api/sales', { items: [{ productId: pid, quantity: 1 }], cartDiscount: { type: 'PERCENT', value: 20 }, payments: [{ method: 'CASH', amount: 1000 }] });
    expect(tooMuch.status).toBe(403);
    expect(tooMuch.body.code).toBe('DISCOUNT_LIMIT_EXCEEDED');
    const managerOk = await manager.post('/api/sales', { items: [{ productId: pid, quantity: 1 }], cartDiscount: { type: 'PERCENT', value: 20 }, payments: [{ method: 'CASH', amount: 800 }] });
    expect(managerOk.status).toBe(201);
  });

  it('denies price overrides to cashiers', async () => {
    const res = await cashier.post('/api/sales', { items: [{ productId: await productId('BOI-002'), quantity: 1, unitPrice: 10 }], payments: [{ method: 'CASH', amount: 10 }] });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PRICE_OVERRIDE_DENIED');
  });

  it('requires a variant for products with variants', async () => {
    const res = await cashier.post('/api/sales', { items: [{ productId: await productId('BOI-011'), quantity: 1 }], payments: [{ method: 'CASH', amount: 5000 }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VARIANT_REQUIRED');
  });
});

describe('Offline sales sync', () => {
  it('serves the full branch catalog for the offline POS, without costs for cashiers', async () => {
    const res = await cashier.get('/api/products/pos/catalog');
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(20);
    expect(res.body.data.syncedAt).toBeTruthy();
    expect(JSON.stringify(res.body.data.items)).not.toMatch(/purchasePrice/);
  });

  it('records a sale rung up offline even if stock went negative meanwhile, once only', async () => {
    await ensureOpenRegister(cashier);
    await setStock('BOI-001', 1);
    const body = {
      clientRef: `offline-${Date.now()}`, offlineCreatedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      items: [{ productId: await productId('BOI-001'), quantity: 3 }], payments: [{ method: 'CASH', amount: 100000 }],
    };
    const res = await cashier.post('/api/sales', body);
    expect(res.status).toBe(201);
    expect(await stockOf('BOI-001')).toBe(-2);
    expect(res.body.data.offlineCreatedAt).toBe(body.offlineCreatedAt);
    const again = await cashier.post('/api/sales', body);
    expect(again.body.data.id).toBe(res.body.data.id);
    expect(await prisma.sale.count({ where: { clientRef: body.clientRef } })).toBe(1);
    await setStock('BOI-001', 200);
  });

  it('refuses offline credit and implausible offline dates', async () => {
    const item = [{ productId: await productId('BOI-001'), quantity: 1 }];
    const old = await cashier.post('/api/sales', { offlineCreatedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(), items: item, payments: [{ method: 'CASH', amount: 100000 }] });
    expect(old.body.code).toBe('OFFLINE_DATE_INVALID');
    const future = await cashier.post('/api/sales', { offlineCreatedAt: new Date(Date.now() + 86_400_000).toISOString(), items: item, payments: [{ method: 'CASH', amount: 100000 }] });
    expect(future.body.code).toBe('OFFLINE_DATE_INVALID');
    const credit = await manager.post('/api/sales', { offlineCreatedAt: new Date().toISOString(), items: item, payments: [{ method: 'CREDIT', amount: 0 }] });
    expect(credit.body.code).toBe('OFFLINE_CREDIT');
  });
});

describe('Credit sales and customer payments', () => {
  let customerId: string;
  beforeAll(async () => {
    const c = await prisma.customer.create({ data: { code: 'CLI-T001', name: 'Test Crédit', type: 'REGISTERED', creditLimit: 3000 } });
    customerId = c.id;
    await setStock('BOI-002', 30);
  });

  it('requires a registered customer for credit', async () => {
    const res = await manager.post('/api/sales', { items: [{ productId: await productId('BOI-002'), quantity: 1 }], payments: [{ method: 'CREDIT', amount: 1000 }] });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CREDIT_REQUIRES_CUSTOMER');
  });

  it('denies credit to cashiers without the permission', async () => {
    const res = await cashier.post('/api/sales', { customerId, items: [{ productId: await productId('BOI-002'), quantity: 1 }], payments: [{ method: 'CREDIT', amount: 1000 }] });
    expect([201, 403]).toContain(res.status);
    if (res.status === 403) expect(res.body.code).toBe('CREDIT_DENIED');
    else await prisma.customer.update({ where: { id: customerId }, data: { balance: 0 } });
  });

  it('records a partial credit sale and updates the customer balance', async () => {
    await prisma.customer.update({ where: { id: customerId }, data: { balance: 0 } });
    const res = await manager.post('/api/sales', {
      customerId, items: [{ productId: await productId('BOI-002'), quantity: 3 }],
      payments: [{ method: 'CASH', amount: 1000 }, { method: 'CREDIT', amount: 2000 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.paymentStatus).toBe('PARTIAL');
    expect(res.body.data.amountDue).toBe('2000');
    const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
    expect(Number(c.balance)).toBe(2000);
    const entry = await prisma.customerAccountEntry.findFirst({ where: { customerId, type: 'SALE' } });
    expect(Number(entry?.amount)).toBe(2000);
  });

  it('blocks credit above the limit and changes nothing', async () => {
    const stock = await stockOf('BOI-002');
    const res = await manager.post('/api/sales', { customerId, items: [{ productId: await productId('BOI-002'), quantity: 2 }], payments: [{ method: 'CREDIT', amount: 2000 }] });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CREDIT_LIMIT_EXCEEDED');
    expect(await stockOf('BOI-002')).toBe(stock);
    expect(Number((await prisma.customer.findUniqueOrThrow({ where: { id: customerId } })).balance)).toBe(2000);
  });

  it('receives a customer payment allocated to open invoices', async () => {
    const tooMuch = await manager.post(`/api/customers/${customerId}/payments`, { amount: 5000, method: 'CASH' });
    expect(tooMuch.body.code).toBe('OVERPAYMENT');
    const res = await manager.post(`/api/customers/${customerId}/payments`, { amount: 1500, method: 'CASH' });
    expect(res.status).toBe(201);
    expect(res.body.data.customer.balance).toBe('500');
    const sale = await prisma.sale.findFirstOrThrow({ where: { customerId } });
    expect(Number(sale.amountDue)).toBe(500);
    expect(Number(sale.amountPaid)).toBe(2500);
  });
});

describe('Returns and cancellation', () => {
  it('returns part of a sale, restocks and refunds in cash without deleting the sale', async () => {
    await setStock('BOI-004', 20);
    const sale = (await cashier.post('/api/sales', { items: [{ productId: await productId('BOI-004'), quantity: 4 }], payments: [{ method: 'CASH', amount: 2000 }] })).body.data;
    expect(await stockOf('BOI-004')).toBe(16);
    const itemId = sale.items[0].id;
    const denied = await cashier.post(`/api/sales/${sale.id}/returns`, { reason: 'OTHER', items: [{ saleItemId: itemId, quantity: 1 }] });
    expect(denied.status).toBe(403);
    const ret = await manager.post(`/api/sales/${sale.id}/returns`, { reason: 'CUSTOMER_REQUEST', refundMethod: 'CASH', items: [{ saleItemId: itemId, quantity: 1 }] });
    expect(ret.status).toBe(201);
    expect(ret.body.data.number).toMatch(/^RET-NDJ-/);
    expect(ret.body.data.total).toBe('500');
    expect(await stockOf('BOI-004')).toBe(17);
    const after = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
    expect(after.status).toBe('PARTIALLY_REFUNDED');
    expect(Number(after.total)).toBe(2000);

    const over = await manager.post(`/api/sales/${sale.id}/returns`, { reason: 'OTHER', items: [{ saleItemId: itemId, quantity: 4 }] });
    expect(over.body.code).toBe('RETURN_QTY_EXCEEDED');
    const rest = await manager.post(`/api/sales/${sale.id}/returns`, { reason: 'DAMAGED', items: [{ saleItemId: itemId, quantity: 3 }] });
    expect(rest.status).toBe(201);
    expect(await stockOf('BOI-004')).toBe(17); // damaged goods are not restocked
    expect((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe('REFUNDED');
  });

  it('refuses to physically delete financial records', async () => {
    const sale = await prisma.sale.findFirstOrThrow();
    await expect(prisma.sale.delete({ where: { id: sale.id } })).rejects.toThrow();
  });

  it('cancels a sale: stock restored, payments voided, sale kept', async () => {
    await setStock('BOI-006', 10);
    const sale = (await manager.post('/api/sales', { items: [{ productId: await productId('BOI-006'), quantity: 2 }], payments: [{ method: 'CASH', amount: 800 }] })).body.data;
    expect(await stockOf('BOI-006')).toBe(8);
    const denied = await cashier.post(`/api/sales/${sale.id}/cancel`, { reason: 'erreur de saisie' });
    expect(denied.status).toBe(403);
    const res = await manager.post(`/api/sales/${sale.id}/cancel`, { reason: 'erreur de saisie' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(res.body.data.payments.every((p: { status: string }) => p.status === 'VOID')).toBe(true);
    expect(await stockOf('BOI-006')).toBe(10);
  });

  it('closes the register with the expected amount', async () => {
    const cur = (await cashier.get('/api/cash/current')).body.data;
    const res = await cashier.post(`/api/cash/sessions/${cur.session.id}/close`, { amount: Number(cur.expected) });
    expect(res.status).toBe(200);
    expect(res.body.data.session.status).toBe('CLOSED');
    expect(res.body.data.session.difference).toBe('0');
  });
});

describe('Held sales', () => {
  it('parks and resumes a cart', async () => {
    const h = await cashier.post('/api/held-sales', { label: 'Client 1', cart: { items: [] }, itemCount: 2, total: 1500 });
    expect(h.status).toBe(201);
    expect((await cashier.get('/api/held-sales')).body.data).toHaveLength(1);
    const r = await cashier.post(`/api/held-sales/${h.body.data.id}/resume`);
    expect(r.status).toBe(200);
    expect((await cashier.get('/api/held-sales')).body.data).toHaveLength(0);
  });
});

describe('Cost confidentiality', () => {
  it('never sends cost prices or margins to a cashier', async () => {
    const list = await cashier.get('/api/sales');
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    const sale = await cashier.get(`/api/sales/${list.body.data[0].id}`);
    expect(sale.body.data.costTotal).toBeUndefined();
    expect(sale.body.data.items[0].unitCost).toBeUndefined();
    const asManager = await manager.get(`/api/sales/${list.body.data[0].id}`);
    expect(asManager.body.data.items[0].unitCost).toBeDefined();
  });
});
