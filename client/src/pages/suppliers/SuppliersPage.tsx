import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Phone } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Money } from '@/components/shared/Money';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SuppliersApi } from '@/services/stock.api';
import { useCan } from '@/stores/auth.store';
import { D } from '@/utils/money';
import type { Supplier } from '@/types/stock';
import { SupplierFormDialog } from './SupplierFormDialog';

export default function SuppliersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canManage = useCan('suppliers.manage');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('ACTIVE');
  const [creating, setCreating] = useState(false);
  const q = { page, pageSize: 25, search: search || undefined, status: filter === 'DEBT' ? 'ACTIVE' : filter, withBalance: filter === 'DEBT' ? 'true' : undefined };
  const { data, isFetching } = useQuery({ queryKey: ['suppliers', q], queryFn: () => SuppliersApi.list(q), placeholderData: keepPreviousData });

  const columns = useMemo<ColumnDef<Supplier, unknown>[]>(() => [
    {
      id: 'name', header: t('common.name'),
      cell: ({ row: { original: s } }) => (
        <div>
          <Link to={`/suppliers/${s.id}`} className="font-medium hover:underline">{s.name}</Link>
          <div className="text-xs text-muted-foreground"><span className="font-mono">{s.code}</span>{s.company && ` · ${s.company}`}</div>
        </div>
      ),
    },
    { id: 'phone', header: t('common.phone'), cell: ({ row }) => row.original.phone ? <a href={`tel:${row.original.phone}`} className="flex items-center gap-1.5 text-sm" onClick={(e) => e.stopPropagation()}><Phone className="h-3.5 w-3.5 text-muted-foreground" />{row.original.phone}</a> : <span className="text-muted-foreground">—</span> },
    { id: 'terms', header: t('suppliers.paymentTerms'), cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.paymentTerms ?? '—'}</span> },
    { id: 'balance', header: t('suppliers.balance'), meta: { className: 'text-end' }, cell: ({ row }) => <Money value={row.original.balance} className={D(row.original.balance).gt(0) ? 'font-semibold text-warning' : 'text-muted-foreground'} /> },
    { id: 'status', header: t('common.status'), cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ], [t]);

  return (
    <>
      <PageHeader
        title={t('suppliers.title')}
        description={t('suppliers.subtitle')}
        actions={canManage && <Button onClick={() => setCreating(true)}><Plus /> {t('suppliers.new')}</Button>}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={`${t('common.name')}, ${t('common.code').toLowerCase()}, ${t('common.phone').toLowerCase()}…`} className="sm:w-80" />
        <Select value={filter} onValueChange={(v) => { setFilter(v); setPage(1); }}>
          <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">{t('common.active')}</SelectItem>
            <SelectItem value="DEBT">{t('suppliers.withBalance')}</SelectItem>
            <SelectItem value="INACTIVE">{t('common.inactive')}</SelectItem>
            <SelectItem value="ALL">{t('common.all')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable columns={columns} data={data?.items} loading={isFetching && !data} page={page} pageSize={25} total={data?.meta.total} onPageChange={setPage} onRowClick={(s) => navigate(`/suppliers/${s.id}`)} />
      <SupplierFormDialog open={creating} onOpenChange={setCreating} onSaved={(s) => navigate(`/suppliers/${s.id}`)} />
    </>
  );
}
