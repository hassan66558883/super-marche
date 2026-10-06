import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, Truck, PackageCheck, XCircle, Pencil, Circle, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { QtyInput } from '@/components/shared/QtyInput';
import { FormField } from '@/components/shared/FormField';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TransfersApi } from '@/services/stock.api';
import { useAuthStore, useCan } from '@/stores/auth.store';
import { D, formatQty } from '@/utils/money';
import { formatDateTime } from '@/utils/format';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';
import type { Transfer } from '@/types/stock';

export default function TransferDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const branchId = useAuthStore((s) => s.branchId);
  const userId = useAuthStore((s) => s.user?.id);
  const canApprove = useCan('transfers.approve');
  const canCreate = useCan('transfers.create');
  const canReceive = useCan('transfers.receive');
  const [confirm, setConfirm] = useState<'approve' | 'ship' | 'cancel' | null>(null);
  const [receiving, setReceiving] = useState(false);
  const { data: tr, isLoading } = useQuery({ queryKey: ['transfer', id], queryFn: () => TransfersApi.get(id!) });

  const done = (msg: string) => (next: Transfer) => {
    toast.success(msg);
    qc.setQueryData(['transfer', id], next);
    void qc.invalidateQueries({ queryKey: ['transfers'] });
    void qc.invalidateQueries({ queryKey: ['products'] });
    void qc.invalidateQueries({ queryKey: ['inventory'] });
    setConfirm(null);
  };
  const approve = useMutation({ mutationFn: () => TransfersApi.approve(id!), onSuccess: done(t('transfers.approved')), onError: toastError });
  const ship = useMutation({ mutationFn: () => TransfersApi.ship(id!), onSuccess: done(t('transfers.shipped')), onError: toastError });
  const cancel = useMutation({ mutationFn: (reason: string) => TransfersApi.cancel(id!, reason), onSuccess: done(t('transfers.cancelled')), onError: toastError });

  if (isLoading || !tr) return <Skeleton className="h-96" />;
  const isSource = tr.fromBranchId === branchId;
  const isDest = tr.toBranchId === branchId;
  const pending = tr.status === 'DRAFT' || tr.status === 'REQUESTED';
  const shortOnSource = tr.items.some((i) => D(i.quantity).gt(D(i.sourceStock ?? 0)));

  const steps: { key: string; label: string; at: string | null; by?: string | null }[] = [
    { key: 'REQUESTED', label: t('transfers.statusREQUESTED'), at: tr.requestedAt ?? (tr.status === 'DRAFT' ? null : tr.createdAt), by: tr.createdBy },
    { key: 'APPROVED', label: t('transfers.statusAPPROVED'), at: tr.approvedAt, by: tr.approvedBy },
    { key: 'IN_TRANSIT', label: t('transfers.statusIN_TRANSIT'), at: tr.shippedAt, by: tr.shippedBy },
    { key: 'RECEIVED', label: t('transfers.statusRECEIVED'), at: tr.receivedAt, by: tr.receivedBy },
  ];

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3"><span className="font-mono">{tr.number}</span> <StatusBadge status={tr.status} ns="transfers.status" /></span>}
        description={<span className="flex items-center gap-2">{tr.fromBranch.name} <ArrowRight className="flip-rtl h-4 w-4" /> {tr.toBranch.name}</span>}
        actions={
          <>
            <Button variant="outline" asChild><Link to="/transfers"><ArrowLeft className="flip-rtl" /> {t('common.back')}</Link></Button>
            {isSource && pending && canCreate && (tr.createdById === userId || canApprove) && <Button variant="outline" onClick={() => navigate(`/transfers/${tr.id}/edit`)}><Pencil /> {t('common.edit')}</Button>}
            {isSource && (pending || tr.status === 'APPROVED') && (canCreate || canApprove) && <Button variant="outline" className="text-destructive" onClick={() => setConfirm('cancel')}><XCircle /> {t('common.cancel')}</Button>}
            {isSource && pending && canApprove && <Button onClick={() => setConfirm('approve')}><Check /> {t('common.approve')}</Button>}
            {isSource && tr.status === 'APPROVED' && canApprove && <Button onClick={() => setConfirm('ship')}><Truck /> {t('transfers.ship')}</Button>}
            {isDest && tr.status === 'IN_TRANSIT' && canReceive && <Button variant="secondary" onClick={() => setReceiving(true)}><PackageCheck /> {t('common.receive')}</Button>}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <CardHeader><CardTitle>{t('common.items')} ({tr.items.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>{t('pos.product')}</TH>
                  {isSource && ['DRAFT', 'REQUESTED', 'APPROVED'].includes(tr.status) && <TH className="text-end">{t('transfers.sourceStock')}</TH>}
                  <TH className="text-end">{t('transfers.sent')}</TH>
                  {tr.status === 'RECEIVED' && <TH className="text-end">{t('transfers.received')}</TH>}
                </TR>
              </THead>
              <TBody>
                {tr.items.map((i) => {
                  const short = D(i.quantity).gt(D(i.sourceStock ?? 0));
                  const gap = i.receivedQuantity != null && !D(i.receivedQuantity).eq(D(i.quantity));
                  return (
                    <TR key={i.id}>
                      <TD><div className="font-medium">{i.product.name}{i.variant && ` — ${i.variant.name}`}</div><div className="font-mono text-xs text-muted-foreground">{i.variant?.sku ?? i.product.sku}</div></TD>
                      {isSource && ['DRAFT', 'REQUESTED', 'APPROVED'].includes(tr.status) && <TD className={cn('text-end tabular', short && 'font-semibold text-destructive')}>{formatQty(i.sourceStock ?? 0)}</TD>}
                      <TD className="text-end font-semibold tabular">{formatQty(i.quantity)} <span className="text-xs font-normal text-muted-foreground">{i.product.unit?.code.toLowerCase()}</span></TD>
                      {tr.status === 'RECEIVED' && <TD className={cn('text-end font-semibold tabular', gap && 'text-warning')}>{formatQty(i.receivedQuantity ?? 0)}</TD>}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {isSource && tr.status === 'APPROVED' && shortOnSource && <p className="mt-3 text-sm text-destructive">{t('transfers.shortWarning')}</p>}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t('transfers.timeline')}</CardTitle></CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {steps.map((s) => (
                  <li key={s.key} className="flex gap-3">
                    {s.at ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/40" />}
                    <div className={cn('text-sm', !s.at && 'text-muted-foreground')}>
                      <div className="font-medium">{s.label}</div>
                      {s.at && <div className="text-xs text-muted-foreground">{formatDateTime(s.at)}{s.by && ` · ${s.by}`}</div>}
                    </div>
                  </li>
                ))}
                {tr.status === 'CANCELLED' && (
                  <li className="flex gap-3"><XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div className="text-sm"><div className="font-medium">{t('transfers.statusCANCELLED')}</div><div className="text-xs text-muted-foreground">{formatDateTime(tr.cancelledAt)}</div></div></li>
                )}
              </ol>
            </CardContent>
          </Card>
          {tr.note && <Card><CardHeader><CardTitle>{t('common.notes')}</CardTitle></CardHeader><CardContent><p className="whitespace-pre-line text-sm text-muted-foreground">{tr.note}</p></CardContent></Card>}
        </div>
      </div>

      <ConfirmDialog open={confirm === 'approve'} onOpenChange={(o) => !o && setConfirm(null)} title={t('transfers.approveTitle')} description={shortOnSource ? t('transfers.shortWarning') : undefined} confirmLabel={t('common.approve')} loading={approve.isPending} onConfirm={() => approve.mutate()} />
      <ConfirmDialog open={confirm === 'ship'} onOpenChange={(o) => !o && setConfirm(null)} title={t('transfers.shipTitle')} description={t('transfers.shipHelp')} confirmLabel={t('transfers.ship')} loading={ship.isPending} onConfirm={() => ship.mutate()} />
      <ConfirmDialog open={confirm === 'cancel'} onOpenChange={(o) => !o && setConfirm(null)} title={t('transfers.cancelTitle')} destructive requireReason confirmLabel={t('transfers.cancelConfirm')} loading={cancel.isPending} onConfirm={(r) => cancel.mutate(r)} />
      {receiving && <ReceiveTransferDialog transfer={tr} onClose={() => setReceiving(false)} onDone={(next) => { done(t('transfers.receivedDone'))(next); setReceiving(false); }} />}
    </>
  );
}

function ReceiveTransferDialog({ transfer, onClose, onDone }: { transfer: Transfer; onClose: () => void; onDone: (t: Transfer) => void }) {
  const { t } = useTranslation();
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(transfer.items.map((i) => [i.id, D(i.quantity).toFixed()])));
  const [note, setNote] = useState('');
  const receive = useMutation({
    mutationFn: () => TransfersApi.receive(transfer.id, { note: note.trim() || null, items: transfer.items.map((i) => ({ itemId: i.id, receivedQuantity: Number(qty[i.id] || 0) })) }),
    onSuccess: onDone,
    onError: toastError,
  });
  const over = transfer.items.some((i) => D(qty[i.id] || 0).gt(D(i.quantity)));
  const gaps = transfer.items.some((i) => !D(qty[i.id] || 0).eq(D(i.quantity)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('transfers.receiveTitle')} {transfer.number}</DialogTitle>
          <DialogDescription>{t('transfers.receiveHelp')}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] overflow-y-auto">
          <Table>
            <THead><TR><TH>{t('pos.product')}</TH><TH className="text-end">{t('transfers.sent')}</TH><TH className="w-32 text-end">{t('transfers.received')}</TH></TR></THead>
            <TBody>
              {transfer.items.map((i) => (
                <TR key={i.id}>
                  <TD><div className="font-medium">{i.product.name}{i.variant && ` — ${i.variant.name}`}</div><div className="font-mono text-xs text-muted-foreground">{i.variant?.sku ?? i.product.sku}</div></TD>
                  <TD className="text-end tabular">{formatQty(i.quantity)}</TD>
                  <TD><QtyInput value={qty[i.id] ?? ''} onChange={(v) => setQty((q) => ({ ...q, [i.id]: v }))} invalid={D(qty[i.id] || 0).gt(D(i.quantity))} aria-label={t('transfers.received')} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        {gaps && !over && <p className="text-sm text-warning">{t('transfers.gapWarning')}</p>}
        {over && <p className="text-sm text-destructive">{t('transfers.overReceived')}</p>}
        <FormField label={t('common.notes')} htmlFor="rcv-note" required={gaps}><Textarea id="rcv-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={t('transfers.gapNoteHint')} /></FormField>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={() => receive.mutate()} disabled={over || (gaps && note.trim().length < 3)} loading={receive.isPending}><PackageCheck /> {t('transfers.confirmReceipt')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
