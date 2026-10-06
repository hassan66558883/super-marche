import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Undo2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { Money } from '@/components/shared/Money';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ReturnsApi } from '@/services/sales.api';
import { useAuthStore } from '@/stores/auth.store';
import { formatQty } from '@/utils/money';
import { formatDateTime, isoDay, addDays } from '@/utils/format';
import type { SaleReturn } from '@/types/sales';
import { ReturnDialog } from './ReturnDialog';

export default function ReturnsPage() {
  const { t } = useTranslation();
  const branchId = useAuthStore((s) => s.branchId);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState(isoDay(addDays(new Date(), -30)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [creating, setCreating] = useState(false);
  const q = { page, pageSize: 25, search: search || undefined, from, to };
  const { data, isFetching, refetch } = useQuery({ queryKey: ['returns', q, branchId], queryFn: () => ReturnsApi.list(q), placeholderData: keepPreviousData });

  const columns = useMemo<ColumnDef<SaleReturn, unknown>[]>(() => [
    { id: 'number', header: t('sales.returnNumber'), cell: ({ row }) => <span className="font-mono font-semibold">{row.original.number}</span> },
    { id: 'date', header: t('common.date'), cell: ({ row }) => <span className="whitespace-nowrap text-sm">{formatDateTime(row.original.createdAt)}</span> },
    { id: 'sale', header: t('sales.invoiceNumber'), cell: ({ row }) => row.original.sale ? <Link to={`/sales/${row.original.sale.id}`} className="font-mono text-primary hover:underline">{row.original.sale.invoiceNumber}</Link> : '—' },
    { id: 'customer', header: t('pos.customer'), cell: ({ row }) => <span className="text-sm">{row.original.sale?.customer?.name ?? <span className="text-muted-foreground">{t('common.walkIn')}</span>}</span> },
    {
      id: 'items', header: t('common.items'),
      cell: ({ row }) => (
        <div className="max-w-72 text-sm">
          {row.original.items.map((i) => <div key={i.id} className="truncate">{formatQty(i.quantity)} × {i.saleItem?.productName}{!i.restocked && <Badge variant="muted" className="ms-1">{t('sales.notRestocked')}</Badge>}</div>)}
        </div>
      ),
    },
    { id: 'reason', header: t('common.reason'), cell: ({ row }) => <Badge variant={row.original.reason === 'DAMAGED' ? 'destructive' : 'muted'}>{t(`sales.reason${row.original.reason}`)}</Badge> },
    {
      id: 'refund', header: t('sales.refundMethod'),
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.payments?.length ? row.original.payments.map((p) => p.paymentMethod.name).join(', ') : t('sales.creditReduced')}</span>,
    },
    { id: 'user', header: t('common.user'), cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.user.fullName}</span> },
    { id: 'total', header: t('common.total'), meta: { className: 'text-end' }, cell: ({ row }) => <Money value={row.original.total} className="font-semibold text-destructive" /> },
  ], [t]);

  return (
    <>
      <PageHeader title={t('nav.returns')} description={t('sales.returnsSubtitle')} actions={<Button onClick={() => setCreating(true)}><Undo2 /> {t('sales.newReturn')}</Button>} />
      <div className="mb-4 flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={`${t('sales.returnNumber')}, ${t('sales.invoiceNumber').toLowerCase()}…`} className="sm:w-72" />
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.from')} />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.to')} />
        </div>
      </div>
      <DataTable columns={columns} data={data?.items} loading={isFetching && !data} page={page} pageSize={25} total={data?.meta.total} onPageChange={setPage} />
      <ReturnDialog open={creating} onClose={() => setCreating(false)} onDone={() => { setCreating(false); void refetch(); }} />
    </>
  );
}
