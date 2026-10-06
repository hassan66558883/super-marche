import { beforeAll, describe, expect, it } from 'vitest';
import { login, prisma, stockOf, type Session } from './helpers.js';

let admin: Session;
let cashier: Session;

beforeAll(async () => {
  admin = await login('admin', 'NDJ');
  cashier = await login('cashier');
});

describe('Products', () => {
  it('creates a product with barcode and opening stock (via a movement)', async () => {
    const res = await admin.post('/api/products', {
      name: 'Savon test 100g', sku: 'TST-001', sellingPrice: 350, purchasePrice: 200, barcodes: ['2000000999995'], openingStock: 12,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.sellingPrice).toBe('350');
    expect(await stockOf('TST-001')).toBe(12);
    const mv = await prisma.inventoryMovement.findFirst({ where: { productId: res.body.data.id, type: 'OPENING' } });
    expect(Number(mv?.quantity)).toBe(12);
  });

  it('rejects duplicate SKU and barcode', async () => {
    const dupSku = await admin.post('/api/products', { name: 'X', sku: 'TST-001', sellingPrice: 1 });
    expect(dupSku.status).toBe(409);
    const dupCode = await admin.post('/api/products', { name: 'Y', sku: 'TST-002', sellingPrice: 1, barcodes: ['2000000999995'] });
    expect(dupCode.status).toBe(409);
  });

  it('finds a product by scanned barcode, and reports unknown codes', async () => {
    const hit = await cashier.get('/api/products/code/2000000999995');
    expect(hit.status).toBe(200);
    expect(hit.body.data.product.sku).toBe('TST-001');
    const miss = await cashier.get('/api/products/code/0000000000000');
    expect(miss.status).toBe(404);
    expect(miss.body.message).toBe('Produit introuvable');
  });

  it('searches the POS catalogue by name', async () => {
    const res = await cashier.get('/api/products/pos?q=coca');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].name.toLowerCase()).toContain('coca');
  });

  it('forbids a cashier from creating or editing products', async () => {
    const res = await cashier.post('/api/products', { name: 'Z', sku: 'TST-003', sellingPrice: 1 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PERMISSION_DENIED');
  });

  it('never exposes cost prices to users without products.view_cost', async () => {
    const res = await cashier.get('/api/products/pos?q=TST-001');
    expect(JSON.stringify(res.body.data)).not.toMatch(/purchasePrice":"[1-9]/);
  });

  it('deactivates instead of deleting a product with history', async () => {
    const p = await prisma.product.findUniqueOrThrow({ where: { sku: 'TST-001' } });
    const res = await admin.del(`/api/products/${p.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deactivated).toBe(true);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('INACTIVE');
  });
});

describe('Customers', () => {
  it('creates a customer with an auto code', async () => {
    const res = await admin.post('/api/customers', { name: 'Boutique Test', phone: '+235 66 00 00 00', creditLimit: 10000 });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toMatch(/^CLI-\d{4}$/);
  });
});
