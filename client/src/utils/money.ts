import Decimal from 'decimal.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });
export { Decimal };

export type Money = Decimal.Value;

export interface CurrencyFormat {
  code: string;
  symbol: string;
  decimals: number;
  symbolPosition: 'before' | 'after';
  thousandsSeparator: string;
}

let currency: CurrencyFormat = { code: 'XAF', symbol: 'FCFA', decimals: 0, symbolPosition: 'after', thousandsSeparator: ',' };

export const setCurrencyFormat = (c: Partial<CurrencyFormat>) => {
  currency = { ...currency, ...c };
};
export const getCurrency = () => currency;

export const D = (v: Money | null | undefined) => {
  if (v === null || v === undefined || v === '') return new Decimal(0);
  try {
    return new Decimal(v);
  } catch {
    return new Decimal(0);
  }
};

export const roundMoney = (v: Money) => D(v).toDecimalPlaces(currency.decimals, Decimal.ROUND_HALF_UP);

function group(intPart: string, sep: string) {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** 1500 → "1,500" */
export function formatNumber(v: Money, decimals = currency.decimals): string {
  const d = D(v).toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
  const neg = d.isNegative() && !d.isZero();
  const [int, frac] = d.abs().toFixed(decimals).split('.');
  return (neg ? '-' : '') + group(int, currency.thousandsSeparator) + (frac ? '.' + frac : '');
}

/** 1500 → "1,500 FCFA" */
export function formatMoney(v: Money | null | undefined, opts: { symbol?: boolean } = {}): string {
  const n = formatNumber(v ?? 0);
  if (opts.symbol === false) return n;
  return currency.symbolPosition === 'before' ? `${currency.symbol} ${n}` : `${n} ${currency.symbol}`;
}

/** Quantity: drop trailing zeros (2.000 → 2, 1.250 → 1.25) */
export function formatQty(v: Money): string {
  return D(v).toDecimalPlaces(3).toString();
}

/** Parse user input like "15,000" or "15 000" → "15000" */
export function parseAmount(input: string): string {
  const cleaned = input.replace(/[\s,\u00a0\u202f]/g, '').replace(/[^\d.-]/g, '');
  return cleaned === '' || cleaned === '-' ? '0' : D(cleaned).toFixed();
}
