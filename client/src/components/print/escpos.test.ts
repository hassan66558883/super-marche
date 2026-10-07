import { describe, expect, it } from 'vitest';
import { Decimal } from '@/utils/money';
import { encodeEscPos, encodeTestPage } from './escpos';
import type { ReceiptDoc } from './receipt-model';

const doc: ReceiptDoc = {
  header: { name: 'Supermarché Test', branch: 'Siège' },
  meta: { invoiceNumber: 'NDJ-2026-000001', date: new Date('2026-10-06T10:00:00Z'), cashier: 'Amina', customer: null, duplicate: false, status: 'COMPLETED' },
  lines: [{ name: 'Riz 5 kg', qty: '2', unitPrice: '6500', total: '13000', discount: null }],
  totals: { subtotal: new Decimal(13000), discount: new Decimal(0), taxByRate: [], taxTotal: new Decimal(0), total: new Decimal(13000) },
  payments: [{ name: 'Espèces', amount: new Decimal(15000), reference: null }],
  tendered: new Decimal(15000), change: new Decimal(2000), amountDue: new Decimal(0), dueDate: null,
  footer: 'Merci', showTaxDetails: false, barcode: 'NDJ-2026-000001',
};

const ascii = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

/** Printable text only: drops ESC/GS commands with their parameter bytes */
function printable(b: Uint8Array) {
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) {
    if (b[i] !== 0x1b && b[i] !== 0x1d) { out.push(b[i]); continue; }
    const cmd = b[i + 1];
    const length = b[i] === 0x1b && cmd === 0x40 ? 2 // ESC @
      : b[i] === 0x1d && cmd === 0x56 ? 4 // GS V B n (cut)
        : b[i] === 0x1d && cmd === 0x6b ? 4 + b[i + 3] // GS k 73 n data (barcode)
          : 3; // one parameter byte
    i += length - 1;
  }
  return ascii(Uint8Array.from(out));
}

describe('ESC/POS encoder', () => {
  it('initialises the printer, selects the Windows-1252 code page and cuts the paper', () => {
    const bytes = encodeEscPos(doc);
    expect(Array.from(bytes.slice(0, 5))).toEqual([0x1b, 0x40, 0x1b, 0x74, 16]);
    expect(ascii(bytes)).toContain('NDJ-2026-000001');
    expect(ascii(bytes.slice(-8))).toContain('\x1dV');
  });

  it('keeps French accents as single bytes', () => {
    const bytes = encodeEscPos(doc);
    expect(ascii(bytes)).toContain('Supermarché Test');
  });

  it('never writes a line wider than the paper', () => {
    for (const columns of [32, 48]) {
      for (const line of printable(encodeEscPos(doc, columns)).split('\n')) expect(line.length).toBeLessThanOrEqual(columns);
    }
  });

  it('encodes a test page', () => {
    expect(ascii(encodeTestPage('Test imprimante'))).toContain('Test imprimante');
  });
});
