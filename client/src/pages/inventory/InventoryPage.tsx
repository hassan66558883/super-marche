import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { Boxes, AlertTriangle, PackageX, Wallet, SlidersHorizontal, History, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { Money } from '@/components/shared/Money';
import { FormField } from '@/components/shared/FormField';
import { ProductThumb } from '@/components/shared/CategoryIcon';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CategoriesApi, ProductsApi } from '@/services/catalog.api';
import { InventoryApi } from '@/services/stock.api';
import { useCan } from '@/stores/auth.store';
import { localizedName } from '@/i18n';
import { D, formatQty } from '@/utils/money';
import { formatDateTime, isoDay, addDays } from '@/utils/format';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';
import type { Product } from '@/types/catalog';
import type { MovementType, StockMovement } from '@/types/stock';

const MOVEMENT_TYPES: MovementType[] = ['SALE', 'RETURN', 'PURCHASE', 'ADJUSTMENT', 'DAMAGE', 'TRANSFER_IN', 'TRANSFER_OUT', 'OPENING'];

export default function InventoryPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'stock';
  const summary = useQuery({ queryKey: ['inventory', 'summary'], queryFn: InventoryApi.summary });
  const s = summary.data;
  const kpi = (icon: React.ReactNode, label: string, value: React.ReactNode, tone: string, onClick?: () => void) => (
    <Card className={cn('flex items-center gap-4 p-4', onClick && 'cursor-pointer transition hover:shadow-md')} onClick={onClick}>
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', tone)}>{icon}</span>
      <div><div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div><div className="text-xl font-bold">{value}</div></div>
    </Card>
  );
  return (
    <>
      <PageHeader title={t('inventory.title')} description={t('inventory.subtitle')} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpi(<Boxes className="h-5 w-5" />, t('inventory.skus'), s ? `${s.skus} · ${formatQty(s.units)} u.` : '—', 'bg-primary/10 text-primary')}
        {kpi(<Wallet className="h-5 w-5" />, s?.costValue ? t('inventory.costValue') : t('inventory.retailValue'), <Money value={s?.costValue ?? s?.retailValue} />, 'bg-secondary/10 text-secondary')}
        {kpi(<AlertTriangle className="h-5 w-5" />, t('pos.lowStock'), s?.low ?? '—', 'bg-warning/15 text-warning', () => setParams({ tab: 'stock', stock: 'low' }))}
        {kpi(<PackageX className="h-5 w-5" />, t('pos.outOfStock'), s?.out ?? '—', 'bg-destructive/10 text-destructive', () => setParams({ tab: 'stock', stock: 'out' }))}
      </div>
      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v })}>
        <TabsList>
          <TabsTrigger value="stock"><Boxes className="h-4 w-4" /> {t('inventory.current')}</TabsTrigger>
          <TabsTrigger value="movements"><History className="h-4 w-4" /> {t('inventory.movements')}</TabsTrigger>
        </TabsList>
        <TabsContent value="stock"><StockTab /></TabsContent>
        <TabsContent value="movements"><MovementsTab /></TabsContent>
      </Tabs>
    </>
  );
}

function StockStatus({ stock, min, track }: { stock: string; min: string; track: boolean }) {
  const { t } = useTranslation();
  if (!track) return <Badge variant="muted">{t('inventory.untracked')}</Badge>;
  const q = D(stock);
  if (q.lte(0)) return <Badge variant="destructive">{t('pos.outOfStock')}</Badge>;
  if (q.lte(D(min))) return <Badge variant="warning">{t('pos.lowStock')}</Badge>;
  return <Badge variant="success">{t('pos.inStock')}</Badge>;
}

