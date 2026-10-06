import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScanBarcode, Search, X, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Kbd, Skeleton } from '@/components/ui/misc';
import { Tip } from '@/components/ui/tooltip';
import { CategoryIcon, ProductThumb } from '@/components/shared/CategoryIcon';
import { Money } from '@/components/shared/Money';
import { CategoriesApi, ProductsApi } from '@/services/catalog.api';
import { useDebounce } from '@/hooks/useDebounce';
import { localizedName } from '@/i18n';
import { D, formatQty } from '@/utils/money';
import { cn } from '@/utils/cn';
import type { Product } from '@/types/catalog';

export interface ProductPanelHandle {
  focusSearch: () => void;
}

const QUICK = '__quick__';

/** Search (F2) + category chips + product grid. Enter adds the highlighted product. */
export const ProductPanel = forwardRef<ProductPanelHandle, {
  onPick: (p: Product, variantId?: string | null) => void;
  onNotFound: (code: string) => void;
  compact?: boolean;
}>(function ProductPanel({ onPick, onNotFound, compact }, ref) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('');
  const [highlight, setHighlight] = useState(0);
  const debounced = useDebounce(query.trim(), 200);
  useImperativeHandle(ref, () => ({ focusSearch: () => { inputRef.current?.focus(); inputRef.current?.select(); } }));

  const categories = useQuery({ queryKey: ['categories'], queryFn: () => CategoriesApi.list(), staleTime: 5 * 60_000 });
  const products = useQuery({
    queryKey: ['pos-products', debounced, category],
    queryFn: ({ signal }) => ProductsApi.pos({
      q: debounced || undefined, pageSize: 60,
      categoryId: !debounced && category && category !== QUICK ? category : undefined,
      quick: !debounced && category === QUICK ? 'true' : undefined,
    }, signal),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const items = products.data?.items ?? [];
  useEffect(() => setHighlight(0), [debounced, category]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const busy = useRef(false);
  const submit = async () => {
    const q = query.trim();
    if (!q || busy.current) return;
    // Results already on screen for this text: Enter adds the highlighted one
    if (debounced === q && items.length > 1 && !products.data?.meta.exact) {
      onPick(items[highlight] ?? items[0]);
      setQuery('');
      return;
    }
    // Scanner / typed code: the server tries an exact barcode or SKU match first
    busy.current = true;
    try {
      const res = await ProductsApi.pos({ q, pageSize: 2 });
      const exact = res.meta.exact as { productId: string; variantId: string | null } | undefined;
      if (exact) { onPick(res.items[0], exact.variantId); setQuery(''); }
      else if (res.items.length === 1) { onPick(res.items[0]); setQuery(''); }
      else if (res.items.length === 0) { onNotFound(q); inputRef.current?.select(); }
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 p-3 sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void submit(); }
              else if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => Math.min(h + 1, Math.max(items.length - 1, 0))); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            }}
            placeholder={t('pos.searchPlaceholder')}
            aria-label={t('pos.searchPlaceholder')}
            className="h-12 ps-11 pe-24 text-base shadow-sm"
            autoComplete="off"
            inputMode="search"
          />
          <div className="absolute end-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {query && (
              <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t('common.reset')}>
                <X className="h-4 w-4" />
              </button>
            )}
            <Tip label={t('pos.scanHelp')} shortcut="F2"><span className="hidden items-center gap-1 text-muted-foreground sm:flex"><ScanBarcode className="h-5 w-5" /><Kbd>F2</Kbd></span></Tip>
          </div>
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin" role="tablist" aria-label={t('products.category')}>
          <Chip active={!category} onClick={() => setCategory('')}>{t('pos.allCategories')}</Chip>
          <Chip active={category === QUICK} onClick={() => setCategory(QUICK)}><Zap className="h-4 w-4 text-warning" />{t('pos.quickProducts')}</Chip>
          {categories.data?.filter((c) => c.status !== 'INACTIVE').map((c) => (
            <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)} color={c.color}>
              <CategoryIcon icon={c.icon} className="h-4 w-4" />{localizedName(c)}
            </Chip>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 sm:px-4">
        {products.isLoading ? (
          <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]')}>
            {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Search className="h-8 w-8 opacity-40" />
            <p className="font-medium">{debounced ? t('pos.productNotFound') : t('pos.noProducts')}</p>
          </div>
        ) : (
          <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-[repeat(auto-fill,minmax(150px,1fr))]')} role="listbox" aria-label={t('nav.products')}>
            {items.map((p, i) => <ProductCard key={p.id} p={p} active={!!debounced && i === highlight} onClick={() => onPick(p)} />)}
          </div>
        )}
      </div>
    </div>
  );
});

function Chip({ active, onClick, children, color }: { active: boolean; onClick: () => void; children: React.ReactNode; color?: string | null }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition',
        active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'bg-card hover:bg-muted',
      )}
      style={!active && color ? { color } : undefined}
    >
      {children}
    </button>
  );
}

function ProductCard({ p, active, onClick }: { p: Product; active: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  const stock = D(p.stock);
  const out = p.trackStock && stock.lte(0) && !p.variants.length;
  const low = p.trackStock && !out && stock.lte(D(p.minStock));
  const fromPrice = p.variants.length ? p.variants.reduce((m, v) => (D(v.sellingPrice).lt(m) ? D(v.sellingPrice) : m), D(p.variants[0].sellingPrice)) : D(p.sellingPrice);
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border bg-card text-start shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]',
        active && 'border-primary ring-2 ring-primary/40',
        out && 'opacity-60',
      )}
    >
      <div className="aspect-[4/3] w-full">
        <ProductThumb name={p.name} imageUrl={p.imageUrl} category={p.category} size="lg" className="rounded-none" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <div className="line-clamp-2 text-sm font-semibold leading-tight">{localizedName(p)}</div>
        <div className="mt-auto flex items-end justify-between gap-1">
          <Money value={fromPrice} className="text-[15px] font-bold text-primary" />
          {p.trackStock && !p.variants.length && (
            <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular', out ? 'bg-destructive/10 text-destructive' : low ? 'bg-warning/15 text-warning' : 'bg-success/10 text-success')}>
              {out ? t('pos.outOfStock') : formatQty(stock)}
            </span>
          )}
          {p.variants.length > 0 && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{p.variants.length} var.</span>}
        </div>
      </div>
    </button>
  );
}
