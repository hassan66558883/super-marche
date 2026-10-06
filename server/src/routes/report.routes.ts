import { Router } from 'express';
import { authenticate, requirePermission, resolveBranch } from '../middleware/auth.js';
import { ReportController as R } from '../controllers/report.controller.js';

export const reportRoutes = Router();
reportRoutes.use(authenticate, resolveBranch);
reportRoutes.get('/', requirePermission('reports.view'), R.catalog);
reportRoutes.get('/:type', requirePermission('reports.view'), R.run);
reportRoutes.get('/:type/export', requirePermission('reports.export'), R.export);

export const dashboardRoutes = Router();
dashboardRoutes.use(authenticate, resolveBranch);
dashboardRoutes.get('/', requirePermission('dashboard.view'), R.dashboard);