function StockTab() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const canAdjust = useCan('inventory.adjust');
  const showCost = useCan('products.view_cost');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('all');
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const stock = params.get('stock') ?? 'all';
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => CategoriesApi.list() });
  const q = { page, pageSize: 25, search: search || undefined, categoryId: category === 'all' ? undefined : category, stock: stock === 'all' ? undefined : stock, status: 'ACTIVE' };
  const { data, isFetching } = useQuery({ queryKey: ['products', 'inventory', q], queryFn: () => ProductsApi.list(q), placeholderData: keepPreviousData });

  const columns = useMemo<ColumnDef<Product, unknown>[]>(() => [
    {
      id: 'name', header: t('products.name'),
      cell: ({ row: { original: p } }) => (
        <div className="flex items-center gap-3">
          <ProductThumb name={p.name} imageUrl={p.imageUrl} category={p.category} size="sm" />
          <div className="min-w-0">
            <div className="truncate font-medium">{localizedName(p)}</div>
            <div className="font-mono text-xs text-muted-foreground">{p.sku}{p.variants.length > 0 && ` · ${p.variants.length} var.`}</div>
          </div>
        </div>
      ),
    },
    { id: 'category', header: t('products.category'), cell: ({ row }) => <span className="text-muted-foreground">{row.original.category ? localizedName(row.original.category) : '—'}</span> },
    {
      id: 'stock', header: t('inventory.current'), meta: { className: 'text-end' },
      cell: ({ row: { original: p } }) => (
        <div className="text-end">
          <div className="font-semibold tabular">{p.trackStock ? formatQty(p.stock) : '∞'} <span className="text-xs font-normal text-muted-foreground">{p.unit?.code.toLowerCase()}</span></div>
          {p.variants.length > 0 && <div className="text-xs text-muted-foreground">{p.variants.map((v) => `${v.name}: ${formatQty(v.stock)}`).join(' · ')}</div>}
        </div>
      ),
    },
    { id: 'min', header: t('inventory.min'), meta: { className: 'text-end' }, cell: ({ row }) => <span className="tabular text-muted-foreground">{formatQty(row.original.minStock)}</span> },
    ...(showCost ? [{ id: 'value', header: t('inventory.value'), meta: { className: 'text-end' }, cell: ({ row: { original: p } }) => <Money value={D(p.stock).gt(0) ? D(p.stock).mul(D(p.purchasePrice)) : 0} className="text-muted-foreground" /> } as ColumnDef<Product, unknown>] : []),
    { id: 'status', header: t('inventory.stockStatus'), cell: ({ row: { original: p } }) => <StockStatus stock={p.stock} min={p.minStock} track={p.trackStock} /> },
    {
      id: 'actions', header: '', meta: { className: 'w-0' },
      cell: ({ row: { original: p } }) => (
        <div className="flex justify-end gap-1">
          <Button asChild variant="ghost" size="sm"><Link to={`/inventory?tab=movements&productId=${p.id}`}><History /></Link></Button>
          {canAdjust && p.trackStock && <Button variant="outline" size="sm" onClick={() => setAdjusting(p)}><SlidersHorizontal /> {t('inventory.adjust')}</Button>}
        </div>
      ),
    },
  ], [t, canAdjust, showCost]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('pos.searchPlaceholder')} className="sm:w-96" />
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
          <SelectTrigger className="sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('products.category')}: {t('common.all')}</SelectItem>
            {categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{localizedName(c)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stock} onValueChange={(v) => { setParams(v === 'all' ? { tab: 'stock' } : { tab: 'stock', stock: v }); setPage(1); }}>
          <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('inventory.stockStatus')}: {t('common.all')}</SelectItem>
            <SelectItem value="low">{t('inventory.lowOnly')}</SelectItem>
            <SelectItem value="out">{t('inventory.outOnly')}</SelectItem>
            <SelectItem value="in">{t('pos.inStock')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable columns={columns} data={data?.items} loading={isFetching && !data} page={page} pageSize={25} total={data?.meta.total} onPageChange={setPage} />
      <AdjustDialog product={adjusting} onClose={() => setAdjusting(null)} />
    </>
  );
}

function AdjustDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'SET' | 'DELTA' | 'DAMAGE'>('SET');
  const [variantId, setVariantId] = useState<string>('');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const variant = product?.variants.find((v) => v.id === variantId) ?? null;
  const current = D(variant ? variant.stock : product?.stock);
  const target = mode === 'SET' ? D(qty) : mode === 'DELTA' ? current.plus(D(qty)) : current.minus(D(qty));
  const save = useMutation({
    mutationFn: () => InventoryApi.adjust({ productId: product!.id, variantId: variantId || null, mode, quantity: Number(qty), note }),
    onSuccess: () => {
      toast.success(t('inventory.adjusted'));
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['inventory'] });
      reset(); onClose();
    },
    onError: toastError,
  });
  const reset = () => { setMode('SET'); setQty(''); setNote(''); setVariantId(''); };
  const needsVariant = !!product?.variants.length && !variantId;
  const valid = qty !== '' && !D(qty).isZero() || (mode === 'SET' && qty !== '');
  return (
    <Dialog open={!!product} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('inventory.adjust')}</DialogTitle>
          <DialogDescription>{product && localizedName(product)} · {product?.sku}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid && !needsVariant && note.trim().length >= 3) save.mutate(); }}>
          {!!product?.variants.length && (
            <FormField label={t('pos.selectVariant')} htmlFor="adj-variant">
              <Select value={variantId} onValueChange={setVariantId}>
                <SelectTrigger id="adj-variant"><SelectValue placeholder={t('pos.selectVariant')} /></SelectTrigger>
                <SelectContent>{product.variants.map((v) => <SelectItem key={v.id} value={v.id}>{v.name} ({formatQty(v.stock)})</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
          )}
          <div className="grid grid-cols-3 gap-1 rounded-lg border p-1">
            {(['SET', 'DELTA', 'DAMAGE'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={cn('rounded-md px-2 py-2 text-sm font-medium', mode === m ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                {m === 'SET' ? t('inventory.setTo') : m === 'DELTA' ? t('inventory.addRemove') : t('inventory.damage')}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/60 p-3"><div className="text-xs text-muted-foreground">{t('inventory.current')}</div><div className="text-xl font-bold tabular">{formatQty(current)}</div></div>
            <FormField label={mode === 'SET' ? t('inventory.newQuantity') : mode === 'DELTA' ? t('inventory.delta') : t('common.quantity')} htmlFor="adj-qty">
              <Input id="adj-qty" value={qty} onChange={(e) => setQty(e.target.value.replace(',', '.').replace(mode === 'DELTA' ? /[^\d.-]/g : /[^\d.]/g, ''))} inputMode="decimal" className="h-11 text-lg font-semibold" autoFocus placeholder={mode === 'DELTA' ? '+5 / -3' : '0'} />
            </FormField>
          </div>
          {qty !== '' && (
            <div className={cn('flex items-center justify-between rounded-lg border px-3 py-2 text-sm', target.lt(0) && 'border-destructive text-destructive')}>
              <span>{t('inventory.balanceAfter')}</span>
              <span className="flex items-center gap-2 font-bold tabular">
                {target.gt(current) ? <ArrowUpRight className="h-4 w-4 text-success" /> : <ArrowDownRight className="h-4 w-4 text-destructive" />}{formatQty(target)}
              </span>
            </div>
          )}
          <FormField label={t('common.reason')} htmlFor="adj-note" required><Textarea id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t('inventory.reasonHint')} /></FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={!valid || needsVariant || note.trim().length < 3 || target.lt(0)} loading={save.isPending}>{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const IN_TYPES: MovementType[] = ['PURCHASE', 'RETURN', 'TRANSFER_IN', 'OPENING'];

function MovementsTab() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const productId = params.get('productId') ?? undefined;
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [from, setFrom] = useState(isoDay(addDays(new Date(), -30)));
  const [to, setTo] = useState(isoDay(new Date()));
  const q = { page, pageSize: 30, productId, type: type === 'all' ? undefined : type, from, to, search: search || undefined };
  const { data, isFetching } = useQuery({ queryKey: ['inventory', 'movements', q], queryFn: () => InventoryApi.movements(q), placeholderData: keepPreviousData });
  const productName = productId ? data?.items[0]?.product.name : null;

  const columns = useMemo<ColumnDef<StockMovement, unknown>[]>(() => [
    { id: 'date', header: t('common.date'), cell: ({ row }) => <span className="whitespace-nowrap text-sm">{formatDateTime(row.original.createdAt)}</span> },
    { id: 'product', header: t('pos.product'), cell: ({ row: { original: m } }) => <div><div className="font-medium">{m.product.name}{m.variant && ` — ${m.variant.name}`}</div><div className="font-mono text-xs text-muted-foreground">{m.product.sku}</div></div> },
    {
      id: 'type', header: t('inventory.movementType'),
      cell: ({ row: { original: m } }) => <Badge variant={m.type === 'DAMAGE' ? 'destructive' : IN_TYPES.includes(m.type) ? 'success' : m.type === 'ADJUSTMENT' ? 'warning' : 'muted'}>{t(`inventory.mv${m.type}`)}</Badge>,
    },
    { id: 'ref', header: t('common.reference'), cell: ({ row: { original: m } }) => <div className="max-w-56"><div className="font-mono text-xs">{m.reference ?? '—'}</div>{m.note && <div className="truncate text-xs text-muted-foreground" title={m.note}>{m.note}</div>}</div> },
    { id: 'qty', header: t('common.quantity'), meta: { className: 'text-end' }, cell: ({ row: { original: m } }) => <span className={cn('font-semibold tabular', D(m.quantity).gt(0) ? 'text-success' : 'text-destructive')}>{D(m.quantity).gt(0) ? '+' : ''}{formatQty(m.quantity)}</span> },
    { id: 'after', header: t('inventory.balanceAfter'), meta: { className: 'text-end' }, cell: ({ row }) => <span className="tabular">{formatQty(row.original.balanceAfter)}</span> },
    { id: 'user', header: t('common.user'), cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.userName}</span> },
  ], [t]);

  return (
    <>
      <div className="mb-4 flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center">
        {productId ? (
          <Badge variant="default" className="h-9 gap-2 px-3 text-sm">{productName ?? t('pos.product')} <button type="button" onClick={() => { params.delete('productId'); setParams(params); }} aria-label={t('common.remove')}>×</button></Badge>
        ) : <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={`${t('pos.product')}, ${t('common.reference').toLowerCase()}…`} className="sm:w-72" />}
        <Select value={type} onValueChange={(v) => { setType(v); setPage(1); }}>
          <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('inventory.movementType')}: {t('common.all')}</SelectItem>
            {MOVEMENT_TYPES.map((m) => <SelectItem key={m} value={m}>{t(`inventory.mv${m}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.from')} />
          <span className="text-muted-foreground">→</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" aria-label={t('common.to')} />
        </div>
      </div>
      <DataTable columns={columns} data={data?.items} loading={isFetching && !data} page={page} pageSize={30} total={data?.meta.total} onPageChange={setPage} />
    </>
  );
}
