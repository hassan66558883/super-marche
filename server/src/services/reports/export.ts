import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import type { ReportResult } from './report.service.js';
import type { Cell, ColType } from './definitions.js';
import { VALUES, WORDS, label, type Lang } from './labels.js';

const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../assets/fonts');
const FONT = path.join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

const NUMERIC: ColType[] = ['money', 'qty', 'int', 'percent'];
const LOCALES: Record<Lang, string> = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TD-u-nu-latn' };

export interface ExportOptions { lang: Lang; currency: string }

// ───────────── value formatting (shared) ─────────────
function fmtDay(day: string, _lang: Lang) {
  const [y, m, d] = day.split('-');
  return `${d}/${m}/${y}`;
}

function fmtDateTime(iso: string, tz: string, _lang: Lang) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

const ARABIC = /[\u0621-\u064A\u0671-\u06D3\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN = /[A-Za-z\u00C0-\u024F]/;
const MIRROR: Record<string, string> = { '→': '←', '←': '→', '(': ')', ')': '(', '[': ']', ']': '[', '<': '>', '>': '<' };

/**
 * pdfkit/fontkit shape Arabic glyphs but lay out each string in a single direction and have
 * no bidi algorithm, so mixed lines come out scrambled. We compute the visual (left-to-right)
 * order of the words ourselves and draw them one by one: an Arabic word is shaped correctly
 * on its own, Latin runs (names, SKUs) keep their order, numbers follow the right-to-left flow.
 */
export function visualTokens(line: string): string[] {
  const tokens = line.split(/ +/).filter(Boolean);
  if (!tokens.some((t) => ARABIC.test(t))) return tokens;
  const kind = tokens.map((t) => (ARABIC.test(t) ? 'R' : LATIN.test(t) ? 'L' : 'N'));
  // Neutral tokens between two Latin tokens belong to the Latin run
  kind.forEach((k, i) => {
    if (k !== 'N') return;
    const prev = kind.slice(0, i).reverse().find((x) => x !== 'N');
    const next = kind.slice(i + 1).find((x) => x !== 'N');
    kind[i] = prev === 'L' && next === 'L' ? 'L' : 'R';
  });
  const runs: { ltr: boolean; tokens: string[] }[] = [];
  tokens.forEach((t, i) => {
    const ltr = kind[i] === 'L';
    const last = runs[runs.length - 1];
    if (last && last.ltr === ltr) last.tokens.push(t); else runs.push({ ltr, tokens: [t] });
  });
  return runs.reverse().flatMap((r) => (r.ltr ? r.tokens : r.tokens.reverse().map((t) => (ARABIC.test(t) ? t : t.split('').map((c) => MIRROR[c] ?? c).join('')))));
}

function fmtNumber(v: Cell, lang: Lang, maxDp = 3) {
  if (v === null || v === '') return '';
  // Normalise narrow no-break spaces so every font renders the thousands separator
  return new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: maxDp }).format(Number(v)).replace(/[\u202F\u00A0]/g, ' ');
}

export function displayValue(v: Cell, type: ColType, r: ReportResult, lang: Lang): string {
  if (v === null || v === undefined) return '';
  switch (type) {
    case 'money': return fmtNumber(v, lang, 2);
    case 'qty': return fmtNumber(v, lang, 3);
    case 'int': return fmtNumber(v, lang, 0);
    case 'percent': return `${fmtNumber(v, lang, 1)} %`;
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? fmtDay(String(v), lang) : String(v);
    case 'datetime': return fmtDateTime(String(v), r.tz, lang);
    case 'enum': return label(VALUES, String(v), lang);
    default: return String(v);
  }
}

function periodLine(r: ReportResult, lang: Lang) {
  return r.snapshot
    ? `${label(WORDS, 'asOf', lang)} ${fmtDateTime(r.generatedAt, r.tz, lang)}`
    : `${label(WORDS, 'period', lang)}${lang === 'fr' ? ' :' : ':'} ${fmtDay(r.from, lang)} → ${fmtDay(r.to, lang)}`;
}

function scopeLine(r: ReportResult, lang: Lang) {
  return r.branchLabel ?? label(WORDS, 'allBranches', lang);
}

export function fileName(r: ReportResult, ext: string) {
  const range = r.snapshot ? r.generatedAt.slice(0, 10) : r.from === r.to ? r.from : `${r.from}_${r.to}`;
  return `${r.key}_${range}.${ext}`;
}

