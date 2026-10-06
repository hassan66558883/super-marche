import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ShoppingCart, X } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Money } from '@/components/shared/Money';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SalesApi } from '@/services/sales.api';
import { useAuthStore, useCan } from '@/stores/auth.store';
import { D } from '@/utils/money';
import { formatDate, formatDateTime, isoDay, addDays } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { SaleListItem } from '@/types/sales';

type Mode = 'sales' | 'invoices';

/**
 * /sales — every ticket of the branch (cashiers see their own).
 * /invoices — customer invoices with money still owed, with due dates.
 */
export default function SalesPage({ mode = 'sales' }: { mode?: Mode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const branchId = useAuthStore((s) => s.branchId);
  const canSell = useCan('sales.create');
  const sessionId = params.get('registerSessionId') ?? undefined;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [payment, setPayment] = useState(mode === 'invoices' || params.get('unpaid') ? 'unpaid' : 'all');
  const [from, setFrom] = useState(mode === 'invoices' || sessionId || params.get('unpaid') ? '' : isoDay(addDays(new Date(), -7)));
  const [to, setTo] = useState(mode === 'invoices' || sessionId || params.get('unpaid') ? '' : isoDay(new Date()));
  const q = {
    page, pageSize: 25, search: search || undefined, from: from || undefined, to: to || undefined, registerSessionId: sessionId,
    status: status === 'all' ? undefined : status,
    paymentStatus: ['PAID', 'PARTIAL', 'CREDIT'].includes(payment) ? payment : undefined,
    unpaid: payment === 'unpaid' ? 'true' : undefined, overdue: payment === 'overdue' ? 'true' : undefined,
  };
  const { data, isFetching } = useQuery({ queryKey: ['sales', q, branchId], queryFn: () => SalesApi.list(q), placeholderData: keepPreviousData });
  const sums = data?.meta.sums as { total: string; due: string } | undefined;

  const columns = useMemo<ColumnDef<SaleListItem, unknown>[]>(() => [
    { id: 'invoice', header: t('sales.invoiceNumber'), cell: ({ row }) => <Link to={`/sales/${row.original.id}`} className="font-mono font-semibold text-primary hover:underline">{row.original.invoiceNumber}</Link> },
    { id: 'date', header: t('common.date'), cell: ({ row }) => <span className="whitespace-nowrap text-sm">{formatDateTime(row.original.createdAt)}</span> },
    { id: 'customer', header: t('pos.customer'), cell: ({ row }) => row.original.customer ? <Link to={`/customers/${row.original.customer.id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.customer.name}</Link> : <span className="text-muted-foreground">{t('common.walkIn')}</span> },
    ...(mode === 'sales' ? [
      { id: 'cashier', header: t('receipt.cashier'), cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.cashier.fullName}</span> } as ColumnDef<SaleListItem, unknown>,
      { id: 'methods', header: t('pos.payment'), cell: ({ row }) => <div className="flex flex-wrap gap-1">{[...new Set(row.original.payments.map((p) => p.paymentMethod.name))].map((n) => <Badge key={n} variant="muted">{n}</Badge>)}</div> } as ColumnDef<SaleListItem, unknown>,
    ] : [
      {
        id: 'dueDate', header: t('sales.dueDate'),
        cell: ({ row }) => {
          const d = row.original.dueDate;
          if (!d) return <span className="text-muted-foreground">—</span>;
          const late = new Date(d) < new Date() && D(row.original.amountDue).gt(0);
          return <span className={cn('text-sm', late && 'font-semibold text-destructive')}>{formatDate(d)}{late && ` · ${t('sales.overdue')}`}</span>;
        },
      } as ColumnDef<SaleListItem, unknown>,
    ]),
    { id: 'total', header: t('common.total'), meta: { className: 'text-end' }, cell: ({ row }) => <Money value={row.original.total} className={cn('font-semibold', row.original.status === 'CANCELLED' && 'line-through text-muted-foreground')} /> },
    { id: 'due', header: t('common.due'), meta: { className: 'text-end' }, cell: ({ row }) => D(row.original.amountDue).gt(0) && row.original.status !== 'CANCELLED' ? <Money value={row.original.amountDue} className="font-semibold text-warning" /> : <span className="text-muted-foreground">—</span> },
    {
      id: 'status', header: t('common.status'),
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          <StatusBadge status={row.original.status} ns="sales.status" />
          {row.original.status !== 'CANCELLED' && row.original.paymentStatus !== 'PAID' && <StatusBadge status={row.original.paymentStatus} ns="sales.payment" />}
        </div>
      ),
    },
  ], [t, mode]);

  return (
    <>
      <PageHeader
        title={mode === 'invoices' ? t('nav.invoices') : t('sales.title')}
        description={mode === 'invoices' ? t('sales.invoicesSubtitle') : t('sales.subtitle')}
        actions={canSell && <Button onClick={() => navigate('/pos')}><ShoppingCart /> {t('nav.pos')}</Button>}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{mode === 'invoices' ? t('nav.invoices') : t('dashboard.transactions')}</div><div className="mt-1 text-xl font-bold">{data?.meta.total ?? '—'}</div></Card>
        <Card className="p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('common.total')}</div><Money value={sums?.total} className="mt-1 block text-xl font-bold" /></Card>
        <Card className="p-4"><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('common.due')}</div><Money value={sums?.due} className={cn('mt-1 block text-xl font-bold', D(sums?.due).gt(0) && 'text-warning')} /></Card>
      </div>
      <div className="mb-4 flex flex-col flex-wrap gap-2 lg:flex-row lg:items-center">
        {sessionId && (
          <Badge variant="default" className="h-9 gap-2 px-3 text-sm">{t('cash.sessionSales')}
            <button type="button" onClick={() => { params.delete('registerSessionId'); setParams(params); }} aria-label={t('common.remove')}><X className="h-3.5 w-3.5" /></button>
          </Badge>
        )}
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={`${t('sales.invoiceNumber')}, ${t('pos.customer').toLowerCase()}…`} className="lg:w-72" />
        {mode === 'sales' && (
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="lg:w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.status')}: {t('common.all')}</SelectItem>
              {['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CANCELLED'].map((s) => <SelectItem key={s} value={s}>{t(`sales.status${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={payment} onValueChange={(v) => { setPayment(v); setPage(1); }}>
          <SelectTrigger className="lg:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('pos.payment')}: {t('common.all')}</SelectItem>
            <SelectItem value="unpaid">{t('sales.unpaidOnly')}</SelectItem>
            <SelectItem value="overdue">{t('sales.overdueOnly')}</SelectItem>
            {['PAID', 'PARTIAL', 'CREDIT'].map((s) => <SelectItem key={s} value={s}>{t(`sales.payment${s}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.from')} />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.to')} />
        </div>
      </div>
      <DataTable columns={columns} data={data?.items} loading={isFetching && !data} page={page} pageSize={25} total={data?.meta.total}
        onPageChange={setPage} onRowClick={(s) => navigate(`/sales/${s.id}`)} rowClassName={(s) => (s.status === 'CANCELLED' ? 'opacity-60' : undefined)} />
    </>
  );
}
