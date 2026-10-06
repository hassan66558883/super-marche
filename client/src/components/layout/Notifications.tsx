import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, AlertTriangle, PackageX, Percent, Ban, Wallet, Truck, ArrowLeftRight, CheckCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';

interface Notification {
  id: string; type: string; title: string; message: string; link: string | null; readAt: string | null; createdAt: string;
}

const ICONS: Record<string, typeof Bell> = {
  LOW_STOCK: AlertTriangle, OUT_OF_STOCK: PackageX, LARGE_DISCOUNT: Percent, SALE_CANCELLED: Ban,
  CASH_DISCREPANCY: Wallet, PENDING_PURCHASE: Truck, PENDING_TRANSFER: ArrowLeftRight,
};
const TONE: Record<string, string> = {
  LOW_STOCK: 'text-warning bg-warning/10', OUT_OF_STOCK: 'text-destructive bg-destructive/10', LARGE_DISCOUNT: 'text-primary bg-primary/10',
  SALE_CANCELLED: 'text-destructive bg-destructive/10', CASH_DISCREPANCY: 'text-warning bg-warning/10',
  PENDING_PURCHASE: 'text-primary bg-primary/10', PENDING_TRANSFER: 'text-primary bg-primary/10',
};

export function NotificationsBell() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const branchId = useAuthStore((s) => s.branchId);
  const { data } = useQuery({
    queryKey: ['notifications', branchId],
    queryFn: () => api.get<{ items: Notification[]; unread: number }>('/notifications'),
    refetchInterval: 60_000,
    enabled: !!branchId,
  });
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markOne = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const unread = data?.unread ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label={`${t('nav.notifications')} (${unread})`}>
          <Bell className="h-[18px] w-[18px]" />
          {unread > 0 && (
            <span className="absolute -end-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-semibold">{t('nav.notifications')}</span>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAll.mutate()}>
              <CheckCheck /> {t('header.markAllRead')}
            </Button>
          )}
        </div>
        <ul className="max-h-[420px] overflow-y-auto">
          {!data?.items.length && <li className="px-4 py-10 text-center text-sm text-muted-foreground">{t('header.noNotifications')}</li>}
          {data?.items.map((n) => {
            const Icon = ICONS[n.type] ?? Bell;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  className={cn('flex w-full gap-3 border-b px-4 py-3 text-start last:border-0 hover:bg-muted/60', !n.readAt && 'bg-primary/[0.03]')}
                  onClick={() => {
                    if (!n.readAt) markOne.mutate(n.id);
                    if (n.link) navigate(n.link);
                  }}
                >
                  <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONE[n.type])}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {n.title}
                      {!n.readAt && <span className="h-2 w-2 rounded-full bg-primary" aria-hidden />}
                    </span>
                    <span className="block text-xs text-muted-foreground">{n.message}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground/80">{formatDateTime(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
