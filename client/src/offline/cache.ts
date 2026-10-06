import { getMeta, setMeta } from './db';
import { isNetworkError } from './outbox';

/** Runs a read request and keeps its last result in IndexedDB; offline, the saved copy is returned. */
export async function withOfflineCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  try {
    const data = await fn();
    void setMeta(key, data).catch(() => undefined);
    return data;
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    const cached = await getMeta<T>(key).catch(() => undefined);
    if (cached === undefined) throw e;
    return cached;
  }
}
