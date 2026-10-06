import type { Request } from 'express';
import type { z } from 'zod';
import { prisma } from '../utils/prisma.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { AuditService } from './audit.service.js';
import { AuthService } from './auth.service.js';
import type { branchInput, paymentMethodInput, registerInput } from '../validators/admin.validators.js';

export const BranchService = {
  async listAll() {
    return prisma.branch.findMany({
      orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }],
      include: {
        defaultTax: { select: { id: true, name: true, rate: true } },
        registers: { orderBy: { name: 'asc' }, select: { id: true, name: true, status: true } },
        _count: { select: { users: true } },
      },
    });
  },

  async save(req: Request, id: string | null, input: z.infer<typeof branchInput>) {
    const existing = id ? await prisma.branch.findUnique({ where: { id } }) : null;
    if (id && !existing) throw notFound('BRANCH_NOT_FOUND', 'Succursale introuvable');
    const clash = await prisma.branch.findFirst({ where: { code: input.code, id: id ? { not: id } : undefined } });
    if (clash) throw conflict('BRANCH_CODE_TAKEN', 'Ce code de succursale existe déjà');
    // The code is part of every invoice number: it cannot change once documents exist
    if (existing && existing.code !== input.code && (await prisma.sale.count({ where: { branchId: existing.id } })) > 0) {
      throw badRequest('BRANCH_CODE_LOCKED', 'Le code ne peut plus changer : des factures utilisent déjà ce code');
    }
    if (existing?.isHeadOffice && input.status === 'INACTIVE') throw badRequest('HEAD_OFFICE_ACTIVE', 'Le siège ne peut pas être désactivé');
    const data = {
      code: input.code, name: input.name, address: input.address ?? null, city: input.city ?? null, phone: input.phone ?? null,
      email: input.email ?? null, defaultTaxId: input.defaultTaxId ?? null, status: input.status,
    };
    const branch = await prisma.$transaction(async (tx) => {
      const b = existing ? await tx.branch.update({ where: { id: existing.id }, data }) : await tx.branch.create({ data: { ...data, registers: { create: [{ name: 'Caisse 1' }] } } });
      await AuditService.log({ action: existing ? 'UPDATE' : 'CREATE', module: 'branches', recordId: b.id, description: `Succursale ${b.code} — ${b.name} ${existing ? 'modifiée' : 'créée'}`, metadata: data }, req, tx);
      return b;
    });
    AuthService.invalidateUser(); // branch lists in sessions change
    return branch;
  },

  async saveRegister(req: Request, branchId: string, registerId: string | null, input: z.infer<typeof registerInput>) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw notFound('BRANCH_NOT_FOUND', 'Succursale introuvable');
    const clash = await prisma.cashRegister.findFirst({ where: { branchId, name: input.name, id: registerId ? { not: registerId } : undefined } });
    if (clash) throw conflict('REGISTER_NAME_TAKEN', 'Une caisse porte déjà ce nom');
    if (registerId && input.status === 'INACTIVE' && (await prisma.cashRegisterSession.count({ where: { registerId, status: 'OPEN' } }))) {
      throw conflict('REGISTER_OPEN', 'Fermez la session en cours avant de désactiver cette caisse');
    }
    return prisma.$transaction(async (tx) => {
      const r = registerId
        ? await tx.cashRegister.update({ where: { id: registerId, branchId }, data: input })
        : await tx.cashRegister.create({ data: { ...input, branchId } });
      await AuditService.log({ action: registerId ? 'UPDATE' : 'CREATE', module: 'branches', recordId: r.id, description: `Caisse « ${r.name} » (${branch.code}) ${registerId ? 'modifiée' : 'créée'}` }, req, tx);
      return r;
    });
  },
};

export const PaymentMethodService = {
  async list(all: boolean) {
    return prisma.paymentMethod.findMany({ where: all ? {} : { isActive: true }, orderBy: { sortOrder: 'asc' } });
  },

  async save(req: Request, id: string | null, input: z.infer<typeof paymentMethodInput>) {
    const existing = id ? await prisma.paymentMethod.findUnique({ where: { id } }) : null;
    if (id && !existing) throw notFound('PAYMENT_METHOD_NOT_FOUND', 'Mode de paiement introuvable');
    // Codes are stored on expenses and used by the POS: they are fixed once created
    const code = existing ? existing.code : input.code;
    if (!existing && (await prisma.paymentMethod.findUnique({ where: { code } }))) throw conflict('PAYMENT_METHOD_CODE_TAKEN', 'Ce code existe déjà');
    if (existing && existing.type !== input.type && (await prisma.payment.count({ where: { paymentMethodId: existing.id } }))) {
      throw badRequest('PAYMENT_METHOD_TYPE_LOCKED', 'Le type ne peut plus changer : des paiements l’utilisent');
    }
    if (input.type === 'CASH' && !input.isActive) {
      const otherCash = await prisma.paymentMethod.count({ where: { type: 'CASH', isActive: true, id: existing ? { not: existing.id } : undefined } });
      if (!otherCash) throw badRequest('CASH_REQUIRED', 'Au moins un mode de paiement en espèces doit rester actif');
    }
    const data = { name: input.name, type: input.type, provider: input.provider ?? null, isActive: input.isActive, sortOrder: input.sortOrder };
    return prisma.$transaction(async (tx) => {
      const m = existing ? await tx.paymentMethod.update({ where: { id: existing.id }, data }) : await tx.paymentMethod.create({ data: { ...data, code } });
      await AuditService.log({ action: existing ? 'UPDATE' : 'CREATE', module: 'settings', recordId: m.id, description: `Mode de paiement « ${m.name} » ${existing ? 'modifié' : 'créé'}`, metadata: data }, req, tx);
      return m;
    });
  },
};
