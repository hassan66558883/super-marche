import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Plus, Ban, Tags, Wallet, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Money } from '@/components/shared/Money';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExpensesApi } from '@/services/expense.api';
import { PaymentMethodsApi } from '@/services/sales.api';
import { useAuthStore, useCan } from '@/stores/auth.store';
import { formatDate, isoDay, addDays } from '@/utils/format';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';
import type { Expense, ExpenseCategory } from '@/types/expense';
import { ExpenseFormDialog } from './ExpenseFormDialog';

export default function ExpensesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const branchId = useAuthStore((s) => s.branchId);
  const canView = useCan('expenses.view');
  const canCreate = useCan('expenses.create');
  const canVoid = useCan('expenses.void');
  const canManageCats = useCan('settings.manage');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [status, setStatus] = useState('RECORDED');
  const [from, setFrom] = useState(isoDay(addDays(new Date(), -30)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<Expense | null>(null);
  const [cats, setCats] = useState(false);
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: () => ExpensesApi.categories() });
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: PaymentMethodsApi.list });
  const q = { page, pageSize: 25, search: search || undefined, categoryId: categoryId === 'all' ? undefined : categoryId, status: status === 'all' ? undefined : status, from, to };
  const { data, isFetching } = useQuery({ queryKey: ['expenses', q, branchId], queryFn: () => ExpensesApi.list(q), placeholderData: keepPreviousData, enabled: canView });
  const voidM = useMutation({
    mutationFn: (reason: string) => ExpensesApi.void(voiding!.id, reason),
    onSuccess: () => { toast.success(t('expenses.voided')); setVoiding(null); void qc.invalidateQueries({ queryKey: ['expenses'] }); void qc.invalidateQueries({ queryKey: ['cash'] }); },
    onError: toastError,
  });

  const columns = useMemo<ColumnDef<Expense, unknown>[]>(() => [
    { id: 'date', header: t('common.date'), cell: ({ row }) => <span className="whitespace-nowrap text-sm">{formatDate(row.original.expenseDate)}</span> },
    { id: 'category', header: t('expenses.category'), cell: ({ row }) => <span className="font-medium">{row.original.category.name}</span> },
    {
      id: 'desc', header: t('common.description'),
      cell: ({ row: { original: e } }) => (
        <div className="max-w-80">
          <div className={cn('truncate', e.status === 'VOID' && 'line-through text-muted-foreground')} title={e.description ?? ''}>{e.description}</div>
          {e.status === 'VOID' && <div className="truncate text-xs text-destructive" title={e.voidReason ?? ''}>{t('expenses.voidedBy', { name: e.voidedByName })} : {e.voidReason}</div>}
          {e.reference && <div className="font-mono text-xs text-muted-foreground">{e.reference}</div>}
        </div>
      ),
    },
    {
      id: 'method', header: t('expenses.paymentMethod'),
      cell: ({ row: { original: e } }) => (
        <div className="text-sm">
          {methods.data?.find((m) => m.code === e.paymentMethodCode)?.name ?? e.paymentMethodCode}
          {e.registerSessionId && <Link to={`/cash/sessions/${e.registerSessionId}`} className="ms-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"><Wallet className="h-3 w-3" />{t('expenses.fromRegisterShort')}</Link>}
        </div>
      ),
    },
    { id: 'user', header: t('common.user'), cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.userName}</span> },
    { id: 'amount', header: t('common.amount'), meta: { className: 'text-end' }, cell: ({ row }) => <Money value={row.original.amount} className={cn('font-semibold', row.original.status === 'VOID' && 'line-through text-muted-foreground')} /> },
    { id: 'status', header: t('common.status'), cell: ({ row }) => <StatusBadge status={row.original.status} ns="expenses.status" /> },
    {
      id: 'actions', header: '', meta: { className: 'w-0' },
      cell: ({ row: { original: e } }) => canVoid && e.status === 'RECORDED'
        ? <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setVoiding(e)}><Ban /> {t('expenses.void')}</Button> : null,
    },
  ], [t, canVoid, methods.data]);

  return (
    <>
      <PageHeader
        title={t('expenses.title')}
        description={t('expenses.subtitle')}
        actions={
          <>
            {canManageCats && <Button variant="outline" onClick={() => setCats(true)}><Tags /> {t('expenses.categories')}</Button>}
            {canCreate && <Button onClick={() => setCreating(true)}><Plus /> {t('expenses.new')}</Button>}
          </>
        }
      />
      {!canView ? (
        <Card className="p-10 text-center text-muted-foreground">{t('expenses.createOnly')}</Card>
      ) : (
        <>
          <div className="mb-4 flex flex-col flex-wrap gap-2 lg:flex-row lg:items-center">
            <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={`${t('common.description')}, ${t('common.reference').toLowerCase()}…`} className="lg:w-72" />
            <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPage(1); }}>
              <SelectTrigger className="lg:w-56"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('expenses.category')}: {t('common.all')}</SelectItem>
                {categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RECORDED">{t('expenses.statusRECORDED')}</SelectItem>
                <SelectItem value="VOID">{t('expenses.statusVOID')}</SelectItem>
                <SelectItem value="all">{t('common.all')}</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.from')} />
              <span className="text-muted-foreground">→</span>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.to')} />
            </div>
            <div className="text-sm lg:ms-auto">{t('expenses.periodTotal')}: <Money value={data?.meta.totalAmount as string | undefined} className="text-base font-bold" /></div>
          </div>
          <DataTable columns={columns} data={data?.items} loading={isFetching && !data} page={page} pageSize={25} total={data?.meta.total} onPageChange={setPage} rowClassName={(e) => (e.status === 'VOID' ? 'opacity-70' : undefined)} />
        </>
      )}
      <ExpenseFormDialog open={creating} onOpenChange={setCreating} />
      <ConfirmDialog open={!!voiding} onOpenChange={(o) => !o && setVoiding(null)} title={t('expenses.voidTitle')} description={voiding ? <span>{voiding.category.name} · <Money value={voiding.amount} />{voiding.registerSessionId ? ` — ${t('expenses.voidRegisterHelp')}` : ''}</span> : undefined}
        destructive requireReason confirmLabel={t('expenses.void')} loading={voidM.isPending} onConfirm={(r) => voidM.mutate(r)} />
      <CategoriesDialog open={cats} onOpenChange={setCats} />
    </>
  );
}

function CategoriesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['expense-categories', 'all'], queryFn: () => ExpensesApi.categories(true), enabled: open });
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<ExpenseCategory | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['expense-categories'] }); };
  const create = useMutation({ mutationFn: () => ExpensesApi.createCategory({ name: name.trim() }), onSuccess: () => { setName(''); refresh(); toast.success(t('common.created')); }, onError: toastError });
  const update = useMutation({ mutationFn: (c: ExpenseCategory) => ExpensesApi.updateCategory(c.id, { name: c.name, status: c.status }), onSuccess: () => { setEditing(null); refresh(); }, onError: toastError });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('expenses.categories')}</DialogTitle><DialogDescription>{t('expenses.categoriesHelp')}</DialogDescription></DialogHeader>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) create.mutate(); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('expenses.newCategory')} />
          <Button type="submit" disabled={name.trim().length < 2} loading={create.isPending}><Plus /> {t('common.add')}</Button>
        </form>
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
          {list.data?.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2">
              {editing?.id === c.id ? (
                <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); update.mutate(editing); }}>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8" autoFocus />
                  <Button size="sm" type="submit" loading={update.isPending}>{t('common.save')}</Button>
                </form>
              ) : (
                <>
                  <span className={cn('flex-1 text-sm', c.status === 'INACTIVE' && 'text-muted-foreground line-through')}>{c.name}</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(c)} aria-label={t('common.edit')}><Pencil /></Button>
                  <Switch checked={c.status === 'ACTIVE'} onCheckedChange={(v) => update.mutate({ ...c, status: v ? 'ACTIVE' : 'INACTIVE' })} aria-label={t('common.active')} />
                </>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
