import type { Sale } from '@/types/sales';
import type { AppSettings } from '@/types/settings';
import { D, Decimal } from '@/utils/money';

/**
 * Printer-agnostic description of a receipt. The browser renderer (Receipt80) and the
 * ESC/POS encoder (escpos.ts) both consume this, so thermal printers can be added
 * without touching sales code.
 */
export interface ReceiptDoc {
  header: { name: string; slogan?: string; address?: string; phone?: string; taxId?: string; rccm?: string; branch: string };
  meta: { invoiceNumber: string; date: Date; cashier: string; customer: string | null; duplicate: boolean; status: Sale['status'] };
  lines: { name: string; qty: string; unitPrice: string; total: string; discount: string | null }[];
  totals: { subtotal: Decimal; discount: Decimal; taxByRate: { rate: string; base: Decimal; tax: Decimal }[]; taxTotal: Decimal; total: Decimal };
  payments: { name: string; amount: Decimal; reference: string | null }[];
  tendered: Decimal; change: Decimal; amountDue: Decimal; dueDate: Date | null;
  footer: string; showTaxDetails: boolean; barcode: string;
}

export function buildReceipt(sale: Sale, settings: AppSettings | undefined, duplicate = false): ReceiptDoc {
  const c = settings?.company;
  const taxMap = new Map<string, { base: Decimal; tax: Decimal }>();
  for (const it of sale.items) {
    const k = D(it.taxRate).toString();
    const cur = taxMap.get(k) ?? { base: D(0), tax: D(0) };
    taxMap.set(k, { base: cur.base.plus(D(it.netAmount)), tax: cur.tax.plus(D(it.taxAmount)) });
  }
  return {
    header: { name: c?.name ?? 'TECHNOVA POS', slogan: c?.slogan, address: sale.branch?.address ?? c?.address, phone: sale.branch?.phone ?? c?.phone, taxId: c?.taxId, rccm: c?.rccm, branch: sale.branch?.name ?? '' },
    meta: { invoiceNumber: sale.invoiceNumber, date: new Date(sale.createdAt), cashier: sale.cashier?.fullName ?? '', customer: sale.customer && sale.customer.type !== 'WALK_IN' ? sale.customer.name : null, duplicate, status: sale.status },
    lines: sale.items.map((it) => ({
      name: it.productName, qty: D(it.quantity).toString(), unitPrice: it.unitPrice, total: D(it.total).plus(D(it.cartDiscountShare)).toFixed(),
      discount: D(it.discountAmount).gt(0) ? it.discountAmount : null,
    })),
    totals: {
      subtotal: D(sale.subtotal), discount: D(sale.discountTotal),
      taxByRate: [...taxMap.entries()].filter(([r]) => D(r).gt(0)).map(([rate, v]) => ({ rate, ...v })),
      taxTotal: D(sale.taxTotal), total: D(sale.total),
    },
    payments: sale.payments.filter((p) => p.direction === 'IN' && !p.returnId).map((p) => ({ name: p.paymentMethod.name, amount: D(p.amount), reference: p.reference })),
    tendered: D(sale.amountTendered), change: D(sale.changeGiven), amountDue: D(sale.amountDue), dueDate: sale.dueDate ? new Date(sale.dueDate) : null,
    footer: settings?.receipt.footer || 'Merci pour votre confiance',
    showTaxDetails: settings?.receipt.showTaxDetails ?? true,
    barcode: sale.invoiceNumber,
  };
}
