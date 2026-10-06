import type { Response } from 'express';
import { serialize } from './serialize.js';

export type PageMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const ok = <T>(res: Response, data: T, meta?: object, status = 200) =>
  res.status(status).json({ success: true, data: serialize(data), ...(meta ? { meta } : {}) });

export const created = <T>(res: Response, data: T) => ok(res, data, undefined, 201);

export const pageMeta = (page: number, pageSize: number, total: number): PageMeta => ({
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});
