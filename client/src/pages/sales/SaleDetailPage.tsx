import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Printer, FileText, Undo2, XCircle, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Money } from '@/components/shared/Money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TFoot, TH, THead, TR } from '@/components/ui/table';
import { SalesApi } from '@/services/sales.api';
import { usePrintStore } from '@/stores/print.store';
import { useCan } from '@/stores/auth.store';
import { D, formatQty } from '@/utils/money';
import { formatDate, formatDateTime } from '@/utils/format';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';
import { ReturnDialog } from '@/pages/returns/ReturnDialog';
import { ReceivePaymentDialog } from '@/pages/customers/ReceivePaymentDialog';

export default function SaleDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const print = usePrintStore((s) => s.print);
  const canCancel = useCan('sales.cancel');
  const canReturn = useCan('sales.return');
  const canPay = useCan('customers.payment');
  const showCost = useCan('products.view_cost');
  const [cancelling, setCancelling] = useState(false);
  const [returning, setReturning] = useState(false);
  const [paying, setPaying] = useState(false);
  const { data: sale, isLoading } = useQuery({ queryKey: ['sale', id], queryFn: () => SalesApi.get(id!) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['sale', id] });
    void qc.invalidateQueries({ queryKey: ['sales'] });
    void qc.invalidateQueries({ queryKey: ['products'] });
    void qc.invalidateQueries({ queryKey: ['cash'] });
  };
  const cancel = useMutation({
    mutationFn: (reason: string) => SalesApi.cancel(id!, reason),
    onSuccess: (s) => { toast.success(t('sales.cancelled')); qc.setQueryData(['sale', id], s); setCancelling(false); refresh(); },
    onError: toastError,
  });

  if (isLoading || !sale) return <Skeleton className="h-96" />;
  const cancelled = sale.status === 'CANCELLED';
  const returnable = !cancelled && sale.items.some((i) => D(i.quantity).gt(D(i.returnedQuantity)));
  const itemName = (saleItemId: string) => sale.items.find((i) => i.id === saleItemId)?.productName ?? '—';
  const margin = showCost ? sale.items.reduce((a, i) => a.plus(D(i.netAmount).minus(D(i.unitCost ?? 0).mul(D(i.quantity)))), D(0)) : null;

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3"><span className="font-mono">{sale.invoiceNumber}</span> <StatusBadge status={sale.status} ns="sales.status" />{!cancelled && <StatusBadge status={sale.paymentStatus} ns="sales.payment" />}</span>}
        description={`${formatDateTime(sale.createdAt)} · ${sale.cashier.fullName} · ${sale.branch.name}`}
        actions={
          <>
            <Button variant="outline" asChild><Link to="/sales"><ArrowLeft className="flip-rtl" /> {t('common.back')}</Link></Button>
            <Button variant="outline" onClick={() => print('receipt', sale, { duplicate: true })}><Printer /> {t('sales.reprintReceipt')}</Button>
            <Button variant="outline" onClick={() => print('invoice', sale, { duplicate: true })}><FileText /> {t('sales.printInvoice')}</Button>
            {canReturn && returnable && <Button variant="outline" onClick={() => setReturning(true)}><Undo2 /> {t('sales.return')}</Button>}
            {canPay && !cancelled && sale.customer && D(sale.amountDue).gt(0) && <Button variant="secondary" onClick={() => setPaying(true)}><Wallet /> {t('customers.receivePayment')}</Button>}
            {canCancel && !cancelled && sale.returns.length === 0 && <Button variant="outline" className="text-destructive" onClick={() => setCancelling(true)}><XCircle /> {t('sales.cancelSale')}</Button>}
          </>
        }
      />
      {cancelled && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <span className="font-semibold">{t('sales.statusCANCELLED')}</span> · {formatDateTime(sale.cancelledAt)} — {sale.cancelReason}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader><CardTitle>{t('common.items')} ({sale.items.length})</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>{t('pos.product')}</TH><TH className="text-end">{t('pos.qty')}</TH><TH className="text-end">{t('pos.unitPrice')}</TH>
                    <TH className="text-end">{t('pos.discount')}</TH><TH className="text-end">{t('pos.tax')}</TH><TH className="text-end">{t('common.total')}</TH>
                  </TR>
                </THead>
                <TBody>
                  {sale.items.map((i) => (
                    <TR key={i.id}>
                      <TD>
                        <div className="font-medium">{i.productName}</div>
                        <div className="font-mono text-xs text-muted-foreground">{i.sku}{D(i.returnedQuantity).gt(0) && <Badge variant="warning" className="ms-2">{t('sales.returnedQty', { qty: formatQty(i.returnedQuantity) })}</Badge>}</div>
                      </TD>
                      <TD className="text-end tabular">{formatQty(i.quantity)}</TD>
                      <TD className="text-end">
                        <Money value={i.unitPrice} />
                        {!D(i.unitPrice).eq(D(i.originalPrice)) && <div className="text-xs text-muted-foreground line-through"><Money value={i.originalPrice} /></div>}
                      </TD>
                      <TD className="text-end">{D(i.discountAmount).plus(D(i.cartDiscountShare)).gt(0) ? <Money value={D(i.discountAmount).plus(D(i.cartDiscountShare))} className="text-destructive" /> : <span className="text-muted-foreground">—</span>}</TD>
                      <TD className="text-end text-muted-foreground">{D(i.taxRate).gt(0) ? `${formatQty(i.taxRate)} %` : '—'}</TD>
                      <TD className="text-end"><Money value={i.total} className="font-semibold" /></TD>
                    </TR>
                  ))}
                </TBody>
                <TFoot>
                  <TR><TD colSpan={5} className="text-end text-muted-foreground">{t('pos.subtotal')}</TD><TD className="text-end"><Money value={sale.subtotal} /></TD></TR>
                  {D(sale.discountTotal).gt(0) && <TR><TD colSpan={5} className="text-end text-muted-foreground">{t('pos.discount')}</TD><TD className="text-end text-destructive">−<Money value={sale.discountTotal} /></TD></TR>}
                  <TR><TD colSpan={5} className="text-end text-muted-foreground">{t('pos.tax')}</TD><TD className="text-end"><Money value={sale.taxTotal} /></TD></TR>
                  <TR><TD colSpan={5} className="text-end font-bold">{t('pos.total')}</TD><TD className="text-end"><Money value={sale.total} className="text-lg font-bold" /></TD></TR>
                </TFoot>
              </Table>
            </CardContent>
          </Card>
          {sale.returns.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t('nav.returns')} ({sale.returns.length})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {sale.returns.map((r) => (
                  <div key={r.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-semibold">{r.number}</span>
                      <span className="text-muted-foreground">{formatDateTime(r.createdAt)} · {r.user.fullName}</span>
                      <Money value={r.total} className="font-semibold text-destructive" />
                    </div>
                    <div className="mt-1 text-muted-foreground">{t(`sales.reason${r.reason}`)}{r.note && ` — ${r.note}`}</div>
                    <ul className="mt-2 space-y-0.5">
                      {r.items.map((it) => <li key={it.id} className="flex justify-between"><span>{formatQty(it.quantity)} × {itemName(it.saleItemId)}{!it.restocked && <Badge variant="muted" className="ms-2">{t('sales.notRestocked')}</Badge>}</span><Money value={it.total} /></li>)}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t('pos.payment')}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {sale.payments.map((p) => (
                <div key={p.id} className={cn('flex justify-between gap-2', p.status === 'VOID' && 'text-muted-foreground line-through')}>
                  <span>
                    {p.direction === 'OUT' ? '↩ ' : ''}{p.paymentMethod.name}
                    {p.reference && <span className="ms-1 font-mono text-xs text-muted-foreground">{p.reference}</span>}
                    <span className="block text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</span>
                  </span>
                  <Money value={p.direction === 'OUT' ? D(p.amount).neg() : p.amount} className={p.direction === 'OUT' ? 'text-destructive' : undefined} />
                </div>
              ))}
              <div className="space-y-1 border-t pt-2">
                {D(sale.changeGiven).gt(0) && <Row label={t('pos.change')} value={<Money value={sale.changeGiven} />} />}
                <Row label={t('common.paid')} value={<Money value={sale.amountPaid} className="font-semibold" />} />
                {D(sale.refundedTotal).gt(0) && <Row label={t('sales.refunded')} value={<Money value={sale.refundedTotal} className="text-destructive" />} />}
                {D(sale.amountDue).gt(0) && !cancelled && <Row label={t('common.due')} value={<Money value={sale.amountDue} className="font-bold text-warning" />} />}
                {sale.dueDate && D(sale.amountDue).gt(0) && <Row label={t('sales.dueDate')} value={formatDate(sale.dueDate)} />}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t('common.details')}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label={t('pos.customer')} value={sale.customer ? <Link to={`/customers/${sale.customer.id}`} className="text-primary hover:underline">{sale.customer.name}</Link> : t('common.walkIn')} />
              {sale.customer?.phone && <Row label={t('common.phone')} value={sale.customer.phone} />}
              <Row label={t('receipt.cashier')} value={sale.cashier.fullName} />
              <Row label={t('common.branch')} value={sale.branch.name} />
              {margin && <Row label={t('sales.margin')} value={<Money value={margin} className={margin.lt(0) ? 'text-destructive' : 'text-success'} />} />}
              {sale.note && <p className="rounded-lg bg-muted p-3 text-muted-foreground">{sale.note}</p>}
            </CardContent>
          </Card>
        </div>
      </div>
      <ConfirmDialog open={cancelling} onOpenChange={setCancelling} title={t('sales.cancelTitle', { number: sale.invoiceNumber })} description={t('sales.cancelHelp')} destructive requireReason confirmLabel={t('sales.cancelSale')} loading={cancel.isPending} onConfirm={(r) => cancel.mutate(r)} />
      <ReturnDialog open={returning} onClose={() => setReturning(false)} initialSale={sale} onDone={() => { setReturning(false); refresh(); }} />
      {sale.customer && <ReceivePaymentDialog open={paying} customer={sale.customer} onOpenChange={(o) => { setPaying(o); if (!o) refresh(); }} />}
    </>
  );
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="text-end">{value}</span></div>
);
