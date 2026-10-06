import { Router } from 'express';
import { authenticate, requirePermission, resolveBranch } from '../middleware/auth.js';
import { ProductController as P } from '../controllers/product.controller.js';
import { BrandController as B, CategoryController as C, TaxController as T, UnitController as U } from '../controllers/catalog.controller.js';
import { CustomerController as Cu } from '../controllers/customer.controller.js';
import { CustomerPaymentController } from '../controllers/sale.controller.js';

export const productRoutes = Router();
productRoutes.use(authenticate, resolveBranch);
productRoutes.get('/', requirePermission('products.view'), P.list);
productRoutes.get('/pos', requirePermission('sales.create'), P.posSearch);
productRoutes.get('/code/:code', requirePermission('products.view'), P.byCode);
productRoutes.get('/generate-barcode', requirePermission('products.create'), P.generateBarcode);
productRoutes.get('/next-sku', requirePermission('products.create'), P.nextSku);
productRoutes.get('/:id', requirePermission('products.view'), P.get);
productRoutes.post('/', requirePermission('products.create'), P.create);
productRoutes.put('/:id', requirePermission('products.edit'), P.update);
productRoutes.delete('/:id', requirePermission('products.delete'), P.remove);

export const categoryRoutes = Router();
categoryRoutes.use(authenticate, resolveBranch);
categoryRoutes.get('/', C.list);
categoryRoutes.post('/', requirePermission('categories.manage'), C.create);
categoryRoutes.put('/:id', requirePermission('categories.manage'), C.update);
categoryRoutes.delete('/:id', requirePermission('categories.manage'), C.remove);

export const brandRoutes = Router();
brandRoutes.use(authenticate);
brandRoutes.get('/', B.list);
brandRoutes.post('/', requirePermission('categories.manage'), B.create);
brandRoutes.put('/:id', requirePermission('categories.manage'), B.update);
brandRoutes.delete('/:id', requirePermission('categories.manage'), B.remove);

export const unitRoutes = Router();
unitRoutes.use(authenticate);
unitRoutes.get('/', U.list);
unitRoutes.post('/', requirePermission('categories.manage'), U.create);
unitRoutes.put('/:id', requirePermission('categories.manage'), U.update);
unitRoutes.delete('/:id', requirePermission('categories.manage'), U.remove);

export const taxRoutes = Router();
taxRoutes.use(authenticate);
taxRoutes.get('/', T.list);
taxRoutes.post('/', requirePermission('settings.manage'), T.create);
taxRoutes.put('/:id', requirePermission('settings.manage'), T.update);

export const customerRoutes = Router();
customerRoutes.use(authenticate, resolveBranch);
customerRoutes.get('/', requirePermission('customers.view'), Cu.list);
customerRoutes.get('/:id', requirePermission('customers.view'), Cu.get);
customerRoutes.get('/:id/ledger', requirePermission('customers.view'), Cu.ledger);
customerRoutes.get('/:id/invoices', requirePermission('customers.view'), Cu.invoices);
customerRoutes.post('/', requirePermission('customers.create'), Cu.create);
customerRoutes.post('/:id/payments', requirePermission('customers.payment'), CustomerPaymentController.create);
customerRoutes.put('/:id', requirePermission('customers.edit'), Cu.update);