// ───────────── CSV ─────────────
export function toCsv(r: ReportResult, { lang }: ExportOptions): Buffer {
  // French Excel expects ';' as list separator
  const sep = lang === 'fr' ? ';' : ',';
  const esc = (s: string) => (s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  // Neutralise spreadsheet formulas in free-text cells (CSV injection)
  const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
  const raw = (v: Cell, type: ColType) => {
    if (v === null || v === undefined) return '';
    if (NUMERIC.includes(type)) return lang === 'fr' ? String(v).replace('.', ',') : String(v);
    if (type === 'datetime') return fmtDateTime(String(v), r.tz, lang);
    if (type === 'enum') return label(VALUES, String(v), lang);
    return safe(String(v));
  };
  const lines = [r.columns.map((c) => esc(c.label)).join(sep)];
  for (const row of r.rows) lines.push(r.columns.map((c) => esc(raw(row[c.key], c.type))).join(sep));
  if (r.totals && Object.keys(r.totals).length) {
    lines.push(r.columns.map((c, i) => esc(i === 0 ? label(WORDS, 'totals', lang) : raw(r.totals![c.key] ?? null, c.type))).join(sep));
  }
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

// ───────────── XLSX ─────────────
export async function toXlsx(r: ReportResult, { lang, currency }: ExportOptions): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TECHNOVA POS';
  wb.created = new Date(r.generatedAt);
  const ws = wb.addWorksheet(r.title.slice(0, 31), { views: [{ rightToLeft: lang === 'ar', state: 'frozen', ySplit: 5 }] });
  const n = r.columns.length;
  ws.addRow([r.company]).font = { bold: true, size: 14 };
  ws.addRow([r.title]).font = { bold: true, size: 12 };
  ws.addRow([`${periodLine(r, lang)} · ${scopeLine(r, lang)}`]);
  ws.addRow([`${label(WORDS, 'generatedAt', lang)} ${fmtDateTime(r.generatedAt, r.tz, lang)} ${label(WORDS, 'by', lang)} ${r.generatedBy}`]).font = { italic: true, color: { argb: 'FF6B7280' } };
  for (let i = 1; i <= 4; i++) ws.mergeCells(i, 1, i, Math.max(n, 1));

  const header = ws.addRow(r.columns.map((c) => (c.type === 'money' ? `${c.label} (${currency})` : c.label)));
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12388C' } }; cell.alignment = { vertical: 'middle', wrapText: true }; });

  const cellValue = (v: Cell, type: ColType): ExcelJS.CellValue => {
    if (v === null || v === undefined || v === '') return null;
    if (NUMERIC.includes(type)) return type === 'percent' ? Number(v) / 100 : Number(v);
    if (type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) return new Date(`${v}T00:00:00Z`);
    if (type === 'datetime') return fmtDateTime(String(v), r.tz, lang);
    if (type === 'enum') return label(VALUES, String(v), lang);
    return String(v);
  };
  for (const row of r.rows) ws.addRow(r.columns.map((c) => cellValue(row[c.key], c.type)));
  if (r.totals && Object.keys(r.totals).length) {
    const t = ws.addRow(r.columns.map((c, i) => (i === 0 ? label(WORDS, 'totals', lang) : cellValue(r.totals![c.key] ?? null, c.type))));
    t.font = { bold: true };
    t.eachCell((cell) => { cell.border = { top: { style: 'thin' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; });
  }

  r.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.numFmt = c.type === 'money' ? '#,##0' : c.type === 'qty' ? '#,##0.###' : c.type === 'int' ? '#,##0' : c.type === 'percent' ? '0.0%' : c.type === 'date' ? 'dd/mm/yyyy' : '@';
    const longest = Math.max(c.label.length, ...r.rows.slice(0, 300).map((row) => displayValue(row[c.key], c.type, r, lang).length));
    col.width = Math.min(Math.max(longest + 2, 10), 48);
  });
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: Math.max(n, 1) } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ───────────── PDF ─────────────
export function toPdf(r: ReportResult, { lang, currency }: ExportOptions): Promise<Buffer> {
  const rtl = lang === 'ar';
  const landscape = r.columns.length > 6;
  const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36, bufferPages: true, info: { Title: r.title, Author: r.company, Creator: 'TECHNOVA POS' } });
  doc.registerFont('regular', FONT);
  doc.registerFont('bold', FONT_BOLD);
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on('end', () => resolve(Buffer.concat(chunks))); doc.on('error', reject); });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom;
  const align = rtl ? 'right' : 'left';
  const accent = '#12388C';
  const needsBidi = (t: string) => rtl && ARABIC.test(t);
  const lineH = () => doc.currentLineHeight(true);

  /** Draws `text` in the box (x, y, w); single line unless `wrap`, Arabic laid out word by word */
  const put = (text: string, x: number, y: number, w: number, alignment: 'left' | 'right' | 'center', wrap = false) => {
    if (!needsBidi(text)) {
      doc.text(text, x, y, wrap ? { width: w, align: alignment } : { width: w, align: alignment, lineBreak: false, ellipsis: true });
      return;
    }
    const space = doc.widthOfString(' ');
    text.split('\n').forEach((line, li) => {
      let toks = visualTokens(line);
      const total = () => toks.reduce((acc, t) => acc + doc.widthOfString(t), 0) + space * Math.max(toks.length - 1, 0);
      // Too wide: drop words from the visual left, i.e. the end of the sentence
      while (toks.length > 1 && total() > w) toks = toks.slice(1);
      let cx = alignment === 'right' ? x + w - total() : alignment === 'center' ? x + (w - total()) / 2 : x;
      for (const t of toks) { doc.text(t, cx, y + li * lineH(), { lineBreak: false }); cx += doc.widthOfString(t) + space; }
    });
  };
  const heightOf = (text: string, w: number) => (needsBidi(text) ? text.split('\n').length * lineH() : doc.heightOfString(text, { width: w }));

  // Header
  let y = 36;
  const headerLine = (text: string, font: string, size: number, color: string, gap = 2) => {
    doc.font(font).fontSize(size).fillColor(color);
    put(text, left, y, width, align);
    y += lineH() + gap;
  };
  headerLine(r.company, 'bold', 15, accent);
  headerLine(r.title, 'bold', 13, '#111827');
  headerLine(`${periodLine(r, lang)}  ·  ${scopeLine(r, lang)}`, 'regular', 9, '#374151', 1);
  headerLine(`${label(WORDS, 'generatedAt', lang)} ${fmtDateTime(r.generatedAt, r.tz, lang)} ${label(WORDS, 'by', lang)} ${r.generatedBy}`, 'regular', 9, '#6B7280');
  doc.y = y + 8;

  // Column widths: share the page width by content length, numbers stay readable
  const cols = rtl ? [...r.columns].reverse() : r.columns;
  const fontSize = cols.length > 9 ? 7 : 8;
  doc.font('regular').fontSize(fontSize);
  const sample = r.rows.slice(0, 200);
  const weights = cols.map((c) => {
    const content = Math.max(doc.widthOfString(c.label) * (rtl ? 1.05 : 0.7), ...sample.map((row) => doc.widthOfString(displayValue(row[c.key], c.type, r, lang))));
    return Math.min(Math.max(content + 8, 36), c.type === 'text' ? 220 : 110);
  });
  const scale = width / weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => w * scale);
  const xs = widths.map((_, i) => left + widths.slice(0, i).reduce((a, b) => a + b, 0));
  const rowH = fontSize + 7;

  const cellAlign = (t: ColType) => (NUMERIC.includes(t) ? 'right' : rtl ? 'right' : 'left');
  const drawHeader = () => {
    const labels = cols.map((c) => (c.type === 'money' ? `${c.label}\n(${currency})` : c.label));
    doc.font('bold').fontSize(fontSize);
    const h = Math.max(...labels.map((l, i) => heightOf(l, widths[i] - 6))) + 8;
    const top = doc.y;
    doc.rect(left, top, width, h).fill(accent);
    doc.fillColor('#FFFFFF');
    labels.forEach((l, i) => put(l, xs[i] + 3, top + 4, widths[i] - 6, cellAlign(cols[i].type), true));
    doc.y = top + h;
  };
  const drawRow = (values: string[], opts: { bold?: boolean; fill?: string }) => {
    if (doc.y + rowH > bottom) { doc.addPage(); doc.y = doc.page.margins.top; drawHeader(); }
    const top = doc.y;
    if (opts.fill) doc.rect(left, top, width, rowH).fill(opts.fill);
    doc.font(opts.bold ? 'bold' : 'regular').fontSize(fontSize).fillColor('#111827');
    values.forEach((v, i) => put(v, xs[i] + 3, top + 3.5, widths[i] - 6, cellAlign(cols[i].type)));
    doc.moveTo(left, top + rowH).lineTo(left + width, top + rowH).lineWidth(0.3).strokeColor('#E5E7EB').stroke();
    doc.y = top + rowH;
  };

  drawHeader();
  if (!r.rows.length) {
    doc.font('regular').fontSize(9).fillColor('#6B7280');
    put('—', left, doc.y + 8, width, 'center');
  }
  r.rows.forEach((row, n) => drawRow(cols.map((c) => displayValue(row[c.key], c.type, r, lang)), { fill: n % 2 ? '#F9FAFB' : undefined }));
  if (r.totals && Object.keys(r.totals).length) {
    const first = rtl ? cols.length - 1 : 0;
    drawRow(cols.map((c, i) => (i === first ? label(WORDS, 'totals', lang) : displayValue(r.totals![c.key] ?? null, c.type, r, lang))), { bold: true, fill: '#E2E8F0' });
  }

  // Footer with page numbers
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Footer sits inside the bottom margin; lift the margin so pdfkit doesn't paginate
    const margin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - margin + 10;
    doc.font('regular').fontSize(7).fillColor('#9CA3AF');
    put(`TECHNOVA POS · ${r.title}`, left, fy, width / 2, 'left');
    put(`${label(WORDS, 'page', lang)} ${i + 1} / ${range.count}`, left + width / 2, fy, width / 2, 'right');
    doc.page.margins.bottom = margin;
  }
  doc.end();
  return done;
}
