import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TransfersApi } from '@/services/stock.api';
import { useAuthStore, useCan } from '@/stores/auth.store';
import { formatDateTime } from '@/utils/format';
import type { Transfer, TransferStatus } from '@/types/stock';

export const TRANSFER_STATUSES: TransferStatus[] = ['DRAFT', 'REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'];

export default function TransfersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const branchId = useAuthStore((s) => s.branchId);
  const canCreate = useCan('transfers.create');
  const [direction, setDirection] = useState<'all' | 'out' | 'in'>('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = { page, pageSize: 25, direction, status: status === 'all' ? undefined : status, search: search || undefined };
  const { data, isFetching } = useQuery({ queryKey: ['transfers', q, branchId], queryFn: () => TransfersApi.list(q), placeholderData: keepPreviousData });

  const columns = useMemo<ColumnDef<Transfer, unknown>[]>(() => [
    { id: 'number', header: t('transfers.number'), cell: ({ row }) => <Link to={`/transfers/${row.original.id}`} className="font-mono font-semibold text-primary hover:underline">{row.original.number}</Link> },
    { id: 'date', header: t('common.date'), cell: ({ row }) => <span className="whitespace-nowrap text-sm">{formatDateTime(row.original.createdAt)}</span> },
    {
      id: 'route', header: `${t('transfers.from')} → ${t('transfers.to')}`,
      cell: ({ row: { original: tr } }) => (
        <div className="flex items-center gap-2">
          <span className={tr.fromBranchId === branchId ? 'font-semibold' : ''}>{tr.fromBranch.name}</span>
          <ArrowRight className="flip-rtl h-4 w-4 text-muted-foreground" />
          <span className={tr.toBranchId === branchId ? 'font-semibold' : ''}>{tr.toBranch.name}</span>
          <Badge variant={tr.fromBranchId === branchId ? 'muted' : 'default'}>{tr.fromBranchId === branchId ? t('transfers.outgoing') : t('transfers.incoming')}</Badge>
        </div>
      ),
    },
    { id: 'items', header: t('common.items'), meta: { className: 'text-end' }, cell: ({ row }) => <span className="tabular">{row.original._count?.items ?? row.original.items?.length ?? 0}</span> },
    { id: 'status', header: t('common.status'), cell: ({ row }) => <StatusBadge status={row.original.status} ns="transfers.status" /> },
  ], [t, branchId]);

  return (
    <>
      <PageHeader
        title={t('transfers.title')}
        description={t('transfers.workflow')}
        actions={canCreate && <Button onClick={() => navigate('/transfers/new')}><Plus /> {t('transfers.new')}</Button>}
      />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <Tabs value={direction} onValueChange={(v) => { setDirection(v as typeof direction); setPage(1); }}>
          <TabsList>
            <TabsTrigger value="all">{t('common.all')}</TabsTrigger>
            <TabsTrigger value="out">{t('transfers.outgoing')}</TabsTrigger>
            <TabsTrigger value="in">{t('transfers.incoming')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('transfers.number')} className="lg:w-64" />
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="lg:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.status')}: {t('common.all')}</SelectItem>
            {TRANSFER_STATUSES.map((s) => <SelectItem key={s} value={s}>{t(`transfers.status${s}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <DataTable columns={columns} data={data?.items} loading={isFetching && !data} page={page} pageSize={25} total={data?.meta.total}
        onPageChange={setPage} onRowClick={(r) => navigate(`/transfers/${r.id}`)} emptyText={t('transfers.empty')} />
    </>
  );
}
