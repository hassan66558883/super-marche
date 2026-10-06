import { create } from 'zustand';
import type { CashSummary, Sale } from '@/types/sales';

export type PrintKind = 'receipt' | 'invoice';
export type PrintJob =
  | { kind: PrintKind; sale: Sale; duplicate?: boolean }
  | { kind: 'zreport'; summary: CashSummary };

interface PrintState {
  job: PrintJob | null;
  print: (kind: PrintKind, sale: Sale, opts?: { duplicate?: boolean }) => void;
  printZReport: (summary: CashSummary) => void;
  done: () => void;
}

/** Print queue consumed by <PrintHost/>: renders the document, then calls window.print(). */
export const usePrintStore = create<PrintState>((set) => ({
  job: null,
  print: (kind, sale, opts) => set({ job: { kind, sale, duplicate: opts?.duplicate } }),
  printZReport: (summary) => set({ job: { kind: 'zreport', summary } }),
  done: () => set({ job: null }),
}));
