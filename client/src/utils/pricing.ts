import { D, Decimal, roundMoney, type Money } from './money';

/**
 * Client mirror of the server pricing engine (server/src/services/pricing.service.ts)
 * so the cart shows exact totals instantly. The server recomputes and is authoritative.
 */
export type DiscountKind = 'PERCENT' | 'FIXED';
export interface PricingLineInput {
  key: string; unitPrice: Money; quantity: Money; discountType?: DiscountKind | null; discountValue?: Money | null;
  taxRate: Money; priceMode: 'INCLUSIVE' | 'EXCLUSIVE';
}
export interface PricingLineResult {
  key: string; gross: Decimal; lineDiscount: Decimal; cartShare: Decimal; net: Decimal; tax: Decimal; total: Decimal; discountPercent: Decimal;
}
export interface PricingResult {
  lines: PricingLineResult[]; subtotal: Decimal; lineDiscountTotal: Decimal; cartDiscountTotal: Decimal; cartDiscountPercent: Decimal;
  discountTotal: Decimal; taxTotal: Decimal; total: Decimal;
}

const discountAmount = (base: Decimal, type?: DiscountKind | null, value?: Money | null) => {
  if (!type || value === null || value === undefined || value === '') return D(0);
  const v = D(value);
  if (v.lte(0)) return D(0);
  const amt = type === 'PERCENT' ? base.mul(Decimal.min(v, 100)).div(100) : v;
  return roundMoney(Decimal.min(amt, base));
};

export function computePricing(lines: PricingLineInput[], cart?: { type: DiscountKind; value: Money } | null): PricingResult {
  const stage1 = lines.map((l) => {
    const gross = roundMoney(D(l.unitPrice).mul(D(l.quantity)));
    const lineDiscount = discountAmount(gross, l.discountType, l.discountValue);
    return { l, gross, lineDiscount, after: gross.minus(lineDiscount) };
  });
  const base = stage1.reduce((a, s) => a.plus(s.after), D(0));
  const cartDiscountTotal = cart ? discountAmount(base, cart.type, cart.value) : D(0);
  const shares = stage1.map((s) => (base.gt(0) ? roundMoney(cartDiscountTotal.mul(s.after).div(base)) : D(0)));
  const diff = cartDiscountTotal.minus(shares.reduce((a, b) => a.plus(b), D(0)));
  if (!diff.isZero() && stage1.length) {
    const idx = stage1.reduce((best, s, i) => (s.after.gt(stage1[best].after) ? i : best), 0);
    shares[idx] = shares[idx].plus(diff);
  }
  const out: PricingLineResult[] = stage1.map((s, i) => {
    const amount = s.after.minus(shares[i]);
    const rate = D(s.l.taxRate);
    let net: Decimal; let tax: Decimal; let total: Decimal;
    if (s.l.priceMode === 'INCLUSIVE') {
      total = amount;
      tax = rate.gt(0) ? roundMoney(amount.mul(rate).div(rate.plus(100))) : D(0);
      net = total.minus(tax);
    } else {
      net = amount;
      tax = rate.gt(0) ? roundMoney(amount.mul(rate).div(100)) : D(0);
      total = net.plus(tax);
    }
    return { key: s.l.key, gross: s.gross, lineDiscount: s.lineDiscount, cartShare: shares[i], net, tax, total, discountPercent: s.gross.gt(0) ? s.lineDiscount.div(s.gross).mul(100) : D(0) };
  });
  const sum = (f: (r: PricingLineResult) => Decimal) => out.reduce((a, r) => a.plus(f(r)), D(0));
  const lineDiscountTotal = sum((r) => r.lineDiscount);
  return {
    lines: out, subtotal: sum((r) => r.gross), lineDiscountTotal, cartDiscountTotal,
    cartDiscountPercent: base.gt(0) ? cartDiscountTotal.div(base).mul(100) : D(0),
    discountTotal: lineDiscountTotal.plus(cartDiscountTotal), taxTotal: sum((r) => r.tax), total: sum((r) => r.total),
  };
}
