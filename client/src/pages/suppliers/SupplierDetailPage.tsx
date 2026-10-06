import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, Phone, Mail, MapPin, FileText, Wallet, Plus, Clock } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Money } from '@/components/shared/Money';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { FormField } from '@/components/shared/FormField';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SuppliersApi } from '@/services/stock.api';
import { PaymentMethodsApi } from '@/services/sales.api';
import { useCan } from '@/stores/auth.store';
import { D } from '@/utils/money';
import { formatDate, formatDateTime } from '@/utils/format';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';
import type { Supplier } from '@/types/stock';
import { SupplierFormDialog } from './SupplierFormDialog';

export default function SupplierDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canManage = useCan('suppliers.manage');
  const canPay = useCan('suppliers.manage');
  const canOrder = useCan('purchases.create');
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const supplier = useQuery({ queryKey: ['supplier', id], queryFn: () => SuppliersApi.get(id!) });
  const ledger = useQuery({ queryKey: ['supplier', id, 'ledger'], queryFn: () => SuppliersApi.ledger(id!) });
  const orders = useQuery({ queryKey: ['supplier', id, 'purchases'], queryFn: () => SuppliersApi.purchases(id!) });

  if (supplier.isLoading || !supplier.data) return <Skeleton className="h-96" />;
  const s = supplier.data;
  const balance = D(s.balance);
  const stat = (label: string, value: React.ReactNode, tone?: string) => (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-xl font-bold', tone)}>{value}</div>
    </Card>
  );

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{s.name} <StatusBadge status={s.status} /></span>}
        description={<span><span className="font-mono">{s.code}</span>{s.company && ` · ${s.company}`}</span>}
        actions={
          <>
            <Button variant="outline" asChild><Link to="/suppliers"><ArrowLeft className="flip-rtl" /> {t('common.back')}</Link></Button>
            {canManage && <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> {t('common.edit')}</Button>}
            {canOrder && s.status === 'ACTIVE' && <Button variant="outline" onClick={() => navigate(`/purchases/new?supplierId=${s.id}`)}><Plus /> {t('purchases.new')}</Button>}
            {canPay && balance.gt(0) && <Button variant="secondary" onClick={() => setPaying(true)}><Wallet /> {t('suppliers.recordPayment')}</Button>}
          </>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {stat(t('suppliers.balance'), <Money value={s.balance} />, balance.gt(0) ? 'text-warning' : undefined)}
        {stat(t('suppliers.purchasesTotal'), <Money value={s.stats?.purchasesTotal} />)}
        {stat(t('suppliers.openOrders'), s.stats?.openOrders ?? 0)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit">
          <CardHeader><CardTitle>{t('common.details')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {s.phone && <a href={`tel:${s.phone}`} className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {s.phone}</a>}
            {s.email && <a href={`mailto:${s.email}`} className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {s.email}</a>}
            {s.address && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {s.address}</div>}
            {s.taxId && <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> {t('customers.taxId')}: {s.taxId}</div>}
            {s.paymentTerms && <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-muted-foreground" /> {s.paymentTerms}</div>}
            {!s.phone && !s.email && !s.address && !s.taxId && !s.paymentTerms && <p className="text-muted-foreground">—</p>}
          </CardContent>
        </Card>
        <Tabs defaultValue="orders" className="min-w-0">
          <TabsList>
            <TabsTrigger value="orders">{t('suppliers.orders')}</TabsTrigger>
            <TabsTrigger value="ledger">{t('suppliers.account')}</TabsTrigger>
          </TabsList>
          <TabsContent value="orders">
            <Card className="overflow-x-auto">
              <Table>
                <THead><TR><TH>{t('purchases.number')}</TH><TH>{t('common.date')}</TH><TH className="text-end">{t('common.total')}</TH><TH className="text-end">{t('common.paid')}</TH><TH>{t('common.status')}</TH></TR></THead>
                <TBody>
                  {orders.data?.items.map((o) => (
                    <TR key={o.id} className="cursor-pointer" onClick={() => navigate(`/purchases/${o.id}`)}>
                      <TD className="font-mono font-semibold text-primary">{o.number}</TD>
                      <TD className="text-sm">{formatDate(o.createdAt)}</TD>
                      <TD className="text-end"><Money value={o.total} /></TD>
                      <TD className="text-end"><Money value={o.amountPaid} className="text-muted-foreground" /></TD>
                      <TD><StatusBadge status={o.status} ns="purchases.status" /></TD>
                    </TR>
                  ))}
                  {orders.data && !orders.data.items.length && <TR><TD colSpan={5} className="py-10 text-center text-muted-foreground">{t('purchases.empty')}</TD></TR>}
                </TBody>
              </Table>
            </Card>
          </TabsContent>
          <TabsContent value="ledger">
            <Card className="overflow-x-auto">
              <Table>
                <THead><TR><TH>{t('common.date')}</TH><TH>{t('common.type')}</TH><TH>{t('common.description')}</TH><TH className="text-end">{t('common.amount')}</TH><TH className="text-end">{t('common.balance')}</TH></TR></THead>
                <TBody>
                  {ledger.data?.items.map((e) => (
                    <TR key={e.id}>
                      <TD className="whitespace-nowrap text-sm">{formatDateTime(e.createdAt)}</TD>
                      <TD><Badge variant={e.type === 'PAYMENT' ? 'success' : e.type === 'PURCHASE' ? 'warning' : 'muted'}>{t(`suppliers.entry${e.type}`)}</Badge></TD>
                      <TD className="max-w-72 text-sm"><div className="truncate" title={e.description ?? ''}>{e.description}</div>{e.reference && <div className="font-mono text-xs text-muted-foreground">{e.reference}</div>}</TD>
                      <TD className={cn('text-end font-semibold', D(e.amount).lt(0) ? 'text-success' : 'text-warning')}><Money value={e.amount} /></TD>
                      <TD className="text-end"><Money value={e.balanceAfter} /></TD>
                    </TR>
                  ))}
                  {ledger.data && !ledger.data.items.length && <TR><TD colSpan={5} className="py-10 text-center text-muted-foreground">{t('common.noData')}</TD></TR>}
                </TBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <SupplierFormDialog open={editing} onOpenChange={setEditing} supplier={s} />
      <PaySupplierDialog open={paying} supplier={s} onOpenChange={setPaying} />
    </>
  );
}

function PaySupplierDialog({ open, supplier, onOpenChange }: { open: boolean; supplier: Supplier; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: PaymentMethodsApi.list, enabled: open });
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [fromRegister, setFromRegister] = useState(false);
  useEffect(() => { if (open) { setAmount(D(supplier.balance).toFixed()); setReference(''); setNote(''); setFromRegister(false); } }, [open, supplier.balance]);
  const methodType = methods.data?.find((m) => m.code === method)?.type;

  const pay = useMutation({
    mutationFn: () => SuppliersApi.pay(supplier.id, { amount: Number(amount), method, reference: reference || null, note: note || null, fromRegister: methodType === 'CASH' && fromRegister }),
    onSuccess: () => {
      toast.success(t('suppliers.paymentRecorded'));
      void qc.invalidateQueries({ queryKey: ['supplier', supplier.id] });
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      void qc.invalidateQueries({ queryKey: ['cash'] });
      onOpenChange(false);
    },
    onError: toastError,
  });
  const valid = D(amount || 0).gt(0) && D(amount).lte(D(supplier.balance));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('suppliers.recordPayment')}</DialogTitle>
          <DialogDescription>{supplier.name} — {t('suppliers.balance')}: <Money value={supplier.balance} className="font-semibold text-foreground" /></DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) pay.mutate(); }}>
          <FormField label={t('common.amount')} htmlFor="sp-amount" required error={amount && !valid ? t('suppliers.amountTooHigh') : undefined}>
            <Input id="sp-amount" type="number" min={1} step="any" inputMode="decimal" className="h-12 text-lg font-semibold" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </FormField>
          <FormField label={t('expenses.paymentMethod')} htmlFor="sp-method">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="sp-method"><SelectValue /></SelectTrigger>
              <SelectContent>{methods.data?.filter((m) => m.type !== 'CREDIT' && m.isActive).map((m) => <SelectItem key={m.code} value={m.code}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          {methodType === 'CASH' && (
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              <span><span className="font-medium">{t('suppliers.fromRegister')}</span><span className="block text-xs text-muted-foreground">{t('suppliers.fromRegisterHelp')}</span></span>
              <Switch checked={fromRegister} onCheckedChange={setFromRegister} />
            </label>
          )}
          <FormField label={t('common.reference')} htmlFor="sp-ref"><Input id="sp-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('suppliers.referenceHint')} /></FormField>
          <FormField label={t('common.notes')} htmlFor="sp-note"><Input id="sp-note" value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="secondary" loading={pay.isPending} disabled={!valid}>{t('common.confirm')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
