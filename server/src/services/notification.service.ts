import type { NotificationType } from '@prisma/client';
import { prisma, type Db } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

export const NotificationService = {
  /**
   * Creates a notification unless an unread one with the same dedup key exists
   * (e.g. one low-stock alert per product/branch until someone reads it).
   */
  async notify(
    input: { branchId?: string | null; type: NotificationType; title: string; message: string; dedupKey?: string; link?: string },
    db: Db = prisma,
  ) {
    try {
      if (input.dedupKey) {
        const existing = await db.notification.findFirst({ where: { dedupKey: input.dedupKey, readAt: null } });
        if (existing) return existing;
      }
      return await db.notification.create({ data: { ...input, branchId: input.branchId ?? null } });
    } catch (err) {
      logger.error({ err }, 'Failed to create notification');
      return null;
    }
  },

  async list(branchIds: string[], opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const where = { OR: [{ branchId: { in: branchIds } }, { branchId: null }], ...(opts.unreadOnly ? { readAt: null } : {}) };
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: opts.limit ?? 30 }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { items, unread };
  },

  async markRead(branchIds: string[], id?: string) {
    await prisma.notification.updateMany({
      where: { ...(id ? { id } : {}), readAt: null, OR: [{ branchId: { in: branchIds } }, { branchId: null }] },
      data: { readAt: new Date() },
    });
  },
};
