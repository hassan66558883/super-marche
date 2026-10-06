import { useTranslation } from 'react-i18next';
import { Minus, Plus, Trash2, UserRound, UserPlus, Percent, PauseCircle, ShoppingCart, Tag, X, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tip } from '@/components/ui/tooltip';
import { ProductThumb } from '@/components/shared/CategoryIcon';
import { Money } from '@/components/shared/Money';
import { useCartStore, type CartLine } from '@/stores/cart.store';
import { useCartPricing } from '@/services/pos.service';
import { D, formatMoney, formatQty, type Decimal } from '@/utils/money';
import { cn } from '@/utils/cn';

interface Props {
  onCustomer: () => void;
  onDiscount: () => void;
  onHold: () => void;
  onClear: () => void;
  onEditLine: (key: string) => void;
  onNote: () => void;
  footer?: React.ReactNode;
}

export function CartPanel({ onCustomer, onDiscount, onHold, onClear, onEditLine, onNote, footer }: Props) {
  const { t } = useTranslation();
  const lines = useCartStore((s) => s.lines);
  const customer = useCartStore((s) => s.customer);
  const cartDiscount = useCartStore((s) => s.cartDiscount);
  const note = useCartStore((s) => s.note);
  const activeKey = useCartStore((s) => s.activeKey);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const pricing = useCartPricing();
  const count = lines.reduce((a, l) => a.plus(D(l.quantity)), D(0));

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Customer */}
      <div className="flex items-center gap-2 border-b p-3">
        <Tip label={t('pos.selectCustomer')} shortcut="F3">
          <button type="button" onClick={onCustomer} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-start transition hover:bg-muted">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', customer && customer.type !== 'WALK_IN' ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/15 text-muted-foreground')}>
              <UserRound className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{customer && customer.type !== 'WALK_IN' ? customer.name : t('pos.walkIn')}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {customer && customer.type !== 'WALK_IN'
                  ? `${customer.code}${D(customer.balance).gt(0) ? ` · ${t('customers.balance')} ${formatMoney(customer.balance)}` : ''}`
                  : t('pos.selectCustomer')}
              </span>
            </span>
          </button>
        </Tip>
        {customer && customer.type !== 'WALK_IN' ? (
          <Button variant="ghost" size="icon" onClick={() => setCustomer(null)} aria-label={t('common.remove')}><X /></Button>
        ) : (
          <Tip label={t('pos.addCustomer')} shortcut="F3"><Button variant="outline" size="icon" onClick={onCustomer} aria-label={t('pos.addCustomer')}><UserPlus /></Button></Tip>
        )}
      </div>

      {/* Lines */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted"><ShoppingCart className="h-8 w-8 opacity-50" /></div>
            <div>
              <p className="font-semibold text-foreground">{t('pos.emptyCart')}</p>
              <p className="text-sm">{t('pos.emptyCartHelp')}</p>
            </div>
          </div>
        ) : (
          <ul className="divide-y" aria-label={t('pos.cart')}>
            {lines.map((l) => <CartRow key={l.key} line={l} active={l.key === activeKey} total={afterLineDiscount(pricing.lines.find((r) => r.key === l.key))} onEdit={() => onEditLine(l.key)} />)}
          </ul>
        )}
      </div>

      {/* Summary + actions */}
      <div className="border-t bg-muted/30 p-3">
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between text-muted-foreground"><dt>{t('pos.items', { count: Number(count.toFixed(0)) })}</dt><dd><Money value={pricing.subtotal} /></dd></div>
          {pricing.lineDiscountTotal.gt(0) && <div className="flex justify-between text-success"><dt>{t('pos.lineDiscount')}</dt><dd>-<Money value={pricing.lineDiscountTotal} /></dd></div>}
          {cartDiscount && pricing.cartDiscountTotal.gt(0) && (
            <div className="flex justify-between text-success">
              <dt className="flex items-center gap-1">{t('pos.cartDiscount')} {cartDiscount.type === 'PERCENT' && `(${cartDiscount.value} %)`}</dt>
              <dd>-<Money value={pricing.cartDiscountTotal} /></dd>
            </div>
          )}
          <div className="flex justify-between text-muted-foreground"><dt>{t('pos.tax')}</dt><dd><Money value={pricing.taxTotal} /></dd></div>
        </dl>
        {note && <p className="mt-2 flex items-start gap-1.5 rounded-md bg-card px-2 py-1.5 text-xs text-muted-foreground"><StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />{note}</p>}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <Tip label={t('pos.cartDiscount')} shortcut="F4"><Button variant="outline" className="h-11 flex-col gap-0 px-1 text-[11px]" onClick={onDiscount} disabled={!lines.length}><Percent className="h-4 w-4" />{t('pos.discount')}</Button></Tip>
          <Tip label={t('pos.hold')} shortcut="F8"><Button variant="outline" className="h-11 flex-col gap-0 px-1 text-[11px]" onClick={onHold}><PauseCircle className="h-4 w-4" />{t('pos.holdShort')}</Button></Tip>
          <Tip label={t('pos.note')}><Button variant="outline" className="h-11 flex-col gap-0 px-1 text-[11px]" onClick={onNote} disabled={!lines.length}><StickyNote className="h-4 w-4" />{t('pos.note')}</Button></Tip>
          <Tip label={t('pos.clearCart')} shortcut="Esc"><Button variant="outline" className="h-11 flex-col gap-0 px-1 text-[11px] text-destructive hover:text-destructive" onClick={onClear} disabled={!lines.length}><Trash2 className="h-4 w-4" />{t('common.cancel')}</Button></Tip>
        </div>
        {footer}
      </div>
    </div>
  );
}

