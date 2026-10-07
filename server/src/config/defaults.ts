import type { Prisma } from '@prisma/client';

/** Reference data shared by the production bootstrap (src/cli/bootstrap.ts) and the demo seed. */

export const UNITS = [
  { code: 'PCS', name: 'Pièce', nameEn: 'Piece', nameAr: 'قطعة', allowDecimal: false },
  { code: 'BOX', name: 'Boîte', nameEn: 'Box', nameAr: 'علبة', allowDecimal: false },
  { code: 'CTN', name: 'Carton', nameEn: 'Carton', nameAr: 'كرتون', allowDecimal: false },
  { code: 'KG', name: 'Kilogramme', nameEn: 'Kilogram', nameAr: 'كيلوغرام', allowDecimal: true },
  { code: 'G', name: 'Gramme', nameEn: 'Gram', nameAr: 'غرام', allowDecimal: true },
  { code: 'L', name: 'Litre', nameEn: 'Liter', nameAr: 'لتر', allowDecimal: true },
  { code: 'ML', name: 'Millilitre', nameEn: 'Milliliter', nameAr: 'ملليلتر', allowDecimal: true },
  { code: 'M', name: 'Mètre', nameEn: 'Meter', nameAr: 'متر', allowDecimal: true },
  { code: 'SAC', name: 'Sac', nameEn: 'Bag', nameAr: 'كيس', allowDecimal: false },
];

export const PAYMENT_METHODS = [
  { code: 'CASH', name: 'Espèces', type: 'CASH', provider: null, sortOrder: 1 },
  { code: 'CARD', name: 'Carte bancaire', type: 'CARD', provider: null, sortOrder: 2 },
  { code: 'AIRTEL_MONEY', name: 'Airtel Money', type: 'MOBILE_MONEY', provider: 'manual', sortOrder: 3 },
  { code: 'MOOV_MONEY', name: 'Moov Money', type: 'MOBILE_MONEY', provider: 'manual', sortOrder: 4 },
  { code: 'BANK_TRANSFER', name: 'Virement bancaire', type: 'BANK_TRANSFER', provider: null, sortOrder: 5 },
  { code: 'CREDIT', name: 'Crédit client', type: 'CREDIT', provider: null, sortOrder: 6 },
] as const;

export const EXPENSE_CATEGORIES = [
  ['TRANSPORT', 'Transport'], ['ELECTRICITY', 'Électricité'], ['INTERNET', 'Internet'], ['SALARY_ADVANCE', 'Avance sur salaire'],
  ['MAINTENANCE', 'Maintenance'], ['OFFICE_SUPPLIES', 'Fournitures de bureau'], ['RENT', 'Loyer'], ['OTHER', 'Autre'],
];

export const DEFAULT_SETTINGS: Record<string, Prisma.InputJsonValue> = {
  company: {
    name: 'TECHNOVA POS',
    slogan: 'Smart Sales. Smart Stock. Smart Business.',
    legalName: 'TECHNOVA SARL',
    address: "Avenue Charles de Gaulle, N'Djamena, Tchad",
    phone: '+235 22 51 00 00',
    email: 'contact@technova.td',
    website: 'www.technova.td',
    taxId: 'NIF-TD-0099999',
    rccm: 'TD-NDJ-2026-B-0001',
    country: 'TD',
    logoUrl: null,
  },
  currency: { code: 'XAF', symbol: 'FCFA', decimals: 0, symbolPosition: 'after', thousandsSeparator: ',' },
  locale: { default: 'fr', available: ['fr', 'ar', 'en'], timezone: 'Africa/Ndjamena' },
  receipt: { footer: 'Merci pour votre confiance', showLogo: true, showTaxDetails: true, paperWidth: 80, showBarcode: true, autoPrint: false },
  invoice: { pattern: '{BRANCH}-{YEAR}-{SEQ}', padding: 6, resetYearly: true },
  pos: { allowNegativeStock: false, requireOpenRegister: true, largeDiscountPercent: 15, quickProductsLimit: 60, defaultPriceList: 'RETAIL' },
  notifications: { lowStock: true, largeDiscount: true, cashDiscrepancyThreshold: 1000 },
  printer: { type: 'BROWSER', escpos: { enabled: false, host: null, port: 9100 } },
  barcode: { internalPrefix: '20', format: 'EAN13' },
};
