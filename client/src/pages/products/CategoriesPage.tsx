import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField } from '@/components/shared/FormField';
import { CategoryIcon, CATEGORY_ICONS } from '@/components/shared/CategoryIcon';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { BrandsApi, CategoriesApi, TaxesApi, UnitsApi } from '@/services/catalog.api';
import { useCan } from '@/stores/auth.store';
import { localizedName } from '@/i18n';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';
import type { Brand, Category, Tax, Unit } from '@/types/catalog';

const COLORS = ['#0ea5e9', '#f59e0b', '#6366f1', '#14b8a6', '#ec4899', '#8b5cf6', '#64748b', '#ef4444', '#d97706', '#22c55e', '#0f766e', '#be123c'];
const NONE = '__none__';

function useInvalidate(key: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [key] });
}

function CategoryDialog({ value, onClose }: { value: Partial<Category> | null; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate('categories');
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: TaxesApi.list });
  const [form, setForm] = useState<Partial<Category>>(value ?? {});
  const save = useMutation({
    mutationFn: () => {
      const body = { name: form.name, nameAr: form.nameAr || null, nameEn: form.nameEn || null, icon: form.icon || 'Package', color: form.color || COLORS[0], taxId: form.taxId && form.taxId !== NONE ? form.taxId : null, sortOrder: form.sortOrder ?? 0, status: form.status ?? 'ACTIVE' };
      return form.id ? CategoriesApi.update(form.id, body) : CategoriesApi.create(body);
    },
    onSuccess: () => { toast.success(t('common.saved')); void invalidate(); onClose(); },
    onError: toastError,
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{form.id ? t('common.edit') : t('products.newCategory')}</DialogTitle></DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (form.name?.trim()) save.mutate(); }}>
          <FormField label={t('common.name')} required className="sm:col-span-2"><Input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></FormField>
          <FormField label={t('products.nameAr')}><Input dir="rtl" value={form.nameAr ?? ''} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} /></FormField>
          <FormField label={t('products.nameEn')}><Input value={form.nameEn ?? ''} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} /></FormField>
          <FormField label={t('products.icon')} className="sm:col-span-2">
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(CATEGORY_ICONS).map((k) => (
                <button key={k} type="button" aria-label={k} aria-pressed={form.icon === k}
                  className={cn('flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-muted', form.icon === k && 'border-primary bg-primary/10 text-primary')}
                  onClick={() => setForm({ ...form, icon: k })}>
                  <CategoryIcon icon={k} className="h-4 w-4" />
                </button>
              ))}
            </div>
          </FormField>
          <FormField label={t('products.color')} className="sm:col-span-2">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-label={c} aria-pressed={form.color === c} className={cn('h-8 w-8 rounded-full ring-offset-2 ring-offset-background', form.color === c && 'ring-2 ring-foreground')} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />
              ))}
            </div>
          </FormField>
          <FormField label={t('products.tax')}>
            <Select value={form.taxId ?? NONE} onValueChange={(v) => setForm({ ...form, taxId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {taxes.data?.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Ordre"><Input type="number" min={0} value={form.sortOrder ?? 0} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} /></FormField>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Switch id="cat-active" checked={(form.status ?? 'ACTIVE') === 'ACTIVE'} onCheckedChange={(c) => setForm({ ...form, status: c ? 'ACTIVE' : 'INACTIVE' })} />
            <Label htmlFor="cat-active">{t('common.active')}</Label>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" loading={save.isPending} disabled={!form.name?.trim()}>{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SimpleDialog<T extends { id?: string }>({ title, initial, fields, onSave, onClose }: {
  title: string; initial: T; fields: { key: keyof T & string; label: string; type?: 'text' | 'number' | 'switch'; dir?: 'rtl'; required?: boolean }[];
  onSave: (v: T) => Promise<unknown>; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<T>(initial);
  const [busy, setBusy] = useState(false);
  const valid = fields.filter((f) => f.required).every((f) => String(form[f.key] ?? '').trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          try { await onSave(form); toast.success(t('common.saved')); onClose(); } catch (err) { toastError(err); } finally { setBusy(false); }
        }}>
          {fields.map((f, i) => f.type === 'switch' ? (
            <div key={f.key} className="flex items-center gap-2">
              <Switch id={f.key} checked={!!form[f.key]} onCheckedChange={(c) => setForm({ ...form, [f.key]: c })} />
              <Label htmlFor={f.key}>{f.label}</Label>
            </div>
          ) : (
            <FormField key={f.key} label={f.label} required={f.required}>
              <Input autoFocus={i === 0} dir={f.dir} type={f.type ?? 'text'} step="any" value={String(form[f.key] ?? '')} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            </FormField>
          ))}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" loading={busy} disabled={!valid}>{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CategoriesPage() {
  const { t } = useTranslation();
  const canTax = useCan('settings.manage');
  const [tab, setTab] = useState('categories');
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null);
  const [editBrand, setEditBrand] = useState<Partial<Brand> | null>(null);
  const [editUnit, setEditUnit] = useState<Partial<Unit> | null>(null);
  const [editTax, setEditTax] = useState<Partial<Tax> | null>(null);
  const cats = useQuery({ queryKey: ['categories', 'all'], queryFn: () => CategoriesApi.list(true) });
  const brands = useQuery({ queryKey: ['brands'], queryFn: BrandsApi.list });
  const units = useQuery({ queryKey: ['units'], queryFn: UnitsApi.list });
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: TaxesApi.list });
  const invCats = useInvalidate('categories');
  const invBrands = useInvalidate('brands');
  const invUnits = useInvalidate('units');
  const invTaxes = useInvalidate('taxes');

  const del = async (fn: () => Promise<unknown>, after: () => unknown) => {
    try { await fn(); toast.success(t('common.updated')); await after(); } catch (e) { toastError(e); }
  };

  const addLabel: Record<string, string> = { categories: t('products.newCategory'), brands: t('products.newBrand'), units: t('products.newUnit'), taxes: t('products.newTax') };
  const onAdd = () => {
    if (tab === 'categories') setEditCat({ icon: 'Package', color: COLORS[0], status: 'ACTIVE' });
    if (tab === 'brands') setEditBrand({ name: '' });
    if (tab === 'units') setEditUnit({ code: '', name: '', allowDecimal: false });
    if (tab === 'taxes') setEditTax({ name: '', code: '', rate: '0' });
  };

  return (
    <>
      <PageHeader
        title={t('nav.categories')}
        actions={(tab !== 'taxes' || canTax) && <Button onClick={onAdd}><Plus /> {addLabel[tab]}</Button>}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="categories">{t('nav.categories')}</TabsTrigger>
          <TabsTrigger value="brands">{t('products.brands')}</TabsTrigger>
          <TabsTrigger value="units">{t('products.units')}</TabsTrigger>
          <TabsTrigger value="taxes">{t('products.taxes')}</TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cats.data?.map((c) => (
              <Card key={c.id} className={cn('flex items-center gap-3 p-4', c.status === 'INACTIVE' && 'opacity-60')}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ background: `${c.color}1f`, color: c.color ?? undefined }}>
                  <CategoryIcon icon={c.icon} className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{localizedName(c)}</div>
                  <div className="text-xs text-muted-foreground">{c.productCount} {t('products.productsCount').toLowerCase()}{c.tax ? ` · ${c.tax.name}` : ''}</div>
                  {c.status === 'INACTIVE' && <StatusBadge status="INACTIVE" />}
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => setEditCat(c)} aria-label={t('common.edit')}><Pencil /></Button>
                <Button variant="ghost" size="icon-sm" onClick={() => del(() => CategoriesApi.remove(c.id), invCats)} aria-label={t('common.delete')}><Trash2 /></Button>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="brands">
          <Card>
            <Table>
              <THead><TR><TH>{t('common.name')}</TH><TH>{t('products.productsCount')}</TH><TH>{t('common.status')}</TH><TH className="w-24" /></TR></THead>
              <TBody>
                {brands.data?.map((b) => (
                  <TR key={b.id}>
                    <TD className="font-medium">{b.name}</TD><TD>{b.productCount}</TD><TD><StatusBadge status={b.status ?? 'ACTIVE'} /></TD>
                    <TD className="text-end">
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditBrand(b)} aria-label={t('common.edit')}><Pencil /></Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => del(() => BrandsApi.remove(b.id), invBrands)} aria-label={t('common.delete')}><Trash2 /></Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="units">
          <Card>
            <Table>
              <THead><TR><TH>{t('common.code')}</TH><TH>{t('common.name')}</TH><TH>{t('products.allowDecimal')}</TH><TH className="w-24" /></TR></THead>
              <TBody>
                {units.data?.map((u) => (
                  <TR key={u.id}>
                    <TD className="font-mono">{u.code}</TD><TD>{localizedName(u)}</TD><TD>{u.allowDecimal ? t('common.yes') : t('common.no')}</TD>
                    <TD className="text-end">
                      <Button variant="ghost" size="icon-sm" onClick={() => setEditUnit(u)} aria-label={t('common.edit')}><Pencil /></Button>
                      {!u.isSystem && <Button variant="ghost" size="icon-sm" onClick={() => del(() => UnitsApi.remove(u.id), invUnits)} aria-label={t('common.delete')}><Trash2 /></Button>}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="taxes">
          <Card>
            <Table>
              <THead><TR><TH>{t('common.code')}</TH><TH>{t('common.name')}</TH><TH>{t('products.rate')}</TH><TH>{t('common.status')}</TH><TH className="w-16" /></TR></THead>
              <TBody>
                {taxes.data?.map((x) => (
                  <TR key={x.id}>
                    <TD className="font-mono">{x.code}</TD><TD>{x.name}</TD><TD><Badge>{x.rate}%</Badge></TD><TD><StatusBadge status={x.status} /></TD>
                    <TD className="text-end">{canTax && <Button variant="ghost" size="icon-sm" onClick={() => setEditTax(x)} aria-label={t('common.edit')}><Pencil /></Button>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      {editCat && <CategoryDialog value={editCat} onClose={() => setEditCat(null)} />}
      {editBrand && (
        <SimpleDialog title={editBrand.id ? t('common.edit') : t('products.newBrand')} initial={editBrand} onClose={() => setEditBrand(null)}
          fields={[{ key: 'name', label: t('common.name'), required: true }]}
          onSave={async (v) => { await (v.id ? BrandsApi.update(v.id, { name: v.name, status: v.status ?? 'ACTIVE' }) : BrandsApi.create({ name: v.name })); await invBrands(); }} />
      )}
      {editUnit && (
        <SimpleDialog title={editUnit.id ? t('common.edit') : t('products.newUnit')} initial={editUnit} onClose={() => setEditUnit(null)}
          fields={[{ key: 'code', label: t('common.code'), required: true }, { key: 'name', label: t('common.name'), required: true }, { key: 'nameAr', label: t('products.nameAr'), dir: 'rtl' }, { key: 'nameEn', label: t('products.nameEn') }, { key: 'allowDecimal', label: t('products.allowDecimal'), type: 'switch' }]}
          onSave={async (v) => { const b = { code: v.code, name: v.name, nameAr: v.nameAr || null, nameEn: v.nameEn || null, allowDecimal: !!v.allowDecimal }; await (v.id ? UnitsApi.update(v.id, b) : UnitsApi.create(b)); await invUnits(); }} />
      )}
      {editTax && (
        <SimpleDialog title={editTax.id ? t('common.edit') : t('products.newTax')} initial={editTax} onClose={() => setEditTax(null)}
          fields={[{ key: 'code', label: t('common.code'), required: true }, { key: 'name', label: t('common.name'), required: true }, { key: 'rate', label: t('products.rate'), type: 'number', required: true }]}
          onSave={async (v) => { const b = { code: v.code, name: v.name, rate: Number(v.rate), status: v.status ?? 'ACTIVE' }; await (v.id ? TaxesApi.update(v.id, b) : TaxesApi.create(b)); await invTaxes(); }} />
      )}
    </>
  );
}
