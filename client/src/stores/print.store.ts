import { create } from 'zustand';
import type { Sale } from '@/types/sales';

export type PrintKind = 'receipt' | 'invoice';
interface PrintState {
  job: { kind: PrintKind; sale: Sale; duplicate?: boolean } | null;
  print: (kind: PrintKind, sale: Sale, opts?: { duplicate?: boolean }) => void;
  done: () => void;
}

/** Print queue consumed by <PrintHost/>: renders the document, then calls window.print(). */
export const usePrintStore = create<PrintState>((set) => ({
  job: null,
  print: (kind, sale, opts) => set({ job: { kind, sale, duplicate: opts?.duplicate } }),
  done: () => set({ job: null }),
}));
