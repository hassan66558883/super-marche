import { useMemo } from 'react';
import { useCartStore, type CartLine, type PaymentDraft } from '@/stores/cart.store';
import { computePricing, type PricingResult } from '@/utils/pricing';
import { D, Decimal } from '@/utils/money';
import type { PaymentMethod, SaleInput } from '@/types/sales';

/** Pricing of the current cart, recomputed only when the cart changes. */
export function useCartPricing(): PricingResult {
  const lines = useCartStore((s) => s.lines);
  const cartDiscount = useCartStore((s) => s.cartDiscount);
  return useMemo(() => computePricing(
    lines.map((l) => ({ key: l.key, unitPrice: l.unitPrice, quantity: l.quantity, discountType: l.discountType, discountValue: l.discountValue, taxRate: l.taxRate, priceMode: l.priceMode })),
    cartDiscount,
  ), [lines, cartDiscount]);
}

export interface PaymentAnalysis {
  /** Amounts as they will be sent (an empty cash amount means "exact") */
  effective: { method: string; type: PaymentMethod['type']; amount: Decimal; reference: string }[];
  cashTendered: Decimal;
  otherPaid: Decimal;
  credit: Decimal;
  paid: Decimal;
  change: Decimal;
  remaining: Decimal;
  overpaidNonCash: boolean;
  needsCustomerForCredit: boolean;
  canComplete: boolean;
}

/**
 * Mirrors the server rules: change is only given from cash, non-cash payments cannot exceed
 * the total, and any shortfall needs an explicit credit line for a registered customer.
 */
export function analyzePayments(total: Decimal, drafts: PaymentDraft[], methods: PaymentMethod[], hasRegisteredCustomer: boolean): PaymentAnalysis {
  const typeOf = (code: string) => methods.find((m) => m.code === code)?.type ?? 'CASH';
  const list = drafts.length ? drafts : [{ id: 'auto', method: 'CASH', amount: '', reference: '' }];
  const explicit = list.filter((p) => p.amount !== '').reduce((a, p) => a.plus(typeOf(p.method) === 'CREDIT' ? 0 : D(p.amount)), D(0));
  const effective = list.map((p) => {
    const type = typeOf(p.method);
    let amount = D(p.amount);
    // Empty amount on the only cash line = exact amount; empty credit line = whatever is left
    if (p.amount === '' && (type === 'CASH' || type === 'CREDIT')) amount = Decimal.max(total.minus(explicit), 0);
    return { method: p.method, type, amount, reference: p.reference };
  });
  const cashTendered = effective.filter((p) => p.type === 'CASH').reduce((a, p) => a.plus(p.amount), D(0));
  const otherPaid = effective.filter((p) => p.type !== 'CASH' && p.type !== 'CREDIT').reduce((a, p) => a.plus(p.amount), D(0));
  const creditLines = effective.filter((p) => p.type === 'CREDIT');
  const paid = cashTendered.plus(otherPaid);
  const change = Decimal.max(paid.minus(total), 0);
  const shortfall = Decimal.max(total.minus(paid), 0);
  const credit = creditLines.length ? shortfall : D(0);
  const remaining = shortfall.minus(credit);
  const overpaidNonCash = otherPaid.gt(total);
  const needsCustomerForCredit = credit.gt(0) && !hasRegisteredCustomer;
  return {
    effective, cashTendered, otherPaid, credit, paid, change, remaining, overpaidNonCash, needsCustomerForCredit,
    canComplete: total.gt(0) && remaining.lte(0) && !overpaidNonCash && !needsCustomerForCredit,
  };
}

export function newClientRef() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function buildSaleInput(args: {
  clientRef: string; lines: CartLine[]; customerId: string | null; cartDiscount: { type: 'PERCENT' | 'FIXED'; value: string } | null;
  analysis: PaymentAnalysis; note: string;
}): SaleInput {
  return {
    clientRef: args.clientRef,
    customerId: args.customerId,
    items: args.lines.map((l) => ({
      productId: l.productId, variantId: l.variantId, quantity: Number(l.quantity),
      unitPrice: D(l.unitPrice).eq(D(l.catalogPrice)) ? undefined : Number(l.unitPrice),
      discountType: l.discountType && D(l.discountValue).gt(0) ? l.discountType : null,
      discountValue: l.discountType && D(l.discountValue).gt(0) ? Number(l.discountValue) : null,
    })),
    cartDiscount: args.cartDiscount && D(args.cartDiscount.value).gt(0) ? { type: args.cartDiscount.type, value: Number(args.cartDiscount.value) } : null,
    payments: args.analysis.effective
      .filter((p) => p.type === 'CREDIT' ? args.analysis.credit.gt(0) : p.amount.gt(0))
      .map((p) => ({ method: p.method, amount: Number((p.type === 'CREDIT' ? args.analysis.credit : p.amount).toFixed()), reference: p.reference || null })),
    note: args.note || null,
  };
}

/** Suggested cash amounts for the quick-tender buttons: exact, then rounded-up notes */
export function quickTenders(total: Decimal): Decimal[] {
  if (total.lte(0)) return [];
  const notes = [500, 1000, 2000, 5000, 10000];
  const out = new Map<string, Decimal>([[total.toFixed(), total]]);
  for (const n of notes) {
    const v = total.div(n).ceil().mul(n);
    if (v.gt(total)) out.set(v.toFixed(), v);
    if (out.size >= 5) break;
  }
  return [...out.values()].slice(0, 5);
}
