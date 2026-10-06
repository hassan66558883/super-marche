import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Store, Wallet, History, ShoppingCart } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { Money } from '@/components/shared/Money';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { FormField } from '@/components/shared/FormField';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CashApi } from '@/services/sales.api';
import { useAuthStore, useCan } from '@/stores/auth.store';
import { D, formatNumber, parseAmount } from '@/utils/money';
import { formatDateTime, isoDay, addDays } from '@/utils/format';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';
import type { CashSession } from '@/types/sales';
import { SessionView } from './SessionView';

export default function CashPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const canOperate = useCan('cash.operate');
  const tab = params.get('tab') ?? (canOperate ? 'current' : 'history');
  return (
    <>
      <PageHeader title={t('cash.title')} description={t('cash.subtitle')} />
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList>
          {canOperate && <TabsTrigger value="current"><Wallet className="h-4 w-4" /> {t('cash.current')}</TabsTrigger>}
          <TabsTrigger value="history"><History className="h-4 w-4" /> {t('cash.history')}</TabsTrigger>
        </TabsList>
        {canOperate && <TabsContent value="current"><CurrentSession /></TabsContent>}
        <TabsContent value="history"><SessionHistory /></TabsContent>
      </Tabs>
    </>
  );
}

function CurrentSession() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const branchId = useAuthStore((s) => s.branchId);
  const current = useQuery({ queryKey: ['cash', 'current', branchId], queryFn: CashApi.current });
  const detail = useQuery({ queryKey: ['cash', 'session', current.data?.session.id], queryFn: () => CashApi.session(current.data!.session.id), enabled: !!current.data });

  if (current.isLoading) return <Skeleton className="h-96" />;
  if (!current.data) return <OpenRegisterCard onOpened={() => void qc.invalidateQueries({ queryKey: ['cash'] })} />;
  if (!detail.data) return <Skeleton className="h-96" />;
  const s = detail.data;
  return (
    <>
      <Card className="mb-4 flex flex-wrap items-center gap-4 p-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-success/15 text-success"><Store className="h-5 w-5" /></span>
        <div className="me-auto">
          <div className="font-semibold">{s.session.register.name} <StatusBadge status="OPEN" ns="cash.status" /></div>
          <div className="text-sm text-muted-foreground">{t('cash.openedAt')} {formatDateTime(s.session.openedAt)}</div>
        </div>
        <div className="text-end">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{t('cash.expected')}</div>
          <Money value={s.expected} className="text-2xl font-bold" />
        </div>
        <Button variant="secondary" onClick={() => navigate('/pos')}><ShoppingCart /> {t('nav.pos')}</Button>
      </Card>
      <SessionView summary={s} onChanged={(z) => {
        if (z) qc.setQueryData(['cash', 'session', z.session.id], z);
        void qc.invalidateQueries({ queryKey: ['cash'] });
        if (z) navigate(`/cash/sessions/${z.session.id}`);
      }} />
    </>
  );
}

