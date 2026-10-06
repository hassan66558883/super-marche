import type { Request, Response } from 'express';
import { ProductService } from '../services/product.service.js';
import { parseBody, parseQuery } from '../middleware/validate.js';
import { posSearchQuery, productInput, productListQuery } from '../validators/catalog.validators.js';
import { created, ok, pageMeta } from '../utils/http.js';
import { notFound } from '../utils/errors.js';

export const ProductController = {
  async list(req: Request, res: Response) {
    const q = parseQuery(productListQuery, req);
    const { items, total } = await ProductService.list(req, q);
    return ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
  async posSearch(req: Request, res: Response) {
    const q = parseQuery(posSearchQuery, req);
    const { items, total, exact } = await ProductService.posSearch(req, q);
    return ok(res, items, { ...pageMeta(q.page, q.pageSize, total), exact });
  },
  async byCode(req: Request, res: Response) {
    const hit = await ProductService.findByCode(req, String(req.params.code).trim());
    if (!hit) throw notFound('PRODUCT_NOT_FOUND', 'Produit introuvable');
    return ok(res, hit);
  },
  async get(req: Request, res: Response) {
    return ok(res, await ProductService.get(req, String(req.params.id)));
  },
  async create(req: Request, res: Response) {
    return created(res, await ProductService.create(req, parseBody(productInput, req)));
  },
  async update(req: Request, res: Response) {
    return ok(res, await ProductService.update(req, String(req.params.id), parseBody(productInput, req)));
  },
  async remove(req: Request, res: Response) {
    return ok(res, await ProductService.remove(req, String(req.params.id)));
  },
  async generateBarcode(_req: Request, res: Response) {
    return ok(res, { barcode: await ProductService.generateBarcode() });
  },
  async nextSku(req: Request, res: Response) {
    return ok(res, { sku: await ProductService.nextSku(String(req.query.prefix ?? 'PRD')) });
  },
};
