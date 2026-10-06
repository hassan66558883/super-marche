import { Router } from 'express';
import { z } from 'zod';
import { PrintService } from '../services/print.service.js';
import { authenticate, requirePermission, resolveBranch } from '../middleware/auth.js';
import { SettingsController } from '../controllers/settings.controller.js';
import { NotificationService } from '../services/notification.service.js';
import { ok } from '../utils/http.js';
import { prisma } from '../utils/prisma.js';
import { BranchService, PaymentMethodService } from '../services/branch.service.js';
import { parseBody } from '../middleware/validate.js';
import { branchInput, paymentMethodInput, registerInput } from '../validators/admin.validators.js';
import { created } from '../utils/http.js';
import { requireAnyPermission } from '../middleware/auth.js';

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
branchRoutes.get('/manage', requireAnyPermission('branches.manage', 'settings.manage'), async (_req, res) => ok(res, await BranchService.listAll()));
branchRoutes.post('/', requirePermission('branches.manage'), async (req, res) => created(res, await BranchService.save(req, null, parseBody(branchInput, req))));
branchRoutes.put('/:id', requirePermission('branches.manage'), async (req, res) => ok(res, await BranchService.save(req, String(req.params.id), parseBody(branchInput, req))));
branchRoutes.post('/:id/registers', requirePermission('branches.manage'), async (req, res) => created(res, await BranchService.saveRegister(req, String(req.params.id), null, parseBody(registerInput, req))));
branchRoutes.put('/:id/registers/:registerId', requirePermission('branches.manage'), async (req, res) =>
  ok(res, await BranchService.saveRegister(req, String(req.params.id), String(req.params.registerId), parseBody(registerInput, req))));

/** Payment methods administration (the POS reads the active list from /payment-methods) */
export const paymentMethodAdminRoutes = Router();
paymentMethodAdminRoutes.use(authenticate, requirePermission('settings.manage'));
paymentMethodAdminRoutes.get('/', async (_req, res) => ok(res, await PaymentMethodService.list(true)));
paymentMethodAdminRoutes.post('/', async (req, res) => created(res, await PaymentMethodService.save(req, null, parseBody(paymentMethodInput, req))));
paymentMethodAdminRoutes.put('/:id', async (req, res) => ok(res, await PaymentMethodService.save(req, String(req.params.id), parseBody(paymentMethodInput, req))));

const printInput = z.object({ data: z.string().min(4).max(400_000).regex(/^[A-Za-z0-9+/]+=*$/) });
export const printRoutes = Router();
printRoutes.use(authenticate, resolveBranch, requireAnyPermission('sales.create', 'sales.view', 'cash.operate', 'settings.manage'));
printRoutes.post('/escpos', async (req, res) => ok(res, await PrintService.sendEscPos(req.branchId!, parseBody(printInput, req).data)));
