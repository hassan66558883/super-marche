import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/utils/prisma.js';

export const app = createApp();
export { prisma };

export const PASSWORDS: Record<string, string> = {
  superadmin: 'Admin@2026', admin: 'Admin@2026', manager: 'Manager@2026', cashier: 'Caisse@2026',
  cashier2: 'Caisse@2026', stock: 'Stock@2026', comptable: 'Compta@2026',
};

export interface Session {
  token: string;
  branchId: string;
  userId: string;
  cookie: string;
  get: (url: string) => request.Test;
  post: (url: string, body?: object) => request.Test;
  put: (url: string, body?: object) => request.Test;
  patch: (url: string, body?: object) => request.Test;
  del: (url: string) => request.Test;
}

export async function login(username: string, branchCode?: string): Promise<Session> {
  const res = await request(app).post('/api/auth/login').send({ identifier: username, password: PASSWORDS[username] });
  if (res.status !== 200) throw new Error(`login ${username} failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token = res.body.data.accessToken as string;
  const branchId = branchCode
    ? (await prisma.branch.findUniqueOrThrow({ where: { code: branchCode } })).id
    : (res.body.data.user.defaultBranchId as string);
  const cookie = String(res.headers['set-cookie']?.[0] ?? '').split(';')[0];
  const h = (t: request.Test) => t.set('Authorization', `Bearer ${token}`).set('X-Branch-Id', branchId);
  return {
    token, branchId, cookie, userId: res.body.data.user.id,
    get: (url) => h(request(app).get(url)),
    post: (url, body = {}) => h(request(app).post(url)).send(body),
    put: (url, body = {}) => h(request(app).put(url)).send(body),
    patch: (url, body = {}) => h(request(app).patch(url)).send(body),
    del: (url) => h(request(app).delete(url)),
  };
}

export async function stockOf(sku: string, branchCode = 'NDJ') {
  const p = await prisma.product.findUniqueOrThrow({ where: { sku } });
  const b = await prisma.branch.findUniqueOrThrow({ where: { code: branchCode } });
  const inv = await prisma.inventory.findFirst({ where: { productId: p.id, branchId: b.id, variantId: null } });
  return Number(inv?.quantity ?? 0);
}

export const productId = async (sku: string) => (await prisma.product.findUniqueOrThrow({ where: { sku } })).id;
