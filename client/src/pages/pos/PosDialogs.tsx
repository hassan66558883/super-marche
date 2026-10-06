import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, UserPlus, Printer, FileText, Plus, PlayCircle, Store, CheckCircle2, UserRound } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { FormField } from '@/components/shared/FormField';
import { Money } from '@/components/shared/Money';
import { CustomerFormDialog } from '@/components/shared/CustomerFormDialog';
import { CustomersApi } from '@/services/catalog.api';
import { CashApi, HeldSalesApi } from '@/services/sales.api';
import { useCartStore, type CartCustomer, type CartLine } from '@/stores/cart.store';
import { useAuthStore, useCan } from '@/stores/auth.store';
import { usePrintStore } from '@/stores/print.store';
import { useDebounce } from '@/hooks/useDebounce';
import { localizedName } from '@/i18n';
import { D, formatMoney, formatNumber, formatQty, parseAmount } from '@/utils/money';
import { formatDateTime, formatTime } from '@/utils/format';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';
import type { Customer, Product } from '@/types/catalog';
import type { Sale } from '@/types/sales';

// ───────────────────────── Variant picker ─────────────────────────
export function VariantDialog({ product, onPick, onClose }: { product: Product | null; onPick: (variantId: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const variants = product?.variants.filter((v) => v.status === 'ACTIVE') ?? [];
  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pos.selectVariant')}</DialogTitle>
          <DialogDescription>{product && localizedName(product)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {variants.map((v, i) => {
            const out = product!.trackStock && D(v.stock).lte(0);
            return (
              <button key={v.id} type="button" autoFocus={i === 0} onClick={() => onPick(v.id)}
                className={cn('flex items-center justify-between rounded-lg border p-3 text-start transition hover:border-primary hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring', out && 'opacity-60')}>
                <span>
                  <span className="block font-semibold">{v.name}</span>
                  <span className="text-xs text-muted-foreground">{v.sku} · {t('pos.stock')}: {formatQty(v.stock)}</span>
                </span>
                <Money value={v.sellingPrice} className="font-bold text-primary" />
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Line edit (qty, price, discount) ─────────────────────────
export function LineEditDialog({ line, onClose }: { line: CartLine | null; onClose: () => void }) {
  const { t } = useTranslation();
  const setLine = useCartStore((s) => s.setLine);
  const setQty = useCartStore((s) => s.setQty);
  const canDiscount = useCan('sales.discount');
  const canOverride = useCan('sales.price_override');
  const canExceed = useCan('sales.discount_override');
  const maxPct = useAuthStore((s) => s.user?.maxDiscountPercent ?? 0);
  const [qty, setQ] = useState('1');
  const [price, setPrice] = useState('0');
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!line) return;
    setQ(formatQty(line.quantity)); setPrice(line.unitPrice); setType(line.discountType ?? 'PERCENT'); setValue(line.discountValue ?? '');
  }, [line]);

  if (!line) return null;
  const gross = D(price).mul(D(qty));
  const amount = type === 'PERCENT' ? gross.mul(D(value)).div(100) : D(value);
  const pct = gross.gt(0) ? amount.div(gross).mul(100) : D(0);
  const tooMuch = !canExceed && pct.gt(maxPct);
  const save = () => {
    if (tooMuch) return;
    setQty(line.key, qty || '0');
    setLine(line.key, { unitPrice: canOverride ? D(price).toFixed() : line.unitPrice, discountType: D(value).gt(0) ? type : null, discountValue: D(value).gt(0) ? D(value).toFixed() : null });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{line.name}{line.variantName && ` — ${line.variantName}`}</DialogTitle>
          <DialogDescription>{line.sku} · {t('pos.unitPrice')} {formatMoney(line.catalogPrice)}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('pos.qty')} htmlFor="le-qty"><Input id="le-qty" value={qty} onChange={(e) => setQ(e.target.value.replace(',', '.'))} inputMode="decimal" className="h-11 text-lg font-semibold" autoFocus onFocus={(e) => e.target.select()} /></FormField>
            <FormField label={t('pos.priceOverride')} htmlFor="le-price" hint={!canOverride ? t('common.permissionDenied') : undefined}>
              <Input id="le-price" value={formatNumber(price)} onChange={(e) => setPrice(parseAmount(e.target.value))} disabled={!canOverride} inputMode="numeric" className="h-11 text-lg font-semibold" />
            </FormField>
          </div>
          {canDiscount && (
            <div className="space-y-2">
              <div className="text-sm font-medium">{t('pos.lineDiscount')}</div>
              <DiscountInput type={type} value={value} onType={setType} onValue={setValue} />
              <p className={cn('text-xs', tooMuch ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                {amount.gt(0) && `-${formatMoney(amount)} (${pct.toDecimalPlaces(1).toString()} %) · `}{t('pos.discountLimit', { max: maxPct })}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={tooMuch}>{t('common.apply')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DiscountInput({ type, value, onType, onValue }: { type: 'PERCENT' | 'FIXED'; value: string; onType: (t: 'PERCENT' | 'FIXED') => void; onValue: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      <div className="flex rounded-lg border p-0.5">
        {(['PERCENT', 'FIXED'] as const).map((k) => (
          <button key={k} type="button" onClick={() => onType(k)} className={cn('rounded-md px-3 py-1.5 text-sm font-semibold', type === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
            {k === 'PERCENT' ? '%' : 'FCFA'}
          </button>
        ))}
      </div>
      <Input value={type === 'FIXED' && value ? formatNumber(value) : value} onChange={(e) => onValue(type === 'FIXED' ? parseAmount(e.target.value) : e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
        inputMode="decimal" className="h-10 flex-1 text-end font-semibold" placeholder="0" aria-label={type === 'PERCENT' ? t('pos.percent') : t('pos.fixed')} />
      {type === 'PERCENT' && (
        <div className="hidden gap-1 sm:flex">
          {[5, 10, 15].map((p) => <Button key={p} type="button" variant="soft" size="sm" className="h-10" onClick={() => onValue(String(p))}>{p}%</Button>)}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Cart discount (F4) ─────────────────────────
export function CartDiscountDialog({ open, onClose, subtotal }: { open: boolean; onClose: () => void; subtotal: string }) {
  const { t } = useTranslation();
  const current = useCartStore((s) => s.cartDiscount);
  const setCartDiscount = useCartStore((s) => s.setCartDiscount);
  const canDiscount = useCan('sales.discount');
  const canExceed = useCan('sales.discount_override');
  const maxPct = useAuthStore((s) => s.user?.maxDiscountPercent ?? 0);
  const [type, setType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [value, setValue] = useState('');
  useEffect(() => { if (open) { setType(current?.type ?? 'PERCENT'); setValue(current?.value ?? ''); } }, [open, current]);
  const base = D(subtotal);
  const amount = type === 'PERCENT' ? base.mul(D(value)).div(100) : D(value);
  const pct = base.gt(0) ? amount.div(base).mul(100) : D(0);
  const tooMuch = !canExceed && pct.gt(maxPct);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('pos.cartDiscount')}</DialogTitle>
          <DialogDescription>{t('pos.subtotal')} : {formatMoney(subtotal)}</DialogDescription>
        </DialogHeader>
        {!canDiscount ? <p className="text-sm text-destructive">{t('common.permissionDenied')}</p> : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (tooMuch) return; setCartDiscount(D(value).gt(0) ? { type, value: D(value).toFixed() } : null); onClose(); }}>
            <DiscountInput type={type} value={value} onType={setType} onValue={setValue} />
            <p className={cn('text-sm', tooMuch ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
              {amount.gt(0) && <>-{formatMoney(amount)} ({pct.toDecimalPlaces(1).toString()} %) · </>}{t('pos.discountLimit', { max: maxPct })}
            </p>
            <DialogFooter>
              {current && <Button type="button" variant="ghost" className="me-auto text-destructive" onClick={() => { setCartDiscount(null); onClose(); }}>{t('common.remove')}</Button>}
              <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={tooMuch}>{t('common.apply')}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Customer picker (F3) ─────────────────────────
export function CustomerPickerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const setCustomer = useCartStore((s) => s.setCustomer);
  const canCreate = useCan('customers.create');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const debounced = useDebounce(q, 250);
  const list = useQuery({ queryKey: ['customers', 'pos', debounced], queryFn: () => CustomersApi.list({ search: debounced || undefined, pageSize: 20, sort: 'name', order: 'asc' }), enabled: open });
  useEffect(() => { if (open) setQ(''); }, [open]);
  const pick = (c: Customer) => {
    const snap: CartCustomer = { id: c.id, code: c.code, name: c.name, type: c.type, phone: c.phone, balance: c.balance, creditLimit: c.creditLimit, paymentTermsDays: c.paymentTermsDays };
    setCustomer(c.type === 'WALK_IN' ? null : snap);
    onClose();
  };
  return (
    <>
      <Dialog open={open && !creating} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('pos.selectCustomer')}</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t('common.name')}, ${t('common.phone').toLowerCase()}, ${t('common.code').toLowerCase()}…`} className="h-11 ps-9" autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && list.data?.items[0]) { e.preventDefault(); pick(list.data.items[0]); } }} />
            </div>
            {canCreate && <Button variant="secondary" className="h-11" onClick={() => setCreating(true)}><UserPlus /> <span className="hidden sm:inline">{t('pos.addCustomer').replace('+ ', '')}</span></Button>}
          </div>
          <div className="max-h-[50vh] min-h-40 overflow-y-auto rounded-lg border">
            {list.isLoading ? <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div> : (
              <ul className="divide-y">
                {list.data?.items.map((c) => {
                  const over = D(c.creditLimit).gt(0) && D(c.balance).gte(D(c.creditLimit));
                  return (
                    <li key={c.id}>
                      <button type="button" onClick={() => pick(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-start hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{c.code}{c.phone && ` · ${c.phone}`}</span>
                        </span>
                        {D(c.balance).gt(0) && <Badge variant={over ? 'destructive' : 'warning'}><Money value={c.balance} /></Badge>}
                      </button>
                    </li>
                  );
                })}
                {!list.data?.items.length && <li className="p-6 text-center text-sm text-muted-foreground">{t('common.noResults')}</li>}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <CustomerFormDialog open={creating} initialName={q} onOpenChange={(o) => { setCreating(o); }} onSaved={(c) => { pick(c); setCreating(false); }} />
    </>
  );
}

// ───────────────────────── Note ─────────────────────────
export function NoteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const note = useCartStore((s) => s.note);
  const setNote = useCartStore((s) => s.setNote);
  const [v, setV] = useState('');
  useEffect(() => { if (open) setV(note); }, [open, note]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('pos.note')}</DialogTitle></DialogHeader>
        <Textarea value={v} onChange={(e) => setV(e.target.value)} maxLength={500} rows={4} autoFocus />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => { setNote(v.trim()); onClose(); }}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Held sales (F8) ─────────────────────────
export function HeldSalesDialog({ open, onClose, total }: { open: boolean; onClose: () => void; total: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const cart = useCartStore();
  const [label, setLabel] = useState('');
  const held = useQuery({ queryKey: ['held-sales'], queryFn: HeldSalesApi.list, enabled: open });
  useEffect(() => { if (open) setLabel(cart.customer?.name ?? `${t('pos.held').split(' ')[0]} ${formatTime(new Date())}`); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const hold = useMutation({
    mutationFn: () => HeldSalesApi.hold({
      label: label.trim() || formatTime(new Date()), customerId: cart.customer?.id ?? null,
      cart: { lines: cart.lines, customer: cart.customer, cartDiscount: cart.cartDiscount, note: cart.note },
      itemCount: cart.lines.length, total: Number(total),
    }),
    onSuccess: () => { cart.clear(); void qc.invalidateQueries({ queryKey: ['held-sales'] }); toast.success(t('pos.heldDone')); onClose(); },
    onError: toastError,
  });
  const resume = useMutation({
    mutationFn: async (id: string) => {
      // Park the current cart first so nothing is lost
      if (cart.lines.length) await HeldSalesApi.hold({ label: `${formatTime(new Date())}`, customerId: cart.customer?.id ?? null, cart: { lines: cart.lines, customer: cart.customer, cartDiscount: cart.cartDiscount, note: cart.note }, itemCount: cart.lines.length, total: Number(total) });
      return HeldSalesApi.resume(id);
    },
    onSuccess: (h) => {
      const c = h.cart as { lines: CartLine[]; customer: CartCustomer | null; cartDiscount: { type: 'PERCENT' | 'FIXED'; value: string } | null; note: string };
      cart.load({ lines: c.lines ?? [], customer: c.customer ?? null, cartDiscount: c.cartDiscount ?? null, note: c.note ?? '' });
      void qc.invalidateQueries({ queryKey: ['held-sales'] });
      onClose();
    },
    onError: toastError,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t('pos.held')}</DialogTitle></DialogHeader>
        {cart.lines.length > 0 && (
          <form className="flex items-end gap-2 rounded-lg border bg-muted/40 p-3" onSubmit={(e) => { e.preventDefault(); hold.mutate(); }}>
            <FormField label={t('pos.heldLabel')} htmlFor="held-label" className="flex-1"><Input id="held-label" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus maxLength={80} /></FormField>
            <Button type="submit" loading={hold.isPending}><Plus /> {t('pos.hold')}</Button>
          </form>
        )}
        <div className="max-h-[50vh] overflow-y-auto">
          {held.isLoading ? <Skeleton className="h-24" /> : !held.data?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('pos.noHeld')}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {held.data.map((h) => (
                <li key={h.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{h.label}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(h.createdAt)} · {t('pos.items', { count: h.itemCount })}</div>
                  </div>
                  <Money value={h.total} className="font-bold" />
                  <Button size="sm" variant="secondary" loading={resume.isPending && resume.variables === h.id} onClick={() => resume.mutate(h.id)}><PlayCircle /> {t('pos.resume')}</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Open register ─────────────────────────
export function OpenRegisterDialog({ open, onOpened }: { open: boolean; onOpened: () => void }) {
  const { t } = useTranslation();
  const canOperate = useCan('cash.operate');
  const registers = useQuery({ queryKey: ['cash', 'registers'], queryFn: CashApi.registers, enabled: open });
  const [registerId, setRegisterId] = useState('');
  const [amount, setAmount] = useState('');
  useEffect(() => {
    const free = registers.data?.find((r) => !r.openSession);
    if (free && !registerId) setRegisterId(free.id);
  }, [registers.data, registerId]);
  const openReg = useMutation({
    mutationFn: () => CashApi.open({ registerId, amount: Number(amount || 0) }),
    onSuccess: () => { toast.success(t('pos.registerOpened')); onOpened(); },
    onError: toastError,
  });
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md" hideClose onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Store className="h-6 w-6" /></div>
          <DialogTitle>{t('pos.registerClosed')}</DialogTitle>
          <DialogDescription>{t('pos.openRegisterFirst')}</DialogDescription>
        </DialogHeader>
        {!canOperate ? <p className="text-sm text-destructive">{t('common.permissionDenied')}</p> : (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (registerId) openReg.mutate(); }}>
            <div className="grid grid-cols-2 gap-2">
              {registers.data?.map((r) => (
                <button key={r.id} type="button" disabled={!!r.openSession} onClick={() => setRegisterId(r.id)}
                  className={cn('rounded-lg border p-3 text-start transition disabled:cursor-not-allowed disabled:opacity-50', registerId === r.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:bg-muted')}>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.openSession ? `${t('cash.openedBy')} ${r.openSession.openedBy.fullName}` : t('cash.statusCLOSED')}</div>
                </button>
              ))}
            </div>
            <FormField label={t('pos.openingAmount')} htmlFor="open-amount">
              <Input id="open-amount" value={amount ? formatNumber(amount) : ''} onChange={(e) => setAmount(parseAmount(e.target.value))} inputMode="numeric" placeholder="0" className="h-12 text-end text-xl font-bold" autoFocus />
            </FormField>
            <Button type="submit" className="h-12 w-full" disabled={!registerId} loading={openReg.isPending}>{t('pos.openRegister')}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────── Sale completed ─────────────────────────
export function SaleSuccessDialog({ sale, offline, onNew }: { sale: Sale | null; offline?: boolean; onNew: () => void }) {
  const { t } = useTranslation();
  const print = usePrintStore((s) => s.print);
  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onNew()}>
      <DialogContent className="max-w-md text-center" onOpenAutoFocus={(e) => { e.preventDefault(); document.getElementById('new-sale-btn')?.focus(); }}>
        {sale && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/15 text-success"><CheckCircle2 className="h-9 w-9" /></div>
            <DialogHeader className="items-center text-center">
              <DialogTitle className="text-xl">{t('pos.successTitle')}</DialogTitle>
              <DialogDescription>{offline ? t('pos.offlineSaved') : <>{t('pos.invoiceNo')} <span className="font-mono font-semibold text-foreground">{sale.invoiceNumber}</span></>}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/50 p-4 text-start">
              <div><div className="text-xs text-muted-foreground">{t('pos.total')}</div><Money value={sale.total} className="text-xl font-bold" /></div>
              {D(sale.amountDue).gt(0)
                ? <div><div className="text-xs text-muted-foreground">{t('receipt.balanceDue')}</div><Money value={sale.amountDue} className="text-xl font-bold text-warning" /></div>
                : <div><div className="text-xs text-muted-foreground">{t('pos.change')}</div><Money value={sale.changeGiven} className="text-xl font-bold text-secondary" /></div>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" onClick={() => print('receipt', sale)}><Printer /> {t('pos.printReceipt')}</Button>
              <Button variant="outline" className="h-12" onClick={() => print('invoice', sale)} disabled={offline}><FileText /> {t('pos.printInvoice')}</Button>
            </div>
            <Button id="new-sale-btn" variant="secondary" size="xl" className="h-14 w-full text-base font-bold" onClick={onNew}>{t('pos.newSale')}</Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
