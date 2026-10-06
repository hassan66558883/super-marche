import { Router } from 'express';
import { authenticate, requireAnyPermission, requirePermission, resolveBranch } from '../middleware/auth.js';
import { CashController as Ca, HeldSaleController as H, PaymentMethodController as PM, ReturnController as R, SaleController as S } from '../controllers/sale.controller.js';

export const saleRoutes = Router();
saleRoutes.use(authenticate, resolveBranch);
saleRoutes.get('/', requirePermission('sales.view'), S.list);
saleRoutes.get('/invoice/:number', requireAnyPermission('sales.view', 'sales.return'), S.byInvoice);
saleRoutes.get('/:id', requirePermission('sales.view'), S.get);
saleRoutes.post('/', requirePermission('sales.create'), S.create);
saleRoutes.post('/:id/cancel', requirePermission('sales.cancel'), S.cancel);
saleRoutes.post('/:id/returns', requirePermission('sales.return'), S.createReturn);

export const returnRoutes = Router();
returnRoutes.use(authenticate, resolveBranch);
returnRoutes.get('/', requireAnyPermission('sales.return', 'sales.view_all'), R.list);
returnRoutes.get('/:id', requireAnyPermission('sales.return', 'sales.view'), R.get);

export const heldSaleRoutes = Router();
heldSaleRoutes.use(authenticate, resolveBranch, requirePermission('sales.create'));
heldSaleRoutes.get('/', H.list);
heldSaleRoutes.post('/', H.create);
heldSaleRoutes.post('/:id/resume', H.take);

export const paymentMethodRoutes = Router();
paymentMethodRoutes.use(authenticate);
paymentMethodRoutes.get('/', PM.list);

export const cashRoutes = Router();
cashRoutes.use(authenticate, resolveBranch);
cashRoutes.get('/registers', requireAnyPermission('cash.operate', 'cash.view'), Ca.registers);
cashRoutes.get('/current', requireAnyPermission('cash.operate', 'sales.create'), Ca.current);
cashRoutes.get('/sessions', requireAnyPermission('cash.operate', 'cash.view'), Ca.sessions);
cashRoutes.get('/sessions/:id', requireAnyPermission('cash.operate', 'cash.view'), Ca.summary);
cashRoutes.post('/open', requirePermission('cash.operate'), Ca.open);
cashRoutes.post('/sessions/:id/cash-in', requireAnyPermission('cash.operate', 'cash.manage'), Ca.cashIn);
cashRoutes.post('/sessions/:id/cash-out', requireAnyPermission('cash.operate', 'cash.manage'), Ca.cashOut);
cashRoutes.post('/sessions/:id/close', requireAnyPermission('cash.operate', 'cash.manage'), Ca.close);
