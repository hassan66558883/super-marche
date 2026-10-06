import { Router } from 'express';
import { authenticate, requireAnyPermission, requirePermission, resolveBranch } from '../middleware/auth.js';
import { AuditController as A, RoleController as R, UserController as U } from '../controllers/admin.controller.js';

export const userRoutes = Router();
userRoutes.use(authenticate);
userRoutes.get('/', requirePermission('users.view'), U.list);
userRoutes.get('/:id', requirePermission('users.view'), U.get);
userRoutes.post('/', requirePermission('users.create'), U.create);
userRoutes.put('/:id', requirePermission('users.edit'), U.update);
userRoutes.post('/:id/status', requirePermission('users.delete'), U.status);
userRoutes.post('/:id/password', requirePermission('users.edit'), U.password);

export const roleRoutes = Router();
roleRoutes.use(authenticate);
roleRoutes.get('/', requireAnyPermission('users.view', 'roles.manage'), R.list);
roleRoutes.get('/permissions', requireAnyPermission('users.view', 'roles.manage'), R.permissions);
roleRoutes.post('/', requirePermission('roles.manage'), R.create);
roleRoutes.put('/:id', requirePermission('roles.manage'), R.update);
roleRoutes.delete('/:id', requirePermission('roles.manage'), R.remove);

// Read-only by design: no PUT/PATCH/DELETE route exists for the audit journal
export const auditRoutes = Router();
auditRoutes.use(authenticate, resolveBranch);
auditRoutes.get('/', requirePermission('audit.view'), A.list);
auditRoutes.get('/meta', requirePermission('audit.view'), A.meta);
