import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Lock } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AuditApi } from '@/services/admin.api';
import { useAuthStore, useCan } from '@/stores/auth.store';
import { formatDateTime, isoDay, addDays } from '@/utils/format';
import type { AuditEntry } from '@/types/admin';

const ACTIONS = [
  'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'CREATE', 'UPDATE', 'DELETE', 'SALE', 'RETURN', 'PAYMENT', 'STOCK_ADJUSTMENT', 'PRICE_CHANGE',
  'CASH_REGISTER_OPEN', 'CASH_REGISTER_CLOSE', 'CANCEL', 'APPROVE', 'RECEIVE', 'PASSWORD_CHANGE', 'EXPORT',
] as const;

const TONE: Partial<Record<string, BadgeVariant>> = {
  LOGIN_FAILED: 'destructive', DELETE: 'destructive', CANCEL: 'destructive', SALE: 'success', PAYMENT: 'success',
  RETURN: 'warning', STOCK_ADJUSTMENT: 'warning', PRICE_CHANGE: 'warning', PASSWORD_CHANGE: 'warning', APPROVE: 'default', RECEIVE: 'default',
};

export default function AuditPage() {
  const { t } = useTranslation();
  const branchId = useAuthStore((s) => s.branchId);
  const canAll = useCan('branches.all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('all');
  const [module, setModule] = useState('all');
  const [userId, setUserId] = useState('all');
  const [scope, setScope] = useState<'branch' | 'all'>('branch');
  const [from, setFrom] = useState(isoDay(addDays(new Date(), -7)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const meta = useQuery({ queryKey: ['audit', 'meta'], queryFn: AuditApi.meta, staleTime: 60_000 });
  const q = {
    page, pageSize: 50, search: search || undefined, from, to, scope,
    action: action === 'all' ? undefined : action, module: module === 'all' ? undefined : module, userId: userId === 'all' ? undefined : userId,
  };
  const { data, isFetching } = useQuery({ queryKey: ['audit', q, branchId], queryFn: () => AuditApi.list(q), placeholderData: keepPreviousData });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(1); };

  const columns = useMemo<ColumnDef<AuditEntry, unknown>[]>(() => [
    { id: 'date', header: t('common.date'), cell: ({ row }) => <span className="whitespace-nowrap text-sm tabular">{formatDateTime(row.original.createdAt)}</span> },
    {
      id: 'user', header: t('common.user'),
      cell: ({ row: { original: e } }) => e.user
        ? <div className="text-sm"><div className="font-medium">{e.user.fullName}</div><div className="text-xs text-muted-foreground">{e.user.username}</div></div>
        : <span className="text-sm text-muted-foreground">{t('audit.system')}</span>,
    },
    { id: 'action', header: t('audit.action'), cell: ({ row }) => <Badge variant={TONE[row.original.action] ?? 'muted'}>{t(`audit.a_${row.original.action}`)}</Badge> },
    { id: 'module', header: t('audit.module'), cell: ({ row }) => <span className="text-sm">{t(`audit.m_${row.original.module}`, { defaultValue: row.original.module })}</span> },
    { id: 'desc', header: t('common.description'), cell: ({ row }) => <div className="max-w-md truncate text-sm" title={row.original.description ?? ''}>{row.original.description ?? '—'}</div> },
    { id: 'branch', header: t('header.branch'), cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.branchName ?? '—'}</span> },
    { id: 'ip', header: t('audit.ip'), cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.ipAddress ?? '—'}</span> },
  ], [t]);

  return (
    <>
      <PageHeader title={t('audit.title')} description={<span className="inline-flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" />{t('audit.subtitle')}</span>} />
      <div className="mb-4 flex flex-col flex-wrap gap-2 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={reset(setSearch)} placeholder={t('audit.searchPlaceholder')} className="lg:w-72" />
        <Select value={action} onValueChange={reset(setAction)}>
          <SelectTrigger className="lg:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('audit.action')}: {t('common.all')}</SelectItem>
            {ACTIONS.map((a) => <SelectItem key={a} value={a}>{t(`audit.a_${a}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={module} onValueChange={reset(setModule)}>
          <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('audit.module')}: {t('common.all')}</SelectItem>
            {meta.data?.modules.map((m) => <SelectItem key={m} value={m}>{t(`audit.m_${m}`, { defaultValue: m })}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={userId} onValueChange={reset(setUserId)}>
          <SelectTrigger className="lg:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.user')}: {t('common.all')}</SelectItem>
            {meta.data?.users.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
        {canAll && (
          <Select value={scope} onValueChange={reset((v: string) => setScope(v as 'branch' | 'all'))}>
            <SelectTrigger className="lg:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="branch">{t('audit.thisBranch')}</SelectItem>
              <SelectItem value="all">{t('dashboard.allBranches')}</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2">
          <Input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.from')} />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.to')} />
        </div>
      </div>
      <DataTable columns={columns} data={data?.items} loading={isFetching && !data} page={page} pageSize={50} total={data?.meta.total} onPageChange={setPage} onRowClick={setOpen}
        rowClassName={(e) => (e.action === 'LOGIN_FAILED' ? 'bg-destructive/5' : undefined)} />

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Badge variant={TONE[open.action] ?? 'muted'}>{t(`audit.a_${open.action}`)}</Badge>{open.description}</DialogTitle>
                <DialogDescription>{formatDateTime(open.createdAt)} · {open.user?.fullName ?? t('audit.system')} · {open.branchName ?? '—'}</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">{t('audit.module')}</dt><dd>{t(`audit.m_${open.module}`, { defaultValue: open.module })}</dd>
                <dt className="text-muted-foreground">{t('audit.record')}</dt><dd className="break-all font-mono text-xs">{open.recordId ?? '—'}</dd>
                <dt className="text-muted-foreground">{t('audit.ip')}</dt><dd className="font-mono text-xs">{open.ipAddress ?? '—'}</dd>
                <dt className="text-muted-foreground">{t('audit.device')}</dt><dd className="break-words text-xs text-muted-foreground">{open.userAgent ?? '—'}</dd>
              </dl>
              {open.metadata != null && (
                <div>
                  <div className="mb-1 text-sm font-medium">{t('audit.details')}</div>
                  <pre className="max-h-72 overflow-auto rounded-lg bg-muted p-3 text-xs scroll-thin" dir="ltr">{JSON.stringify(open.metadata, null, 2)}</pre>
                </div>
              )}
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="h-3 w-3" />{t('audit.immutable')}</p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
