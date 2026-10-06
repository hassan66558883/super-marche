import { beforeAll, describe, expect, it } from 'vitest';
import { login, prisma, productId, stockOf, type Session } from './helpers.js';

let stock: Session;
let manager: Session;
let adminMou: Session;
let adminNdj: Session;
let cashier: Session;

async function setStock(sku: string, qty: number, branchCode = 'NDJ') {
  const p = await prisma.product.findUniqueOrThrow({ where: { sku } });
  const b = await prisma.branch.findUniqueOrThrow({ where: { code: branchCode } });
  await prisma.inventory.updateMany({ where: { productId: p.id, branchId: b.id, variantId: null }, data: { quantity: qty } });
}

beforeAll(async () => {
  stock = await login('stock');
  manager = await login('manager', 'NDJ');
  adminMou = await login('admin', 'MOU');
  adminNdj = await login('admin', 'NDJ');
  cashier = await login('cashier');
});

describe('Inventory adjustments', () => {
  it('sets a counted quantity through an ADJUSTMENT movement and audits it', async () => {
    await setStock('ALI-001', 10);
    const res = await stock.post('/api/inventory/adjust', { productId: await productId('ALI-001'), mode: 'SET', quantity: 7, note: 'Inventaire tournant' });
    expect(res.status).toBe(201);
    expect(res.body.data.type).toBe('ADJUSTMENT');
    expect(res.body.data.quantity).toBe('-3');
    expect(await stockOf('ALI-001')).toBe(7);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'STOCK_ADJUSTMENT', recordId: await productId('ALI-001') } });
    expect(audit?.description).toContain('10 → 7');
  });

  it('records damage as a negative DAMAGE movement and refuses to go below zero', async () => {
    const pid = await productId('ALI-001');
    const ok = await stock.post('/api/inventory/adjust', { productId: pid, mode: 'DAMAGE', quantity: 2, note: 'Sacs déchirés' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.type).toBe('DAMAGE');
    expect(await stockOf('ALI-001')).toBe(5);
    const tooMuch = await stock.post('/api/inventory/adjust', { productId: pid, mode: 'DAMAGE', quantity: 50, note: 'Erreur' });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.code).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf('ALI-001')).toBe(5);
  });

  it('forbids adjustments to cashiers', async () => {
    const res = await cashier.post('/api/inventory/adjust', { productId: await productId('ALI-001'), mode: 'SET', quantity: 100, note: 'test' });
    expect(res.status).toBe(403);
  });

  it('lists movements and the stock summary', async () => {
    const mv = await stock.get(`/api/inventory/movements?productId=${await productId('ALI-001')}`);
    expect(mv.status).toBe(200);
    expect(mv.body.data.length).toBeGreaterThanOrEqual(2);
    const sum = await stock.get('/api/inventory/summary');
    expect(sum.status).toBe(200);
    expect(sum.body.data.skus).toBeGreaterThan(50);
  });

  it('never allows editing or deleting stock movements', async () => {
    const mv = await prisma.inventoryMovement.findFirstOrThrow();
    await expect(prisma.inventoryMovement.update({ where: { id: mv.id }, data: { note: 'x' } })).rejects.toThrow();
    await expect(prisma.inventoryMovement.delete({ where: { id: mv.id } })).rejects.toThrow();
  });
});

