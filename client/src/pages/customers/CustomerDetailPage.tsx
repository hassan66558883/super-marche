import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Phone, Mail, MapPin, FileText, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Money } from '@/components/shared/Money';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { CustomerFormDialog } from '@/components/shared/CustomerFormDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { CustomersApi } from '@/services/catalog.api';
import { useCan } from '@/stores/auth.store';
import { D } from '@/utils/money';
import { formatDate, formatDateTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { ReceivePaymentDialog } from './ReceivePaymentDialog';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const canEdit = useCan('customers.edit');
  const canPay = useCan('customers.payment');
  const [editing, setEditing] = useState(false);
  const [paying, setPaying] = useState(false);
  const customer = useQuery({ queryKey: ['customer', id], queryFn: () => CustomersApi.get(id!) });
  const ledger = useQuery({ queryKey: ['customer', id, 'ledger'], queryFn: () => CustomersApi.ledger(id!) });
  const invoices = useQuery({ queryKey: ['customer', id, 'invoices'], queryFn: () => CustomersApi.invoices(id!) });

  if (customer.isLoading || !customer.data) return <Skeleton className="h-96" />;
  const c = customer.data;
  const balance = D(c.balance);
  const over = D(c.creditLimit).gt(0) && balance.gt(D(c.creditLimit));

  const stat = (label: string, value: React.ReactNode, tone?: string) => (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('mt-1 text-xl font-bold', tone)}>{value}</div>
    </Card>
  );

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{c.name} <Badge variant="muted">{t(`customers.type${c.type}`)}</Badge></span>}
        description={<span className="font-mono">{c.code}</span>}
        actions={
          <>
            <Button variant="outline" asChild><Link to="/customers"><ArrowLeft className="flip-rtl" /> {t('common.back')}</Link></Button>
            {canEdit && <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> {t('common.edit')}</Button>}
            {canPay && balance.gt(0) && <Button variant="secondary" onClick={() => setPaying(true)}><Wallet /> {t('customers.receivePayment')}</Button>}
          </>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stat(t('customers.balance'), <Money value={c.balance} />, balance.gt(0) ? (over ? 'text-destructive' : 'text-warning') : undefined)}
        {stat(t('customers.creditLimit'), <Money value={c.creditLimit} />)}
        {stat(t('customers.available'), <Money value={D(c.availableCredit).lt(0) ? 0 : c.availableCredit} />, 'text-success')}
        {stat(t('customers.invoices'), <span>{c.stats?.salesCount ?? 0} <span className="text-sm font-medium text-muted-foreground">({c.stats?.openInvoices ?? 0} {t('common.due').toLowerCase()})</span></span>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader><CardTitle>{t('common.details')}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {c.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {c.phone}</div>}
            {c.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {c.email}</div>}
            {c.address && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {c.address}</div>}
            {c.taxId && <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /> {t('customers.taxId')}: {c.taxId}</div>}
            <div className="text-muted-foreground">{t('customers.paymentTerms')}: {c.paymentTermsDays}</div>
            <div className="text-muted-foreground">{t('dashboard.revenue')}: <Money value={c.stats?.totalPurchases} className="font-semibold text-foreground" /></div>
            {over && <Badge variant="destructive">{t('customers.overLimit')}</Badge>}
            {c.notes && <p className="rounded-lg bg-muted p-3 text-muted-foreground">{c.notes}</p>}
          </CardContent>
        </Card>
        <Tabs defaultValue="invoices">
          <TabsList>
            <TabsTrigger value="invoices">{t('customers.invoices')}</TabsTrigger>
            <TabsTrigger value="history">{t('customers.history')}</TabsTrigger>
          </TabsList>
          <TabsContent value="invoices">
            <Card>
              <Table>
                <THead><TR><TH>{t('sales.invoiceNo')}</TH><TH>{t('common.date')}</TH><TH className="text-end">{t('common.total')}</TH><TH className="text-end">{t('common.paid')}</TH><TH className="text-end">{t('common.due')}</TH><TH>{t('pos.creditDue')}</TH><TH>{t('sales.paymentStatus')}</TH></TR></THead>
                <TBody>
                  {invoices.data?.map((s) => (
                    <TR key={s.id}>
                      <TD><Link className="font-mono text-primary hover:underline" to={`/sales/${s.id}`}>{s.invoiceNumber}</Link></TD>
                      <TD>{formatDate(s.createdAt)}</TD>
                      <TD className="text-end"><Money value={s.total} /></TD>
                      <TD className="text-end"><Money value={s.amountPaid} /></TD>
                      <TD className="text-end"><Money value={s.amountDue} className={D(s.amountDue).gt(0) ? 'font-semibold text-warning' : ''} /></TD>
                      <TD className={cn(s.dueDate && D(s.amountDue).gt(0) && new Date(s.dueDate) < new Date() && 'font-semibold text-destructive')}>{s.dueDate ? formatDate(s.dueDate) : '—'}</TD>
                      <TD><StatusBadge status={s.status === 'COMPLETED' ? s.paymentStatus : s.status} ns={s.status === 'COMPLETED' ? 'sales.payment' : 'sales.status'} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {!invoices.data?.length && <p className="py-10 text-center text-sm text-muted-foreground">{t('common.noData')}</p>}
            </Card>
          </TabsContent>
          <TabsContent value="history">
            <Card>
              <Table>
                <THead><TR><TH>{t('common.date')}</TH><TH>{t('common.type')}</TH><TH>{t('common.reference')}</TH><TH className="text-end">{t('common.amount')}</TH><TH className="text-end">{t('common.balance')}</TH></TR></THead>
                <TBody>
                  {ledger.data?.items.map((e) => (
                    <TR key={e.id}>
                      <TD className="whitespace-nowrap">{formatDateTime(e.createdAt)}</TD>
                      <TD><Badge variant={e.type === 'PAYMENT' ? 'success' : e.type === 'SALE' ? 'warning' : 'muted'}>{t(`customers.entry${e.type}`)}</Badge></TD>
                      <TD className="text-xs">{e.invoiceNumber ?? e.description}</TD>
                      <TD className={cn('text-end font-medium', D(e.amount).lt(0) ? 'text-success' : 'text-warning')}><Money value={e.amount} /></TD>
                      <TD className="text-end"><Money value={e.balanceAfter} /></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {!ledger.data?.items.length && <p className="py-10 text-center text-sm text-muted-foreground">{t('common.noData')}</p>}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <CustomerFormDialog open={editing} customer={c} onOpenChange={setEditing} />
      <ReceivePaymentDialog open={paying} customer={c} onOpenChange={setPaying} />
    </>
  );
}
