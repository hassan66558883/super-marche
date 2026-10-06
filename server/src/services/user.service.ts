import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { paging } from '../utils/pagination.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { AuditService } from './audit.service.js';
import { AuthService, hashPassword } from './auth.service.js';
import type { PermissionCode } from '../config/permissions.js';
import type { roleInput, userCreateInput, userListQuery, userUpdateInput } from '../validators/admin.validators.js';

/** Never select password hashes or tokens */
const userSelect = {
  id: true, username: true, email: true, fullName: true, phone: true, status: true, locale: true,
  defaultBranchId: true, lastLoginAt: true, lockedUntil: true, failedLoginCount: true, createdAt: true,
  roles: { select: { role: { select: { id: true, code: true, name: true } } } },
  branches: { select: { branch: { select: { id: true, code: true, name: true } } } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;
const shape = (u: UserRow) => ({
  ...u,
  locked: u.status === 'LOCKED' || (!!u.lockedUntil && u.lockedUntil > new Date()),
  roles: u.roles.map((r) => r.role),
  branches: u.branches.map((b) => b.branch),
});

const isSuperAdmin = (req: Request) => req.auth!.roles.includes('SUPER_ADMIN');

/**
 * Privilege escalation guard: only a super administrator may hand out permissions
 * they do not hold themselves (directly or by assigning a role).
 */
async function assertCanGrant(req: Request, roleIds: string[]) {
  if (isSuperAdmin(req)) return;
  const roles = await prisma.role.findMany({ where: { id: { in: roleIds } }, include: { permissions: { include: { permission: true } } } });
  if (roles.length !== roleIds.length) throw badRequest('ROLE_NOT_FOUND', 'Rôle introuvable');
  for (const r of roles) {
    if (r.code === 'SUPER_ADMIN') throw forbidden('Seul un super administrateur peut attribuer ce rôle', 'ROLE_FORBIDDEN');
    const extra = r.permissions.map((p) => p.permission.code).filter((c) => !req.auth!.permissions.has(c as PermissionCode));
    if (extra.length) throw forbidden(`Le rôle « ${r.name} » donne des droits que vous n’avez pas (${extra.slice(0, 3).join(', ')}…)`, 'ROLE_FORBIDDEN');
  }
}

async function assertManageable(req: Request, userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
  if (!target) throw notFound('USER_NOT_FOUND', 'Utilisateur introuvable');
  if (target.roles.some((r) => r.role.code === 'SUPER_ADMIN') && !isSuperAdmin(req)) {
    throw forbidden('Seul un super administrateur peut modifier ce compte', 'USER_FORBIDDEN');
  }
  return target;
}

async function assertBranches(ids: string[]) {
  const n = await prisma.branch.count({ where: { id: { in: ids } } });
  if (n !== ids.length) throw badRequest('BRANCH_NOT_FOUND', 'Succursale introuvable');
}

async function uniqueness(username: string, email: string | null | undefined, exceptId?: string) {
  const clash = await prisma.user.findFirst({
    where: { id: exceptId ? { not: exceptId } : undefined, OR: [{ username }, ...(email ? [{ email }] : [])] },
    select: { username: true },
  });
  if (clash) throw conflict(clash.username === username ? 'USERNAME_TAKEN' : 'EMAIL_TAKEN', clash.username === username ? 'Nom d’utilisateur déjà utilisé' : 'Adresse e-mail déjà utilisée');
}

export const UserService = {
  async list(q: z.infer<typeof userListQuery>) {
    const where: Prisma.UserWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.roleId ? { roles: { some: { roleId: q.roleId } } } : {}),
      ...(q.branchId ? { branches: { some: { branchId: q.branchId } } } : {}),
      ...(q.search ? { OR: [
        { fullName: { contains: q.search, mode: 'insensitive' } },
        { username: { contains: q.search, mode: 'insensitive' } },
        { email: { contains: q.search, mode: 'insensitive' } },
        { phone: { contains: q.search } },
      ] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.user.findMany({ where, select: userSelect, orderBy: { fullName: 'asc' }, ...paging(q) }),
      prisma.user.count({ where }),
    ]);
    return { items: items.map(shape), total };
  },

  async get(id: string) {
    const u = await prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!u) throw notFound('USER_NOT_FOUND', 'Utilisateur introuvable');
    return shape(u);
  },

  async create(req: Request, input: z.infer<typeof userCreateInput>) {
    await uniqueness(input.username, input.email);
    await assertCanGrant(req, input.roleIds);
    await assertBranches(input.branchIds);
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          username: input.username, email: input.email ?? null, fullName: input.fullName, phone: input.phone ?? null,
          passwordHash, locale: input.locale, defaultBranchId: input.defaultBranchId,
          roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
          branches: { create: input.branchIds.map((branchId) => ({ branchId })) },
        },
        select: userSelect,
      });
      await AuditService.log({ action: 'CREATE', module: 'users', recordId: u.id, description: `Utilisateur ${u.username} créé`, metadata: { roles: u.roles.map((r) => r.role.code), branches: u.branches.map((b) => b.branch.code) } }, req, tx);
      return u;
    });
    return shape(user);
  },

  async update(req: Request, id: string, input: z.infer<typeof userUpdateInput>) {
    const target = await assertManageable(req, id);
    await uniqueness(input.username, input.email, id);
    await assertBranches(input.branchIds);
    const currentRoles = target.roles.map((r) => r.roleId).sort();
    const rolesChanged = currentRoles.join() !== [...input.roleIds].sort().join();
    if (rolesChanged) {
      if (id === req.auth!.userId) throw forbidden('Vous ne pouvez pas modifier vos propres rôles', 'SELF_ROLE_CHANGE');
      await assertCanGrant(req, input.roleIds);
    }
    const user = await prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userBranch.deleteMany({ where: { userId: id } });
      const u = await tx.user.update({
        where: { id },
        data: {
          username: input.username, email: input.email ?? null, fullName: input.fullName, phone: input.phone ?? null,
          locale: input.locale, defaultBranchId: input.defaultBranchId,
          roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
          branches: { create: input.branchIds.map((branchId) => ({ branchId })) },
        },
        select: userSelect,
      });
      await AuditService.log({
        action: 'UPDATE', module: 'users', recordId: id, description: `Utilisateur ${u.username} modifié`,
        metadata: { roles: u.roles.map((r) => r.role.code), branches: u.branches.map((b) => b.branch.code), rolesChanged },
      }, req, tx);
      return u;
    });
    AuthService.invalidateUser(id);
    return shape(user);
  },

  async setStatus(req: Request, id: string, status: 'ACTIVE' | 'INACTIVE') {
    await assertManageable(req, id);
    if (id === req.auth!.userId) throw forbidden('Vous ne pouvez pas désactiver votre propre compte', 'SELF_DISABLE');
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id }, data: { status, failedLoginCount: 0, lockedUntil: null }, select: userSelect });
      // A disabled account loses its sessions immediately
      if (status === 'INACTIVE') await tx.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await AuditService.log({ action: 'UPDATE', module: 'users', recordId: id, description: `Compte ${u.username} ${status === 'ACTIVE' ? 'activé / déverrouillé' : 'désactivé'}` }, req, tx);
      return u;
    });
    AuthService.invalidateUser(id);
    return shape(user);
  },

  async resetPassword(req: Request, id: string, password: string) {
    const target = await assertManageable(req, id);
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null, ...(target.status === 'LOCKED' ? { status: 'ACTIVE' } : {}) } });
      await tx.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await AuditService.log({ action: 'PASSWORD_CHANGE', module: 'users', recordId: id, description: `Mot de passe de ${target.username} réinitialisé par un administrateur` }, req, tx);
    });
    AuthService.invalidateUser(id);
    return { ok: true };
  },
};

