import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Send, Save, Trash2, PackageSearch, Plus } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField } from '@/components/shared/FormField';
import { Money } from '@/components/shared/Money';
import { ProductPicker, type PickedProduct } from '@/components/shared/ProductPicker';
import { QtyInput } from '@/components/shared/QtyInput';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TFoot, TH, THead, TR } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PurchasesApi, SuppliersApi } from '@/services/stock.api';
import { TaxesApi } from '@/services/catalog.api';
import { useCan } from '@/stores/auth.store';
import { localizedName } from '@/i18n';
import { D, formatQty, roundMoney } from '@/utils/money';
import { toastError } from '@/utils/errors';
import { SupplierFormDialog } from '@/pages/suppliers/SupplierFormDialog';

interface Line { key: string; productId: string; variantId: string | null; name: string; sku: string; stock: string; quantity: string; unitCost: string; taxRate: string }

/** Same arithmetic as the server (per-line rounding, half-up, 0 decimals for XAF). */
function lineTotals(l: Line) {
  const gross = roundMoney(D(l.unitCost || 0).mul(D(l.quantity || 0)));
  const tax = roundMoney(gross.mul(D(l.taxRate || 0)).div(100));
  return { gross, tax, total: gross.plus(tax) };
}

export default function PurchaseFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canManageSuppliers = useCan('suppliers.manage');
  const [supplierId, setSupplierId] = useState(params.get('supplierId') ?? '');
  const [expectedAt, setExpectedAt] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [newSupplier, setNewSupplier] = useState(false);
  const suppliers = useQuery({ queryKey: ['suppliers', 'all-active'], queryFn: () => SuppliersApi.list({ pageSize: 200 }) });
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: TaxesApi.list });
  const existing = useQuery({ queryKey: ['purchase', id], queryFn: () => PurchasesApi.get(id!), enabled: !!id });

  useEffect(() => {
    const po = existing.data;
    if (!po) return;
    setSupplierId(po.supplierId);
    setExpectedAt(po.expectedAt?.slice(0, 10) ?? '');
    setNote(po.note ?? '');
    setLines(po.items.map((i) => ({
      key: `${i.productId}:${i.variantId ?? ''}`, productId: i.productId, variantId: i.variantId, name: i.product.name + (i.variant ? ` — ${i.variant.name}` : ''),
      sku: i.variant?.sku ?? i.product.sku, stock: '', quantity: D(i.quantity).toFixed(), unitCost: D(i.unitCost).toFixed(), taxRate: D(i.taxRate).toFixed(),
    })));
  }, [existing.data]);

  const add = ({ product, variant }: PickedProduct) => {
    const key = `${product.id}:${variant?.id ?? ''}`;
    setLines((ls) => ls.some((l) => l.key === key)
      ? ls.map((l) => (l.key === key ? { ...l, quantity: D(l.quantity || 0).plus(1).toFixed() } : l))
      : [...ls, {
        key, productId: product.id, variantId: variant?.id ?? null, name: localizedName(product) + (variant ? ` — ${variant.name}` : ''), sku: variant?.sku ?? product.sku,
        stock: variant?.stock ?? product.stock, quantity: '1', unitCost: D(variant?.purchasePrice ?? product.purchasePrice ?? 0).toFixed(), taxRate: D(product.tax?.rate ?? 0).toFixed(),
      }]);
  };
  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const totals = useMemo(() => lines.reduce((a, l) => {
    const x = lineTotals(l);
    return { subtotal: a.subtotal.plus(x.gross), tax: a.tax.plus(x.tax) };
  }, { subtotal: D(0), tax: D(0) }), [lines]);

  const save = useMutation({
    mutationFn: (submit: boolean) => {
      const body = {
        supplierId, expectedAt: expectedAt || null, note: note.trim() || null, submit,
        items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: Number(l.quantity), unitCost: Number(l.unitCost || 0), taxRate: Number(l.taxRate || 0) })),
      };
      return id ? PurchasesApi.update(id, body) : PurchasesApi.create(body);
    },
    onSuccess: (po) => {
      toast.success(id ? t('common.updated') : t('purchases.created', { number: po.number }));
      void qc.invalidateQueries({ queryKey: ['purchases'] });
      qc.setQueryData(['purchase', po.id], po);
      navigate(`/purchases/${po.id}`, { replace: true });
    },
    onError: toastError,
  });

  if (id && !existing.data) return <Skeleton className="h-96" />;
  const invalid = !supplierId || !lines.length || lines.some((l) => !l.quantity || D(l.quantity).lte(0) || l.unitCost === '');
  const taxRates = [...new Set(['0', ...(taxes.data?.map((x) => D(x.rate).toFixed()) ?? [])])];

  return (
    <>
      <PageHeader
        title={id ? `${t('purchases.edit')} ${existing.data?.number ?? ''}` : t('purchases.new')}
        actions={<Button variant="outline" asChild><Link to={id ? `/purchases/${id}` : '/purchases'}><ArrowLeft className="flip-rtl" /> {t('common.back')}</Link></Button>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card className="min-w-0">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <ProductPicker onPick={add} showCost placeholder={t('transfers.addProduct')} />
            {lines.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center text-muted-foreground">
                <PackageSearch className="h-10 w-10" />
                <p className="text-sm">{t('transfers.noLines')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>{t('pos.product')}</TH>
                      <TH className="w-24 text-end">{t('common.quantity')}</TH>
                      <TH className="w-32 text-end">{t('purchases.unitCost')}</TH>
                      <TH className="w-24 text-end">{t('pos.tax')}</TH>
                      <TH className="text-end">{t('common.total')}</TH>
                      <TH className="w-0" />
                    </TR>
                  </THead>
                  <TBody>
                    {lines.map((l) => (
                      <TR key={l.key}>
                        <TD>
                          <div className="font-medium">{l.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{l.sku}{l.stock !== '' && ` · ${t('pos.stock')}: ${formatQty(l.stock)}`}</div>
                        </TD>
                        <TD><QtyInput value={l.quantity} onChange={(v) => patch(l.key, { quantity: v })} invalid={!l.quantity || D(l.quantity).lte(0)} aria-label={t('common.quantity')} /></TD>
                        <TD><QtyInput value={l.unitCost} onChange={(v) => patch(l.key, { unitCost: v })} invalid={l.unitCost === ''} aria-label={t('purchases.unitCost')} /></TD>
                        <TD>
                          <Select value={l.taxRate} onValueChange={(v) => patch(l.key, { taxRate: v })}>
                            <SelectTrigger className="h-9" aria-label={t('pos.tax')}><SelectValue /></SelectTrigger>
                            <SelectContent>{[...new Set([...taxRates, l.taxRate])].map((r) => <SelectItem key={r} value={r}>{r} %</SelectItem>)}</SelectContent>
                          </Select>
                        </TD>
                        <TD className="text-end"><Money value={lineTotals(l).total} className="font-semibold" /></TD>
                        <TD><Button variant="ghost" size="icon-sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={t('common.remove')}><Trash2 className="text-destructive" /></Button></TD>
                      </TR>
                    ))}
                  </TBody>
                  <TFoot>
                    <TR><TD colSpan={4} className="text-end text-muted-foreground">{t('pos.subtotal')}</TD><TD className="text-end"><Money value={totals.subtotal} /></TD><TD /></TR>
                    <TR><TD colSpan={4} className="text-end text-muted-foreground">{t('pos.tax')}</TD><TD className="text-end"><Money value={totals.tax} /></TD><TD /></TR>
                    <TR><TD colSpan={4} className="text-end font-bold">{t('common.total')}</TD><TD className="text-end"><Money value={totals.subtotal.plus(totals.tax)} className="text-lg font-bold" /></TD><TD /></TR>
                  </TFoot>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <FormField label={t('purchases.supplier')} htmlFor="po-supplier" required>
              <div className="flex gap-2">
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="po-supplier" className="min-w-0 flex-1"><SelectValue placeholder={t('purchases.chooseSupplier')} /></SelectTrigger>
                  <SelectContent>{suppliers.data?.items.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.company ? ` — ${s.company}` : ''}</SelectItem>)}</SelectContent>
                </Select>
                {canManageSuppliers && <Button variant="outline" size="icon" className="shrink-0" onClick={() => setNewSupplier(true)} aria-label={t('suppliers.new')}><Plus /></Button>}
              </div>
            </FormField>
            <FormField label={t('purchases.expectedAt')} htmlFor="po-expected"><Input id="po-expected" type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} /></FormField>
            <FormField label={t('common.notes')} htmlFor="po-note"><Textarea id="po-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></FormField>
            <div className="flex items-baseline justify-between border-t pt-3"><span className="text-sm text-muted-foreground">{t('common.total')}</span><Money value={totals.subtotal.plus(totals.tax)} className="text-xl font-bold" /></div>
            <div className="grid gap-2">
              <Button onClick={() => save.mutate(true)} disabled={invalid} loading={save.isPending && save.variables === true}><Send /> {t('purchases.submit')}</Button>
              {(!existing.data || existing.data.status === 'DRAFT') && (
                <Button variant="outline" onClick={() => save.mutate(false)} disabled={invalid} loading={save.isPending && save.variables === false}><Save /> {t('transfers.saveDraft')}</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      <SupplierFormDialog open={newSupplier} onOpenChange={setNewSupplier} onSaved={(s) => { void qc.invalidateQueries({ queryKey: ['suppliers'] }); setSupplierId(s.id); }} />
    </>
  );
}
