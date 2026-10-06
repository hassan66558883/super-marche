import { beforeAll, describe, expect, it } from 'vitest';
import { login, prisma, type Session } from './helpers.js';

let cashier: Session; // cashier2 works at MOU
let admin: Session;
let sessionId: string;
let categoryId: string;

async function expected(id: string) {
  return Number((await admin.get(`/api/cash/sessions/${id}`)).body.data.expected);
}

beforeAll(async () => {
  cashier = await login('cashier2');
  admin = await login('admin', 'MOU');
  categoryId = (await prisma.expenseCategory.findUniqueOrThrow({ where: { code: 'TRANSPORT' } })).id;
  const regs = await cashier.get('/api/cash/registers');
  const free = regs.body.data.find((r: { openSession: unknown }) => !r.openSession);
  const open = await cashier.post('/api/cash/open', { registerId: free.id, amount: 20000 });
  expect(open.status).toBe(201);
  sessionId = open.body.data.session.id;
});

describe('Expenses', () => {
  it('pays an expense from the register: EXPENSE movement lowers expected cash', async () => {
    const res = await cashier.post('/api/expenses', { categoryId, amount: 3500, description: 'Taxi livraison', method: 'CASH', fromRegister: true });
    expect(res.status).toBe(201);
    expect(res.body.data.registerSessionId).toBe(sessionId);
    expect(res.body.data.amount).toBe('3500');
    expect(await expected(sessionId)).toBe(16500);
    const mv = await prisma.cashMovement.findFirstOrThrow({ where: { referenceId: res.body.data.id } });
    expect(mv.type).toBe('EXPENSE');
    expect(Number(mv.amount)).toBe(-3500);
  });

  it('refuses to take more cash than the register holds', async () => {
    const res = await cashier.post('/api/expenses', { categoryId, amount: 999999, description: 'Trop cher', method: 'CASH', fromRegister: true });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_CASH');
    expect(await expected(sessionId)).toBe(16500);
  });

  it('records a non-register expense without touching the cash drawer', async () => {
    const res = await admin.post('/api/expenses', { categoryId, amount: 50000, description: 'Facture électricité', method: 'BANK_TRANSFER', reference: 'SNE-0925' });
    expect(res.status).toBe(201);
    expect(res.body.data.registerSessionId).toBeNull();
    const bad = await admin.post('/api/expenses', { categoryId, amount: 100, description: 'x carte', method: 'CARD', fromRegister: true });
    expect(bad.body.code).toBe('REGISTER_CASH_ONLY');
  });

  it('lists with the recorded total; cashiers cannot list or void', async () => {
    const list = await admin.get('/api/expenses');
    expect(list.status).toBe(200);
    expect(list.body.meta.totalAmount).toBe('53500');
    expect(list.body.data[0].userName).toBeTruthy();
    expect((await cashier.get('/api/expenses')).status).toBe(403);
    expect((await cashier.post(`/api/expenses/${list.body.data[0].id}/void`, { reason: 'erreur' })).status).toBe(403);
  });

  it('voids an expense: cash goes back into the open register, the row stays', async () => {
    const e = await prisma.expense.findFirstOrThrow({ where: { registerSessionId: sessionId } });
    const res = await admin.post(`/api/expenses/${e.id}/void`, { reason: 'Saisie en double' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('VOID');
    expect(res.body.data.voidedByName).toBeTruthy();
    expect(await expected(sessionId)).toBe(20000);
    expect((await admin.post(`/api/expenses/${e.id}/void`, { reason: 'encore' })).body.code).toBe('EXPENSE_ALREADY_VOID');
    expect((await admin.get('/api/expenses')).body.meta.totalAmount).toBe('50000');
    await expect(prisma.expense.delete({ where: { id: e.id } })).rejects.toThrow();
  });

  it('manages expense categories (admin only)', async () => {
    const res = await admin.post('/api/expenses/categories', { name: 'Eau potable' });
    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('EAU_POTABLE');
    expect((await cashier.post('/api/expenses/categories', { name: 'X' })).status).toBe(403);
  });
});
