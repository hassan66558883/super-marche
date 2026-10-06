import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Keyboard, Undo2, PauseCircle, Wallet, ShoppingCart, LayoutGrid, CreditCard, WifiOff, Store, CloudUpload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Kbd } from '@/components/ui/misc';
import { Tip } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, SheetContent } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Money } from '@/components/shared/Money';
import { Logo } from '@/components/layout/Logo';
import { LanguageSwitcher, ThemeToggle, UserMenu } from '@/components/layout/HeaderControls';
import { ProductPanel, type ProductPanelHandle } from './ProductPanel';
import { CartPanel } from './CartPanel';
import { CheckoutPanel, type CheckoutHandle } from './CheckoutPanel';
import { CartDiscountDialog, CustomerPickerDialog, HeldSalesDialog, LineEditDialog, NoteDialog, OpenRegisterDialog, SaleSuccessDialog, VariantDialog } from './PosDialogs';
import { ReturnDialog } from '@/pages/returns/ReturnDialog';
import { useCartStore } from '@/stores/cart.store';
import { useAuthStore, useCurrentBranch } from '@/stores/auth.store';
import { usePrintStore } from '@/stores/print.store';
import { analyzePayments, buildSaleInput, newClientRef, useCartPricing } from '@/services/pos.service';
import { CashApi, HeldSalesApi, PaymentMethodsApi, SalesApi } from '@/services/sales.api';
import { ProductsApi } from '@/services/catalog.api';
import { ApiError } from '@/services/api';
import { useSettings } from '@/hooks/useSettings';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { usePosLayout } from '@/hooks/useMediaQuery';
import { useOnline } from '@/hooks/useOnline';
import { syncCatalog, findLocalByCode, decrementLocalStock, catalogInfo } from '@/offline/catalog';
import { enqueueSale, isNetworkError, useOfflineStore } from '@/offline/outbox';
import { withOfflineCache } from '@/offline/cache';
import { localSaleNumber, provisionalSale } from '@/offline/provisional';
import { OutboxDialog } from './OutboxDialog';
import { D } from '@/utils/money';
import { toastError } from '@/utils/errors';
import { beep } from '@/utils/beep';
import { cn } from '@/utils/cn';
import type { Product } from '@/types/catalog';
import type { Sale } from '@/types/sales';

type Panel = 'products' | 'cart' | 'checkout';

