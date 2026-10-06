import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Banknote, CreditCard, Smartphone, Landmark, NotebookPen, Plus, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/misc';
import { Tip } from '@/components/ui/tooltip';
import { Money } from '@/components/shared/Money';
import { useCartStore, type PaymentDraft } from '@/stores/cart.store';
import { useCan } from '@/stores/auth.store';
import { quickTenders, type PaymentAnalysis } from '@/services/pos.service';
import { Decimal, formatNumber, parseAmount } from '@/utils/money';
import { cn } from '@/utils/cn';
import type { PaymentMethod } from '@/types/sales';

const ICONS: Record<PaymentMethod['type'], typeof Banknote> = {
  CASH: Banknote, CARD: CreditCard, MOBILE_MONEY: Smartphone, BANK_TRANSFER: Landmark, CREDIT: NotebookPen,
};

export interface CheckoutHandle { focusAmount: () => void }

interface Props {
  total: Decimal;
  methods: PaymentMethod[];
  analysis: PaymentAnalysis;
  submitting: boolean;
  onConfirm: () => void;
  disabledReason?: string | null;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const CheckoutPanel = forwardRef<CheckoutHandle, Props>(function CheckoutPanel({ total, methods, analysis, submitting, onConfirm, disabledReason }, ref) {
  const { t } = useTranslation();
  const payments = useCartStore((s) => s.payments);
  const setPayments = useCartStore((s) => s.setPayments);
  const hasLines = useCartStore((s) => s.lines.length > 0);
  const canCredit = useCan('sales.credit');
  const firstAmount = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focusAmount: () => { firstAmount.current?.focus(); firstAmount.current?.select(); } }));

  const rows: PaymentDraft[] = payments.length ? payments : [{ id: 'default', method: 'CASH', amount: '', reference: '' }];
  const typeOf = (code: string) => methods.find((m) => m.code === code)?.type ?? 'CASH';
  const update = (id: string, patch: Partial<PaymentDraft>) => setPayments(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: string) => setPayments(rows.filter((r) => r.id !== id));

  const pickMethod = (m: PaymentMethod) => {
    // Untouched single line: switch its method; otherwise add a line for what is still due
    if (rows.length === 1 && rows[0].amount === '') { setPayments([{ ...rows[0], method: m.code, reference: '' }]); return; }
    if (rows.some((r) => r.method === m.code)) return;
    const due = Decimal.max(total.minus(analysis.paid), 0);
    setPayments([...rows, { id: uid(), method: m.code, amount: m.type === 'CREDIT' ? '' : due.gt(0) ? due.toFixed() : '', reference: '' }]);
  };

  const cashRow = rows.find((r) => typeOf(r.method) === 'CASH');
  const visibleMethods = methods.filter((m) => m.isActive && (m.type !== 'CREDIT' || canCredit));
  const blocked = !hasLines || !analysis.canComplete || !!disabledReason || submitting;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-widest opacity-80">{t('pos.total')}</div>
          <div className="text-4xl font-extrabold tabular leading-tight" aria-live="polite"><Money value={total} /></div>
        </div>

        <section aria-label={t('pos.paymentMethods')}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('pos.paymentMethods')}</div>
          <div className="grid grid-cols-3 gap-2">
            {visibleMethods.map((m) => {
              const Icon = ICONS[m.type];
              const selected = rows.some((r) => r.method === m.code);
              return (
                <button
                  key={m.code}
                  type="button"
                  onClick={() => pickMethod(m)}
                  aria-pressed={selected}
                  className={cn('flex h-16 flex-col items-center justify-center gap-1 rounded-lg border bg-card px-1 text-xs font-semibold transition hover:border-primary/60',
                    selected && 'border-primary bg-primary/10 text-primary ring-1 ring-primary')}
                >
                  <Icon className="h-5 w-5" />
                  <span className="line-clamp-1 text-center">{m.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          {rows.map((r, i) => {
            const type = typeOf(r.method);
            const m = methods.find((x) => x.code === r.method);
            const Icon = ICONS[type];
            return (
              <div key={r.id} className="rounded-lg border bg-card p-2.5">
                <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <Icon className="h-4 w-4 text-primary" />{m?.name ?? r.method}
                  {type === 'CASH' && <span className="text-xs font-normal text-muted-foreground">· {t('pos.amountReceived')}</span>}
                  {rows.length > 1 && <button type="button" className="ms-auto rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => removeRow(r.id)} aria-label={t('common.remove')}><X className="h-4 w-4" /></button>}
                </div>
                {type === 'CREDIT' ? (
                  <div className="flex items-center justify-between rounded-md bg-warning/10 px-3 py-2 text-sm">
                    <span>{t('pos.onCredit')}</span><Money value={analysis.credit} className="font-bold text-warning" />
                  </div>
                ) : (
                  <Input
                    ref={i === 0 ? firstAmount : undefined}
                    value={r.amount === '' ? '' : formatNumber(r.amount)}
                    placeholder={type === 'CASH' && rows.length === 1 && total.gt(0) ? `${formatNumber(total)} (${t('pos.exact').toLowerCase()})` : '0'}
                    onChange={(e) => update(r.id, { amount: e.target.value.trim() === '' ? '' : parseAmount(e.target.value) })}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !blocked) { e.preventDefault(); onConfirm(); } }}
                    inputMode="numeric"
                    className="h-12 text-end text-xl font-bold tabular"
                    aria-label={`${m?.name ?? ''} ${t('common.amount')}`}
                  />
                )}
                {(type === 'MOBILE_MONEY' || type === 'CARD' || type === 'BANK_TRANSFER') && (
                  <Input value={r.reference} onChange={(e) => update(r.id, { reference: e.target.value })} placeholder={t('pos.paymentReference')} className="mt-2 h-9 text-sm" />
                )}
              </div>
            );
          })}
          {cashRow && total.gt(0) && (
            <div className="flex flex-wrap gap-1.5">
              {quickTenders(total).map((v) => (
                <Button key={v.toFixed()} variant="soft" size="sm" className="h-9 flex-1 tabular" onClick={() => update(cashRow.id, { amount: v.toFixed() })}>
                  {v.eq(total) ? t('pos.exact') : formatNumber(v)}
                </Button>
              ))}
            </div>
          )}
          {rows.length < 4 && analysis.remaining.gt(0) && (
            <Button variant="ghost" size="sm" className="w-full" onClick={() => pickMethod(methods.find((m) => !rows.some((r) => r.method === m.code) && m.type !== 'CREDIT') ?? methods[0])}>
              <Plus /> {t('pos.addPayment')}
            </Button>
          )}
        </section>
      </div>

      <div className="space-y-3 border-t bg-muted/30 p-4">
        <div className={cn('flex items-center justify-between rounded-xl px-4 py-3 transition-colors', analysis.change.gt(0) ? 'bg-secondary text-secondary-foreground' : analysis.remaining.gt(0) && hasLines ? 'bg-destructive/10 text-destructive' : 'bg-card border')}>
          <span className="text-sm font-bold uppercase tracking-wide">{analysis.remaining.gt(0) && hasLines ? t('pos.remaining') : t('pos.change')}</span>
          <Money value={analysis.remaining.gt(0) ? analysis.remaining : analysis.change} className="text-3xl font-extrabold" />
        </div>
        {analysis.credit.gt(0) && <p className="text-xs text-muted-foreground">{t('pos.onCredit')} : <Money value={analysis.credit} className="font-semibold text-warning" /></p>}
        {(disabledReason || analysis.needsCustomerForCredit || analysis.overpaidNonCash) && hasLines && (
          <p className="flex items-start gap-1.5 text-xs font-medium text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {disabledReason ?? (analysis.needsCustomerForCredit ? t('pos.creditRequiresCustomer') : t('pos.nonCashOverpaid'))}
          </p>
        )}
        <Tip label={t('pos.confirmSale')} shortcut="F10" side="top">
          <Button variant="secondary" size="xl" className="h-16 w-full text-lg font-extrabold tracking-wide shadow-lg" disabled={blocked} loading={submitting} onClick={onConfirm}>
            {!submitting && <CheckCircle2 className="h-6 w-6" />} {t('pos.confirmSale')} <Kbd className="ms-1 border-white/30 bg-white/15 text-white">F10</Kbd>
          </Button>
        </Tip>
      </div>
    </div>
  );
});

