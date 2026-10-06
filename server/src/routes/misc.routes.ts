import { Router } from 'express';
import { authenticate, requirePermission, resolveBranch } from '../middleware/auth.js';
import { SettingsController } from '../controllers/settings.controller.js';
import { NotificationService } from '../services/notification.service.js';
import { ok } from '../utils/http.js';
import { prisma } from '../utils/prisma.js';

export const settingsRoutes = Router();
settingsRoutes.use(authenticate, resolveBranch);
settingsRoutes.get('/', SettingsController.all);
settingsRoutes.put('/:key', requirePermission('settings.manage'), SettingsController.update);

export const notificationRoutes = Router();
notificationRoutes.use(authenticate, resolveBranch);
notificationRoutes.get('/', async (req, res) => {
  ok(res, await NotificationService.list([req.branchId!], { unreadOnly: req.query.unread === 'true' }));
});
notificationRoutes.post('/read-all', async (req, res) => {
  await NotificationService.markRead([req.branchId!]);
  ok(res, { ok: true });
});
notificationRoutes.post('/:id/read', async (req, res) => {
  await NotificationService.markRead([req.branchId!], String(req.params.id));
  ok(res, { ok: true });
});

/** Active branches (id, code, name) — e.g. transfer destinations. Full branch admin lives under settings. */
export const branchRoutes = Router();
branchRoutes.use(authenticate);
branchRoutes.get('/', async (_req, res) => {
  ok(res, await prisma.branch.findMany({ where: { status: 'ACTIVE' }, select: { id: true, code: true, name: true, city: true }, orderBy: { name: 'asc' } }));
});
