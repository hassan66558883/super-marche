import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, login, prisma, type Session } from './helpers.js';

let superadmin: Session;
let admin: Session;
let manager: Session;
let cashier: Session;
const roleId = async (code: string) => (await prisma.role.findUniqueOrThrow({ where: { code } })).id;
const branchId = async (code: string) => (await prisma.branch.findUniqueOrThrow({ where: { code } })).id;
const loginRaw = (identifier: string, password: string) => request(app).post('/api/auth/login').send({ identifier, password });

beforeAll(async () => {
  [superadmin, admin, manager, cashier] = await Promise.all([login('superadmin'), login('admin'), login('manager', 'NDJ'), login('cashier')]);
});

async function newUser(by: Session, username: string, roles: string[], extra: object = {}) {
  const ndj = await branchId('NDJ');
  return by.post('/api/users', {
    username, fullName: `Test ${username}`, password: 'Secret2026', roleIds: await Promise.all(roles.map(roleId)),
    branchIds: [ndj], defaultBranchId: ndj, locale: 'fr', ...extra,
  });
}

describe('Users API', () => {
  it('lists users without ever exposing password hashes', async () => {
    const res = await admin.get('/api/users?pageSize=100');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(7);
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/passwordHash|\$argon2/);
    const one = await admin.get(`/api/users/${res.body.data[0].id}`);
    expect(JSON.stringify(one.body)).not.toMatch(/passwordHash|\$argon2/);
  });

  it('refuses users without the permission', async () => {
    expect((await cashier.get('/api/users')).status).toBe(403);
    expect((await manager.post('/api/users', {})).status).toBe(403);
  });

  it('creates a user who can sign in, and rejects duplicates', async () => {
    const res = await newUser(admin, 'test.caisse', ['CASHIER']);
    expect(res.status).toBe(201);
    expect(res.body.data.roles.map((r: { code: string }) => r.code)).toEqual(['CASHIER']);
    expect((await loginRaw('test.caisse', 'Secret2026')).status).toBe(200);
    expect((await newUser(admin, 'test.caisse', ['CASHIER'])).body.code).toBe('USERNAME_TAKEN');
    const audit = await prisma.auditLog.findFirst({ where: { module: 'users', recordId: res.body.data.id, action: 'CREATE' } });
    expect(audit).not.toBeNull();
    expect(JSON.stringify(audit?.metadata)).not.toMatch(/Secret2026|argon2/);
  });

  it('validates that the default branch belongs to the user', async () => {
    const res = await newUser(admin, 'test.badbranch', ['CASHIER'], { defaultBranchId: await branchId('MOU') });
    expect(res.status).toBe(400);
  });

  it('blocks privilege escalation by non super admins', async () => {
    const asSuper = await newUser(admin, 'test.escalate', ['SUPER_ADMIN']);
    expect(asSuper.status).toBe(403);
    expect(asSuper.body.code).toBe('ROLE_FORBIDDEN');
    const sa = await prisma.user.findUniqueOrThrow({ where: { username: 'superadmin' } });
    const edit = await admin.post(`/api/users/${sa.id}/status`, { status: 'INACTIVE' });
    expect(edit.status).toBe(403);
    expect(edit.body.code).toBe('USER_FORBIDDEN');
    expect((await admin.post(`/api/users/${sa.id}/password`, { password: 'Hacked2026' })).status).toBe(403);
  });

  it('prevents users from changing their own roles or disabling themselves', async () => {
    const me = (await admin.get(`/api/users/${admin.userId}`)).body.data;
    const body = {
      username: me.username, fullName: me.fullName, email: me.email, phone: me.phone, locale: me.locale,
      roleIds: [await roleId('CASHIER')], branchIds: me.branches.map((b: { id: string }) => b.id), defaultBranchId: me.defaultBranchId,
    };
    const res = await admin.put(`/api/users/${admin.userId}`, body);
    expect(res.body.code).toBe('SELF_ROLE_CHANGE');
    // Same roles: profile edits are fine
    expect((await admin.put(`/api/users/${admin.userId}`, { ...body, roleIds: me.roles.map((r: { id: string }) => r.id) })).status).toBe(200);
    expect((await admin.post(`/api/users/${admin.userId}/status`, { status: 'INACTIVE' })).body.code).toBe('SELF_DISABLE');
  });

  it('disabling a user ends their sessions immediately', async () => {
    const created = (await newUser(admin, 'test.disable', ['CASHIER'])).body.data;
    const s = await login2('test.disable', 'Secret2026');
    expect((await s.get('/api/auth/me')).status).toBe(200);
    expect((await admin.post(`/api/users/${created.id}/status`, { status: 'INACTIVE' })).status).toBe(200);
    expect((await s.get('/api/auth/me')).status).toBe(401);
    expect((await loginRaw('test.disable', 'Secret2026')).status).not.toBe(200);
    expect((await admin.post(`/api/users/${created.id}/status`, { status: 'ACTIVE' })).status).toBe(200);
    expect((await loginRaw('test.disable', 'Secret2026')).status).toBe(200);
  });

  it('password reset revokes sessions and enforces the password policy', async () => {
    const created = (await newUser(admin, 'test.reset', ['CASHIER'])).body.data;
    const s = await login2('test.reset', 'Secret2026');
    expect((await admin.post(`/api/users/${created.id}/password`, { password: 'short' })).status).toBe(400);
    expect((await admin.post(`/api/users/${created.id}/password`, { password: 'Nouveau2026' })).status).toBe(200);
    expect((await s.get('/api/auth/me')).status).toBe(401);
    expect((await loginRaw('test.reset', 'Secret2026')).status).not.toBe(200);
    expect((await loginRaw('test.reset', 'Nouveau2026')).status).toBe(200);
  });
});

