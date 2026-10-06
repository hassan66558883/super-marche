import { useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useFieldArray, useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash2, Wand2, Save } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField } from '@/components/shared/FormField';
import { ProductThumb } from '@/components/shared/CategoryIcon';
import { BarcodeSvg } from '@/components/shared/BarcodeSvg';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/misc';
import { BrandsApi, CategoriesApi, ProductsApi, TaxesApi, UnitsApi, type ProductInput } from '@/services/catalog.api';
import { localizedName } from '@/i18n';
import { D, formatMoney } from '@/utils/money';
import { toastError } from '@/utils/errors';
import { useCan } from '@/stores/auth.store';
import type { Product } from '@/types/catalog';

const num = z.coerce.number().min(0);
const optNum = z.union([z.literal(''), z.coerce.number().min(0)]).optional().nullable().transform((v) => (v === '' || v === undefined ? null : v));
const schema = z.object({
  name: z.string().trim().min(1), nameAr: z.string().optional(), nameEn: z.string().optional(),
  sku: z.string().trim().min(1), reference: z.string().optional(),
  categoryId: z.string().optional(), brandId: z.string().optional(), unitId: z.string().optional(), taxId: z.string().optional(),
  priceMode: z.enum(['INCLUSIVE', 'EXCLUSIVE']),
  purchasePrice: num, sellingPrice: num, wholesalePrice: optNum,
  minStock: num, maxStock: optNum,
  trackStock: z.boolean(), isQuick: z.boolean(), returnToStock: z.boolean(),
  imageUrl: z.string().url().or(z.literal('')).optional(), description: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  barcodes: z.array(z.object({ value: z.string().trim().min(3) })),
  variants: z.array(z.object({
    id: z.string().optional(), name: z.string().trim().min(1), sku: z.string().trim().min(1),
    sellingPrice: optNum, wholesalePrice: optNum, purchasePrice: optNum, barcode: z.string().optional(),
  })),
  openingStock: optNum,
});
type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

const NONE = '__none__';

function toValues(p?: Product): Values {
  return {
    name: p?.name ?? '', nameAr: p?.nameAr ?? '', nameEn: p?.nameEn ?? '', sku: p?.sku ?? '', reference: p?.reference ?? '',
    categoryId: p?.category?.id ?? NONE, brandId: p?.brand?.id ?? NONE, unitId: p?.unit?.id ?? NONE, taxId: p?.taxId ?? NONE,
    priceMode: p?.priceMode ?? 'INCLUSIVE',
    purchasePrice: p?.purchasePrice ?? '0', sellingPrice: p?.sellingPrice ?? '', wholesalePrice: p?.wholesalePrice ?? '',
    minStock: p?.minStock ?? '0', maxStock: p?.maxStock ?? '',
    trackStock: p?.trackStock ?? true, isQuick: p?.isQuick ?? false, returnToStock: p?.returnToStock ?? true,
    imageUrl: p?.imageUrl ?? '', description: p?.description ?? '', status: p?.status ?? 'ACTIVE',
    barcodes: p ? p.barcodes.filter((b) => !b.variantId).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map((b) => ({ value: b.barcode })) : [],
    variants: p?.variants.map((v) => ({ id: v.id, name: v.name, sku: v.sku, sellingPrice: v.sellingPrice, wholesalePrice: v.wholesalePrice ?? '', purchasePrice: v.purchasePrice ?? '', barcode: v.barcode ?? '' })) ?? [],
    openingStock: '',
  } as unknown as Values;
}

const pick = (v?: string) => (!v || v === NONE ? null : v);

