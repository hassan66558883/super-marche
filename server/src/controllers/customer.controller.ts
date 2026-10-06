import type { Request, Response } from 'express';
import { CustomerService } from '../services/customer.service.js';
import { parseBody, parseQuery } from '../middleware/validate.js';
import { customerInput, customerListQuery } from '../validators/customer.validators.js';
import { created, ok, pageMeta } from '../utils/http.js';
import { pageQuery } from '../utils/pagination.js';

export const CustomerController = {
  async list(req: Request, res: Response) {
    const q = parseQuery(customerListQuery, req);
    const { items, total } = await CustomerService.list(q);
    return ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
  async get(req: Request, res: Response) {
    return ok(res, await CustomerService.get(String(req.params.id)));
  },
  async create(req: Request, res: Response) {
    return created(res, await CustomerService.create(req, parseBody(customerInput, req)));
  },
  async update(req: Request, res: Response) {
    return ok(res, await CustomerService.update(req, String(req.params.id), parseBody(customerInput, req)));
  },
  async ledger(req: Request, res: Response) {
    const q = parseQuery(pageQuery, req);
    const { items, total } = await CustomerService.ledger(String(req.params.id), q.page, q.pageSize);
    return ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
  async invoices(req: Request, res: Response) {
    return ok(res, await CustomerService.invoices(String(req.params.id), req.query.open === 'true'));
  },
};