async function login2(username: string, password: string) {
  const res = await loginRaw(username, password);
  expect(res.status).toBe(200);
  const token = res.body.data.accessToken as string;
  return { get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`), token, user: res.body.data.user };
}

describe('Roles API', () => {
  it('lists roles with permissions and user counts', async () => {
    const res = await admin.get('/api/roles');
    expect(res.status).toBe(200);
    const cashierRole = res.body.data.find((r: { code: string }) => r.code === 'CASHIER');
    expect(cashierRole.userCount).toBeGreaterThan(0);
    expect(cashierRole.permissions).toContain('sales.create');
    expect((await admin.get('/api/roles/permissions')).body.data.length).toBeGreaterThan(40);
  });

  it('only roles.manage can write roles; SUPER_ADMIN and system roles are protected', async () => {
    expect((await admin.post('/api/roles', { code: 'X', name: 'X', maxDiscountPercent: 0, permissions: [] })).status).toBe(403);
    const sa = await roleId('SUPER_ADMIN');
    const res = await superadmin.put(`/api/roles/${sa}`, { code: 'SUPER_ADMIN', name: 'Root', maxDiscountPercent: 100, permissions: [] });
    expect(res.body.code).toBe('ROLE_LOCKED');
    expect((await superadmin.del(`/api/roles/${await roleId('CASHIER')}`)).body.code).toBe('ROLE_LOCKED');
  });

  it('a role manager cannot grant permissions they do not hold', async () => {
    const hr = await superadmin.post('/api/roles', {
      code: 'HR_TEST', name: 'RH test', maxDiscountPercent: 0,
      permissions: ['users.view', 'users.create', 'users.edit', 'roles.manage'],
    });
    expect(hr.status).toBe(201);
    await newUser(superadmin, 'test.hr', ['HR_TEST']);
    const s = await login2('test.hr', 'Secret2026');
    const post = (body: object) => request(app).post('/api/roles').set('Authorization', `Bearer ${s.token}`).set('X-Branch-Id', s.user.defaultBranchId).send(body);
    const escalate = await post({ code: 'HR_PLUS', name: 'RH plus', maxDiscountPercent: 0, permissions: ['users.view', 'settings.manage'] });
    expect(escalate.status).toBe(403);
    expect(escalate.body.code).toBe('ROLE_FORBIDDEN');
    expect((await post({ code: 'HR_LITE', name: 'RH lite', maxDiscountPercent: 0, permissions: ['users.view'] })).status).toBe(201);
    // Assigning a role that carries extra rights is also refused
    const ndj = await branchId('NDJ');
    const assign = await request(app).post('/api/users').set('Authorization', `Bearer ${s.token}`).set('X-Branch-Id', ndj)
      .send({ username: 'test.viaRole', fullName: 'Via role', password: 'Secret2026', roleIds: [await roleId('ADMIN')], branchIds: [ndj], defaultBranchId: ndj });
    expect(assign.body.code).toBe('ROLE_FORBIDDEN');
  });

  it('role permission changes apply to existing sessions and roles in use cannot be deleted', async () => {
    const hr = await prisma.role.findUniqueOrThrow({ where: { code: 'HR_TEST' } });
    const s = await login2('test.hr', 'Secret2026');
    const get = () => request(app).get('/api/users').set('Authorization', `Bearer ${s.token}`).set('X-Branch-Id', s.user.defaultBranchId);
    expect((await get()).status).toBe(200);
    await superadmin.put(`/api/roles/${hr.id}`, { code: 'HR_TEST', name: 'RH test', maxDiscountPercent: 0, permissions: ['roles.manage'] });
    expect((await get()).status).toBe(403);
    expect((await superadmin.del(`/api/roles/${hr.id}`)).body.code).toBe('ROLE_IN_USE');
    const lite = await roleId('HR_LITE');
    expect((await superadmin.del(`/api/roles/${lite}`)).status).toBe(200);
  });
});

describe('Audit log', () => {
  it('is readable with filters and has no write routes', async () => {
    const res = await admin.get('/api/audit?module=users&pageSize=20');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((e: { module: string }) => e.module === 'users')).toBe(true);
    const id = res.body.data[0].id;
    expect([404, 405]).toContain((await admin.put(`/api/audit/${id}`, { description: 'x' })).status);
    expect([404, 405]).toContain((await admin.del(`/api/audit/${id}`)).status);
    expect((await cashier.get('/api/audit')).status).toBe(403);
    const meta = await admin.get('/api/audit/meta');
    expect(meta.body.data.modules).toContain('users');
  });

  it('cannot be modified even directly in the database', async () => {
    const row = await prisma.auditLog.findFirstOrThrow();
    await expect(prisma.auditLog.update({ where: { id: row.id }, data: { description: 'tampered' } })).rejects.toThrow();
    await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow();
  });

  it('limits company-wide audit to users with all-branch access', async () => {
    expect((await manager.get('/api/audit?scope=all')).status).toBe(403);
    expect((await manager.get('/api/audit')).status).toBe(200);
    expect((await admin.get('/api/audit?scope=all')).status).toBe(200);
  });
});

describe('Branches, registers and payment methods', () => {
  it('creates a branch with a first register and protects the head office', async () => {
    const res = await admin.post('/api/branches', { code: 'ABC', name: 'Abéché', city: 'Abéché', status: 'ACTIVE' });
    expect(res.status).toBe(201);
    const list = (await admin.get('/api/branches/manage')).body.data;
    const abc = list.find((b: { code: string }) => b.code === 'ABC');
    expect(abc.registers.map((r: { name: string }) => r.name)).toEqual(['Caisse 1']);
    expect((await admin.post(`/api/branches/${abc.id}/registers`, { name: 'Caisse 2' })).status).toBe(201);
    expect((await admin.post(`/api/branches/${abc.id}/registers`, { name: 'Caisse 2' })).body.code).toBe('REGISTER_NAME_TAKEN');
    const head = list.find((b: { isHeadOffice: boolean }) => b.isHeadOffice);
    const off = await admin.put(`/api/branches/${head.id}`, { code: head.code, name: head.name, status: 'INACTIVE' });
    expect(off.body.code).toBe('HEAD_OFFICE_ACTIVE');
    expect((await manager.post('/api/branches', { code: 'ZZ', name: 'Zz' })).status).toBe(403);
  });

  it('keeps at least one active cash payment method', async () => {
    const list = (await admin.get('/api/admin/payment-methods')).body.data;
    const cash = list.find((m: { code: string }) => m.code === 'CASH');
    const res = await admin.put(`/api/admin/payment-methods/${cash.id}`, { ...cash, isActive: false });
    expect(res.body.code).toBe('CASH_REQUIRED');
    const created = await admin.post('/api/admin/payment-methods', { code: 'WARI', name: 'Wari', type: 'MOBILE_MONEY', provider: 'Wari', isActive: true, sortOrder: 90 });
    expect(created.status).toBe(201);
    expect((await admin.get('/api/payment-methods')).body.data.map((m: { code: string }) => m.code)).toContain('WARI');
    expect((await cashier.get('/api/admin/payment-methods')).status).toBe(403);
  });
});

describe('ESC/POS print bridge', () => {
  let server: net.Server;
  const received: Buffer[] = [];
  afterAll(() => new Promise<void>((r) => server?.close(() => r())));

  it('refuses when no printer is configured, then forwards bytes to the branch printer', async () => {
    expect((await cashier.post('/api/print/escpos', { data: Buffer.from('hello').toString('base64') })).body.code).toBe('PRINTER_NOT_CONFIGURED');
    server = net.createServer((sock) => sock.on('data', (d) => received.push(d)));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as net.AddressInfo).port;
    // Branch-scoped printer setting for NDJ (cashier's branch)
    const ndjAdmin = await login('admin', 'NDJ');
    expect((await ndjAdmin.put('/api/settings/printer?scope=branch', { type: 'ESCPOS', escpos: { enabled: true, host: '127.0.0.1', port } })).status).toBe(200);
    const payload = Buffer.from([0x1b, 0x40, 0x41, 0x0a]);
    const res = await cashier.post('/api/print/escpos', { data: payload.toString('base64') });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(Buffer.concat(received)).toEqual(payload);
    // The target host can never come from the request
    expect((await cashier.post('/api/print/escpos', { data: 'AAAA', host: '10.0.0.1' })).status).toBe(200);
    // Other branches keep the browser printer
    const mou = await login('cashier2');
    expect((await mou.post('/api/print/escpos', { data: 'AAAA' })).body.code).toBe('PRINTER_NOT_CONFIGURED');
    await ndjAdmin.put('/api/settings/printer?scope=branch', { type: 'BROWSER', escpos: { enabled: false, host: null, port: 9100 } });
  });
});
