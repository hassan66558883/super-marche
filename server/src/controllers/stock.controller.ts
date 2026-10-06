import type { Request, Response } from 'express';
import { StockService } from '../services/stock.service.js';
import { TransferService } from '../services/transfer.service.js';
import { PurchaseService } from '../services/purchase.service.js';
import { SupplierService } from '../services/supplier.service.js';
import { parseBody, parseQuery } from '../middleware/validate.js';
import {
  adjustInput, movementQuery, purchaseInput, purchaseListQuery, receivePurchaseInput, receiveTransferInput,
  supplierListQuery, supplierPaymentInput, transferInput, transferListQuery,
} from '../validators/stock.validators.js';
import { supplierInput } from '../validators/customer.validators.js';
import { cancelInput } from '../validators/sale.validators.js';
import { created, ok, pageMeta } from '../utils/http.js';
import { pageQuery } from '../utils/pagination.js';

const id = (req: Request) => String(req.params.id);

export const StockController = {
  async summary(req: Request, res: Response) { return ok(res, await StockService.summary(req)); },
  async adjust(req: Request, res: Response) { return created(res, await StockService.adjust(req, parseBody(adjustInput, req))); },
  async movements(req: Request, res: Response) {
    const q = parseQuery(movementQuery, req);
    const { items, total } = await StockService.movements(req, q);
    return ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
};

export const TransferController = {
  async list(req: Request, res: Response) {
    const q = parseQuery(transferListQuery, req);
    const { items, total } = await TransferService.list(req, q);
    return ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
  async get(req: Request, res: Response) { return ok(res, await TransferService.get(req, id(req))); },
  async create(req: Request, res: Response) { return created(res, await TransferService.create(req, parseBody(transferInput, req))); },
  async update(req: Request, res: Response) { return ok(res, await TransferService.update(req, id(req), parseBody(transferInput, req))); },
  async approve(req: Request, res: Response) { return ok(res, await TransferService.approve(req, id(req))); },
  async ship(req: Request, res: Response) { return ok(res, await TransferService.ship(req, id(req))); },
  async receive(req: Request, res: Response) { return ok(res, await TransferService.receive(req, id(req), parseBody(receiveTransferInput, req))); },
  async cancel(req: Request, res: Response) { return ok(res, await TransferService.cancel(req, id(req), parseBody(cancelInput, req).reason)); },
};

export const PurchaseController = {
  async list(req: Request, res: Response) {
    const q = parseQuery(purchaseListQuery, req);
    const { items, total } = await PurchaseService.list(req, q);
    return ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
  async get(req: Request, res: Response) { return ok(res, await PurchaseService.get(req, id(req))); },
  async create(req: Request, res: Response) { return created(res, await PurchaseService.create(req, parseBody(purchaseInput, req))); },
  async update(req: Request, res: Response) { return ok(res, await PurchaseService.update(req, id(req), parseBody(purchaseInput, req))); },
  async submit(req: Request, res: Response) { return ok(res, await PurchaseService.submit(req, id(req))); },
  async approve(req: Request, res: Response) { return ok(res, await PurchaseService.approve(req, id(req))); },
  async receive(req: Request, res: Response) { return ok(res, await PurchaseService.receive(req, id(req), parseBody(receivePurchaseInput, req))); },
  async cancel(req: Request, res: Response) { return ok(res, await PurchaseService.cancel(req, id(req), parseBody(cancelInput, req).reason)); },
};

export const SupplierController = {
  async list(req: Request, res: Response) {
    const q = parseQuery(supplierListQuery, req);
    const { items, total } = await SupplierService.list(q);
    return ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
  async get(req: Request, res: Response) { return ok(res, await SupplierService.get(id(req))); },
  async create(req: Request, res: Response) { return created(res, await SupplierService.create(req, parseBody(supplierInput, req))); },
  async update(req: Request, res: Response) { return ok(res, await SupplierService.update(req, id(req), parseBody(supplierInput, req))); },
  async ledger(req: Request, res: Response) {
    const q = parseQuery(pageQuery, req);
    const { items, total } = await SupplierService.ledger(id(req), q.page, q.pageSize);
    return ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
  async purchases(req: Request, res: Response) {
    const q = parseQuery(purchaseListQuery, req);
    const { items, total } = await PurchaseService.list(req, { ...q, supplierId: id(req) });
    return ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
  async pay(req: Request, res: Response) { return created(res, await SupplierService.pay(req, id(req), parseBody(supplierPaymentInput, req))); },
};
