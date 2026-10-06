import type { Request, Response } from 'express';
import { parseBody, parseQuery } from '../middleware/validate.js';
import { created, ok, pageMeta } from '../utils/http.js';
import { UserService, RoleService } from '../services/user.service.js';
import { AuditService } from '../services/audit.service.js';
import {
  auditListQuery, roleInput, userCreateInput, userListQuery, userPasswordInput, userStatusInput, userUpdateInput,
} from '../validators/admin.validators.js';

const id = (req: Request) => String(req.params.id);

export const UserController = {
  async list(req: Request, res: Response) {
    const q = parseQuery(userListQuery, req);
    const { items, total } = await UserService.list(q);
    return ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
  async get(req: Request, res: Response) { return ok(res, await UserService.get(id(req))); },
  async create(req: Request, res: Response) { return created(res, await UserService.create(req, parseBody(userCreateInput, req))); },
  async update(req: Request, res: Response) { return ok(res, await UserService.update(req, id(req), parseBody(userUpdateInput, req))); },
  async status(req: Request, res: Response) { return ok(res, await UserService.setStatus(req, id(req), parseBody(userStatusInput, req).status)); },
  async password(req: Request, res: Response) { return ok(res, await UserService.resetPassword(req, id(req), parseBody(userPasswordInput, req).password)); },
};

export const RoleController = {
  async list(_req: Request, res: Response) { return ok(res, await RoleService.list()); },
  async permissions(_req: Request, res: Response) { return ok(res, await RoleService.permissions()); },
  async create(req: Request, res: Response) { return created(res, await RoleService.save(req, null, parseBody(roleInput, req))); },
  async update(req: Request, res: Response) { return ok(res, await RoleService.save(req, id(req), parseBody(roleInput, req))); },
  async remove(req: Request, res: Response) { return ok(res, await RoleService.remove(req, id(req))); },
};

export const AuditController = {
  async list(req: Request, res: Response) {
    const q = parseQuery(auditListQuery, req);
    const { items, total } = await AuditService.list(req, q);
    return ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
  async meta(_req: Request, res: Response) { return ok(res, await AuditService.meta()); },
};
