import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Money } from '@/components/shared/Money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PurchasesApi } from '@/services/stock.api';
import { useAuthStore, useCan } from '@/stores/auth.store';
import { D } from '@/utils/money';
import { formatDate, formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { PurchaseOrder, PurchaseStatus } from '@/types/stock';

const STATUSES: PurchaseStatus[] = ['DRAFT', 'PENDING', 'APPROVED', 'RECEIVED', 'CANCELLED'];

export default function PurchasesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const branchId = useAuthStore((s) => s.branchId);
  const canCreate = useCan('purchases.create');
  const status = params.get('status') ?? 'all';
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = { page, pageSize: 25, status: status === 'all' ? undefined : status, search: search || undefined, from: from || undefined, to: to || undefined };
  const { data, isFetching } = useQuery({ queryKey: ['purchases', q, branchId], queryFn: () => PurchasesApi.list(q), placeholderData: keepPreviousData });

  const columns = useMemo<ColumnDef<PurchaseOrder, unknown>[]>(() => [
    { id: 'number', header: t('purchases.number'), cell: ({ row }) => <Link to={`/purchases/${row.original.id}`} className="font-mono font-semibold text-primary hover:underline">{row.original.number}</Link> },
    { id: 'date', header: t('common.date'), cell: ({ row }) => <span className="whitespace-nowrap text-sm">{formatDateTime(row.original.createdAt)}</span> },
    { id: 'supplier', header: t('purchases.supplier'), cell: ({ row }) => <div><div className="font-medium">{row.original.supplier.name}</div>{row.original.supplier.company && <div className="text-xs text-muted-foreground">{row.original.supplier.company}</div>}</div> },
    { id: 'expected', header: t('purchases.expectedAt'), cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.expectedAt ? formatDate(row.original.expectedAt) : '—'}</span> },
    { id: 'total', header: t('common.total'), meta: { className: 'text-end' }, cell: ({ row }) => <Money value={row.original.total} className="font-semibold" /> },
    {
      id: 'paid', header: t('common.due'), meta: { className: 'text-end' },
      cell: ({ row: { original: p } }) => {
        if (p.status !== 'RECEIVED' && p.status !== 'APPROVED') return <span className="text-muted-foreground">—</span>;
        const due = D(p.total).minus(D(p.amountPaid));
        return <Money value={due} className={cn(due.gt(0) ? 'text-warning' : 'text-success')} />;
      },
    },
    { id: 'status', header: t('common.status'), cell: ({ row }) => <StatusBadge status={row.original.status} ns="purchases.status" /> },
  ], [t]);

  return (
    <>
      <PageHeader
        title={t('purchases.title')}
        description={t('purchases.subtitle')}
        actions={canCreate && <Button onClick={() => navigate('/purchases/new')}><Plus /> {t('purchases.new')}</Button>}
      />
      <div className="mb-4 flex flex-col flex-wrap gap-2 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={`${t('purchases.number')}, ${t('purchases.supplier').toLowerCase()}…`} className="lg:w-72" />
        <Select value={status} onValueChange={(v) => { setParams(v === 'all' ? {} : { status: v }); setPage(1); }}>
          <SelectTrigger className="lg:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.status')}: {t('common.all')}</SelectItem>
            {STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`purchases.status${s}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.from')} />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.to')} />
        </div>
      </div>
      <DataTable columns={columns} data={data?.items} loading={isFetching && !data} page={page} pageSize={25} total={data?.meta.total}
        onPageChange={setPage} onRowClick={(r) => navigate(`/purchases/${r.id}`)} emptyText={t('purchases.empty')} />
    </>
  );
}
