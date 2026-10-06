import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Check, PackageCheck, XCircle, Pencil, Send, Truck } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { QtyInput } from '@/components/shared/QtyInput';
import { FormField } from '@/components/shared/FormField';
import { Money } from '@/components/shared/Money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TFoot, TH, THead, TR } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PurchasesApi } from '@/services/stock.api';
import { useAuthStore, useCan } from '@/stores/auth.store';
import { D, formatQty } from '@/utils/money';
import { formatDate, formatDateTime } from '@/utils/format';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';
import type { PurchaseOrder } from '@/types/stock';

export default function PurchaseDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canCreate = useCan('purchases.create');
  const canApprove = useCan('purchases.approve');
  const canReceive = useCan('purchases.receive');
  const isAdmin = useCan('settings.manage');
  const [confirm, setConfirm] = useState<'submit' | 'approve' | 'cancel' | null>(null);
  const [receiving, setReceiving] = useState(false);
  const { data: po, isLoading } = useQuery({ queryKey: ['purchase', id], queryFn: () => PurchasesApi.get(id!) });

  const done = (msg: string) => (next: PurchaseOrder) => {
    toast.success(msg);
    qc.setQueryData(['purchase', id], next);
    void qc.invalidateQueries({ queryKey: ['purchases'] });
    void qc.invalidateQueries({ queryKey: ['products'] });
    void qc.invalidateQueries({ queryKey: ['inventory'] });
    void qc.invalidateQueries({ queryKey: ['supplier'] });
    setConfirm(null);
  };
  const submit = useMutation({ mutationFn: () => PurchasesApi.submit(id!), onSuccess: done(t('purchases.submitted')), onError: toastError });
  const approve = useMutation({ mutationFn: () => PurchasesApi.approve(id!), onSuccess: done(t('purchases.approved')), onError: toastError });
  const cancel = useMutation({ mutationFn: (reason: string) => PurchasesApi.cancel(id!, reason), onSuccess: done(t('purchases.cancelled')), onError: toastError });

  if (isLoading || !po) return <Skeleton className="h-96" />;
  const anyReceived = po.items.some((i) => D(i.receivedQuantity).gt(0));
  const selfApproval = po.createdById === user?.id && !isAdmin;
  const due = D(po.total).minus(D(po.amountPaid));
  const progress = po.items.reduce((a, i) => ({ q: a.q.plus(D(i.quantity)), r: a.r.plus(D(i.receivedQuantity)) }), { q: D(0), r: D(0) });

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3"><span className="font-mono">{po.number}</span> <StatusBadge status={po.status} ns="purchases.status" /></span>}
        description={<Link to={`/suppliers/${po.supplierId}`} className="hover:underline">{po.supplier.name}</Link>}
        actions={
          <>
            <Button variant="outline" asChild><Link to="/purchases"><ArrowLeft className="flip-rtl" /> {t('common.back')}</Link></Button>
            {['DRAFT', 'PENDING'].includes(po.status) && canCreate && <Button variant="outline" onClick={() => navigate(`/purchases/${po.id}/edit`)}><Pencil /> {t('common.edit')}</Button>}
            {['DRAFT', 'PENDING', 'APPROVED'].includes(po.status) && !anyReceived && (canCreate || canApprove) && <Button variant="outline" className="text-destructive" onClick={() => setConfirm('cancel')}><XCircle /> {t('common.cancel')}</Button>}
            {po.status === 'DRAFT' && canCreate && <Button variant="outline" onClick={() => setConfirm('submit')}><Send /> {t('common.submit')}</Button>}
            {['DRAFT', 'PENDING'].includes(po.status) && canApprove && (
              <Button onClick={() => setConfirm('approve')} disabled={selfApproval} title={selfApproval ? t('purchases.selfApproval') : undefined}><Check /> {t('common.approve')}</Button>
            )}
            {po.status === 'APPROVED' && canReceive && <Button variant="secondary" onClick={() => setReceiving(true)}><PackageCheck /> {t('common.receive')}</Button>}
          </>
        }
      />
      {selfApproval && ['DRAFT', 'PENDING'].includes(po.status) && canApprove && <p className="-mt-2 mb-4 text-sm text-muted-foreground">{t('purchases.selfApproval')}</p>}
      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <Card className="min-w-0">
          <CardHeader><CardTitle>{t('common.items')} ({po.items.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>{t('pos.product')}</TH><TH className="text-end">{t('common.quantity')}</TH><TH className="text-end">{t('purchases.receivedQty')}</TH>
                  <TH className="text-end">{t('purchases.unitCost')}</TH><TH className="text-end">{t('pos.tax')}</TH><TH className="text-end">{t('common.total')}</TH>
                </TR>
              </THead>
              <TBody>
                {po.items.map((i) => {
                  const full = D(i.receivedQuantity).gte(D(i.quantity));
                  return (
                    <TR key={i.id}>
                      <TD><div className="font-medium">{i.product.name}{i.variant && ` — ${i.variant.name}`}</div><div className="font-mono text-xs text-muted-foreground">{i.variant?.sku ?? i.product.sku}</div></TD>
                      <TD className="text-end tabular">{formatQty(i.quantity)}</TD>
                      <TD className={cn('text-end font-semibold tabular', full ? 'text-success' : D(i.receivedQuantity).gt(0) ? 'text-warning' : 'text-muted-foreground')}>{formatQty(i.receivedQuantity)}</TD>
                      <TD className="text-end"><Money value={i.unitCost} /></TD>
                      <TD className="text-end text-muted-foreground">{formatQty(i.taxRate)} %</TD>
                      <TD className="text-end"><Money value={i.total} className="font-semibold" /></TD>
                    </TR>
                  );
                })}
              </TBody>
              <TFoot>
                <TR><TD colSpan={5} className="text-end text-muted-foreground">{t('pos.subtotal')}</TD><TD className="text-end"><Money value={po.subtotal} /></TD></TR>
                <TR><TD colSpan={5} className="text-end text-muted-foreground">{t('pos.tax')}</TD><TD className="text-end"><Money value={po.taxTotal} /></TD></TR>
                <TR><TD colSpan={5} className="text-end font-bold">{t('common.total')}</TD><TD className="text-end"><Money value={po.total} className="text-lg font-bold" /></TD></TR>
              </TFoot>
            </Table>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t('common.details')}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label={t('common.date')} value={formatDateTime(po.createdAt)} />
              <Row label={t('purchases.createdBy')} value={po.createdBy ?? '—'} />
              {po.expectedAt && <Row label={t('purchases.expectedAt')} value={formatDate(po.expectedAt)} />}
              {po.approvedAt && <Row label={t('purchases.statusAPPROVED')} value={`${formatDateTime(po.approvedAt)} · ${po.approvedBy ?? ''}`} />}
              {po.receivedAt && <Row label={t('purchases.statusRECEIVED')} value={`${formatDateTime(po.receivedAt)} · ${po.receivedBy ?? ''}`} />}
              {['APPROVED', 'RECEIVED'].includes(po.status) && (
                <div className="space-y-1 pt-2">
                  <div className="flex justify-between text-xs text-muted-foreground"><span><Truck className="me-1 inline h-3.5 w-3.5" />{t('purchases.receivedQty')}</span><span>{formatQty(progress.r)} / {formatQty(progress.q)}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${progress.q.gt(0) ? progress.r.div(progress.q).mul(100).toNumber() : 0}%` }} /></div>
                </div>
              )}
              <div className="border-t pt-2" />
              <Row label={t('common.paid')} value={<Money value={po.amountPaid} />} />
              <Row label={t('common.due')} value={<Money value={['APPROVED', 'RECEIVED'].includes(po.status) ? due : 0} className={cn('font-semibold', due.gt(0) && ['APPROVED', 'RECEIVED'].includes(po.status) && 'text-warning')} />} />
            </CardContent>
          </Card>
          {po.note && <Card><CardHeader><CardTitle>{t('common.notes')}</CardTitle></CardHeader><CardContent><p className="whitespace-pre-line text-sm text-muted-foreground">{po.note}</p></CardContent></Card>}
        </div>
      </div>
      <ConfirmDialog open={confirm === 'submit'} onOpenChange={(o) => !o && setConfirm(null)} title={t('purchases.submit')} loading={submit.isPending} onConfirm={() => submit.mutate()} />
      <ConfirmDialog open={confirm === 'approve'} onOpenChange={(o) => !o && setConfirm(null)} title={t('purchases.approveTitle')} description={<span>{po.supplier.name} · <Money value={po.total} /></span>} confirmLabel={t('common.approve')} loading={approve.isPending} onConfirm={() => approve.mutate()} />
      <ConfirmDialog open={confirm === 'cancel'} onOpenChange={(o) => !o && setConfirm(null)} title={t('purchases.cancelTitle')} destructive requireReason confirmLabel={t('purchases.cancelConfirm')} loading={cancel.isPending} onConfirm={(r) => cancel.mutate(r)} />
      {receiving && <ReceivePurchaseDialog po={po} onClose={() => setReceiving(false)} onDone={(next) => { done(next.status === 'RECEIVED' ? t('purchases.receivedFull') : t('purchases.receivedPartial'))(next); setReceiving(false); }} />}
    </>
  );
}

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="text-end font-medium">{value}</span></div>
);

function ReceivePurchaseDialog({ po, onClose, onDone }: { po: PurchaseOrder; onClose: () => void; onDone: (p: PurchaseOrder) => void }) {
  const { t } = useTranslation();
  const remaining = (i: PurchaseOrder['items'][number]) => D(i.quantity).minus(D(i.receivedQuantity));
  const open = po.items.filter((i) => remaining(i).gt(0));
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(open.map((i) => [i.id, remaining(i).toFixed()])));
  const [updateCost, setUpdateCost] = useState(true);
  const [note, setNote] = useState('');
  const receive = useMutation({
    mutationFn: () => PurchasesApi.receive(po.id, { updateCost, note: note.trim() || null, items: open.filter((i) => D(qty[i.id] || 0).gt(0)).map((i) => ({ itemId: i.id, quantity: Number(qty[i.id]) })) }),
    onSuccess: onDone,
    onError: toastError,
  });
  const over = open.some((i) => D(qty[i.id] || 0).gt(remaining(i)));
  const nothing = open.every((i) => D(qty[i.id] || 0).lte(0));
  const value = open.reduce((a, i) => a.plus(D(qty[i.id] || 0).mul(D(i.unitCost)).mul(D(1).plus(D(i.taxRate).div(100)))), D(0));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('purchases.receiveTitle')} {po.number}</DialogTitle>
          <DialogDescription>{t('purchases.receiveHelp')}</DialogDescription>
        </DialogHeader>
        <div className="mb-1 flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setQty(Object.fromEntries(open.map((i) => [i.id, remaining(i).toFixed()])))}>{t('purchases.receiveAll')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setQty(Object.fromEntries(open.map((i) => [i.id, '0'])))}>{t('common.reset')}</Button>
        </div>
        <div className="max-h-[45vh] overflow-y-auto">
          <Table>
            <THead><TR><TH>{t('pos.product')}</TH><TH className="text-end">{t('purchases.remaining')}</TH><TH className="w-32 text-end">{t('purchases.receiveQty')}</TH></TR></THead>
            <TBody>
              {open.map((i) => (
                <TR key={i.id}>
                  <TD><div className="font-medium">{i.product.name}{i.variant && ` — ${i.variant.name}`}</div><div className="text-xs text-muted-foreground"><Money value={i.unitCost} /> / u.</div></TD>
                  <TD className="text-end tabular">{formatQty(remaining(i))}</TD>
                  <TD><QtyInput value={qty[i.id] ?? ''} onChange={(v) => setQty((q) => ({ ...q, [i.id]: v }))} invalid={D(qty[i.id] || 0).gt(remaining(i))} aria-label={t('purchases.receiveQty')} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        {over && <p className="text-sm text-destructive">{t('purchases.overReceive')}</p>}
        <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
          <span><span className="font-medium">{t('purchases.updateCost')}</span><span className="block text-xs text-muted-foreground">{t('purchases.updateCostHelp')}</span></span>
          <Switch checked={updateCost} onCheckedChange={setUpdateCost} />
        </label>
        <FormField label={t('common.notes')} htmlFor="po-rcv-note"><Textarea id="po-rcv-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t('purchases.deliveryNoteHint')} /></FormField>
        <DialogFooter className="items-center sm:justify-between">
          <span className="text-sm text-muted-foreground">{t('purchases.receiptValue')}: <Money value={value.toDecimalPlaces(0)} className="font-semibold text-foreground" /></span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button onClick={() => receive.mutate()} disabled={over || nothing} loading={receive.isPending}><PackageCheck /> {t('purchases.confirmReceipt')}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
