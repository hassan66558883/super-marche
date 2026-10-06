import { api } from '@/services/api';
import type { Product } from '@/types/catalog';
import { db } from './db';

let memo: { branchId: string; syncedAt: string; items: Product[]; index: Map<string, { product: Product; variantId: string | null }> } | null = null;

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function buildIndex(items: Product[]) {
  const index = new Map<string, { product: Product; variantId: string | null }>();
  for (const p of items) {
    index.set(p.sku.toLowerCase(), { product: p, variantId: null });
    for (const b of p.barcodes ?? []) index.set(b.barcode.toLowerCase(), { product: p, variantId: b.variantId });
    for (const v of p.variants ?? []) if (v.sku) index.set(v.sku.toLowerCase(), { product: p, variantId: v.id });
  }
  return index;
}

/** Downloads the branch catalog (prices, stock, barcodes) into IndexedDB for offline selling. */
export async function syncCatalog(branchId: string) {
  const res = await api.get<{ syncedAt: string; items: Product[] }>('/products/pos/catalog');
  const entry = { branchId, syncedAt: res.syncedAt, items: res.items };
  memo = { ...entry, index: buildIndex(res.items) };
  try { await (await db()).put('catalog', entry); } catch { /* storage unavailable: memory copy still works this session */ }
  return { count: res.items.length, syncedAt: res.syncedAt };
}

async function load(branchId: string) {
  if (memo?.branchId === branchId) return memo;
  const entry = await (await db()).get('catalog', branchId);
  if (!entry) return null;
  memo = { ...entry, index: buildIndex(entry.items) };
  return memo;
}

export async function catalogInfo(branchId: string) {
  try {
    const c = await load(branchId);
    return c ? { count: c.items.length, syncedAt: c.syncedAt } : null;
  } catch { return null; }
}

/** Same contract as GET /products/pos, answered from the local copy. */
export async function searchLocal(branchId: string, q: { q?: string; categoryId?: string; quick?: boolean; pageSize?: number }) {
  const c = await load(branchId);
  if (!c) return { items: [] as Product[], total: 0, exact: null as null | { productId: string; variantId: string | null } };
  const size = q.pageSize ?? 60;
  if (q.q) {
    const hit = c.index.get(q.q.trim().toLowerCase());
    if (hit) return { items: [hit.product], total: 1, exact: { productId: hit.product.id, variantId: hit.variantId } };
    const words = norm(q.q).split(/\s+/).filter(Boolean);
    const items = c.items.filter((p) => { const hay = norm(`${p.name} ${p.sku} ${p.brand?.name ?? ''}`); return words.every((w) => hay.includes(w)); });
    return { items: items.slice(0, size), total: items.length, exact: null };
  }
  let items = c.items;
  if (q.categoryId) items = items.filter((p) => p.category?.id === q.categoryId);
  if (q.quick) items = items.filter((p) => p.isQuick);
  return { items: items.slice(0, size), total: items.length, exact: null };
}

export async function findLocalByCode(branchId: string, code: string) {
  const c = await load(branchId);
  return c?.index.get(code.trim().toLowerCase()) ?? null;
}

/** Keeps the local stock roughly right between syncs after an offline sale. */
export async function decrementLocalStock(branchId: string, lines: { productId: string; variantId: string | null; quantity: string }[]) {
  const c = await load(branchId);
  if (!c) return;
  for (const l of lines) {
    const p = c.items.find((x) => x.id === l.productId);
    if (!p) continue;
    if (l.variantId) {
      const v = p.variants.find((x) => x.id === l.variantId) as { stock?: string | null } | undefined;
      if (v && v.stock != null) v.stock = String(Number(v.stock) - Number(l.quantity));
    } else if (p.stock != null) {
      p.stock = String(Number(p.stock) - Number(l.quantity));
    }
  }
  try { await (await db()).put('catalog', { branchId, syncedAt: c.syncedAt, items: c.items }); } catch { /* ignore */ }
}