// ───────────── roles ─────────────
export const RoleService = {
  async list() {
    const roles = await prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { permissions: { include: { permission: { select: { code: true } } } }, _count: { select: { users: true } } },
    });
    return roles.map((r) => ({
      id: r.id, code: r.code, name: r.name, description: r.description, isSystem: r.isSystem,
      maxDiscountPercent: r.maxDiscountPercent.toFixed(), userCount: r._count.users,
      permissions: r.permissions.map((p) => p.permission.code).sort(),
    }));
  },

  async permissions() {
    const rows = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
    return rows.map((p) => ({ code: p.code, module: p.module, description: p.description }));
  },

  async save(req: Request, id: string | null, input: z.infer<typeof roleInput>) {
    const existing = id ? await prisma.role.findUnique({ where: { id } }) : null;
    if (id && !existing) throw notFound('ROLE_NOT_FOUND', 'Rôle introuvable');
    if (existing?.code === 'SUPER_ADMIN') throw forbidden('Le rôle super administrateur ne peut pas être modifié', 'ROLE_LOCKED');
    if (!isSuperAdmin(req)) {
      const extra = input.permissions.filter((c) => !req.auth!.permissions.has(c as PermissionCode));
      if (extra.length) throw forbidden(`Vous ne pouvez pas accorder des droits que vous n’avez pas (${extra.slice(0, 3).join(', ')})`, 'ROLE_FORBIDDEN');
    }
    const clash = await prisma.role.findFirst({ where: { code: existing?.isSystem ? existing.code : input.code, id: id ? { not: id } : undefined } });
    if (clash) throw conflict('ROLE_CODE_TAKEN', 'Ce code de rôle existe déjà');
    const perms = await prisma.permission.findMany({ where: { code: { in: input.permissions } }, select: { id: true } });
    const role = await prisma.$transaction(async (tx) => {
      const data = {
        // A system role keeps its code (seed and code refer to it)
        code: existing?.isSystem ? existing.code : input.code,
        name: input.name, description: input.description ?? null, maxDiscountPercent: input.maxDiscountPercent,
      };
      const r = existing ? await tx.role.update({ where: { id: existing.id }, data }) : await tx.role.create({ data });
      await tx.rolePermission.deleteMany({ where: { roleId: r.id } });
      if (perms.length) await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: r.id, permissionId: p.id })) });
      await AuditService.log({
        action: existing ? 'UPDATE' : 'CREATE', module: 'roles', recordId: r.id,
        description: `Rôle « ${r.name} » ${existing ? 'modifié' : 'créé'} (${perms.length} permissions)`,
        metadata: { permissions: input.permissions, maxDiscountPercent: input.maxDiscountPercent },
      }, req, tx);
      return r;
    });
    AuthService.invalidateUser(); // every session re-reads its permissions
    return (await this.list()).find((r) => r.id === role.id)!;
  },

  async remove(req: Request, id: string) {
    const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw notFound('ROLE_NOT_FOUND', 'Rôle introuvable');
    if (role.isSystem) throw forbidden('Un rôle système ne peut pas être supprimé', 'ROLE_LOCKED');
    if (role._count.users > 0) throw conflict('ROLE_IN_USE', `Ce rôle est attribué à ${role._count.users} utilisateur(s)`);
    await prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await AuditService.log({ action: 'DELETE', module: 'roles', recordId: id, description: `Rôle « ${role.name} » supprimé` }, req, tx);
    });
    return { ok: true };
  },
};
