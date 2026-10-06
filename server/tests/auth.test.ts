import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, login, prisma } from './helpers.js';

describe('Authentication', () => {
  it('logs in with valid credentials and never exposes the password hash', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'admin', password: 'Admin@2026' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
    expect(res.headers['set-cookie']?.[0]).toMatch(/tn_refresh=.*HttpOnly/i);
    expect(res.body.data.user.defaultBranchId).toBeTruthy();
  });

  it('rejects a wrong password with a consistent error format', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'admin', password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: expect.any(String), code: 'INVALID_CREDENTIALS' });
  });

  it('accepts login by email too', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'admin@technova.td', password: 'Admin@2026' });
    expect(res.status).toBe(200);
  });

  it('stores passwords with argon2id', async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { username: 'cashier' } });
    expect(u.passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('locks the account after repeated failures', async () => {
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ identifier: 'stock', password: 'nope' });
    const res = await request(app).post('/api/auth/login').send({ identifier: 'stock', password: 'Stock@2026' });
    expect(res.status).toBe(423);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
    await prisma.user.update({ where: { username: 'stock' }, data: { lockedUntil: null, failedLoginCount: 0 } });
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const s = await login('manager');
    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', s.cookie);
    expect(r1.status).toBe(200);
    const newCookie = String(r1.headers['set-cookie']?.[0]).split(';')[0];
    expect(newCookie).not.toBe(s.cookie);
    // A second tab refreshing at the same moment is told to retry, nothing is revoked
    const race = await request(app).post('/api/auth/refresh').set('Cookie', s.cookie);
    expect(race.status).toBe(401);
    expect(race.body.code).toBe('REFRESH_RACE');
    const r2 = await request(app).post('/api/auth/refresh').set('Cookie', newCookie);
    expect(r2.status).toBe(200);
    const latest = String(r2.headers['set-cookie']?.[0]).split(';')[0];
    // Replaying an old token later revokes the whole session family
    await prisma.userSession.updateMany({ where: { revokedAt: { not: null }, userId: s.userId }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    const replay = await request(app).post('/api/auth/refresh').set('Cookie', s.cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('REFRESH_TOKEN_REUSED');
    const after = await request(app).post('/api/auth/refresh').set('Cookie', latest);
    expect(after.status).toBe(401);
  });

  it('rejects requests without a token, and revoked sessions after logout', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    const s = await login('cashier');
    expect((await s.get('/api/auth/me')).status).toBe(200);
    expect((await s.post('/api/auth/logout')).status).toBe(200);
    const res = await s.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('changes password and requires the current one', async () => {
    const s = await login('comptable');
    const bad = await s.post('/api/auth/change-password', { currentPassword: 'wrong', newPassword: 'Nouveau@2027' });
    expect(bad.body.code).toBe('INVALID_PASSWORD');
    const weak = await s.post('/api/auth/change-password', { currentPassword: 'Compta@2026', newPassword: 'short' });
    expect(weak.body.code).toBe('VALIDATION_ERROR');
    const okRes = await s.post('/api/auth/change-password', { currentPassword: 'Compta@2026', newPassword: 'Nouveau@2027' });
    expect(okRes.status).toBe(200);
    const relog = await request(app).post('/api/auth/login').send({ identifier: 'comptable', password: 'Nouveau@2027' });
    expect(relog.status).toBe(200);
    await s.post('/api/auth/change-password', { currentPassword: 'Nouveau@2027', newPassword: 'Compta@2026' }).set('Authorization', `Bearer ${relog.body.data.accessToken}`);
  });

  it('resets a password with a single-use token', async () => {
    const req = await request(app).post('/api/auth/forgot-password').send({ identifier: 'cashier2' });
    const token = req.body.data.token as string;
    expect(token).toBeTruthy();
    expect((await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Reset@2026x' })).status).toBe(200);
    expect((await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Again@2026x' })).body.code).toBe('INVALID_RESET_TOKEN');
    expect((await request(app).post('/api/auth/login').send({ identifier: 'cashier2', password: 'Reset@2026x' })).status).toBe(200);
    // restore
    const { hashPassword } = await import('../src/services/auth.service.js');
    await prisma.user.update({ where: { username: 'cashier2' }, data: { passwordHash: await hashPassword('Caisse@2026') } });
  });

  it('records LOGIN in the audit log, and audit rows are immutable', async () => {
    const log = await prisma.auditLog.findFirst({ where: { action: 'LOGIN' } });
    expect(log).toBeTruthy();
    await expect(prisma.auditLog.update({ where: { id: log!.id }, data: { description: 'tampered' } })).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: log!.id } })).rejects.toThrow(/append-only/);
  });
});

describe('Branch access', () => {
  it('loads the default branch and refuses branches the user is not assigned to', async () => {
    const s = await login('cashier');
    const mou = await prisma.branch.findUniqueOrThrow({ where: { code: 'MOU' } });
    const res = await request(app).get('/api/settings').set('Authorization', `Bearer ${s.token}`).set('X-Branch-Id', mou.id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('BRANCH_FORBIDDEN');
    const def = await request(app).get('/api/settings').set('Authorization', `Bearer ${s.token}`);
    expect(def.status).toBe(200);
  });
});