function OpenRegisterCard({ onOpened }: { onOpened: () => void }) {
  const { t } = useTranslation();
  const registers = useQuery({ queryKey: ['cash', 'registers'], queryFn: CashApi.registers });
  const [registerId, setRegisterId] = useState('');
  const [amount, setAmount] = useState('');
  useEffect(() => {
    const free = registers.data?.find((r) => !r.openSession);
    if (free && !registerId) setRegisterId(free.id);
  }, [registers.data, registerId]);
  const open = useMutation({
    mutationFn: () => CashApi.open({ registerId, amount: Number(amount || 0) }),
    onSuccess: () => { toast.success(t('pos.registerOpened')); onOpened(); },
    onError: toastError,
  });
  return (
    <Card className="mx-auto max-w-xl">
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Store className="h-6 w-6" /></span>
          <div><div className="text-lg font-semibold">{t('cash.noOpenSession')}</div><div className="text-sm text-muted-foreground">{t('pos.openRegisterFirst')}</div></div>
        </div>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (registerId) open.mutate(); }}>
          <div className="grid grid-cols-2 gap-2">
            {registers.data?.map((r) => (
              <button key={r.id} type="button" disabled={!!r.openSession} onClick={() => setRegisterId(r.id)}
                className={cn('rounded-lg border p-3 text-start transition disabled:cursor-not-allowed disabled:opacity-50', registerId === r.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted')}>
                <div className="font-semibold">{r.name}</div>
                <div className="text-xs text-muted-foreground">{r.openSession ? `${t('cash.openedBy')} ${r.openSession.openedBy.fullName}` : t('cash.statusCLOSED')}</div>
              </button>
            ))}
          </div>
          <FormField label={t('pos.openingAmount')} htmlFor="cash-open-amount">
            <Input id="cash-open-amount" value={amount ? formatNumber(amount) : ''} onChange={(e) => setAmount(parseAmount(e.target.value))} inputMode="numeric" placeholder="0" className="h-12 text-end text-xl font-bold" />
          </FormField>
          <Button type="submit" className="h-12 w-full" disabled={!registerId} loading={open.isPending}>{t('pos.openRegister')}</Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SessionHistory() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const branchId = useAuthStore((s) => s.branchId);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [from, setFrom] = useState(isoDay(addDays(new Date(), -30)));
  const [to, setTo] = useState(isoDay(new Date()));
  const q = { page, pageSize: 25, status: status === 'all' ? undefined : status, from, to };
  const { data, isFetching } = useQuery({ queryKey: ['cash', 'sessions', q, branchId], queryFn: () => CashApi.sessions(q), placeholderData: keepPreviousData });
  const columns = useMemo<ColumnDef<CashSession, unknown>[]>(() => [
    { id: 'register', header: t('cash.register'), cell: ({ row }) => <span className="font-medium">{row.original.register.name}</span> },
    { id: 'opened', header: t('cash.openedAt'), cell: ({ row }) => <div className="text-sm"><div>{formatDateTime(row.original.openedAt)}</div><div className="text-muted-foreground">{row.original.openedBy.fullName}</div></div> },
    { id: 'closed', header: t('cash.closedAt'), cell: ({ row }) => row.original.closedAt ? <div className="text-sm"><div>{formatDateTime(row.original.closedAt)}</div><div className="text-muted-foreground">{row.original.closedBy?.fullName}</div></div> : <span className="text-muted-foreground">—</span> },
    { id: 'opening', header: t('cash.opening'), meta: { className: 'text-end' }, cell: ({ row }) => <Money value={row.original.openingAmount} className="text-muted-foreground" /> },
    { id: 'expected', header: t('cash.expected'), meta: { className: 'text-end' }, cell: ({ row }) => row.original.expectedAmount ? <Money value={row.original.expectedAmount} /> : <span className="text-muted-foreground">—</span> },
    { id: 'counted', header: t('cash.counted'), meta: { className: 'text-end' }, cell: ({ row }) => row.original.countedAmount ? <Money value={row.original.countedAmount} /> : <span className="text-muted-foreground">—</span> },
    {
      id: 'diff', header: t('cash.difference'), meta: { className: 'text-end' },
      cell: ({ row }) => row.original.difference == null ? <span className="text-muted-foreground">—</span>
        : <span className={cn('font-semibold tabular', D(row.original.difference).isZero() ? 'text-success' : 'text-destructive')}>{D(row.original.difference).gt(0) ? '+' : ''}<Money value={row.original.difference} /></span>,
    },
    { id: 'status', header: t('common.status'), cell: ({ row }) => <StatusBadge status={row.original.status} ns="cash.status" /> },
  ], [t]);
  return (
    <>
      <div className="mb-4 flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center">
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.status')}: {t('common.all')}</SelectItem>
            <SelectItem value="OPEN">{t('cash.statusOPEN')}</SelectItem>
            <SelectItem value="CLOSED">{t('cash.statusCLOSED')}</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.from')} />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.to')} />
        </div>
      </div>
      <DataTable columns={columns} data={data?.items} loading={isFetching && !data} page={page} pageSize={25} total={data?.meta.total} onPageChange={setPage} onRowClick={(r) => navigate(`/cash/sessions/${r.id}`)} />
    </>
  );
}
