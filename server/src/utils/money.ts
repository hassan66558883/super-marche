import { Decimal } from 'decimal.js';
import { Prisma } from '@prisma/client';

// All money math goes through Decimal; XAF has no minor unit so amounts round to 0 dp.
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type DecimalInput = Decimal.Value | Prisma.Decimal;

export const CURRENCY_DECIMALS = Number(process.env.CURRENCY_DECIMALS ?? 0);

export const D = (v: DecimalInput | null | undefined): Decimal =>
  v === null || v === undefined ? new Decimal(0) : new Decimal(v.toString());

export const roundMoney = (v: DecimalInput, dp = CURRENCY_DECIMALS): Decimal =>
  D(v).toDecimalPlaces(dp, Decimal.ROUND_HALF_UP);

export const roundQty = (v: DecimalInput): Decimal => D(v).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

export const sum = (values: DecimalInput[]): Decimal => values.reduce<Decimal>((a, b) => a.plus(D(b)), D(0));

/** Serialise for Prisma Decimal columns */
export const toDb = (v: DecimalInput): Prisma.Decimal => new Prisma.Decimal(D(v).toFixed());

/** Serialise for JSON responses: decimals as strings to avoid float drift */
export const toStr = (v: DecimalInput | null | undefined): string => D(v).toFixed();
