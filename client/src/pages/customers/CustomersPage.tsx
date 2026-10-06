import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Building2, Plus, User } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { Money } from '@/components/shared/Money';
import { CustomerFormDialog } from '@/components/shared/CustomerFormDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomersApi } from '@/services/catalog.api';
import { useCan } from '@/stores/auth.store';
import { D } from '@/utils/money';
import type { Customer } from '@/types/catalog';

export default function CustomersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canCreate = useCan('customers.create');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [type, setType] = useState('all');
  const [balance, setBalance] = useState('all');
  const [creating, setCreating] = useState(false);
  const q = { page, pageSize: 25, search: search || undefined, type: type === 'all' ? undefined : type, withBalance: balance === 'due' ? 'true' : undefined };
  const { data, isFetching } = useQuery({ queryKey: ['customers', q], queryFn: () => CustomersApi.list(q), placeholderData: keepPreviousData });

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(() => [
    {
      id: 'name', header: t('common.name'),
      cell: ({ row: { original: c } }) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            {c.type === 'BUSINESS' ? <Building2 className="h-4 w-4" /> : <User className="h-4 w-4" />}
          </span>
          <div>
            <div className="font-medium">{c.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{c.code}</div>
          </div>
        </div>
      ),
    },
    { id: 'type', header: t('common.type'), cell: ({ row }) => <Badge variant="muted">{t(`customers.type${row.original.type}`)}</Badge> },
    { id: 'phone', header: t('common.phone'), cell: ({ row }) => <span className="whitespace-nowrap">{row.original.phone ?? '—'}</span> },
    { id: 'creditLimit', header: t('customers.creditLimit'), meta: { className: 'text-end' }, cell: ({ row }) => <Money value={row.original.creditLimit} className="text-muted-foreground" /> },
    {
      id: 'balance', header: t('customers.balance'), meta: { className: 'text-end' },
      cell: ({ row: { original: c } }) => {
        const over = D(c.creditLimit).gt(0) && D(c.balance).gt(D(c.creditLimit));
        return <Money value={c.balance} className={D(c.balance).gt(0) ? (over ? 'font-bold text-destructive' : 'font-semibold text-warning') : 'text-muted-foreground'} />;
      },
    },
  ], [t]);

  return (
    <>
      <PageHeader
        title={t('customers.title')}
        description={t('common.results', { count: data?.meta.total ?? 0 })}
        actions={canCreate && <Button onClick={() => setCreating(true)}><Plus /> {t('customers.new')}</Button>}
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={`${t('common.search')} (${t('common.name')}, ${t('common.phone')}…)`} className="sm:w-96" />
        <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.type')}: {t('common.all')}</SelectItem>
            <SelectItem value="REGISTERED">{t('customers.typeREGISTERED')}</SelectItem>
            <SelectItem value="BUSINESS">{t('customers.typeBUSINESS')}</SelectItem>
            <SelectItem value="WALK_IN">{t('customers.typeWALK_IN')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={balance} onValueChange={(v) => { setBalance(v); setPage(1); }}>
          <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('customers.balance')}: {t('common.all')}</SelectItem>
            <SelectItem value="due">{t('customers.balance')} &gt; 0</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable columns={columns} data={data?.items} loading={isFetching} page={page} total={data?.meta.total} onPageChange={setPage} onRowClick={(c) => navigate(`/customers/${c.id}`)} />
      <CustomerFormDialog open={creating} onOpenChange={setCreating} onSaved={(c) => navigate(`/customers/${c.id}`)} />
    </>
  );
}
