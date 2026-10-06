import type { Request } from 'express';
import type { AuditAction, Prisma } from '@prisma/client';
import { prisma, type Db } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { dayBounds, paging } from '../utils/pagination.js';
import { forbidden } from '../utils/errors.js';
import type { PermissionCode } from '../config/permissions.js';

export interface AuditEntry {
  action: AuditAction;
  module: string;
  recordId?: string | null;
  description?: string;
  metadata?: Prisma.InputJsonValue;
  userId?: string | null;
  branchId?: string | null;
}

export const requestContext = (req?: Request) => ({
  userId: req?.auth?.userId ?? null,
  branchId: req?.branchId ?? null,
  ipAddress: req?.ip ?? null,
  userAgent: req?.get?.('user-agent')?.slice(0, 300) ?? null,
});

export const AuditService = {
  /** Write inside the caller's transaction when given one, so audit commits/rolls back with the change. */
  async log(entry: AuditEntry, req?: Request, db: Db = prisma) {
    const ctx = requestContext(req);
    try {
      await db.auditLog.create({
        data: {
          action: entry.action,
          module: entry.module,
          recordId: entry.recordId ?? null,
          description: entry.description,
          metadata: entry.metadata,
          userId: entry.userId ?? ctx.userId,
          branchId: entry.branchId ?? ctx.branchId,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
        },
      });
    } catch (err) {
      // Inside a transaction the error must propagate; standalone audit failures are logged only.
      if (db !== prisma) throw err;
      logger.error({ err, entry }, 'Failed to write audit log');
    }
  },
  /** Read-only journal query. There is deliberately no update or delete path (and the table is immutable in the database). */
  async list(req: Request, q: { page: number; pageSize: number; search?: string; from?: string; to?: string; userId?: string; action?: string; module?: string; recordId?: string; scope?: 'branch' | 'all' }) {
    const all = q.scope === 'all';
    if (all && !req.auth!.permissions.has('branches.all' as PermissionCode)) throw forbidden('Accès refusé aux autres succursales', 'BRANCH_FORBIDDEN');
    const created = dayBounds(q.from, q.to);
    const where: Prisma.AuditLogWhereInput = {
      // Branch scope also shows account events (logins…) of the people working in that branch
      ...(all ? {} : { OR: [{ branchId: req.branchId }, { branchId: null, user: { branches: { some: { branchId: req.branchId } } } }] }),
      ...(created ? { createdAt: created } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
      ...(q.action ? { action: q.action as AuditAction } : {}),
      ...(q.module ? { module: q.module } : {}),
      ...(q.recordId ? { recordId: q.recordId } : {}),
      ...(q.search ? { AND: [{ OR: [
        { description: { contains: q.search, mode: 'insensitive' } },
        { recordId: q.search },
        { user: { fullName: { contains: q.search, mode: 'insensitive' } } },
        { ipAddress: { startsWith: q.search } },
      ] }] } : {}),
    };
    const [rows, total, branches] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, include: { user: { select: { id: true, fullName: true, username: true } } }, ...paging(q) }),
      prisma.auditLog.count({ where }),
      prisma.branch.findMany({ select: { id: true, name: true } }),
    ]);
    const branchName = new Map(branches.map((b) => [b.id, b.name]));
    return { items: rows.map((r) => ({ ...r, branchName: r.branchId ? branchName.get(r.branchId) ?? null : null })), total };
  },

  async meta() {
    const modules = await prisma.auditLog.findMany({ distinct: ['module'], select: { module: true }, orderBy: { module: 'asc' } });
    const users = await prisma.user.findMany({ select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } });
    return { modules: modules.map((m) => m.module), users };
  },
};
