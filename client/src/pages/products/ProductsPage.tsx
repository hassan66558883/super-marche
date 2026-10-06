import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { toast } from 'sonner';
import { MoreHorizontal, Pencil, Plus, Tag, Trash2, Barcode } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { ProductThumb } from '@/components/shared/CategoryIcon';
import { Money } from '@/components/shared/Money';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CategoriesApi, ProductsApi } from '@/services/catalog.api';
import { useAuthStore, useCan } from '@/stores/auth.store';
import { localizedName } from '@/i18n';
import { D, formatQty } from '@/utils/money';
import { toastError } from '@/utils/errors';
import type { Product } from '@/types/catalog';
import { LabelDialog } from './LabelDialog';

export function StockBadge({ stock, min, track = true }: { stock: string; min: string; track?: boolean }) {
  const { t } = useTranslation();
  if (!track) return <span className="text-muted-foreground">—</span>;
  const q = D(stock);
  const variant = q.lte(0) ? 'destructive' : q.lte(D(min)) ? 'warning' : 'success';
  return <Badge variant={variant} title={q.lte(0) ? t('pos.outOfStock') : q.lte(D(min)) ? t('pos.lowStock') : t('pos.inStock')}>{formatQty(stock)}</Badge>;
}

export default function ProductsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const branchId = useAuthStore((s) => s.branchId);
  const canCreate = useCan('products.create');
  const canEdit = useCan('products.edit');
  const canDelete = useCan('products.delete');
  const showCost = useCan('products.view_cost');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [categoryId, setCategoryId] = useState('all');
  const [stock, setStock] = useState('all');
  const [status, setStatus] = useState('ACTIVE');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [labelFor, setLabelFor] = useState<Product | null>(null);
  const [toDelete, setToDelete] = useState<Product | null>(null);

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => CategoriesApi.list() });
  const query = {
    page, pageSize: 25, search: search || undefined,
    categoryId: categoryId === 'all' ? undefined : categoryId,
    stock: stock === 'all' ? undefined : stock,
    status,
    sort: sorting[0]?.id, order: sorting[0] ? (sorting[0].desc ? 'desc' : 'asc') : undefined,
  };
  const { data, isFetching } = useQuery({ queryKey: ['products', branchId, query], queryFn: () => ProductsApi.list(query), placeholderData: keepPreviousData });

  const remove = useMutation({
    mutationFn: (id: string) => ProductsApi.remove(id),
    onSuccess: (r) => {
      toast.success(r.deleted ? t('common.deleted') : t('products.deactivated'));
      setToDelete(null);
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: toastError,
  });

  const columns = useMemo<ColumnDef<Product, unknown>[]>(() => [
    {
      id: 'name', header: t('products.name'), enableSorting: true,
      cell: ({ row: { original: p } }) => (
        <div className="flex min-w-[220px] items-center gap-3">
          <ProductThumb name={p.name} imageUrl={p.imageUrl} category={p.category} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium">{localizedName(p)}</div>
            <div className="font-mono text-xs text-muted-foreground">{p.sku}{p.variants.length ? ` · ${p.variants.length} ${t('products.variants').toLowerCase()}` : ''}</div>
          </div>
        </div>
      ),
    },
    { id: 'barcode', header: t('products.barcode'), enableSorting: false, cell: ({ row }) => <span className="font-mono text-xs">{row.original.barcode ?? '—'}</span> },
    { id: 'category', header: t('products.category'), enableSorting: false, cell: ({ row }) => (row.original.category ? localizedName(row.original.category) : '—') },
    ...(showCost
      ? [{ id: 'purchasePrice', header: t('products.purchasePrice'), enableSorting: false, meta: { className: 'text-end' }, cell: ({ row }: { row: { original: Product } }) => <Money value={row.original.purchasePrice} className="text-muted-foreground" /> } as ColumnDef<Product, unknown>]
      : []),
    { id: 'sellingPrice', header: t('products.sellingPrice'), enableSorting: true, meta: { className: 'text-end' }, cell: ({ row }) => <Money value={row.original.sellingPrice} className="font-semibold" /> },
    { id: 'tax', header: t('products.tax'), enableSorting: false, cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.tax ? `${row.original.tax.rate}%` : '0%'}</span> },
    { id: 'stock', header: t('products.stock'), enableSorting: false, cell: ({ row }) => <StockBadge stock={row.original.stock} min={row.original.minStock} track={row.original.trackStock} /> },
    { id: 'status', header: t('common.status'), enableSorting: false, cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      id: 'actions', header: '', enableSorting: false, size: 48,
      cell: ({ row: { original: p } }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t('common.actions')}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && <DropdownMenuItem onSelect={() => navigate(`/products/${p.id}/edit`)}><Pencil /> {t('common.edit')}</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => setLabelFor(p)}><Barcode /> {t('products.printLabel')}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate(`/inventory?search=${encodeURIComponent(p.sku)}`)}><Tag /> {t('nav.inventory')}</DropdownMenuItem>
              {canDelete && p.status === 'ACTIVE' && <DropdownMenuItem destructive onSelect={() => setToDelete(p)}><Trash2 /> {t('common.delete')}</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], [t, showCost, canEdit, canDelete, navigate]);

  return (
    <>
      <PageHeader
        title={t('products.title')}
        description={t('common.results', { count: data?.meta.total ?? 0 })}
        actions={canCreate && (
          <Button asChild><Link to="/products/new"><Plus /> {t('products.new')}</Link></Button>
        )}
      />
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('pos.searchPlaceholder')} className="lg:w-96" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPage(1); }}>
            <SelectTrigger className="sm:w-48" aria-label={t('products.category')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('products.category')}: {t('common.all')}</SelectItem>
              {categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{localizedName(c)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={stock} onValueChange={(v) => { setStock(v); setPage(1); }}>
            <SelectTrigger className="sm:w-44" aria-label={t('products.stock')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('products.stock')}: {t('common.all')}</SelectItem>
              <SelectItem value="low">{t('pos.lowStock')}</SelectItem>
              <SelectItem value="out">{t('pos.outOfStock')}</SelectItem>
              <SelectItem value="in">{t('pos.inStock')}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="sm:w-36" aria-label={t('common.status')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">{t('common.active')}</SelectItem>
              <SelectItem value="INACTIVE">{t('common.inactive')}</SelectItem>
              <SelectItem value="ALL">{t('common.all')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={data?.items}
        loading={isFetching}
        page={page}
        pageSize={25}
        total={data?.meta.total}
        onPageChange={setPage}
        sorting={sorting}
        onSortingChange={setSorting}
        onRowClick={canEdit ? (p) => navigate(`/products/${p.id}/edit`) : undefined}
      />
      <LabelDialog product={labelFor} onOpenChange={(o) => !o && setLabelFor(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        destructive
        description={toDelete ? `${toDelete.name} (${toDelete.sku})` : undefined}
        confirmLabel={t('common.delete')}
        loading={remove.isPending}
        onConfirm={() => remove.mutate(toDelete!.id)}
      />
    </>
  );
}
