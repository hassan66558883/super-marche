import { Router } from 'express';
import { authenticate, requireAnyPermission, requirePermission, resolveBranch } from '../middleware/auth.js';
import { PurchaseController as P, StockController as S, SupplierController as Su, TransferController as T } from '../controllers/stock.controller.js';

export const inventoryRoutes = Router();
inventoryRoutes.use(authenticate, resolveBranch);
inventoryRoutes.get('/summary', requirePermission('inventory.view'), S.summary);
inventoryRoutes.get('/movements', requirePermission('inventory.view'), S.movements);
inventoryRoutes.post('/adjust', requirePermission('inventory.adjust'), S.adjust);

export const transferRoutes = Router();
transferRoutes.use(authenticate, resolveBranch);
transferRoutes.get('/', requirePermission('transfers.view'), T.list);
transferRoutes.get('/:id', requirePermission('transfers.view'), T.get);
transferRoutes.post('/', requirePermission('transfers.create'), T.create);
transferRoutes.put('/:id', requirePermission('transfers.create'), T.update);
transferRoutes.post('/:id/approve', requirePermission('transfers.approve'), T.approve);
transferRoutes.post('/:id/ship', requirePermission('transfers.approve'), T.ship);
transferRoutes.post('/:id/receive', requirePermission('transfers.receive'), T.receive);
transferRoutes.post('/:id/cancel', requireAnyPermission('transfers.create', 'transfers.approve'), T.cancel);

export const purchaseRoutes = Router();
purchaseRoutes.use(authenticate, resolveBranch);
purchaseRoutes.get('/', requirePermission('purchases.view'), P.list);
purchaseRoutes.get('/:id', requirePermission('purchases.view'), P.get);
purchaseRoutes.post('/', requirePermission('purchases.create'), P.create);
purchaseRoutes.put('/:id', requirePermission('purchases.create'), P.update);
purchaseRoutes.post('/:id/submit', requirePermission('purchases.create'), P.submit);
purchaseRoutes.post('/:id/approve', requirePermission('purchases.approve'), P.approve);
purchaseRoutes.post('/:id/receive', requirePermission('purchases.receive'), P.receive);
purchaseRoutes.post('/:id/cancel', requireAnyPermission('purchases.create', 'purchases.approve'), P.cancel);

export const supplierRoutes = Router();
supplierRoutes.use(authenticate, resolveBranch);
supplierRoutes.get('/', requireAnyPermission('suppliers.view', 'purchases.create'), Su.list);
supplierRoutes.get('/:id', requirePermission('suppliers.view'), Su.get);
supplierRoutes.get('/:id/ledger', requirePermission('suppliers.view'), Su.ledger);
supplierRoutes.get('/:id/purchases', requirePermission('suppliers.view'), Su.purchases);
supplierRoutes.post('/', requirePermission('suppliers.manage'), Su.create);
supplierRoutes.put('/:id', requirePermission('suppliers.manage'), Su.update);
supplierRoutes.post('/:id/payments', requirePermission('suppliers.manage'), Su.pay);
