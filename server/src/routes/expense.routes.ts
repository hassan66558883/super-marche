import { Router } from 'express';
import { authenticate, requireAnyPermission, requirePermission, resolveBranch } from '../middleware/auth.js';
import { ExpenseController as E } from '../controllers/expense.controller.js';

export const expenseRoutes = Router();
expenseRoutes.use(authenticate, resolveBranch);
expenseRoutes.get('/categories', requireAnyPermission('expenses.view', 'expenses.create'), E.categories);
expenseRoutes.post('/categories', requirePermission('settings.manage'), E.createCategory);
expenseRoutes.put('/categories/:id', requirePermission('settings.manage'), E.updateCategory);
expenseRoutes.get('/', requirePermission('expenses.view'), E.list);
expenseRoutes.get('/:id', requirePermission('expenses.view'), E.get);
expenseRoutes.post('/', requirePermission('expenses.create'), E.create);
expenseRoutes.post('/:id/void', requirePermission('expenses.void'), E.void);