const afterLineDiscount = (r?: { gross: Decimal; lineDiscount: Decimal }) => (r ? r.gross.minus(r.lineDiscount) : null);

function CartRow({ line, active, total, onEdit }: { line: CartLine; active: boolean; total: Decimal | null; onEdit: () => void }) {
  const { t } = useTranslation();
  const setQty = useCartStore((s) => s.setQty);
  const inc = useCartStore((s) => s.inc);
  const remove = useCartStore((s) => s.remove);
  const setActive = useCartStore((s) => s.setActive);
  const overStock = line.stock !== null && D(line.quantity).gt(D(line.stock));
  const step = line.allowDecimal ? 0.5 : 1;
  const priceChanged = !D(line.unitPrice).eq(D(line.catalogPrice));
  return (
    <li className={cn('flex gap-3 p-3 transition-colors', active && 'bg-primary/5')} onClick={() => setActive(line.key)}>
      <ProductThumb name={line.name} imageUrl={line.imageUrl} category={line.category} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onEdit} className="min-w-0 text-start">
            <div className="truncate text-sm font-semibold leading-tight hover:text-primary">{line.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {line.variantName && <span className="font-medium text-foreground/80">{line.variantName} · </span>}
              <span className={cn(priceChanged && 'font-semibold text-warning')}>{formatMoney(line.unitPrice)}</span>
              {line.unitCode && line.unitCode !== 'PCS' && ` / ${line.unitCode.toLowerCase()}`}
            </div>
          </button>
          <Money value={total ? total.toFixed() : D(line.unitPrice).mul(D(line.quantity))} className="shrink-0 text-sm font-bold" />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="flex items-center rounded-lg border bg-card">
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-s-lg hover:bg-muted" onClick={(e) => { e.stopPropagation(); inc(line.key, -step); }} aria-label="-1"><Minus className="h-3.5 w-3.5" /></button>
            <Input
              value={formatQty(line.quantity)}
              onChange={(e) => { const v = e.target.value.replace(',', '.'); if (/^\d*\.?\d*$/.test(v) && v !== '') setQty(line.key, v); }}
              onFocus={(e) => e.target.select()}
              inputMode={line.allowDecimal ? 'decimal' : 'numeric'}
              className="h-8 w-12 rounded-none border-0 border-x p-0 text-center text-sm font-semibold tabular focus-visible:ring-0"
              aria-label={t('pos.qty')}
            />
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-e-lg hover:bg-muted" onClick={(e) => { e.stopPropagation(); inc(line.key, step); }} aria-label="+1"><Plus className="h-3.5 w-3.5" /></button>
          </div>
          {line.discountType && D(line.discountValue).gt(0) && (
            <button type="button" onClick={onEdit} className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
              <Tag className="h-3 w-3" />{line.discountType === 'PERCENT' ? `-${line.discountValue} %` : `-${formatMoney(line.discountValue)}`}
            </button>
          )}
          {overStock && <span className="text-xs font-medium text-destructive">{t('pos.stock')}: {formatQty(line.stock!)}</span>}
          <button type="button" className="ms-auto rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={(e) => { e.stopPropagation(); remove(line.key); }} aria-label={t('pos.removeItem')}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </li>
  );
}
