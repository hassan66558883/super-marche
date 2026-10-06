/** EAN-13 check digit for a 12-digit body */
export function ean13CheckDigit(body12: string): number {
  if (!/^\d{12}$/.test(body12)) throw new Error('EAN-13 body must be 12 digits');
  const sum = body12.split('').reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/**
 * Internal (in-store) EAN-13: GS1 prefix 20–29 is reserved for restricted in-store use,
 * so generated codes never collide with manufacturer barcodes.
 */
export function generateInternalEan13(seq: number, prefix = '20'): string {
  const body = (prefix + String(seq).padStart(10, '0')).slice(0, 12);
  return body + ean13CheckDigit(body);
}
