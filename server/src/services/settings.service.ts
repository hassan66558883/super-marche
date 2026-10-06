import type { Prisma } from '@prisma/client';
import { prisma, type Db } from '../utils/prisma.js';

export interface CompanySettings {
  name: string; slogan?: string; legalName?: string; address?: string; phone?: string; email?: string;
  website?: string; taxId?: string; rccm?: string; country?: string; logoUrl?: string | null;
}
export interface PosSettings {
  allowNegativeStock: boolean; requireOpenRegister: boolean; largeDiscountPercent: number; quickProductsLimit: number; defaultPriceList: string;
}
export interface InvoiceSettings { pattern: string; padding: number; resetYearly: boolean }

const DEFAULTS: Record<string, unknown> = {
  pos: { allowNegativeStock: false, requireOpenRegister: true, largeDiscountPercent: 15, quickProductsLimit: 60, defaultPriceList: 'RETAIL' },
  invoice: { pattern: '{BRANCH}-{YEAR}-{SEQ}', padding: 6, resetYearly: true },
  currency: { code: 'XAF', symbol: 'FCFA', decimals: 0, symbolPosition: 'after', thousandsSeparator: ',' },
  receipt: { footer: 'Merci pour votre confiance', showLogo: true, showTaxDetails: true, paperWidth: 80, showBarcode: true, autoPrint: false },
  notifications: { lowStock: true, largeDiscount: true, cashDiscrepancyThreshold: 1000 },
};

export const PUBLIC_KEYS = ['company', 'currency', 'locale', 'receipt', 'invoice', 'pos', 'printer', 'barcode', 'notifications'];

export const SettingsService = {
  /** Branch-specific value overrides the company-wide one (shallow merge). */
  async get<T = Record<string, unknown>>(key: string, branchId?: string | null, db: Db = prisma): Promise<T> {
    const rows = await db.setting.findMany({ where: { key, OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] } });
    const global = rows.find((r) => r.branchId === null)?.value as Record<string, unknown> | undefined;
    const local = rows.find((r) => r.branchId === branchId)?.value as Record<string, unknown> | undefined;
    return { ...((DEFAULTS[key] as object) ?? {}), ...(global ?? {}), ...(local ?? {}) } as T;
  },

  async getAll(branchId?: string | null) {
    const out: Record<string, unknown> = {};
    for (const key of PUBLIC_KEYS) out[key] = await this.get(key, branchId);
    return out;
  },

  async set(key: string, value: Prisma.InputJsonValue, branchId: string | null = null) {
    const existing = await prisma.setting.findFirst({ where: { key, branchId } });
    if (existing) return prisma.setting.update({ where: { id: existing.id }, data: { value } });
    return prisma.setting.create({ data: { key, value, branchId } });
  },
};
