import type { CurrencyFormat } from '@/utils/money';

export interface CompanySettings {
  name: string; slogan?: string; legalName?: string; address?: string; phone?: string; email?: string;
  website?: string; taxId?: string; rccm?: string; country?: string; logoUrl?: string | null;
}
export interface ReceiptSettings { footer: string; showLogo: boolean; showTaxDetails: boolean; paperWidth: 58 | 80; showBarcode: boolean; autoPrint: boolean }
export interface PosSettings { allowNegativeStock: boolean; requireOpenRegister: boolean; largeDiscountPercent: number; quickProductsLimit: number; defaultPriceList: 'RETAIL' | 'WHOLESALE' }
export interface InvoiceSettings { pattern: string; padding: number; resetYearly: boolean }
export interface NotificationSettings { lowStock: boolean; largeDiscount: boolean; cashDiscrepancyThreshold: number }
export interface PrinterSettings { type: 'BROWSER' | 'ESCPOS'; escpos: { enabled: boolean; host: string | null; port: number } }
export interface BarcodeSettings { internalPrefix: string; format: 'EAN13' }
export interface LocaleSettings { default: 'fr' | 'ar' | 'en'; available: ('fr' | 'ar' | 'en')[]; timezone: string }

export interface AppSettings {
  company: CompanySettings;
  currency: CurrencyFormat;
  locale: LocaleSettings;
  receipt: ReceiptSettings;
  invoice: InvoiceSettings;
  pos: PosSettings;
  printer: PrinterSettings;
  barcode: BarcodeSettings;
  notifications: NotificationSettings;
}
