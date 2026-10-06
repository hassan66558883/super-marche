import { z } from 'zod';

const str = (max = 200) => z.string().trim().max(max);

export const settingSchemas: Record<string, z.ZodTypeAny> = {
  company: z.object({
    name: str(120).min(1), slogan: str().optional(), legalName: str().optional(), address: str(300).optional(),
    phone: str(60).optional(), email: z.string().email().or(z.literal('')).optional(), website: str().optional(),
    taxId: str(60).optional(), rccm: str(60).optional(), country: str(2).optional(),
    logoUrl: z.string().url().or(z.literal('')).nullable().optional(),
  }),
  currency: z.object({
    code: str(3).min(3), symbol: str(8).min(1), decimals: z.number().int().min(0).max(3),
    symbolPosition: z.enum(['before', 'after']), thousandsSeparator: z.enum([',', ' ', '.', '']),
  }),
  locale: z.object({ default: z.enum(['fr', 'ar', 'en']), available: z.array(z.enum(['fr', 'ar', 'en'])).min(1), timezone: str(60).refine((tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }, 'Fuseau horaire inconnu') }),
  receipt: z.object({
    footer: str(300), showLogo: z.boolean(), showTaxDetails: z.boolean(), paperWidth: z.union([z.literal(58), z.literal(80)]),
    showBarcode: z.boolean(), autoPrint: z.boolean(),
  }),
  invoice: z.object({
    pattern: str(60).refine((v) => v.includes('{SEQ}'), 'Le format doit contenir {SEQ}'),
    padding: z.number().int().min(3).max(10), resetYearly: z.boolean(),
  }),
  pos: z.object({
    allowNegativeStock: z.boolean(), requireOpenRegister: z.boolean(), largeDiscountPercent: z.number().min(0).max(100),
    quickProductsLimit: z.number().int().min(6).max(200), defaultPriceList: z.enum(['RETAIL', 'WHOLESALE']),
  }),
  notifications: z.object({ lowStock: z.boolean(), largeDiscount: z.boolean(), cashDiscrepancyThreshold: z.number().min(0) }),
  printer: z.object({
    type: z.enum(['BROWSER', 'ESCPOS']),
    escpos: z.object({ enabled: z.boolean(), host: z.string().nullable(), port: z.number().int() }),
  }),
  barcode: z.object({ internalPrefix: z.string().regex(/^2\d$/), format: z.enum(['EAN13']) }),
};
