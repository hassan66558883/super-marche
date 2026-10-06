import type { Request } from 'express';
import type { AuditAction, Prisma } from '@prisma/client';
import { prisma, type Db } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

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
};
