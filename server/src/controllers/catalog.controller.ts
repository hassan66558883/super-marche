import type { Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { parseBody } from '../middleware/validate.js';
import { brandInput, categoryInput, taxInput, unitInput } from '../validators/catalog.validators.js';
import { created, ok } from '../utils/http.js';
import { conflict, notFound } from '../utils/errors.js';
import { toDb } from '../utils/money.js';
import { AuditService } from '../services/audit.service.js';

const audit = (req: Request, action: 'CREATE' | 'UPDATE' | 'DELETE', module: string, id: string, description: string) =>
  AuditService.log({ action, module, recordId: id, description }, req);

export const CategoryController = {
  async list(req: Request, res: Response) {
    const all = req.query.status === 'ALL';
    const rows = await prisma.category.findMany({
      where: all ? {} : { status: 'ACTIVE' },
      include: { tax: { select: { id: true, name: true, rate: true } }, _count: { select: { products: { where: { status: 'ACTIVE' } } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return ok(res, rows.map(({ _count, ...c }) => ({ ...c, productCount: _count.products })));
  },
  async create(req: Request, res: Response) {
    const data = parseBody(categoryInput, req);
    const c = await prisma.category.create({ data });
    await audit(req, 'CREATE', 'categories', c.id, `Catégorie créée : ${c.name}`);
    return created(res, c);
  },
  async update(req: Request, res: Response) {
    const id = String(req.params.id);
    const data = parseBody(categoryInput, req);
    if (data.parentId === id) throw conflict('INVALID_PARENT', 'Une catégorie ne peut pas être sa propre parente');
    const c = await prisma.category.update({ where: { id }, data });
    await audit(req, 'UPDATE', 'categories', id, `Catégorie modifiée : ${c.name}`);
    return ok(res, c);
  },
  async remove(req: Request, res: Response) {
    const id = String(req.params.id);
    const c = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } } } });
    if (!c) throw notFound('CATEGORY_NOT_FOUND', 'Catégorie introuvable');
    if (c._count.products || c._count.children) {
      await prisma.category.update({ where: { id }, data: { status: 'INACTIVE' } });
      await audit(req, 'UPDATE', 'categories', id, `Catégorie désactivée : ${c.name}`);
      return ok(res, { deleted: false, deactivated: true });
    }
    await prisma.category.delete({ where: { id } });
    await audit(req, 'DELETE', 'categories', id, `Catégorie supprimée : ${c.name}`);
    return ok(res, { deleted: true });
  },
};

export const BrandController = {
  async list(_req: Request, res: Response) {
    const rows = await prisma.brand.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } });
    return ok(res, rows.map(({ _count, ...b }) => ({ ...b, productCount: _count.products })));
  },
  async create(req: Request, res: Response) {
    const b = await prisma.brand.create({ data: parseBody(brandInput, req) });
    await audit(req, 'CREATE', 'brands', b.id, `Marque créée : ${b.name}`);
    return created(res, b);
  },
  async update(req: Request, res: Response) {
    const b = await prisma.brand.update({ where: { id: String(req.params.id) }, data: parseBody(brandInput, req) });
    await audit(req, 'UPDATE', 'brands', b.id, `Marque modifiée : ${b.name}`);
    return ok(res, b);
  },
  async remove(req: Request, res: Response) {
    const id = String(req.params.id);
    const used = await prisma.product.count({ where: { brandId: id } });
    if (used) {
      await prisma.brand.update({ where: { id }, data: { status: 'INACTIVE' } });
      return ok(res, { deleted: false, deactivated: true });
    }
    const b = await prisma.brand.delete({ where: { id } });
    await audit(req, 'DELETE', 'brands', id, `Marque supprimée : ${b.name}`);
    return ok(res, { deleted: true });
  },
};

export const UnitController = {
  async list(_req: Request, res: Response) {
    return ok(res, await prisma.unit.findMany({ orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] }));
  },
  async create(req: Request, res: Response) {
    const u = await prisma.unit.create({ data: parseBody(unitInput, req) });
    await audit(req, 'CREATE', 'units', u.id, `Unité créée : ${u.name}`);
    return created(res, u);
  },
  async update(req: Request, res: Response) {
    const u = await prisma.unit.update({ where: { id: String(req.params.id) }, data: parseBody(unitInput, req) });
    await audit(req, 'UPDATE', 'units', u.id, `Unité modifiée : ${u.name}`);
    return ok(res, u);
  },
  async remove(req: Request, res: Response) {
    const id = String(req.params.id);
    const u = await prisma.unit.findUnique({ where: { id } });
    if (!u) throw notFound('UNIT_NOT_FOUND', 'Unité introuvable');
    if (u.isSystem) throw conflict('SYSTEM_UNIT', 'Les unités système ne peuvent pas être supprimées');
    if (await prisma.product.count({ where: { unitId: id } })) throw conflict('UNIT_IN_USE', 'Unité utilisée par des produits');
    await prisma.unit.delete({ where: { id } });
    await audit(req, 'DELETE', 'units', id, `Unité supprimée : ${u.name}`);
    return ok(res, { deleted: true });
  },
};

export const TaxController = {
  async list(_req: Request, res: Response) {
    return ok(res, await prisma.tax.findMany({ orderBy: { rate: 'desc' } }));
  },
  async create(req: Request, res: Response) {
    const d = parseBody(taxInput, req);
    const t = await prisma.tax.create({ data: { ...d, rate: toDb(d.rate) } });
    await audit(req, 'CREATE', 'taxes', t.id, `Taxe créée : ${t.name}`);
    return created(res, t);
  },
  async update(req: Request, res: Response) {
    const d = parseBody(taxInput, req);
    const t = await prisma.tax.update({ where: { id: String(req.params.id) }, data: { ...d, rate: toDb(d.rate) } });
    await audit(req, 'UPDATE', 'taxes', t.id, `Taxe modifiée : ${t.name} (${d.rate}%)`);
    return ok(res, t);
  },
};
