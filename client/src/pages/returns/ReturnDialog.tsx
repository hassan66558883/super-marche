import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Search, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/shared/FormField';
import { Money } from '@/components/shared/Money';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { PaymentMethodsApi, SalesApi } from '@/services/sales.api';
import { D, formatQty, roundMoney } from '@/utils/money';
import { formatDateTime } from '@/utils/format';
import { toastError } from '@/utils/errors';
import type { Sale, SaleReturn } from '@/types/sales';

type Reason = SaleReturn['reason'];

/**
 * Return / refund against an existing invoice. The original sale is never modified line by line:
 * a return document is created and stock and money flow back through it.
 */
export function ReturnDialog({ open, onClose, initialSale, onDone }: { open: boolean; onClose: () => void; initialSale?: Sale | null; onDone?: (r: SaleReturn) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [invoice, setInvoice] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState<Reason>('CUSTOMER_REQUEST');
  const [method, setMethod] = useState('CASH');
  const [note, setNote] = useState('');
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: PaymentMethodsApi.list, enabled: open });

  useEffect(() => {
    if (!open) return;
    setSale(initialSale ?? null); setInvoice(initialSale?.invoiceNumber ?? ''); setQty({}); setRestock({}); setReason('CUSTOMER_REQUEST'); setMethod('CASH'); setNote('');
  }, [open, initialSale]);

  const find = useMutation({
    mutationFn: () => SalesApi.byInvoice(invoice.trim()),
    onSuccess: (s) => { setSale(s); setQty({}); setRestock({}); },
    onError: toastError,
  });
  const submit = useMutation({
    mutationFn: () => SalesApi.createReturn(sale!.id, {
      reason, note: note || null, refundMethod: method,
      items: Object.entries(qty).filter(([, q]) => D(q).gt(0)).map(([saleItemId, q]) => ({ saleItemId, quantity: Number(q), restock: restock[saleItemId] ?? reason !== 'DAMAGED' })),
    }),
    onSuccess: (r) => {
      toast.success(`${t('sales.returnDone')} — ${r.number}`);
      void qc.invalidateQueries({ queryKey: ['sales'] });
      void qc.invalidateQueries({ queryKey: ['sale', sale!.id] });
      void qc.invalidateQueries({ queryKey: ['returns'] });
      void qc.invalidateQueries({ queryKey: ['pos-products'] });
      onDone?.(r);
      onClose();
    },
    onError: toastError,
  });

  const returnable = (it: Sale['items'][number]) => D(it.quantity).minus(D(it.returnedQuantity));
  const refund = sale ? sale.items.reduce((a, it) => {
    const q = D(qty[it.id]);
    return q.gt(0) ? a.plus(roundMoney(D(it.total).mul(q).div(D(it.quantity)))) : a;
  }, D(0)) : D(0);
  const creditPart = sale && D(sale.amountDue).gt(0) ? (D(sale.amountDue).lt(refund) ? D(sale.amountDue) : refund) : D(0);
  const invalid = sale?.items.some((it) => D(qty[it.id]).gt(returnable(it))) ?? false;
  const closed = sale && (sale.status === 'CANCELLED' || sale.status === 'REFUNDED');

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Undo2 className="h-5 w-5" /> {t('sales.returnTitle')}</DialogTitle>
          <DialogDescription>{t('sales.findSale')}</DialogDescription>
        </DialogHeader>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (invoice.trim()) find.mutate(); }}>
          <div className="relative flex-1">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="NDJ-2026-000001" className="h-11 ps-9 font-mono uppercase" autoFocus={!initialSale} />
          </div>
          <Button type="submit" className="h-11" loading={find.isPending}>{t('common.search')}</Button>
        </form>

        {sale && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="font-mono font-semibold">{sale.invoiceNumber}</span>
              <span className="text-muted-foreground">{formatDateTime(sale.createdAt)}</span>
              <span>{sale.customer?.name ?? t('common.walkIn')}</span>
              <Money value={sale.total} className="font-semibold" />
              <StatusBadge status={sale.status} ns="sales.status" />
            </div>
            {closed ? <p className="text-sm font-medium text-destructive">{t('sales.notReturnable')}</p> : (
              <>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <THead><TR><TH>{t('pos.product')}</TH><TH className="text-end">{t('pos.qty')}</TH><TH className="text-end">{t('sales.returnable')}</TH><TH className="w-28">{t('sales.returnQty')}</TH><TH className="text-center">{t('sales.restock')}</TH><TH className="text-end">{t('common.total')}</TH></TR></THead>
                    <TBody>
                      {sale.items.map((it) => {
                        const max = returnable(it);
                        const q = D(qty[it.id]);
                        return (
                          <TR key={it.id} className={max.lte(0) ? 'opacity-50' : undefined}>
                            <TD><div className="font-medium">{it.productName}</div><div className="text-xs text-muted-foreground">{it.sku} · <Money value={D(it.total).div(D(it.quantity))} /></div></TD>
                            <TD className="text-end tabular">{formatQty(it.quantity)}</TD>
                            <TD className="text-end tabular">{formatQty(max)}</TD>
                            <TD>
                              <Input value={qty[it.id] ?? ''} disabled={max.lte(0)} onChange={(e) => setQty({ ...qty, [it.id]: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') })}
                                inputMode="decimal" placeholder="0" className={q.gt(max) ? 'border-destructive' : ''} aria-label={`${t('sales.returnQty')} ${it.productName}`} />
                            </TD>
                            <TD className="text-center"><Switch checked={restock[it.id] ?? reason !== 'DAMAGED'} onCheckedChange={(v) => setRestock({ ...restock, [it.id]: v })} disabled={max.lte(0)} aria-label={t('sales.restock')} /></TD>
                            <TD className="text-end font-semibold">{q.gt(0) ? <Money value={roundMoney(D(it.total).mul(q).div(D(it.quantity)))} /> : '—'}</TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <FormField label={t('sales.returnReason')} htmlFor="ret-reason">
                    <Select value={reason} onValueChange={(v) => setReason(v as Reason)}>
                      <SelectTrigger id="ret-reason"><SelectValue /></SelectTrigger>
                      <SelectContent>{(['CUSTOMER_REQUEST', 'DAMAGED', 'WRONG_PRODUCT', 'OTHER'] as const).map((r) => <SelectItem key={r} value={r}>{t(`sales.reason${r}`)}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormField>
                  <FormField label={t('sales.refundMethod')} htmlFor="ret-method">
                    <Select value={method} onValueChange={setMethod}>
                      <SelectTrigger id="ret-method"><SelectValue /></SelectTrigger>
                      <SelectContent>{methods.data?.filter((m) => m.type !== 'CREDIT').map((m) => <SelectItem key={m.code} value={m.code}>{m.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </FormField>
                  <FormField label={t('pos.note')} htmlFor="ret-note"><Textarea id="ret-note" rows={1} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-10" /></FormField>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 rounded-lg border bg-card px-4 py-3">
                  {creditPart.gt(0) && <span className="text-sm text-muted-foreground">{t('sales.creditReduced')} : <Money value={creditPart} className="font-semibold text-foreground" /></span>}
                  <span className="text-sm font-semibold uppercase">{t('sales.refundTotal')}</span>
                  <Money value={refund.minus(creditPart)} className="text-2xl font-extrabold text-primary" />
                </div>
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="warning" disabled={!sale || !!closed || refund.lte(0) || invalid} loading={submit.isPending} onClick={() => submit.mutate()}>
            <Undo2 /> {t('sales.refund')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
