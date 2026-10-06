import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDownCircle, ArrowUpCircle, Lock, Printer, Receipt, HandCoins, Calculator, CloudUpload } from 'lucide-react';
import { Money } from '@/components/shared/Money';
import { FormField } from '@/components/shared/FormField';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CashApi } from '@/services/sales.api';
import { usePrintStore } from '@/stores/print.store';
import { useAuthStore, useCan } from '@/stores/auth.store';
import { D, formatMoney, formatNumber, parseAmount } from '@/utils/money';
import { formatDateTime, formatTime } from '@/utils/format';
import { toastError } from '@/utils/errors';
import { flushOutbox, pendingForBranch, useOfflineStore } from '@/offline/outbox';
import { cn } from '@/utils/cn';
import type { CashMovement, CashSummary } from '@/types/sales';
import { ExpenseFormDialog } from '@/pages/expenses/ExpenseFormDialog';

const MV_TONE: Record<CashMovement['type'], 'success' | 'destructive' | 'warning' | 'muted' | 'default'> = {
  OPEN: 'default', SALE: 'success', REFUND: 'destructive', EXPENSE: 'warning', CASH_IN: 'success', CASH_OUT: 'warning', CLOSE: 'muted',
};

/** CFA franc notes and coins, for the closing count helper */
const DENOMINATIONS = [10000, 5000, 2000, 1000, 500, 250, 100, 50, 25, 10, 5];

