import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Send, Save, Trash2, PackageSearch } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField } from '@/components/shared/FormField';
import { ProductPicker, type PickedProduct } from '@/components/shared/ProductPicker';
import { QtyInput } from '@/components/shared/QtyInput';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BranchesApi, TransfersApi } from '@/services/stock.api';
import { useCurrentBranch } from '@/stores/auth.store';
import { localizedName } from '@/i18n';
import { D, formatQty } from '@/utils/money';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';

interface Line { key: string; productId: string; variantId: string | null; name: string; sku: string; unit: string; stock: string; quantity: string }

export default function TransferFormPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const branch = useCurrentBranch();
  const [toBranchId, setTo] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const branches = useQuery({ queryKey: ['branches'], queryFn: BranchesApi.list });
  const existing = useQuery({ queryKey: ['transfer', id], queryFn: () => TransfersApi.get(id!), enabled: !!id });

  useEffect(() => {
    const tr = existing.data;
    if (!tr) return;
    setTo(tr.toBranchId);
    setNote(tr.note ?? '');
    setLines(tr.items.map((i) => ({
      key: `${i.productId}:${i.variantId ?? ''}`, productId: i.productId, variantId: i.variantId, name: i.product.name + (i.variant ? ` — ${i.variant.name}` : ''),
      sku: i.variant?.sku ?? i.product.sku, unit: i.product.unit?.code ?? '', stock: i.sourceStock ?? '0', quantity: D(i.quantity).toFixed(),
    })));
  }, [existing.data]);

  const add = ({ product, variant }: PickedProduct) => {
    const key = `${product.id}:${variant?.id ?? ''}`;
    setLines((ls) => ls.some((l) => l.key === key)
      ? ls.map((l) => (l.key === key ? { ...l, quantity: D(l.quantity || 0).plus(1).toFixed() } : l))
      : [...ls, { key, productId: product.id, variantId: variant?.id ?? null, name: localizedName(product) + (variant ? ` — ${variant.name}` : ''), sku: variant?.sku ?? product.sku, unit: product.unit?.code ?? '', stock: variant?.stock ?? product.stock, quantity: '1' }]);
  };
  const setQty = (key: string, quantity: string) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity } : l)));

  const save = useMutation({
    mutationFn: (submit: boolean) => {
      const body = { toBranchId, note: note.trim() || null, submit, items: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: Number(l.quantity) })) };
      return id ? TransfersApi.update(id, body) : TransfersApi.create(body);
    },
    onSuccess: (tr) => {
      toast.success(id ? t('common.updated') : t('transfers.created', { number: tr.number }));
      void qc.invalidateQueries({ queryKey: ['transfers'] });
      void qc.invalidateQueries({ queryKey: ['transfer', tr.id] });
      navigate(`/transfers/${tr.id}`, { replace: true });
    },
    onError: toastError,
  });

  if (id && !existing.data) return <Skeleton className="h-96" />;
  const destinations = branches.data?.filter((b) => b.id !== branch?.id) ?? [];
  const overStock = (l: Line) => D(l.quantity || 0).gt(D(l.stock));
  const invalid = !toBranchId || !lines.length || lines.some((l) => !l.quantity || D(l.quantity).lte(0));
  const editable = !existing.data || ['DRAFT', 'REQUESTED'].includes(existing.data.status);

  return (
    <>
      <PageHeader
        title={id ? `${t('transfers.edit')} ${existing.data?.number ?? ''}` : t('transfers.new')}
        description={t('transfers.workflow')}
        actions={<Button variant="outline" asChild><Link to={id ? `/transfers/${id}` : '/transfers'}><ArrowLeft className="flip-rtl" /> {t('common.back')}</Link></Button>}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <ProductPicker onPick={add} placeholder={t('transfers.addProduct')} />
            {lines.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center text-muted-foreground">
                <PackageSearch className="h-10 w-10" />
                <p className="text-sm">{t('transfers.noLines')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR><TH>{t('pos.product')}</TH><TH className="text-end">{t('transfers.sourceStock')}</TH><TH className="w-32 text-end">{t('common.quantity')}</TH><TH className="w-0" /></TR>
                  </THead>
                  <TBody>
                    {lines.map((l) => (
                      <TR key={l.key}>
                        <TD><div className="font-medium">{l.name}</div><div className="font-mono text-xs text-muted-foreground">{l.sku}</div></TD>
                        <TD className={cn('text-end tabular', overStock(l) && 'font-semibold text-destructive')}>{formatQty(l.stock)} <span className="text-xs text-muted-foreground">{l.unit.toLowerCase()}</span></TD>
                        <TD><QtyInput value={l.quantity} onChange={(v) => setQty(l.key, v)} invalid={!l.quantity || D(l.quantity).lte(0)} aria-label={t('common.quantity')} /></TD>
                        <TD><Button variant="ghost" size="icon-sm" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label={t('common.remove')}><Trash2 className="text-destructive" /></Button></TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                {lines.some(overStock) && <p className="mt-3 text-sm text-warning">{t('transfers.overStockWarning')}</p>}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-3 text-sm">
              <span className="font-semibold">{branch?.name}</span><ArrowRight className="flip-rtl h-4 w-4 text-muted-foreground" />
              <span className="font-semibold">{destinations.find((b) => b.id === toBranchId)?.name ?? '…'}</span>
            </div>
            <FormField label={t('transfers.to')} htmlFor="tr-to" required>
              <Select value={toBranchId} onValueChange={setTo}>
                <SelectTrigger id="tr-to"><SelectValue placeholder={t('transfers.chooseBranch')} /></SelectTrigger>
                <SelectContent>{destinations.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t('common.notes')} htmlFor="tr-note"><Textarea id="tr-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></FormField>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">{t('common.items')}</span><span className="font-semibold">{lines.length} · {formatQty(lines.reduce((s, l) => s.plus(D(l.quantity || 0)), D(0)))} u.</span></div>
            <div className="grid gap-2">
              <Button onClick={() => save.mutate(true)} disabled={invalid || !editable} loading={save.isPending && save.variables === true}><Send /> {t('transfers.request')}</Button>
              {(!existing.data || existing.data.status === 'DRAFT') && (
                <Button variant="outline" onClick={() => save.mutate(false)} disabled={invalid} loading={save.isPending && save.variables === false}><Save /> {t('transfers.saveDraft')}</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
