import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CloudUpload, RefreshCw, Download, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Money } from '@/components/shared/Money';
import { flushOutbox, listOutbox, retrySale, useOfflineStore, type OutboxSale } from '@/offline/outbox';
import { useAuthStore } from '@/stores/auth.store';
import { formatDateTime } from '@/utils/format';

/** Sales recorded offline that are waiting for the server, or that it refused and need attention. */
export function OutboxDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const syncing = useOfflineStore((s) => s.syncing);
  const reachable = useOfflineStore((s) => s.reachable);
  const counts = useOfflineStore((s) => `${s.pending}-${s.failed}`);
  const [items, setItems] = useState<OutboxSale[]>([]);

  useEffect(() => {
    if (open) void listOutbox().then(setItems).catch(() => setItems([]));
  }, [open, counts, syncing]);

  const syncNow = async () => {
    const sent = await flushOutbox(userId);
    if (sent) toast.success(t('pos.outboxSent', { count: sent }));
    else if (!useOfflineStore.getState().reachable) toast.error(t('errors.NETWORK'));
  };
  const download = () => {
    const failed = items.filter((s) => s.status === 'failed');
    const blob = new Blob([JSON.stringify(failed, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ventes-hors-ligne-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const failed = items.some((s) => s.status === 'failed');

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><CloudUpload className="h-5 w-5" />{t('pos.outboxTitle')}</DialogTitle>
          <DialogDescription>{t('pos.outboxHelp')}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-lg border scroll-thin">
          {items.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">{t('pos.outboxEmpty')}</li>}
          {items.map((s) => (
            <li key={s.clientRef} className="flex items-start gap-3 p-3">
              {s.status === 'failed' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{s.localNumber}</span>
                  <Badge variant={s.status === 'failed' ? 'destructive' : 'warning'}>{t(`pos.outbox_${s.status}`)}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{formatDateTime(s.createdAt)} · {t('pos.items', { count: s.input.items.length })}</div>
                {s.error && <div className="mt-1 text-xs text-destructive">{t(`errors.${s.error.code}`, { defaultValue: s.error.message })}</div>}
              </div>
              <div className="text-end">
                <Money value={s.total} className="font-semibold" />
                {s.status === 'failed' && <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => void retrySale(s.clientRef)}>{t('pos.outboxRetry')}</Button>}
              </div>
            </li>
          ))}
        </ul>
        {failed && <p className="text-xs text-muted-foreground">{t('pos.outboxFailedHelp')}</p>}
        <DialogFooter className="gap-2 sm:justify-between">
          {failed ? <Button variant="outline" onClick={download}><Download /> {t('pos.outboxDownload')}</Button> : <span />}
          <Button onClick={() => void syncNow()} loading={syncing} disabled={!items.some((s) => s.status === 'pending')}>
            <RefreshCw /> {reachable ? t('pos.outboxSync') : t('pos.outboxTry')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