export default function POSPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const layout = usePosLayout();
  const browserOnline = useOnline();
  const reachable = useOfflineStore((s) => s.reachable);
  const queued = useOfflineStore((s) => s.pending + s.failed);
  const failedCount = useOfflineStore((s) => s.failed);
  const online = browserOnline && reachable;
  const user = useAuthStore((s) => s.user);
  const branch = useCurrentBranch();
  const settings = useSettings();
  const cart = useCartStore();
  const pricing = useCartPricing();
  const print = usePrintStore((s) => s.print);

  const productsRef = useRef<ProductPanelHandle>(null);
  const checkoutRef = useRef<CheckoutHandle>(null);
  const clientRef = useRef<string>(newClientRef());

  const [mobilePanel, setMobilePanel] = useState<Panel>('products');
  const [drawer, setDrawer] = useState(false);
  const [variantFor, setVariantFor] = useState<Product | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'customer' | 'discount' | 'held' | 'note' | 'return' | 'clear' | 'shortcuts'>(null);
  const [completed, setCompleted] = useState<{ sale: Sale; offline: boolean } | null>(null);
  const [outboxOpen, setOutboxOpen] = useState(false);
  const [catalogState, setCatalogState] = useState<{ count: number; syncedAt: string } | null>(null);

  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: () => withOfflineCache('payment-methods', PaymentMethodsApi.list), staleTime: 10 * 60_000 });
  const session = useQuery({ queryKey: ['cash', 'current', branch?.id], queryFn: () => withOfflineCache(`cash-current-${branch?.id}-${user?.id}`, CashApi.current), enabled: !!branch });

  // Local copy of the catalog for offline selling, refreshed every 10 minutes while online
  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    const run = () => syncCatalog(branch.id).then((r) => !cancelled && setCatalogState(r)).catch(() => catalogInfo(branch.id).then((r) => !cancelled && setCatalogState(r)));
    void run();
    const timer = window.setInterval(() => { if (useOfflineStore.getState().reachable) void run(); }, 10 * 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [branch]);
  const held = useQuery({ queryKey: ['held-sales'], queryFn: HeldSalesApi.list });
  const requireRegister = settings.data?.pos.requireOpenRegister ?? true;
  const registerMissing = requireRegister && session.isSuccess && !session.data;

  const hasRegisteredCustomer = !!cart.customer && cart.customer.type !== 'WALK_IN';
  const analysis = useMemo(() => analyzePayments(pricing.total, cart.payments, methods.data ?? [], hasRegisteredCustomer), [pricing.total, cart.payments, methods.data, hasRegisteredCustomer]);

  // ── Adding products ──
  const addProduct = useCallback((p: Product, variantId?: string | null) => {
    const activeVariants = p.variants.filter((v) => v.status === 'ACTIVE');
    if (activeVariants.length && !variantId) { setVariantFor(p); return; }
    const line = useCartStore.getState().add(p, variantId ?? null);
    if (line.stock !== null && D(line.quantity).gt(D(line.stock)) && !settings.data?.pos.allowNegativeStock) {
      toast.warning(`${line.name} : ${t('pos.stock')} ${D(line.stock).toString()}`, { id: `stock-${line.key}` });
    }
  }, [settings.data, t]);

  const notFound = useCallback((code: string) => {
    toast.error(t('pos.productNotFound'), { description: code, id: 'not-found' });
    beep('error');
  }, [t]);

  // Scanner while focus is outside the search box
  useBarcodeScanner(async (code) => {
    try {
      const hit = await ProductsApi.byCode(code);
      addProduct(hit.product, hit.variantId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) notFound(code);
      else if (isNetworkError(e) && branch) {
        const local = await findLocalByCode(branch.id, code);
        if (local) addProduct(local.product, local.variantId); else notFound(code);
      } else toastError(e);
    }
  }, { enabled: !completed });

  // ── Completing the sale ──
  /** Methods that work without the server: no credit (limit check) and no live mobile-money provider */
  const offlineAllowed = (code: string) => {
    const m = methods.data?.find((x) => x.code === code);
    return !!m && m.type !== 'CREDIT' && !m.provider;
  };

  const saveOffline = async (input: ReturnType<typeof buildSaleInput>) => {
    if (!branch || !user) throw new ApiError(0, 'NETWORK', t('errors.NETWORK'));
    if (input.payments.some((p) => !offlineAllowed(p.method))) throw new ApiError(0, 'OFFLINE_METHOD', t('pos.offlineMethodNotAllowed'));
    const now = new Date();
    const ref = input.clientRef!;
    const localNumber = localSaleNumber(branch.code, ref, now);
    const sale = provisionalSale({
      clientRef: ref, localNumber, lines: cart.lines, pricing, analysis, methods: methods.data ?? [], customer: cart.customer,
      cashier: { id: user.id, fullName: user.fullName }, branch: { id: branch.id, code: branch.code, name: branch.name }, note: cart.note, createdAt: now,
    });
    await enqueueSale({ clientRef: ref, branchId: branch.id, userId: user.id, input: { ...input, offlineCreatedAt: now.toISOString() }, localNumber, total: sale.total, createdAt: now.toISOString() });
    await decrementLocalStock(branch.id, cart.lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })));
    return sale;
  };

  const complete = useMutation({
    mutationFn: async (): Promise<{ sale: Sale; offline: boolean }> => {
      const input = buildSaleInput({
        clientRef: clientRef.current, lines: cart.lines, customerId: cart.customer?.id ?? null, cartDiscount: cart.cartDiscount, analysis, note: cart.note,
      });
      if (!online) return { sale: await saveOffline(input), offline: true };
      try {
        return { sale: await SalesApi.create(input), offline: false };
      } catch (e) {
        // The request may or may not have reached the server: queue it with the same clientRef, the server dedupes
        if (isNetworkError(e)) return { sale: await saveOffline(input), offline: true };
        throw e;
      }
    },
    onSuccess: (res) => {
      setCompleted(res);
      setDrawer(false);
      cart.clear();
      clientRef.current = newClientRef();
      if (res.offline) toast.warning(t('pos.offlineQueued'), { id: 'offline-sale' });
      void qc.invalidateQueries({ queryKey: ['pos-products'] });
      void qc.invalidateQueries({ queryKey: ['cash', 'current'] });
      if (settings.data?.receipt.autoPrint) print('receipt', res.sale);
    },
    onError: (e) => {
      // Business rule errors: a new attempt must be a new request
      if (e instanceof ApiError && e.status < 500) clientRef.current = newClientRef();
      if (e instanceof ApiError && e.code === 'REGISTER_NOT_OPEN') void session.refetch();
      toastError(e);
    },
  });
  const offlineBlocked = !online && analysis.effective.some((p) => p.amount.gt(0) && !offlineAllowed(p.method)) ? t('pos.offlineMethodNotAllowed') : null;
  const disabledReason = registerMissing ? t('pos.openRegisterFirst') : offlineBlocked;
  const confirm = () => {
    if (!cart.lines.length || complete.isPending) return;
    if (!analysis.canComplete || disabledReason) {
      if (layout === 'tablet') setDrawer(true);
      if (layout === 'mobile') setMobilePanel('checkout');
      if (analysis.remaining.gt(0)) toast.error(t('pos.insufficientPayment'), { id: 'pay' });
      return;
    }
    complete.mutate();
  };
  const goPayment = () => {
    if (layout === 'tablet') setDrawer(true);
    if (layout === 'mobile') setMobilePanel('checkout');
    window.setTimeout(() => checkoutRef.current?.focusAmount(), 120);
  };

  useHotkeys({
    F2: () => { if (layout === 'mobile') setMobilePanel('products'); window.setTimeout(() => productsRef.current?.focusSearch(), 50); },
    F3: () => setDialog('customer'),
    F4: () => cart.lines.length && setDialog('discount'),
    F6: goPayment,
    F8: () => setDialog('held'),
    F9: () => setDialog('return'),
    F10: confirm,
    Escape: () => { if (cart.lines.length) setDialog('clear'); },
  }, { enabled: !completed && !registerMissing });

  useEffect(() => { document.title = `${t('nav.pos')} · TECHNOVA POS`; }, [t]);

  const editLine = cart.lines.find((l) => l.key === editKey) ?? null;
  const count = cart.lines.reduce((a, l) => a.plus(D(l.quantity)), D(0));

  const productPanel = <ProductPanel ref={productsRef} onPick={addProduct} onNotFound={notFound} compact={layout === 'mobile'} />;
  const checkoutPanel = (
    <CheckoutPanel ref={checkoutRef} total={pricing.total} methods={methods.data ?? []} analysis={analysis} submitting={complete.isPending} onConfirm={confirm} disabledReason={disabledReason} />
  );
  const cartPanel = (
    <CartPanel
      onCustomer={() => setDialog('customer')} onDiscount={() => setDialog('discount')} onHold={() => setDialog('held')} onClear={() => setDialog('clear')}
      onEditLine={setEditKey} onNote={() => setDialog('note')}
      footer={layout !== 'desktop' && (
        <Button variant="secondary" size="xl" className="mt-3 h-14 w-full justify-between text-base font-bold" onClick={goPayment} disabled={!cart.lines.length}>
          <span className="flex items-center gap-2"><CreditCard className="h-5 w-5" />{t('pos.payment')} <Kbd className="border-white/30 bg-white/15 text-white">F6</Kbd></span>
          <Money value={pricing.total} className="text-lg" />
        </Button>
      )}
    />
  );

  return (
    <div className="flex h-full flex-col bg-muted/40">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-2 sm:px-4">
        <Tip label={t('common.back')}><Button asChild variant="ghost" size="icon"><Link to="/" aria-label={t('common.back')}><ArrowLeft className="flip-rtl" /></Link></Button></Tip>
        <div className="hidden xl:block"><Logo /></div>
        <div className="mx-1 hidden h-6 w-px bg-border xl:block" />
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Store className="hidden h-4 w-4 text-muted-foreground sm:block" />
          <span className="truncate font-semibold">{branch?.name}</span>
          {session.data ? (
            <Badge variant="success" className="hidden sm:inline-flex"><Wallet className="h-3 w-3" /> {session.data.session.register.name}</Badge>
          ) : session.isSuccess && <Badge variant="destructive" className="hidden sm:inline-flex">{t('pos.registerClosed')}</Badge>}
          {!online && (
            <Tip label={catalogState ? t('pos.offlineCatalog', { count: catalogState.count, date: new Date(catalogState.syncedAt).toLocaleTimeString() }) : t('pos.offlineNoCatalog')}>
              <Badge variant="warning"><WifiOff className="h-3 w-3" /> {t('common.offline')}</Badge>
            </Tip>
          )}
        </div>
        <div className="ms-auto flex items-center gap-1">
          {queued > 0 && (
            <Tip label={t('pos.outboxTitle')}>
              <Button variant="ghost" size="sm" className={cn('relative', failedCount && 'text-destructive')} onClick={() => setOutboxOpen(true)}>
                <CloudUpload /> <span className="hidden lg:inline">{t('pos.outboxShort')}</span>
                <span className={cn('absolute -top-0.5 end-0 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white', failedCount ? 'bg-destructive' : 'bg-warning')}>{queued}</span>
              </Button>
            </Tip>
          )}
          <Tip label={t('pos.held')} shortcut="F8">
            <Button variant="ghost" size="sm" className="relative" onClick={() => setDialog('held')}>
              <PauseCircle /> <span className="hidden lg:inline">{t('pos.held')}</span>
              {!!held.data?.length && <span className="absolute -top-0.5 end-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-warning px-1 text-[10px] font-bold text-white">{held.data.length}</span>}
            </Button>
          </Tip>
          <Tip label={t('pos.returnSale')} shortcut="F9"><Button variant="ghost" size="sm" onClick={() => setDialog('return')}><Undo2 /> <span className="hidden lg:inline">{t('pos.returnSale')}</span></Button></Tip>
          <Tip label={t('pos.shortcuts')}><Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => setDialog('shortcuts')} aria-label={t('pos.shortcuts')}><Keyboard /></Button></Tip>
          <LanguageSwitcher />
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>

      {/* Body */}
      {layout === 'desktop' && (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_400px_360px]">
          <section className="min-h-0" aria-label={t('nav.products')}>{productPanel}</section>
          <section className="min-h-0 border-s bg-card" aria-label={t('pos.cart')}>{cartPanel}</section>
          <section className="min-h-0 border-s bg-card" aria-label={t('pos.payment')}>{checkoutPanel}</section>
        </div>
      )}
      {layout === 'tablet' && (
        <>
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(340px,42%)]">
            <section className="min-h-0">{productPanel}</section>
            <section className="min-h-0 border-s bg-card">{cartPanel}</section>
          </div>
          <Dialog open={drawer} onOpenChange={setDrawer}>
            <SheetContent side="end" className="w-[min(420px,100vw)] p-0" aria-describedby={undefined}>
              <DialogTitle className="border-b px-4 py-3 text-base">{t('pos.payment')}</DialogTitle>
              <div className="min-h-0 flex-1">{checkoutPanel}</div>
            </SheetContent>
          </Dialog>
        </>
      )}
      {layout === 'mobile' && (
        <>
          <div className="min-h-0 flex-1 bg-card">
            {mobilePanel === 'products' && productPanel}
            {mobilePanel === 'cart' && cartPanel}
            {mobilePanel === 'checkout' && checkoutPanel}
          </div>
          <nav className="grid shrink-0 grid-cols-3 border-t bg-card pb-[env(safe-area-inset-bottom)]" aria-label={t('nav.pos')}>
            {([['products', LayoutGrid, t('pos.productsTab')], ['cart', ShoppingCart, t('pos.cartTab')], ['checkout', CreditCard, t('pos.checkoutTab')]] as const).map(([k, Icon, label]) => (
              <button key={k} type="button" onClick={() => setMobilePanel(k)} aria-current={mobilePanel === k}
                className={cn('relative flex h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold', mobilePanel === k ? 'text-primary' : 'text-muted-foreground')}>
                <Icon className="h-5 w-5" />{label}
                {k === 'cart' && count.gt(0) && <span className="absolute end-[28%] top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1 text-[11px] font-bold text-white">{count.toFixed(0)}</span>}
                {k === 'checkout' && pricing.total.gt(0) && <Money value={pricing.total} className="text-[10px] text-foreground" />}
              </button>
            ))}
          </nav>
        </>
      )}

      {/* Dialogs */}
      <VariantDialog product={variantFor} onClose={() => setVariantFor(null)} onPick={(vid) => { const p = variantFor!; setVariantFor(null); addProduct(p, vid); }} />
      <LineEditDialog line={editLine} onClose={() => setEditKey(null)} />
      <CartDiscountDialog open={dialog === 'discount'} onClose={() => setDialog(null)} subtotal={pricing.subtotal.minus(pricing.lineDiscountTotal).toFixed()} />
      <CustomerPickerDialog open={dialog === 'customer'} onClose={() => setDialog(null)} />
      <NoteDialog open={dialog === 'note'} onClose={() => setDialog(null)} />
      <HeldSalesDialog open={dialog === 'held'} onClose={() => setDialog(null)} total={pricing.total.toFixed()} />
      <ReturnDialog open={dialog === 'return'} onClose={() => setDialog(null)} onDone={() => void session.refetch()} />
      <ConfirmDialog open={dialog === 'clear'} onOpenChange={(o) => !o && setDialog(null)} title={t('pos.clearConfirm')} destructive confirmLabel={t('pos.clearCart')}
        onConfirm={() => { cart.clear(); setDialog(null); productsRef.current?.focusSearch(); }} />
      <ShortcutsDialog open={dialog === 'shortcuts'} onClose={() => setDialog(null)} />
      <OpenRegisterDialog open={registerMissing} onOpened={() => void session.refetch()} />
      <OutboxDialog open={outboxOpen} onClose={() => setOutboxOpen(false)} />
      <SaleSuccessDialog sale={completed?.sale ?? null} offline={completed?.offline} onNew={() => { setCompleted(null); setMobilePanel('products'); window.setTimeout(() => productsRef.current?.focusSearch(), 50); }} />
    </div>
  );
}

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    ['F2', t('pos.scShortcutSearch')], ['F3', t('pos.customer')], ['F4', t('pos.cartDiscount')], ['F6', t('pos.payment')],
    ['F8', t('pos.hold')], ['F9', t('pos.returnSale')], ['F10', t('pos.confirmSale')], ['Esc', t('pos.clearCart')],
    ['↑ ↓ Entrée', t('pos.scShortcutPick')],
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Keyboard className="h-5 w-5" /> {t('pos.shortcuts')}</DialogTitle></DialogHeader>
        <ul className="divide-y">
          {rows.map(([k, label]) => <li key={k} className="flex items-center justify-between py-2 text-sm"><span>{label}</span><Kbd>{k}</Kbd></li>)}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
