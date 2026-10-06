import type { ReceiptDoc } from './receipt-model';
import { formatNumber, formatMoney } from '@/utils/money';

/**
 * Minimal ESC/POS encoder for 80 mm (48 columns) / 58 mm (32 columns) thermal printers.
 * Produces raw bytes from the same ReceiptDoc the browser receipt uses; a print bridge
 * (network port 9100 or a local agent) only has to forward them.
 */
const ESC = 0x1b;
const GS = 0x1d;

export function encodeEscPos(doc: ReceiptDoc, columns = 48): Uint8Array {
  const out: number[] = [];
  const raw = (...b: number[]) => out.push(...b);
  // Code page: WPC1252 covers French accents (é, è, à, ç); unsupported glyphs become '?'
  const text = (s: string) => { for (const ch of s.normalize('NFC')) { const c = ch.charCodeAt(0); out.push(c < 256 ? c : 0x3f); } };
  const line = (s = '') => { text(s); raw(0x0a); };
  const align = (n: 0 | 1 | 2) => raw(ESC, 0x61, n);
  const bold = (on: boolean) => raw(ESC, 0x45, on ? 1 : 0);
  const size = (w: number, h: number) => raw(GS, 0x21, ((w - 1) << 4) | (h - 1));
  const lr = (l: string, r: string) => {
    const space = Math.max(1, columns - l.length - r.length);
    line(l.length + r.length >= columns ? `${l}\n${' '.repeat(Math.max(0, columns - r.length))}${r}` : l + ' '.repeat(space) + r);
  };
  const rule = () => line('-'.repeat(columns));

  raw(ESC, 0x40); // init
  raw(ESC, 0x74, 16); // WPC1252
  align(1); bold(true); size(2, 2); line(doc.header.name); size(1, 1); bold(false);
  if (doc.header.slogan) line(doc.header.slogan);
  line(doc.header.branch);
  if (doc.header.address) line(doc.header.address);
  if (doc.header.phone) line(`Tel : ${doc.header.phone}`);
  if (doc.header.taxId) line(`NIF ${doc.header.taxId}`);
  if (doc.meta.duplicate) { bold(true); line('*** DUPLICATA ***'); bold(false); }
  align(0); rule();
  bold(true); line(`N° ${doc.meta.invoiceNumber}`); bold(false);
  lr('Date', doc.meta.date.toLocaleString('fr-FR'));
  lr('Caissier', doc.meta.cashier);
  if (doc.meta.customer) lr('Client', doc.meta.customer);
  rule();
  for (const l of doc.lines) {
    line(l.name.slice(0, columns));
    lr(`  ${l.qty} x ${formatNumber(l.unitPrice)}`, formatNumber(l.total));
    if (l.discount) lr('  Remise', `-${formatNumber(l.discount)}`);
  }
  rule();
  if (doc.totals.discount.gt(0)) lr('Remise', `-${formatNumber(doc.totals.discount)}`);
  if (doc.showTaxDetails) for (const t of doc.totals.taxByRate) lr(`TVA ${t.rate}%`, formatNumber(t.tax));
  bold(true); size(1, 2); lr('TOTAL TTC', formatMoney(doc.totals.total)); size(1, 1); bold(false);
  rule();
  for (const p of doc.payments) lr(p.name, formatNumber(p.amount));
  if (doc.change.gt(0)) { lr('Recu', formatNumber(doc.tendered)); bold(true); lr('Monnaie', formatMoney(doc.change)); bold(false); }
  if (doc.amountDue.gt(0)) { bold(true); lr('Reste du', formatMoney(doc.amountDue)); bold(false); }
  rule();
  align(1);
  // CODE128 barcode of the invoice number
  const code = `{B${doc.barcode}`;
  raw(GS, 0x68, 60, GS, 0x77, 2, GS, 0x48, 2, GS, 0x6b, 73, code.length); text(code);
  raw(0x0a); bold(true); line(doc.footer); bold(false);
  raw(0x0a, 0x0a, 0x0a);
  raw(GS, 0x56, 0x42, 0x00); // partial cut
  return new Uint8Array(out);
}

/** Short page used by the "test print" button in printer settings. */
export function encodeTestPage(message: string, columns = 48): Uint8Array {
  const out: number[] = [ESC, 0x40, ESC, 0x74, 16, ESC, 0x61, 1, ESC, 0x45, 1];
  const text = (s: string) => { for (const ch of s.normalize('NFC')) { const c = ch.charCodeAt(0); out.push(c < 256 ? c : 0x3f); } out.push(0x0a); };
  text('TECHNOVA POS');
  out.push(ESC, 0x45, 0);
  text('-'.repeat(columns));
  text(message);
  text(new Date().toLocaleString('fr-FR'));
  out.push(0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00);
  return new Uint8Array(out);
}