/** Full view of one register session: drawer breakdown, takings by method, movements and actions. */
export function SessionView({ summary, onChanged }: { summary: CashSummary; onChanged: (s?: CashSummary) => void }) {
  const { t } = useTranslation();
  const s = summary;
  const userId = useAuthStore((st) => st.user?.id);
  const canManage = useCan('cash.manage');
  const canExpense = useCan('expenses.create');
  const printZ = usePrintStore((st) => st.printZReport);
  const [inOut, setInOut] = useState<'in' | 'out' | null>(null);
  const [closing, setClosing] = useState(false);
  const [expense, setExpense] = useState(false);
  const open = s.session.status === 'OPEN';
  const mine = s.session.openedById === userId;
  const canAct = open && (mine || canManage);

  const line = (label: string, value: string, sign: '+' | '-' | '' = '', strong = false) => (
    <div className={cn('flex items-center justify-between py-1.5 text-sm', strong && 'border-t pt-3 text-base font-bold')}>
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className={cn('tabular', sign === '-' && !D(value).isZero() && 'text-destructive', sign === '+' && !D(value).isZero() && 'text-success')}>
        {sign === '-' && !D(value).isZero() && !value.startsWith('-') ? '−' : ''}{formatMoney(value)}
      </span>
    </div>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {canAct && <Button variant="outline" onClick={() => setInOut('in')}><ArrowDownCircle className="text-success" /> {t('cash.cashIn')}</Button>}
        {canAct && <Button variant="outline" onClick={() => setInOut('out')}><ArrowUpCircle className="text-warning" /> {t('cash.cashOut')}</Button>}
        {canAct && mine && canExpense && <Button variant="outline" onClick={() => setExpense(true)}><HandCoins /> {t('expenses.new')}</Button>}
        <Button variant="outline" onClick={() => printZ(s)}><Printer /> {open ? t('cash.xReport') : t('cash.zReport')}</Button>
        <Button variant="ghost" asChild><Link to={`/sales?registerSessionId=${s.session.id}`}><Receipt /> {t('cash.sessionSales')}</Link></Button>
        {canAct && <Button className="ms-auto" variant="destructive" onClick={() => setClosing(true)}><Lock /> {t('cash.closeRegister')}</Button>}
      </div>
      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t('cash.drawer')}</CardTitle></CardHeader>
            <CardContent>
              {line(t('cash.opening'), s.opening)}
              {line(t('cash.cashSales'), s.cashSales, '+')}
              {line(t('cash.cashRefunds'), s.cashRefunds, '-')}
              {line(t('cash.cashExpenses'), s.cashExpenses, '-')}
              {line(t('cash.cashIn'), s.cashIn, '+')}
              {line(t('cash.cashOut'), s.cashOut, '-')}
              {line(t('cash.expected'), s.expected, '', true)}
              {!open && (
                <>
                  {line(t('cash.counted'), s.session.countedAmount ?? '0', '', true)}
                  <div className={cn('mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold',
                    D(s.session.difference).isZero() ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
                    <span>{t('cash.difference')}</span>
                    <span className="tabular">{D(s.session.difference).gt(0) ? '+' : ''}{formatMoney(s.session.difference)}</span>
                  </div>
                  {s.session.closingNote && <p className="mt-3 text-sm text-muted-foreground">{s.session.closingNote}</p>}
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t('cash.salesByMethod')}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between font-semibold"><span>{s.salesCount} {t('dashboard.transactions').toLowerCase()}</span><Money value={s.salesTotal} /></div>
              {s.byMethod.map((m) => (
                <div key={m.code} className="flex justify-between"><span className="text-muted-foreground">{m.name}</span><span className="tabular">{formatMoney(m.net)}{D(m.out).gt(0) && <span className="ms-1 text-xs text-destructive">(−{formatNumber(m.out)})</span>}</span></div>
              ))}
              {!s.byMethod.length && <p className="text-muted-foreground">{t('common.noData')}</p>}
            </CardContent>
          </Card>
        </div>
        <Card className="min-w-0">
          <CardHeader><CardTitle>{t('cash.movements')} ({s.movements?.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <THead><TR><TH>{t('common.date')}</TH><TH>{t('common.type')}</TH><TH>{t('common.description')}</TH><TH className="text-end">{t('common.amount')}</TH><TH>{t('common.user')}</TH></TR></THead>
              <TBody>
                {[...(s.movements ?? [])].reverse().map((m) => (
                  <TR key={m.id}>
                    <TD className="whitespace-nowrap text-sm">{formatTime(m.createdAt)}</TD>
                    <TD><Badge variant={MV_TONE[m.type]}>{t(`cash.mv${m.type}`)}</Badge></TD>
                    <TD className="max-w-72 text-sm">
                      {m.referenceType === 'SALE' && m.referenceId ? <Link to={`/sales/${m.referenceId}`} className="font-mono text-primary hover:underline">{m.reference ?? m.note}</Link> : <span className="text-muted-foreground">{m.reference ?? m.note ?? '—'}</span>}
                    </TD>
                    <TD className={cn('whitespace-nowrap text-end font-semibold tabular', D(m.amount).lt(0) ? 'text-destructive' : D(m.amount).gt(0) ? 'text-success' : 'text-muted-foreground')}>{D(m.amount).gt(0) && m.type !== 'OPEN' ? '+' : ''}{formatMoney(m.amount)}</TD>
                    <TD className="text-sm text-muted-foreground">{m.userName}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      {inOut && <CashInOutDialog sessionId={s.session.id} kind={inOut} expected={s.expected} onClose={() => setInOut(null)} onDone={() => { setInOut(null); onChanged(); }} />}
      {closing && <CloseRegisterDialog summary={s} onClose={() => setClosing(false)} onDone={(z) => { setClosing(false); onChanged(z); printZ(z); }} />}
      <ExpenseFormDialog open={expense} onOpenChange={setExpense} defaultFromRegister onSaved={() => onChanged()} />
    </>
  );
}

function CashInOutDialog({ sessionId, kind, expected, onClose, onDone }: { sessionId: string; kind: 'in' | 'out'; expected: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const save = useMutation({
    mutationFn: () => (kind === 'in' ? CashApi.cashIn : CashApi.cashOut)(sessionId, { amount: Number(amount), note }),
    onSuccess: () => { toast.success(t('common.saved')); void qc.invalidateQueries({ queryKey: ['cash'] }); onDone(); },
    onError: toastError,
  });
  const tooMuch = kind === 'out' && D(amount || 0).gt(D(expected));
  const valid = D(amount || 0).gt(0) && note.trim().length >= 2 && !tooMuch;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === 'in' ? t('cash.cashIn') : t('cash.cashOut')}</DialogTitle>
          <DialogDescription>{kind === 'in' ? t('cash.cashInHelp') : t('cash.cashOutHelp')} {t('cash.expected')}: <Money value={expected} className="font-semibold text-foreground" /></DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <FormField label={t('common.amount')} htmlFor="io-amount" required error={tooMuch ? t('cash.insufficientCash') : undefined}>
            <Input id="io-amount" value={amount ? formatNumber(amount) : ''} onChange={(e) => setAmount(parseAmount(e.target.value))} inputMode="numeric" className="h-12 text-end text-xl font-bold" autoFocus />
          </FormField>
          <FormField label={t('common.reason')} htmlFor="io-note" required><Input id="io-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'in' ? t('cash.cashInHint') : t('cash.cashOutHint')} /></FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={!valid} loading={save.isPending}>{t('common.confirm')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseRegisterDialog({ summary, onClose, onDone }: { summary: CashSummary; onClose: () => void; onDone: (z: CashSummary) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [byDenom, setByDenom] = useState<Record<number, string>>({});
  const [helper, setHelper] = useState(false);
  const diff = counted === '' ? null : D(counted).minus(D(summary.expected));
  const close = useMutation({
    mutationFn: () => CashApi.close(summary.session.id, { amount: Number(counted), note: note.trim() || undefined }),
    onSuccess: (z) => { toast.success(t('cash.closed')); void qc.invalidateQueries({ queryKey: ['cash'] }); onDone(z); },
    onError: toastError,
  });
  const applyDenoms = (next: Record<number, string>) => {
    setByDenom(next);
    setCounted(DENOMINATIONS.reduce((a, d) => a.plus(D(next[d] || 0).mul(d)), D(0)).toFixed());
  };
  const needsNote = diff !== null && !diff.isZero();
  // Offline sales of this branch not yet on the server would be missing from the expected cash
  const queued = useOfflineStore((st) => st.pending);
  const [branchQueued, setBranchQueued] = useState(0);
  useEffect(() => { void pendingForBranch(summary.session.branchId).then(setBranchQueued); }, [summary.session.branchId, queued]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('cash.closeRegister')} — {summary.session.register.name}</DialogTitle>
          <DialogDescription>{t('cash.closeHelp')}</DialogDescription>
        </DialogHeader>
        {branchQueued > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm" role="alert">
            <CloudUpload className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="flex-1">{t('cash.offlinePending', { count: branchQueued })}</div>
            <Button size="sm" variant="outline" onClick={() => void flushOutbox()}>{t('pos.outboxSync')}</Button>
          </div>
        )}
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (counted !== '' && (!needsNote || note.trim().length >= 3) && !branchQueued) close.mutate(); }}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/60 p-3"><div className="text-xs text-muted-foreground">{t('cash.expected')}</div><div className="text-xl font-bold tabular">{formatMoney(summary.expected)}</div></div>
            <FormField label={t('cash.counted')} htmlFor="close-counted" required>
              <Input id="close-counted" value={counted ? formatNumber(counted) : ''} onChange={(e) => { setCounted(parseAmount(e.target.value)); setByDenom({}); }} inputMode="numeric" className="h-12 text-end text-xl font-bold" autoFocus />
            </FormField>
          </div>
          <button type="button" onClick={() => setHelper((h) => !h)} className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"><Calculator className="h-4 w-4" /> {t('cash.countHelper')}</button>
          {helper && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-3 sm:grid-cols-3">
              {DENOMINATIONS.map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm">
                  <span className="w-14 shrink-0 text-end font-medium tabular">{formatNumber(d)}</span>
                  <span className="text-muted-foreground">×</span>
                  <Input value={byDenom[d] ?? ''} onChange={(e) => applyDenoms({ ...byDenom, [d]: e.target.value.replace(/\D/g, '') })} inputMode="numeric" className="h-8 text-end" aria-label={`${d} FCFA`} />
                </label>
              ))}
            </div>
          )}
          {diff !== null && (
            <div className={cn('flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold', diff.isZero() ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
              <span>{diff.isZero() ? t('cash.balanced') : diff.gt(0) ? t('cash.surplus') : t('cash.shortage')}</span>
              <span className="tabular">{diff.gt(0) ? '+' : ''}{formatMoney(diff)}</span>
            </div>
          )}
          <FormField label={t('cash.closingNote')} htmlFor="close-note" required={needsNote}>
            <Textarea id="close-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={needsNote ? t('cash.explainDifference') : undefined} />
          </FormField>
          <p className="text-xs text-muted-foreground">{t('cash.openedAt')} {formatDateTime(summary.session.openedAt)} · {summary.session.openedBy.fullName}</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" variant="destructive" disabled={counted === '' || (needsNote && note.trim().length < 3) || branchQueued > 0} loading={close.isPending}><Lock /> {t('cash.closeAndPrint')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
