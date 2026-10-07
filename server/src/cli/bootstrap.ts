/* eslint-disable no-console */
/**
 * Production bootstrap (idempotent): permissions, system roles, taxes, units, payment methods,
 * default settings, the head-office branch and the first super administrator.
 *
 * Nothing is hard-coded: the administrator's credentials come from the environment and are
 * only used when that account does not exist yet.
 *
 *   BOOTSTRAP_ADMIN_USERNAME   (default: superadmin)
 *   BOOTSTRAP_ADMIN_PASSWORD   required on first run, ≥ 8 chars with a letter and a digit
 *   BOOTSTRAP_ADMIN_EMAIL      optional
 *   BOOTSTRAP_COMPANY_NAME     (default: TECHNOVA POS)
 *   BOOTSTRAP_BRANCH_CODE      (default: NDJ)  BOOTSTRAP_BRANCH_NAME (default: Siège)
 *   BOOTSTRAP_BRANCH_CITY      (default: N'Djamena)
 *
 * Run: node dist/cli/bootstrap.js   (or npm run db:bootstrap in development)
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { ALL_PERMISSIONS, DEFAULT_ROLES, PERMISSIONS } from '../config/permissions.js';
import { DEFAULT_SETTINGS, EXPENSE_CATEGORIES, PAYMENT_METHODS, UNITS } from '../config/defaults.js';
import { passwordSchema } from '../validators/auth.validators.js';
import { hashPassword } from '../services/auth.service.js';

const prisma = new PrismaClient();
const env = (k: string, d = '') => (process.env[k] ?? d).trim();

async function main() {
  // Check the administrator password before writing anything
  const username = env('BOOTSTRAP_ADMIN_USERNAME', 'superadmin').toLowerCase();
  const existing = await prisma.user.findUnique({ where: { username } });
  const password = existing ? null : passwordSchema.safeParse(process.env.BOOTSTRAP_ADMIN_PASSWORD ?? '');
  if (password && !password.success) throw new Error('Set BOOTSTRAP_ADMIN_PASSWORD (at least 8 characters with a letter and a digit) to create the first administrator.');

  // Permissions and system roles (grants of system roles are re-applied, custom roles untouched)
  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: PERMISSIONS[code], module: code.split('.')[0] },
      create: { code, module: code.split('.')[0], description: PERMISSIONS[code] },
    });
  }
  const permissionIds = new Map((await prisma.permission.findMany()).map((p) => [p.code, p.id]));
  for (const def of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { code: def.code },
      update: { isSystem: true },
      create: { code: def.code, name: def.name, description: def.description, isSystem: true, maxDiscountPercent: new Prisma.Decimal(def.maxDiscountPercent) },
    });
    await prisma.rolePermission.createMany({ data: def.permissions.map((c) => ({ roleId: role.id, permissionId: permissionIds.get(c)! })), skipDuplicates: true });
  }

  // Reference data
  const vat = await prisma.tax.upsert({ where: { code: 'TVA18' }, update: {}, create: { code: 'TVA18', name: 'TVA 18%', rate: new Prisma.Decimal(18) } });
  await prisma.tax.upsert({ where: { code: 'EXO' }, update: {}, create: { code: 'EXO', name: 'Exonéré', rate: new Prisma.Decimal(0) } });
  for (const u of UNITS) await prisma.unit.upsert({ where: { code: u.code }, update: {}, create: { ...u, isSystem: true } });
  for (const m of PAYMENT_METHODS) await prisma.paymentMethod.upsert({ where: { code: m.code }, update: {}, create: { ...m } });
  for (const [code, name] of EXPENSE_CATEGORIES) await prisma.expenseCategory.upsert({ where: { code }, update: {}, create: { code, name } });

  // Settings: defaults without the demo company details
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (await prisma.setting.findFirst({ where: { key, branchId: null } })) continue;
    const v = key === 'company'
      ? { name: env('BOOTSTRAP_COMPANY_NAME', 'TECHNOVA POS'), slogan: 'Smart Sales. Smart Stock. Smart Business.', country: 'TD', logoUrl: null }
      : value;
    await prisma.setting.create({ data: { key, value: v as Prisma.InputJsonValue } });
  }

  // Head office
  let head = await prisma.branch.findFirst({ where: { isHeadOffice: true } });
  if (!head) {
    head = await prisma.branch.create({
      data: {
        code: env('BOOTSTRAP_BRANCH_CODE', 'NDJ').toUpperCase(), name: env('BOOTSTRAP_BRANCH_NAME', 'Siège'), city: env('BOOTSTRAP_BRANCH_CITY', "N'Djamena"),
        isHeadOffice: true, defaultTaxId: vat.id, registers: { create: [{ name: 'Caisse 1' }] },
      },
    });
    console.log(`Branch created: ${head.code} — ${head.name}`);
  }

  // First super administrator
  if (existing || !password?.success) {
    console.log(`Administrator "${username}" already exists: password left unchanged.`);
  } else {
    const superRole = await prisma.role.findUniqueOrThrow({ where: { code: 'SUPER_ADMIN' } });
    const branchIds = (await prisma.branch.findMany({ select: { id: true } })).map((b) => b.id);
    await prisma.user.create({
      data: {
        username, fullName: 'Super administrateur', email: env('BOOTSTRAP_ADMIN_EMAIL') || null,
        passwordHash: await hashPassword(password.data), defaultBranchId: head.id,
        roles: { create: [{ roleId: superRole.id }] }, branches: { create: branchIds.map((branchId) => ({ branchId })) },
      },
    });
    console.log(`Administrator "${username}" created. Sign in and change the password from your profile.`);
  }
  console.log('✅ Bootstrap complete');
}

main()
  .catch((e) => { console.error('❌', e instanceof Error ? e.message : e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
