import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ProductThumb } from '@/components/shared/CategoryIcon';
import { Money } from '@/components/shared/Money';
import { ProductsApi } from '@/services/catalog.api';
import { ApiError } from '@/services/api';
import { useDebounce } from '@/hooks/useDebounce';
import { localizedName } from '@/i18n';
import { formatQty } from '@/utils/money';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';
import { toast } from 'sonner';
import type { Product, ProductVariant } from '@/types/catalog';

export interface PickedProduct { product: Product; variant: ProductVariant | null }

/**
 * Search-as-you-type product selector for documents (transfers, purchase orders).
 * Variants are listed as separate options; Enter on a barcode adds the exact match.
 */
export function ProductPicker({ onPick, placeholder, showCost, className }: { onPick: (p: PickedProduct) => void; placeholder?: string; showCost?: boolean; className?: string }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounce(q.trim(), 200);
  const results = useQuery({
    queryKey: ['product-picker', debounced],
    queryFn: () => ProductsApi.list({ search: debounced, pageSize: 10, status: 'ACTIVE' }),
    enabled: debounced.length >= 1,
  });
  const options: PickedProduct[] = (results.data?.items ?? []).flatMap((p) =>
    p.variants.length ? p.variants.filter((v) => v.status === 'ACTIVE').map((v): PickedProduct => ({ product: p, variant: v })) : [{ product: p, variant: null } as PickedProduct]);

  const pick = (o: PickedProduct) => { onPick(o); setQ(''); setOpen(false); setHl(0); inputRef.current?.focus(); };
  const enter = async () => {
    if (options[hl] && debounced === q.trim()) return pick(options[hl]);
    if (!q.trim()) return;
    try {
      const hit = await ProductsApi.byCode(q.trim());
      pick({ product: hit.product, variant: hit.variantId ? hit.product.variants.find((v) => v.id === hit.variantId) ?? null : null });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) toast.error(t('pos.productNotFound'), { description: q });
      else toastError(e);
    }
  };

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setHl(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHl((h) => Math.min(h + 1, options.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHl((h) => Math.max(h - 1, 0)); }
          else if (e.key === 'Enter') { e.preventDefault(); void enter(); }
          else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder ?? t('pos.searchPlaceholder')}
        className="h-11 ps-9"
        role="combobox"
        aria-expanded={open && options.length > 0}
        autoComplete="off"
      />
      {open && debounced && (
        <ul className="absolute inset-x-0 top-full z-40 mt-1 max-h-80 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg" role="listbox">
          {options.map((o, i) => (
            <li key={`${o.product.id}:${o.variant?.id ?? ''}`} role="option" aria-selected={i === hl}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setHl(i)}
                className={cn('flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-start text-sm', i === hl && 'bg-muted')}>
                <ProductThumb name={o.product.name} imageUrl={o.product.imageUrl} category={o.product.category} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{localizedName(o.product)}{o.variant && ` — ${o.variant.name}`}</span>
                  <span className="block truncate text-xs text-muted-foreground">{o.variant?.sku ?? o.product.sku} · {t('pos.stock')}: {formatQty(o.variant?.stock ?? o.product.stock)}</span>
                </span>
                <Money value={showCost ? (o.variant?.purchasePrice ?? o.product.purchasePrice) : (o.variant?.sellingPrice ?? o.product.sellingPrice)} className="text-xs font-semibold" />
              </button>
            </li>
          ))}
          {!results.isLoading && !options.length && <li className="px-3 py-4 text-center text-sm text-muted-foreground">{t('pos.productNotFound')}</li>}
        </ul>
      )}
    </div>
  );
}