describe('Transfers', () => {
  let transferId: string;
  let itemId: string;
  beforeAll(async () => {
    await setStock('LAI-001', 30, 'NDJ');
    await setStock('LAI-001', 5, 'MOU');
  });

  it('creates a requested transfer from the current branch', async () => {
    const mou = await prisma.branch.findUniqueOrThrow({ where: { code: 'MOU' } });
    const res = await stock.post('/api/transfers', { toBranchId: mou.id, items: [{ productId: await productId('LAI-001'), quantity: 12 }], note: 'Réassort Moundou' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('REQUESTED');
    expect(res.body.data.number).toMatch(/^TR-NDJ-/);
    transferId = res.body.data.id;
    itemId = res.body.data.items[0].id;
    expect(await stockOf('LAI-001', 'NDJ')).toBe(30); // nothing moves before shipment
  });

  it('cannot be shipped before approval, and stock users cannot approve', async () => {
    expect((await manager.post(`/api/transfers/${transferId}/ship`)).body.code).toBe('INVALID_TRANSFER_STATUS');
    expect((await stock.post(`/api/transfers/${transferId}/approve`)).status).toBe(403);
  });

  it('approves and ships: stock leaves the source branch', async () => {
    expect((await manager.post(`/api/transfers/${transferId}/approve`)).body.data.status).toBe('APPROVED');
    const shipped = await manager.post(`/api/transfers/${transferId}/ship`);
    expect(shipped.body.data.status).toBe('IN_TRANSIT');
    expect(await stockOf('LAI-001', 'NDJ')).toBe(18);
    expect(await stockOf('LAI-001', 'MOU')).toBe(5);
  });

  it('only the destination branch can receive; partial receipt is recorded', async () => {
    const wrong = await adminNdj.post(`/api/transfers/${transferId}/receive`, { items: [{ itemId, receivedQuantity: 12 }] });
    expect(wrong.status).toBe(403);
    const res = await adminMou.post(`/api/transfers/${transferId}/receive`, { items: [{ itemId, receivedQuantity: 11 }], note: '1 carton abîmé' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RECEIVED');
    expect(res.body.data.items[0].receivedQuantity).toBe('11');
    expect(await stockOf('LAI-001', 'MOU')).toBe(16);
    const mv = await prisma.inventoryMovement.findMany({ where: { referenceId: transferId } });
    expect(mv.map((m) => m.type).sort()).toEqual(['TRANSFER_IN', 'TRANSFER_OUT']);
  });

  it('fails the whole shipment if the source is short', async () => {
    const mou = await prisma.branch.findUniqueOrThrow({ where: { code: 'MOU' } });
    await setStock('LAI-002', 3, 'NDJ');
    const t = (await stock.post('/api/transfers', { toBranchId: mou.id, items: [{ productId: await productId('LAI-001'), quantity: 1 }, { productId: await productId('LAI-002'), quantity: 10 }] })).body.data;
    await manager.post(`/api/transfers/${t.id}/approve`);
    const res = await manager.post(`/api/transfers/${t.id}/ship`);
    expect(res.status).toBe(422);
    expect(await stockOf('LAI-001', 'NDJ')).toBe(18);
    expect(await stockOf('LAI-002', 'NDJ')).toBe(3);
    expect((await prisma.stockTransfer.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('APPROVED');
    const cancelled = await manager.post(`/api/transfers/${t.id}/cancel`, { reason: 'Stock insuffisant' });
    expect(cancelled.body.data.status).toBe('CANCELLED');
  });
});

describe('Purchases and suppliers', () => {
  let poId: string;
  let supplierId: string;
  let items: { id: string; quantity: string }[];

  it('creates a supplier with an auto code', async () => {
    const res = await manager.post('/api/suppliers', { name: 'Fournisseur Test', phone: '+235 66 11 22 33' });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toMatch(/^FRN-\d{4}$/);
    supplierId = res.body.data.id;
  });

  it('creates and submits a purchase order with computed totals', async () => {
    const res = await manager.post('/api/purchases', {
      supplierId, submit: true,
      items: [{ productId: await productId('HYG-001'), quantity: 10, unitCost: 300, taxRate: 18 }, { productId: await productId('HYG-002'), quantity: 4, unitCost: 1000 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(res.body.data.number).toMatch(/^BC-NDJ-/);
    expect(res.body.data.subtotal).toBe('7000');
    expect(res.body.data.taxTotal).toBe('540');
    expect(res.body.data.total).toBe('7540');
    poId = res.body.data.id;
    items = res.body.data.items;
  });

  it('prevents self-approval and receiving before approval', async () => {
    expect((await manager.post(`/api/purchases/${poId}/approve`)).body.code).toBe('SELF_APPROVAL');
    expect((await stock.post(`/api/purchases/${poId}/receive`, { items: [{ itemId: items[0].id, quantity: 1 }] })).body.code).toBe('INVALID_PURCHASE_STATUS');
    expect((await adminNdj.post(`/api/purchases/${poId}/approve`)).body.data.status).toBe('APPROVED');
  });

  it('receives partially then fully: stock, supplier balance and cost price follow', async () => {
    const hyg1 = await stockOf('HYG-001');
    const r1 = await stock.post(`/api/purchases/${poId}/receive`, { items: [{ itemId: items[0].id, quantity: 6 }], updateCost: true });
    expect(r1.status).toBe(200);
    expect(r1.body.data.status).toBe('APPROVED');
    expect(await stockOf('HYG-001')).toBe(hyg1 + 6);
    let s = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    expect(Number(s.balance)).toBe(2124); // 6 × 300 × 1.18
    const over = await stock.post(`/api/purchases/${poId}/receive`, { items: [{ itemId: items[0].id, quantity: 5 }] });
    expect(over.body.code).toBe('RECEIVE_EXCEEDS_ORDERED');
    const r2 = await stock.post(`/api/purchases/${poId}/receive`, { items: [{ itemId: items[0].id, quantity: 4 }, { itemId: items[1].id, quantity: 4 }] });
    expect(r2.body.data.status).toBe('RECEIVED');
    s = await prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    expect(Number(s.balance)).toBe(7540);
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { sku: 'HYG-001' } })).purchasePrice)).toBe(300);
  });

  it('records a supplier payment against the balance', async () => {
    const tooMuch = await manager.post(`/api/suppliers/${supplierId}/payments`, { amount: 10000, method: 'BANK_TRANSFER' });
    expect(tooMuch.body.code).toBe('OVERPAYMENT');
    const res = await manager.post(`/api/suppliers/${supplierId}/payments`, { amount: 5000, method: 'BANK_TRANSFER', reference: 'VIR-001' });
    expect(res.status).toBe(201);
    expect(res.body.data.supplier.balance).toBe('2540');
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: poId } });
    expect(Number(po.amountPaid)).toBe(5000);
    const ledger = await manager.get(`/api/suppliers/${supplierId}/ledger`);
    expect(ledger.body.data.map((e: { type: string }) => e.type)).toEqual(['PAYMENT', 'PURCHASE', 'PURCHASE']);
  });

  it('cannot cancel a partially received order', async () => {
    const res = await manager.post(`/api/purchases/${poId}/cancel`, { reason: 'test' });
    expect(res.status).toBe(409);
  });
});
