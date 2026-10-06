import type { Request, Response } from 'express';
import { ExpenseService } from '../services/expense.service.js';
import { parseBody, parseQuery } from '../middleware/validate.js';
import { expenseCategoryInput, expenseInput, expenseListQuery, voidExpenseInput } from '../validators/expense.validators.js';
import { created, ok, pageMeta } from '../utils/http.js';

const id = (req: Request) => String(req.params.id);

export const ExpenseController = {
  async list(req: Request, res: Response) {
    const q = parseQuery(expenseListQuery, req);
    const { items, total, totalAmount } = await ExpenseService.list(req, q);
    return ok(res, items, { ...pageMeta(q.page, q.pageSize, total), totalAmount });
  },
  async get(req: Request, res: Response) { return ok(res, await ExpenseService.get(req, id(req))); },
  async create(req: Request, res: Response) { return created(res, await ExpenseService.create(req, parseBody(expenseInput, req))); },
  async void(req: Request, res: Response) { return ok(res, await ExpenseService.void(req, id(req), parseBody(voidExpenseInput, req).reason)); },
  async categories(req: Request, res: Response) { return ok(res, await ExpenseService.categories(req.query.all === 'true')); },
  async createCategory(req: Request, res: Response) { return created(res, await ExpenseService.createCategory(req, parseBody(expenseCategoryInput, req))); },
  async updateCategory(req: Request, res: Response) { return ok(res, await ExpenseService.updateCategory(req, id(req), parseBody(expenseCategoryInput, req))); },
};
