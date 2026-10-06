import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Product } from '@/types/catalog';
import type { PaymentMethod, SaleInput } from '@/types/sales';

export type OutboxStatus = 'pending' | 'syncing' | 'failed';

/** A sale rung up while the server was unreachable, waiting to be sent. */
export interface OutboxSale {
  clientRef: string;
  branchId: string;
  userId: string;
  input: SaleInput;
  /** Provisional number printed on the receipt until the server assigns the invoice number */
  localNumber: string;
  total: string;
  createdAt: string;
  status: OutboxStatus;
  attempts: number;
  error?: { code: string; message: string };
  lastAttemptAt?: string;
}

interface PosDB extends DBSchema {
  catalog: { key: string; value: { branchId: string; syncedAt: string; items: Product[] } };
  meta: { key: string; value: { key: string; value: unknown } };
  outbox: { key: string; value: OutboxSale; indexes: { byBranch: string; byStatus: string } };
}

let dbPromise: Promise<IDBPDatabase<PosDB>> | null = null;

/** Local POS database. The caller must handle rejection (private mode, quota, old browser). */
export function db() {
  dbPromise ??= openDB<PosDB>('technova-pos', 1, {
    upgrade(d) {
      d.createObjectStore('catalog', { keyPath: 'branchId' });
      d.createObjectStore('meta', { keyPath: 'key' });
      const outbox = d.createObjectStore('outbox', { keyPath: 'clientRef' });
      outbox.createIndex('byBranch', 'branchId');
      outbox.createIndex('byStatus', 'status');
    },
  }).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('meta', key))?.value as T | undefined;
}
export async function setMeta(key: string, value: unknown) {
  await (await db()).put('meta', { key, value });
}

export const paymentMethodsKey = 'payment-methods';
export type CachedMethods = PaymentMethod[];
