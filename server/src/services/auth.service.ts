import crypto from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { prisma } from '../utils/prisma.js';
import { env } from '../config/env.js';
import { AppError, badRequest, unauthorized } from '../utils/errors.js';
import { AuditService } from './audit.service.js';
import type { AuthContext } from '../types.js';
import type { PermissionCode } from '../config/permissions.js';
import { logger } from '../utils/logger.js';

const ARGON_OPTS: argon2.HashOptions = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (plain: string) => argon2.hash(plain, ARGON_OPTS);
export const verifyPassword = (hash: string, plain: string) => argon2.verify(hash, plain).catch(() => false);

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');
const randomToken = () => crypto.randomBytes(48).toString('base64url');

interface AccessPayload {
  sub: string;
  sid: string;
}

// Dummy hash so unknown usernames take as long as wrong passwords (no user enumeration by timing)
let dummyHash: string | null = null;
const getDummyHash = async () => (dummyHash ??= await hashPassword('technova-timing-equalizer'));

// Short-lived cache of resolved auth contexts (invalidated on permission/user changes)
const ctxCache = new Map<string, { ctx: AuthContext; expires: number }>();
const CTX_TTL_MS = 15_000;

export const AuthService = {
  invalidateUser(userId?: string) {
    if (!userId) return ctxCache.clear();
    for (const [k, v] of ctxCache) if (v.ctx.userId === userId) ctxCache.delete(k);
  },

  signAccessToken(userId: string, sessionId: string) {
    return jwt.sign({ sub: userId, sid: sessionId } satisfies AccessPayload, env.JWT_ACCESS_SECRET, {
      expiresIn: env.JWT_ACCESS_TTL as jwt.SignOptions['expiresIn'],
      algorithm: 'HS256',
      issuer: 'technova-pos',
    });
  },

  verifyAccessToken(token: string): AccessPayload {
    try {
      return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], issuer: 'technova-pos' }) as AccessPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) throw unauthorized('Session expirée', 'TOKEN_EXPIRED');
      throw unauthorized('Jeton invalide', 'INVALID_TOKEN');
    }
  },

  async buildContext(userId: string, sessionId: string): Promise<AuthContext> {
    const cached = ctxCache.get(sessionId);
    if (cached && cached.expires > Date.now()) return cached.ctx;

    const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
    if (!session || session.userId !== userId || session.revokedAt || session.expiresAt < new Date()) {
      throw unauthorized('Session expirée', 'SESSION_REVOKED');
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
        branches: { include: { branch: true } },
      },
    });
    if (!user || user.status !== 'ACTIVE') throw unauthorized('Compte désactivé', 'ACCOUNT_DISABLED');

    const permissions = new Set<PermissionCode>();
    let maxDiscount = 0;
    for (const ur of user.roles) {
      maxDiscount = Math.max(maxDiscount, Number(ur.role.maxDiscountPercent));
      for (const rp of ur.role.permissions) permissions.add(rp.permission.code as PermissionCode);
    }
    const allBranches = permissions.has('branches.all');
    const branchIds = allBranches
      ? (await prisma.branch.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })).map((b) => b.id)
      : user.branches.filter((ub) => ub.branch.status === 'ACTIVE').map((ub) => ub.branchId);

    const ctx: AuthContext = {
      userId: user.id,
      sessionId,
      username: user.username,
      fullName: user.fullName,
      roles: user.roles.map((r) => r.role.code),
      permissions,
      maxDiscountPercent: maxDiscount,
      branchIds,
      allBranches,
      defaultBranchId: user.defaultBranchId && branchIds.includes(user.defaultBranchId) ? user.defaultBranchId : branchIds[0] ?? null,
    };
    ctxCache.set(sessionId, { ctx, expires: Date.now() + CTX_TTL_MS });
    return ctx;
  },

  async login(identifier: string, password: string, rememberMe: boolean, req: Request) {
    const id = identifier.trim().toLowerCase();
    const user = await prisma.user.findFirst({ where: { OR: [{ username: id }, { email: id }] } });

    if (!user) {
      await verifyPassword(await getDummyHash(), password);
      await AuditService.log({ action: 'LOGIN_FAILED', module: 'auth', description: `Identifiant inconnu: ${id.slice(0, 60)}` }, req);
      throw unauthorized('Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError(423, 'ACCOUNT_LOCKED', 'Compte temporairement verrouillé. Réessayez plus tard.');
    }
    if (user.status !== 'ACTIVE') throw unauthorized('Compte désactivé', 'ACCOUNT_DISABLED');

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      const attempts = user.failedLoginCount + 1;
      const lock = attempts >= env.LOGIN_MAX_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: lock ? 0 : attempts,
          lockedUntil: lock ? new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60_000) : null,
        },
      });
      await AuditService.log({ action: 'LOGIN_FAILED', module: 'auth', userId: user.id, recordId: user.id, description: lock ? 'Compte verrouillé' : 'Mot de passe incorrect' }, req);
      throw unauthorized('Identifiant ou mot de passe incorrect', 'INVALID_CREDENTIALS');
    }

    if (argon2.needsRehash(user.passwordHash, ARGON_OPTS)) {
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
    }
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });

    const { session, refreshToken } = await this.createSession(user.id, rememberMe, req);
    await AuditService.log({ action: 'LOGIN', module: 'auth', userId: user.id, recordId: user.id, description: 'Connexion' }, req);
    return { accessToken: this.signAccessToken(user.id, session.id), refreshToken, session, user };
  },

  async createSession(userId: string, rememberMe: boolean, req: Request) {
    const refreshToken = randomToken();
    const ttlMs = rememberMe ? env.REFRESH_TTL_REMEMBER_DAYS * 86_400_000 : env.REFRESH_TTL_HOURS * 3_600_000;
    const session = await prisma.userSession.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        rememberMe,
        expiresAt: new Date(Date.now() + ttlMs),
        userAgent: req.get('user-agent')?.slice(0, 300),
        ipAddress: req.ip,
      },
    });
    return { session, refreshToken };
  },

  /** Rotates the refresh token. Reuse of a revoked token revokes every session of that user. */
  async refresh(refreshToken: string | undefined, req: Request) {
    if (!refreshToken) throw unauthorized('Session expirée', 'NO_REFRESH_TOKEN');
    const session = await prisma.userSession.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!session) throw unauthorized('Session expirée', 'INVALID_REFRESH_TOKEN');
    if (session.revokedAt && Date.now() - session.revokedAt.getTime() < 10_000) {
      // Two tabs refreshed at the same moment: the other one already rotated the cookie.
      // Not an attack; the caller retries with the cookie it now holds.
      throw unauthorized('Session renouvelée, réessayez', 'REFRESH_RACE');
    }
    if (session.revokedAt) {
      logger.warn({ userId: session.userId }, 'Refresh token reuse detected, revoking all sessions');
      await prisma.userSession.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      this.invalidateUser(session.userId);
      throw unauthorized('Session expirée', 'REFRESH_TOKEN_REUSED');
    }
    if (session.expiresAt < new Date()) throw unauthorized('Session expirée', 'REFRESH_TOKEN_EXPIRED');

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user || user.status !== 'ACTIVE') throw unauthorized('Compte désactivé', 'ACCOUNT_DISABLED');

    const newToken = randomToken();
    const ttlMs = session.rememberMe ? env.REFRESH_TTL_REMEMBER_DAYS * 86_400_000 : env.REFRESH_TTL_HOURS * 3_600_000;
    // Rotate in place: same session id (in-flight access tokens stay valid), new token hash.
    // The old hash is kept on a revoked tombstone row so a replayed old token is detected as reuse.
    const [updated] = await prisma.$transaction([
      prisma.userSession.update({
        where: { id: session.id },
        data: { tokenHash: sha256(newToken), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + ttlMs), ipAddress: req.ip },
      }),
      prisma.userSession.create({
        data: { userId: session.userId, tokenHash: session.tokenHash, revokedAt: new Date(), expiresAt: session.expiresAt },
      }),
    ]);
    return { accessToken: this.signAccessToken(user.id, updated.id), refreshToken: newToken, session: updated, user };
  },

  async logout(sessionId: string | undefined, refreshToken: string | undefined, req: Request) {
    const where = sessionId ? { id: sessionId } : refreshToken ? { tokenHash: sha256(refreshToken) } : null;
    if (!where) return;
    const session = await prisma.userSession.findUnique({ where });
    if (!session) return;
    await prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    ctxCache.delete(session.id);
    await AuditService.log({ action: 'LOGOUT', module: 'auth', userId: session.userId, recordId: session.userId, description: 'Déconnexion' }, req);
  },

  async changePassword(userId: string, sessionId: string, currentPassword: string, newPassword: string, req: Request) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verifyPassword(user.passwordHash, currentPassword))) {
      throw badRequest('INVALID_PASSWORD', 'Mot de passe actuel incorrect');
    }
    if (currentPassword === newPassword) throw badRequest('SAME_PASSWORD', 'Le nouveau mot de passe doit être différent');
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() } });
    // Sign out every other device
    await prisma.userSession.updateMany({ where: { userId, revokedAt: null, NOT: { id: sessionId } }, data: { revokedAt: new Date() } });
    this.invalidateUser(userId);
    await AuditService.log({ action: 'PASSWORD_CHANGE', module: 'auth', recordId: userId, description: 'Mot de passe modifié' }, req);
  },

  /**
   * Password reset architecture: creates a single-use token valid 30 min.
   * Delivery is pluggable (email/SMS); without a provider configured the token is logged in development.
   * Always resolves the same way so callers cannot probe which accounts exist.
   */
  async requestPasswordReset(identifier: string) {
    const id = identifier.trim().toLowerCase();
    const user = await prisma.user.findFirst({ where: { OR: [{ username: id }, { email: id }], status: 'ACTIVE' } });
    if (!user) return;
    const token = randomToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) },
    });
    if (!env.isProd) logger.info({ username: user.username, token }, 'Password reset token (dev only — configure a mail provider for production)');
    return env.isTest ? token : undefined;
  },

  async resetPassword(token: string, newPassword: string, req: Request) {
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw badRequest('INVALID_RESET_TOKEN', 'Lien de réinitialisation invalide ou expiré');
    }
    await prisma.$transaction([
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } }),
      prisma.userSession.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    this.invalidateUser(record.userId);
    await AuditService.log({ action: 'PASSWORD_CHANGE', module: 'auth', userId: record.userId, recordId: record.userId, description: 'Mot de passe réinitialisé' }, req);
  },

  async profile(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } }, branches: { include: { branch: true } } },
    });
    return user;
  },
};
