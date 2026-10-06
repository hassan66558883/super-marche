import { z } from 'zod';
import { pageQuery, dateRange } from '../utils/pagination.js';
import { passwordSchema } from './auth.validators.js';
import { ALL_PERMISSIONS } from '../config/permissions.js';

const id = z.string().uuid();

export const userListQuery = pageQuery.extend({
  status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED']).optional(),
  roleId: id.optional(),
  branchId: id.optional(),
});

const userBase = z.object({
  username: z.string().trim().toLowerCase().min(3).max(40).regex(/^[a-z0-9._-]+$/, 'Lettres minuscules, chiffres, . _ - uniquement'),
  email: z.string().trim().toLowerCase().email().max(120).optional().nullable().or(z.literal('').transform(() => null)),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  roleIds: z.array(id).min(1, 'Au moins un rôle'),
  branchIds: z.array(id).min(1, 'Au moins une succursale'),
  defaultBranchId: id,
  locale: z.enum(['fr', 'ar', 'en']).default('fr'),
});

const branchCheck = <T extends { branchIds: string[]; defaultBranchId: string }>(s: z.ZodType<T>) =>
  s.refine((v) => v.branchIds.includes(v.defaultBranchId), { message: 'La succursale par défaut doit faire partie des succursales', path: ['defaultBranchId'] });

export const userCreateInput = branchCheck(userBase.extend({ password: passwordSchema }));
export const userUpdateInput = branchCheck(userBase);
export const userStatusInput = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) });
export const userPasswordInput = z.object({ password: passwordSchema });

export const roleInput = z.object({
  code: z.string().trim().toUpperCase().min(2).max(40).regex(/^[A-Z0-9_]+$/, 'Majuscules, chiffres et _ uniquement'),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(250).optional().nullable(),
  maxDiscountPercent: z.coerce.number().min(0).max(100),
  permissions: z.array(z.enum(ALL_PERMISSIONS as [string, ...string[]])).max(ALL_PERMISSIONS.length),
});

export const auditListQuery = pageQuery.merge(dateRange).extend({
  userId: id.optional(),
  action: z.string().max(40).optional(),
  module: z.string().max(40).optional(),
  recordId: z.string().max(80).optional(),
  scope: z.enum(['branch', 'all']).optional(),
});

export const branchInput = z.object({
  code: z.string().trim().toUpperCase().min(2).max(6).regex(/^[A-Z0-9]+$/, 'Lettres majuscules et chiffres'),
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(300).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().max(120).optional().nullable().or(z.literal('').transform(() => null)),
  defaultTaxId: z.string().uuid().optional().nullable(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});

export const registerInput = z.object({ name: z.string().trim().min(2).max(60), status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE') });

export const paymentMethodInput = z.object({
  code: z.string().trim().toUpperCase().min(2).max(40).regex(/^[A-Z0-9_]+$/),
  name: z.string().trim().min(2).max(60),
  type: z.enum(['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CREDIT', 'OTHER']),
  provider: z.string().trim().max(40).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});
