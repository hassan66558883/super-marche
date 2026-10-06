import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { flushOutbox, recoverStuck, refreshCounts, useOfflineStore } from './outbox';

/** Background sync of queued offline sales: at sign-in, when the network returns, and every 30 s. */
export function useOfflineSync() {
  const userId = useAuthStore((s) => (s.status === 'authenticated' ? s.user?.id : undefined));
  const reachable = useOfflineStore((s) => s.reachable);

  useEffect(() => {
    if (!userId) return;
    let stop = false;
    void recoverStuck().then(refreshCounts).then(() => { if (!stop) void flushOutbox(userId); });
    const tick = () => { if (useOfflineStore.getState().pending > 0) void flushOutbox(userId); };
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener('online', tick);
    return () => { stop = true; window.clearInterval(timer); window.removeEventListener('online', tick); };
  }, [userId]);

  // Server reachable again: send right away
  useEffect(() => {
    if (userId && reachable && useOfflineStore.getState().pending > 0) void flushOutbox(userId);
  }, [reachable, userId]);
}
