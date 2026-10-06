import type { Request, Response, CookieOptions } from 'express';
import { AuthService } from '../services/auth.service.js';
import { parseBody } from '../middleware/validate.js';
import { changePasswordSchema, forgotPasswordSchema, loginSchema, preferencesSchema, resetPasswordSchema } from '../validators/auth.validators.js';
import { ok } from '../utils/http.js';
import { env } from '../config/env.js';
import { prisma } from '../utils/prisma.js';
import { forbidden } from '../utils/errors.js';

export const REFRESH_COOKIE = 'tn_refresh';

const cookieOptions = (expires?: Date): CookieOptions => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'strict',
  path: '/api/auth',
  domain: env.COOKIE_DOMAIN,
  expires, // undefined → browser-session cookie (no "remember me")
});

async function mePayload(req: Request) {
  const ctx = req.auth!;
  const user = await AuthService.profile(ctx.userId);
  const branches = await prisma.branch.findMany({
    where: { id: { in: ctx.branchIds } },
    select: { id: true, code: true, name: true, city: true, address: true, phone: true, isHeadOffice: true },
    orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }],
  });
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    locale: user.locale,
    theme: user.theme,
    roles: user.roles.map((r) => ({ code: r.role.code, name: r.role.name })),
    permissions: [...ctx.permissions],
    maxDiscountPercent: ctx.maxDiscountPercent,
    branches,
    defaultBranchId: ctx.defaultBranchId,
  };
}

export const AuthController = {
  async login(req: Request, res: Response) {
    const body = parseBody(loginSchema, req);
    const result = await AuthService.login(body.identifier, body.password, body.rememberMe, req);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(body.rememberMe ? result.session.expiresAt : undefined));
    req.auth = await AuthService.buildContext(result.user.id, result.session.id);
    return ok(res, { accessToken: result.accessToken, user: await mePayload(req) });
  },

  async refresh(req: Request, res: Response) {
    const result = await AuthService.refresh(req.cookies?.[REFRESH_COOKIE], req);
    res.cookie(REFRESH_COOKIE, result.refreshToken, cookieOptions(result.session.rememberMe ? result.session.expiresAt : undefined));
    req.auth = await AuthService.buildContext(result.user.id, result.session.id);
    return ok(res, { accessToken: result.accessToken, user: await mePayload(req) });
  },

  async logout(req: Request, res: Response) {
    await AuthService.logout(req.auth?.sessionId, req.cookies?.[REFRESH_COOKIE], req);
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), expires: undefined });
    return ok(res, { loggedOut: true });
  },

  async me(req: Request, res: Response) {
    return ok(res, await mePayload(req));
  },

  async updatePreferences(req: Request, res: Response) {
    const body = parseBody(preferencesSchema, req);
    if (body.defaultBranchId && !req.auth!.branchIds.includes(body.defaultBranchId)) {
      throw forbidden('Accès refusé à cette succursale', 'BRANCH_FORBIDDEN');
    }
    await prisma.user.update({ where: { id: req.auth!.userId }, data: body });
    AuthService.invalidateUser(req.auth!.userId);
    req.auth = await AuthService.buildContext(req.auth!.userId, req.auth!.sessionId);
    return ok(res, await mePayload(req));
  },

  async changePassword(req: Request, res: Response) {
    const body = parseBody(changePasswordSchema, req);
    await AuthService.changePassword(req.auth!.userId, req.auth!.sessionId, body.currentPassword, body.newPassword, req);
    return ok(res, { changed: true });
  },

  async forgotPassword(req: Request, res: Response) {
    const body = parseBody(forgotPasswordSchema, req);
    const token = await AuthService.requestPasswordReset(body.identifier);
    return ok(res, {
      message: 'Si ce compte existe, un lien de réinitialisation a été envoyé.',
      ...(env.isTest && token ? { token } : {}),
    });
  },

  async resetPassword(req: Request, res: Response) {
    const body = parseBody(resetPasswordSchema, req);
    await AuthService.resetPassword(body.token, body.newPassword, req);
    return ok(res, { reset: true });
  },

  async sessions(req: Request, res: Response) {
    const sessions = await prisma.userSession.findMany({
      where: { userId: req.auth!.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true, rememberMe: true },
      orderBy: { lastUsedAt: 'desc' },
    });
    return ok(res, sessions.map((s) => ({ ...s, current: s.id === req.auth!.sessionId })));
  },

  async revokeSession(req: Request, res: Response) {
    await prisma.userSession.updateMany({
      where: { id: String(req.params.id), userId: req.auth!.userId },
      data: { revokedAt: new Date() },
    });
    AuthService.invalidateUser(req.auth!.userId);
    return ok(res, { revoked: true });
  },
};
