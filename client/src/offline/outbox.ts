import { create } from 'zustand';
import { api, ApiError, networkListeners } from '@/services/api';
import type { Sale, SaleInput } from '@/types/sales';
import { db, type OutboxSale } from './db';

interface OfflineState {
  /** False after a request failed for network reasons; true again on the next success */
  reachable: boolean;
  pending: number;
  failed: number;
  syncing: boolean;
  lastSyncAt: string | null;
  setReachable: (v: boolean) => void;
}

export const useOfflineStore = create<OfflineState>((set) => ({
  reachable: true, pending: 0, failed: 0, syncing: false, lastSyncAt: null,
  setReachable: (reachable) => set({ reachable }),
}));

networkListeners.add((reachable) => {
  if (useOfflineStore.getState().reachable !== reachable) useOfflineStore.setState({ reachable });
});

/** Network failure (server down, Wi-Fi lost, gateway error): the sale can be queued. */
export const isNetworkError = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504);

/** After a crash or a closed tab, a sale stuck in "syncing" goes back to the queue (the server dedupes). */
export async function recoverStuck() {
  try {
    const d = await db();
    for (const s of await d.getAllFromIndex('outbox', 'byStatus', 'syncing')) await d.put('outbox', { ...s, status: 'pending' });
  } catch { /* IndexedDB unavailable */ }
}

export async function refreshCounts() {
  try {
    const all = await (await db()).getAll('outbox');
    useOfflineStore.setState({ pending: all.filter((s) => s.status !== 'failed').length, failed: all.filter((s) => s.status === 'failed').length });
  } catch { /* IndexedDB unavailable */ }
}

export async function enqueueSale(entry: Omit<OutboxSale, 'status' | 'attempts'>) {
  await (await db()).put('outbox', { ...entry, status: 'pending', attempts: 0 });
  await refreshCounts();
}

export async function listOutbox() {
  return (await (await db()).getAll('outbox')).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function pendingForBranch(branchId: string) {
  try {
    return (await (await db()).getAllFromIndex('outbox', 'byBranch', branchId)).filter((s) => s.status !== 'failed').length;
  } catch { return 0; }
}

/** Removes a failed sale after a manager has dealt with it (re-entered it, refunded the customer…). */
export async function discardSale(clientRef: string) {
  await (await db()).delete('outbox', clientRef);
  await refreshCounts();
}

export async function retrySale(clientRef: string) {
  const d = await db();
  const s = await d.get('outbox', clientRef);
  if (s) await d.put('outbox', { ...s, status: 'pending', error: undefined });
  await refreshCounts();
  return flushOutbox();
}

let running: Promise<number> | null = null;

/**
 * Sends queued sales oldest first. The server deduplicates by clientRef, so a sale whose
 * response was lost is never recorded twice. Business errors (4xx) park the sale as
 * "failed" for review instead of dropping it; network errors stop the run.
 */
export function flushOutbox(currentUserId?: string): Promise<number> {
  running ??= (async () => {
    let sent = 0;
    useOfflineStore.setState({ syncing: true });
    try {
      const d = await db();
      const queue = (await d.getAll('outbox')).filter((s) => s.status === 'pending' && (!currentUserId || s.userId === currentUserId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const s of queue) {
        await d.put('outbox', { ...s, status: 'syncing', attempts: s.attempts + 1, lastAttemptAt: new Date().toISOString() });
        try {
          await api.post<Sale>('/sales', s.input, { 'X-Branch-Id': s.branchId });
          await d.delete('outbox', s.clientRef);
          sent++;
          useOfflineStore.setState({ reachable: true });
        } catch (e) {
          if (isNetworkError(e) || (e instanceof ApiError && (e.status === 401 || e.status >= 500))) {
            await d.put('outbox', { ...s, status: 'pending', attempts: s.attempts + 1 });
            if (isNetworkError(e)) useOfflineStore.setState({ reachable: false });
            break;
          }
          const err = e instanceof ApiError ? { code: e.code, message: e.message } : { code: 'ERROR', message: String(e) };
          await d.put('outbox', { ...s, status: 'failed', attempts: s.attempts + 1, error: err });
        }
      }
      if (sent) useOfflineStore.setState({ lastSyncAt: new Date().toISOString() });
    } catch { /* IndexedDB unavailable */ } finally {
      useOfflineStore.setState({ syncing: false });
      await refreshCounts();
      running = null;
    }
    return sent;
  })();
  return running;
}

export type { OutboxSale, SaleInput };