export default function ProductFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showCost = useCan('products.view_cost');

  const product = useQuery({ queryKey: ['product', id], queryFn: () => ProductsApi.get(id!), enabled: isEdit });
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => CategoriesApi.list() });
  const brands = useQuery({ queryKey: ['brands'], queryFn: BrandsApi.list });
  const units = useQuery({ queryKey: ['units'], queryFn: UnitsApi.list });
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: TaxesApi.list });

  const form = useForm<Values, unknown, Parsed>({ resolver: zodResolver(schema), defaultValues: toValues() });
  const { register, control, handleSubmit, reset, watch, setValue, getValues, formState: { errors, isSubmitting } } = form;
  const barcodes = useFieldArray({ control, name: 'barcodes' });
  const variants = useFieldArray({ control, name: 'variants' });

  useEffect(() => { if (product.data) reset(toValues(product.data)); }, [product.data, reset]);

  // Suggest a SKU from the category for new products
  const categoryId = watch('categoryId');
  useEffect(() => {
    if (isEdit || getValues('sku')) return;
    const cat = categories.data?.find((c) => c.id === categoryId);
    if (cat) void ProductsApi.nextSku(cat.name.normalize('NFD').replace(/[̀-ͯ]/g, '')).then((r) => { if (!getValues('sku')) setValue('sku', r.sku); });
  }, [categoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (v: Parsed) => {
      const body: ProductInput = {
        name: v.name, nameAr: v.nameAr || null, nameEn: v.nameEn || null, sku: v.sku, reference: v.reference || null,
        categoryId: pick(v.categoryId), brandId: pick(v.brandId), unitId: pick(v.unitId), taxId: pick(v.taxId),
        priceMode: v.priceMode, purchasePrice: v.purchasePrice, sellingPrice: v.sellingPrice, wholesalePrice: v.wholesalePrice,
        minStock: v.minStock, maxStock: v.maxStock, trackStock: v.trackStock, isQuick: v.isQuick, returnToStock: v.returnToStock,
        imageUrl: v.imageUrl || null, description: v.description || null, status: v.status,
        barcodes: v.barcodes.map((b) => b.value),
        variants: v.variants.map((x) => ({ id: x.id, name: x.name, sku: x.sku, sellingPrice: x.sellingPrice, wholesalePrice: x.wholesalePrice, purchasePrice: x.purchasePrice, barcode: x.barcode || null, status: 'ACTIVE' })),
        openingStock: !isEdit && v.openingStock ? v.openingStock : undefined,
      };
      return isEdit ? ProductsApi.update(id!, body) : ProductsApi.create(body);
    },
    onSuccess: (p) => {
      toast.success(isEdit ? t('common.updated') : t('common.created'));
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['product', p.id] });
      navigate('/products');
    },
    onError: toastError,
  });

  const genBarcode = async (apply: (code: string) => void) => {
    try { apply((await ProductsApi.generateBarcode()).barcode); } catch (e) { toastError(e); }
  };

  const selling = String(watch('sellingPrice') ?? '');
  const cost = String(watch('purchasePrice') ?? '');
  const margin = D(selling).gt(0) ? D(selling).minus(D(cost)).div(D(selling)).mul(100) : null;
  const preview = { name: watch('name') || '—', imageUrl: watch('imageUrl') || null, category: categories.data?.find((c) => c.id === watch('categoryId')) ?? null };

  // Radix Select only shows a value whose item is mounted: wait for the reference lists first
  if ((isEdit && product.isLoading) || categories.isLoading || brands.isLoading || units.isLoading || taxes.isLoading) return <Skeleton className="h-96 w-full" />;

  const selectField = (name: 'categoryId' | 'brandId' | 'unitId' | 'taxId', items: { id: string; label: string }[], noneLabel: string) => (
    <Controller control={control} name={name} render={({ field }) => (
      <Select key={items.length} value={field.value ?? NONE} onValueChange={field.onChange}>
        <SelectTrigger id={name}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{noneLabel}</SelectItem>
          {items.map((i) => <SelectItem key={i.id} value={i.id}>{i.label}</SelectItem>)}
        </SelectContent>
      </Select>
    )} />
  );

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
      <PageHeader
        title={isEdit ? t('products.edit') : t('products.new')}
        description={isEdit ? product.data?.sku : undefined}
        actions={
          <>
            <Button variant="outline" asChild><Link to="/products"><ArrowLeft className="flip-rtl" /> {t('common.back')}</Link></Button>
            <Button type="submit" loading={save.isPending || isSubmitting}><Save /> {t('common.save')}</Button>
          </>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>{t('products.general')}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('products.name')} htmlFor="name" required error={errors.name && t('common.required')} className="sm:col-span-2">
                <Input id="name" {...register('name')} aria-invalid={!!errors.name} autoFocus={!isEdit} />
              </FormField>
              <FormField label={t('products.nameAr')} htmlFor="nameAr"><Input id="nameAr" dir="rtl" {...register('nameAr')} /></FormField>
              <FormField label={t('products.nameEn')} htmlFor="nameEn"><Input id="nameEn" dir="ltr" {...register('nameEn')} /></FormField>
              <FormField label={t('products.category')} htmlFor="categoryId">
                {selectField('categoryId', (categories.data ?? []).map((c) => ({ id: c.id, label: localizedName(c) })), '—')}
              </FormField>
              <FormField label={t('products.brand')} htmlFor="brandId">
                {selectField('brandId', (brands.data ?? []).filter((b) => b.status !== 'INACTIVE').map((b) => ({ id: b.id, label: b.name })), '—')}
              </FormField>
              <FormField label={t('products.sku')} htmlFor="sku" required error={errors.sku && t('common.required')}>
                <Input id="sku" className="font-mono" {...register('sku')} aria-invalid={!!errors.sku} />
              </FormField>
              <FormField label={t('products.reference')} htmlFor="reference"><Input id="reference" {...register('reference')} /></FormField>
              <FormField label={t('products.unit')} htmlFor="unitId">
                {selectField('unitId', (units.data ?? []).map((u) => ({ id: u.id, label: `${localizedName(u)} (${u.code})` })), '—')}
              </FormField>
              <FormField label={t('common.status')} htmlFor="status">
                <Controller control={control} name="status" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">{t('common.active')}</SelectItem>
                      <SelectItem value="INACTIVE">{t('common.inactive')}</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </FormField>
              <FormField label={t('common.description')} htmlFor="description" className="sm:col-span-2">
                <Textarea id="description" rows={3} {...register('description')} />
              </FormField>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('products.pricing')}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              {showCost && (
                <FormField label={t('products.purchasePrice')} htmlFor="purchasePrice">
                  <Input id="purchasePrice" type="number" inputMode="decimal" min={0} step="any" {...register('purchasePrice')} />
                </FormField>
              )}
              <FormField label={t('products.sellingPrice')} htmlFor="sellingPrice" required error={errors.sellingPrice && t('common.required')}>
                <Input id="sellingPrice" type="number" inputMode="decimal" min={0} step="any" {...register('sellingPrice')} aria-invalid={!!errors.sellingPrice} />
              </FormField>
              <FormField label={t('products.wholesalePrice')} htmlFor="wholesalePrice">
                <Input id="wholesalePrice" type="number" inputMode="decimal" min={0} step="any" {...register('wholesalePrice')} />
              </FormField>
              <FormField label={t('products.tax')} htmlFor="taxId" hint={t('products.inheritTax')}>
                {selectField('taxId', (taxes.data ?? []).filter((x) => x.status === 'ACTIVE').map((x) => ({ id: x.id, label: `${x.name}` })), t('products.inheritTax'))}
              </FormField>
              <FormField label={t('products.priceMode')} htmlFor="priceMode">
                <Controller control={control} name="priceMode" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="priceMode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INCLUSIVE">{t('products.inclusive')}</SelectItem>
                      <SelectItem value="EXCLUSIVE">{t('products.exclusive')}</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </FormField>
              {showCost && margin && (
                <div className="flex flex-col justify-end">
                  <span className="text-sm font-medium">{t('products.margin')}</span>
                  <span className={margin.lt(0) ? 'text-lg font-bold text-destructive' : 'text-lg font-bold text-success'}>
                    {margin.toDecimalPlaces(1).toString()} %
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('products.inventory')}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <FormField label={t('products.minStock')} htmlFor="minStock"><Input id="minStock" type="number" min={0} step="any" {...register('minStock')} /></FormField>
              <FormField label={t('products.maxStock')} htmlFor="maxStock"><Input id="maxStock" type="number" min={0} step="any" {...register('maxStock')} /></FormField>
              {!isEdit && (
                <FormField label={t('inventory.current')} htmlFor="openingStock" hint={t('inventory.mvOPENING')}>
                  <Input id="openingStock" type="number" min={0} step="any" {...register('openingStock')} />
                </FormField>
              )}
              <div className="flex flex-col gap-3 sm:col-span-3 sm:flex-row sm:flex-wrap sm:gap-6">
                {(['trackStock', 'isQuick', 'returnToStock'] as const).map((k) => (
                  <Controller key={k} control={control} name={k} render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Switch id={k} checked={field.value} onCheckedChange={field.onChange} />
                      <Label htmlFor={k} className="cursor-pointer font-normal">{t(k === 'trackStock' ? 'products.trackStock' : k === 'isQuick' ? 'products.quick' : 'products.returnToStock')}</Label>
                    </div>
                  )} />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t('products.barcodes')}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => genBarcode((code) => barcodes.append({ value: code }))}><Wand2 /> {t('products.generateBarcode')}</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => barcodes.append({ value: '' })}><Plus /> {t('products.addBarcode')}</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {!barcodes.fields.length && <p className="text-sm text-muted-foreground">{t('common.none')}</p>}
              {barcodes.fields.map((f, i) => (
                <div key={f.id} className="flex items-center gap-3">
                  <Input className="max-w-xs font-mono" {...register(`barcodes.${i}.value`)} aria-label={`${t('products.barcode')} ${i + 1}`} aria-invalid={!!errors.barcodes?.[i]} />
                  <div className="hidden rounded bg-white px-2 py-1 sm:block">{watch(`barcodes.${i}.value`)?.length >= 3 && <BarcodeSvg value={watch(`barcodes.${i}.value`)} height={24} width={1.2} fontSize={9} />}</div>
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => barcodes.remove(i)} aria-label={t('common.remove')}><Trash2 /></Button>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t('products.variants')}</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => variants.append({ name: '', sku: `${getValues('sku')}-${variants.fields.length + 1}`, sellingPrice: '', wholesalePrice: '', purchasePrice: '', barcode: '' } as never)}>
                <Plus /> {t('products.addVariant')}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {!variants.fields.length && <p className="text-sm text-muted-foreground">{t('common.none')}</p>}
              {variants.fields.map((f, i) => (
                <div key={f.id} className="grid items-end gap-2 rounded-lg border p-3 sm:grid-cols-[1.2fr_1fr_1fr_1fr_1.2fr_auto]">
                  <FormField label={t('products.variantName')}><Input {...register(`variants.${i}.name`)} aria-invalid={!!errors.variants?.[i]?.name} /></FormField>
                  <FormField label={t('products.sku')}><Input className="font-mono" {...register(`variants.${i}.sku`)} /></FormField>
                  <FormField label={t('products.sellingPrice')}><Input type="number" min={0} step="any" placeholder={String(selling ?? '')} {...register(`variants.${i}.sellingPrice`)} /></FormField>
                  {showCost ? <FormField label={t('products.purchasePrice')}><Input type="number" min={0} step="any" {...register(`variants.${i}.purchasePrice`)} /></FormField> : <div />}
                  <FormField label={t('products.barcode')}>
                    <div className="flex gap-1">
                      <Input className="font-mono" {...register(`variants.${i}.barcode`)} />
                      <Button type="button" variant="outline" size="icon" onClick={() => genBarcode((code) => setValue(`variants.${i}.barcode`, code))} aria-label={t('products.generateBarcode')}><Wand2 /></Button>
                    </div>
                  </FormField>
                  <Button type="button" variant="ghost" size="icon" onClick={() => variants.remove(i)} aria-label={t('common.remove')}><Trash2 /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-4">
            <CardContent className="space-y-4 p-5">
              <div className="aspect-square overflow-hidden rounded-xl border">
                <ProductThumb name={preview.name} imageUrl={preview.imageUrl} category={preview.category} size="lg" className="rounded-none" />
              </div>
              <div>
                <div className="font-semibold">{preview.name}</div>
                <div className="text-xl font-bold text-primary">{formatMoney(selling)}</div>
              </div>
              <FormField label={t('products.image')} htmlFor="imageUrl" error={errors.imageUrl && 'URL invalide'}>
                <Input id="imageUrl" placeholder="https://…" {...register('imageUrl')} />
              </FormField>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
