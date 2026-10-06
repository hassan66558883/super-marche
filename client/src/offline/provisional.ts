import type { CartCustomer, CartLine } from '@/stores/cart.store';
import type { PricingResult } from '@/utils/pricing';
import type { PaymentAnalysis } from '@/services/pos.service';
import type { Branch, PaymentMethod, Sale } from '@/types/sales';
import type { Customer } from '@/types/catalog';
import { D } from '@/utils/money';

/**
 * Sale-shaped object for a sale queued offline, so the success dialog and the receipt
 * printer work unchanged. Totals come from the same pricing engine the server uses.
 */
export function provisionalSale(args: {
  clientRef: string; localNumber: string; lines: CartLine[]; pricing: PricingResult; analysis: PaymentAnalysis; methods: PaymentMethod[];
  customer: CartCustomer | null; cashier: { id: string; fullName: string }; branch: Branch; note: string; createdAt: Date;
}): Sale {
  const { pricing, analysis } = args;
  const byKey = new Map(pricing.lines.map((l) => [l.key, l]));
  const total = pricing.total;
  const change = analysis.change;
  const zero = '0';
  return {
    id: args.clientRef, invoiceNumber: args.localNumber, clientRef: args.clientRef, branchId: args.branch.id, cashierId: args.cashier.id,
    customerId: args.customer?.id ?? null, status: 'COMPLETED', paymentStatus: 'PAID',
    subtotal: pricing.subtotal.toFixed(), lineDiscountTotal: pricing.lineDiscountTotal.toFixed(), cartDiscountType: null, cartDiscountValue: null,
    cartDiscountTotal: pricing.cartDiscountTotal.toFixed(), discountTotal: pricing.discountTotal.toFixed(), taxTotal: pricing.taxTotal.toFixed(),
    total: total.toFixed(), amountPaid: total.toFixed(), amountDue: zero, amountTendered: analysis.paid.toFixed(), changeGiven: change.toFixed(),
    refundedTotal: zero, dueDate: null, note: args.note || null, cancelReason: null, cancelledAt: null, createdAt: args.createdAt.toISOString(),
    items: args.lines.map((l) => {
      const p = byKey.get(l.key)!;
      return {
        id: l.key, productId: l.productId, variantId: l.variantId, productName: l.variantName ? `${l.name} — ${l.variantName}` : l.name, sku: l.sku,
        quantity: l.quantity, unitPrice: l.unitPrice, originalPrice: l.catalogPrice, discountType: l.discountType, discountValue: l.discountValue,
        discountAmount: p.lineDiscount.toFixed(), cartDiscountShare: p.cartShare.toFixed(), taxId: null, taxRate: l.taxRate, priceMode: l.priceMode,
        taxAmount: p.tax.toFixed(), netAmount: p.net.toFixed(), total: p.total.toFixed(), returnedQuantity: zero,
      };
    }),
    payments: analysis.effective.filter((p) => p.amount.gt(0) && p.type !== 'CREDIT').map((p, i) => {
      const m = args.methods.find((x) => x.code === p.method);
      // Cash shown net of change, like the server records it
      const amount = p.type === 'CASH' ? D(p.amount).minus(change) : p.amount;
      return {
        id: `${args.clientRef}-${i}`, amount: amount.toFixed(), direction: 'IN' as const, reference: p.reference || null, status: 'COMPLETED' as const,
        createdAt: args.createdAt.toISOString(), returnId: null, paymentMethod: { code: p.method, name: m?.name ?? p.method, type: m?.type },
      };
    }),
    customer: (args.customer as Customer | null) ?? null,
    cashier: args.cashier, branch: args.branch, returns: [],
  };
}

/** Short provisional number shown on offline receipts, e.g. HL-NDJ-0612-4F2A */
export function localSaleNumber(branchCode: string, clientRef: string, at = new Date()) {
  const dd = String(at.getDate()).padStart(2, '0');
  const mm = String(at.getMonth() + 1).padStart(2, '0');
  return `HL-${branchCode}-${dd}${mm}-${clientRef.replace(/-/g, '').slice(0, 4).toUpperCase()}`;
}
