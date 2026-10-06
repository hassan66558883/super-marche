import type { RequestHandler } from 'express';
import { AuthService } from '../services/auth.service.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import type { PermissionCode } from '../config/permissions.js';

/** Requires a valid Bearer access token; attaches req.auth. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  const payload = AuthService.verifyAccessToken(header.slice(7));
  req.auth = await AuthService.buildContext(payload.sub, payload.sid);
  next();
};

/** Attaches req.auth when a valid token is present; never rejects. */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.get('authorization');
    if (header?.startsWith('Bearer ')) {
      const payload = AuthService.verifyAccessToken(header.slice(7));
      req.auth = await AuthService.buildContext(payload.sub, payload.sid);
    }
  } catch {
    // ignore: caller falls back to the refresh cookie
  }
  next();
};

/** Backend RBAC: the user must hold ALL listed permissions. */
export const requirePermission =
  (...codes: PermissionCode[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) throw unauthorized();
    const missing = codes.filter((c) => !req.auth!.permissions.has(c));
    if (missing.length) throw forbidden(`Permission requise: ${missing.join(', ')}`, 'PERMISSION_DENIED');
    next();
  };

/** The user must hold at least one of the listed permissions. */
export const requireAnyPermission =
  (...codes: PermissionCode[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) throw unauthorized();
    if (!codes.some((c) => req.auth!.permissions.has(c))) {
      throw forbidden(`Permission requise: ${codes.join(' | ')}`, 'PERMISSION_DENIED');
    }
    next();
  };

export const hasPermission = (req: Parameters<RequestHandler>[0], code: PermissionCode) =>
  Boolean(req.auth?.permissions.has(code));

/**
 * Resolves the active branch from `X-Branch-Id` (or the user's default) and checks access.
 * Every transactional endpoint runs behind this so rows always get a valid branch_id.
 */
export const resolveBranch: RequestHandler = (req, _res, next) => {
  if (!req.auth) throw unauthorized();
  const requested = req.get('x-branch-id') || (typeof req.query.branchId === 'string' ? req.query.branchId : undefined);
  const branchId = requested || req.auth.defaultBranchId;
  if (!branchId) throw forbidden('Aucune succursale assignée à cet utilisateur', 'NO_BRANCH');
  if (!req.auth.branchIds.includes(branchId)) throw forbidden('Accès refusé à cette succursale', 'BRANCH_FORBIDDEN');
  req.branchId = branchId;
  next();
};
