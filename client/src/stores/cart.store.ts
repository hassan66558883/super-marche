import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Customer, Product } from '@/types/catalog';
import type { DiscountType } from '@/types/sales';
import { D } from '@/utils/money';

/** Snapshot of what the cart needs from a product (kept small: the cart is persisted). */
export interface CartLine {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  sku: string;
  unitPrice: string; // catalog price at the time it was added (or override)
  catalogPrice: string;
  quantity: string;
  allowDecimal: boolean;
  unitCode: string | null;
  taxRate: string;
  priceMode: 'INCLUSIVE' | 'EXCLUSIVE';
  stock: string | null; // null = not tracked
  discountType: DiscountType | null;
  discountValue: string | null;
  category: { icon: string | null; color: string | null } | null;
  imageUrl: string | null;
}

export type CartCustomer = Pick<Customer, 'id' | 'code' | 'name' | 'type' | 'phone' | 'balance' | 'creditLimit' | 'paymentTermsDays'>;

export interface PaymentDraft { id: string; method: string; amount: string; reference: string }

interface CartState {
  lines: CartLine[];
  customer: CartCustomer | null;
  cartDiscount: { type: DiscountType; value: string } | null;
  note: string;
  /** Last line touched, highlighted and used by +/- keys */
  activeKey: string | null;
  payments: PaymentDraft[];
  setPayments: (p: PaymentDraft[]) => void;
  add: (p: Product, variantId?: string | null, qty?: number) => CartLine;
  setQty: (key: string, qty: string) => void;
  inc: (key: string, delta: number) => void;
  remove: (key: string) => void;
  setLine: (key: string, patch: Partial<Pick<CartLine, 'unitPrice' | 'discountType' | 'discountValue'>>) => void;
  setCustomer: (c: CartCustomer | null) => void;
  setCartDiscount: (d: CartState['cartDiscount']) => void;
  setNote: (n: string) => void;
  setActive: (key: string | null) => void;
  clear: () => void;
  load: (s: Pick<CartState, 'lines' | 'customer' | 'cartDiscount' | 'note'>) => void;
}

const lineKey = (productId: string, variantId: string | null) => `${productId}:${variantId ?? '-'}`;

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      customer: null,
      cartDiscount: null,
      note: '',
      activeKey: null,
      payments: [],
      setPayments: (payments) => set({ payments }),
      add: (p, variantId = null, qty = 1) => {
        const key = lineKey(p.id, variantId);
        const existing = get().lines.find((l) => l.key === key);
        if (existing) {
          const next = { ...existing, quantity: D(existing.quantity).plus(qty).toString() };
          set({ lines: get().lines.map((l) => (l.key === key ? next : l)), activeKey: key });
          return next;
        }
        const v = variantId ? p.variants.find((x) => x.id === variantId) ?? null : null;
        const price = v?.sellingPrice ?? p.sellingPrice;
        const line: CartLine = {
          key, productId: p.id, variantId, name: p.name, variantName: v?.name ?? null, sku: v?.sku ?? p.sku,
          unitPrice: price, catalogPrice: price, quantity: String(qty), allowDecimal: !!p.unit?.allowDecimal, unitCode: p.unit?.code ?? null,
          taxRate: p.tax?.rate ?? '0', priceMode: p.priceMode, stock: p.trackStock ? (v ? v.stock : p.stock) : null,
          discountType: null, discountValue: null, category: p.category ? { icon: p.category.icon, color: p.category.color } : null, imageUrl: p.imageUrl,
        };
        set({ lines: [...get().lines, line], activeKey: key });
        return line;
      },
      setQty: (key, qty) => {
        const q = D(qty);
        if (q.lte(0)) return get().remove(key);
        set({ lines: get().lines.map((l) => (l.key === key ? { ...l, quantity: (l.allowDecimal ? q.toDecimalPlaces(3) : q.ceil()).toString() } : l)), activeKey: key });
      },
      inc: (key, delta) => {
        const l = get().lines.find((x) => x.key === key);
        if (l) get().setQty(key, D(l.quantity).plus(delta).toString());
      },
      remove: (key) => set({ lines: get().lines.filter((l) => l.key !== key), activeKey: get().activeKey === key ? null : get().activeKey }),
      setLine: (key, patch) => set({ lines: get().lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }),
      setCustomer: (customer) => set({ customer }),
      setCartDiscount: (cartDiscount) => set({ cartDiscount }),
      setNote: (note) => set({ note }),
      setActive: (activeKey) => set({ activeKey }),
      clear: () => set({ lines: [], customer: null, cartDiscount: null, note: '', activeKey: null, payments: [] }),
      load: (s) => set({ ...s, payments: [], activeKey: s.lines.at(-1)?.key ?? null }),
    }),
    // Survives a page reload or a crash in the middle of a sale (per tab, never shared)
    { name: 'technova-cart', storage: createJSONStorage(() => sessionStorage), partialize: (s) => ({ lines: s.lines, customer: s.customer, cartDiscount: s.cartDiscount, note: s.note }) },
  ),
);
