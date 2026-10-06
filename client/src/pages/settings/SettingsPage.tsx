import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2, Store, Percent, Coins, CreditCard, Receipt, Hash, ShoppingCart, Printer, Barcode, Languages, Bell, Palette, Users,
  Plus, Pencil, Save, Monitor, Sun, Moon, ExternalLink, Crown,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormField } from '@/components/shared/FormField';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BranchAdminApi, PaymentMethodAdminApi, PrintApi, SettingsApi } from '@/services/admin.api';
import { encodeTestPage } from '@/components/print/escpos';
import { TaxesApi } from '@/services/catalog.api';
import { AuthApi } from '@/services/auth.service';
import { useSettings } from '@/hooks/useSettings';
import { useAuthStore, useCan } from '@/stores/auth.store';
import { useUiStore, type Theme } from '@/stores/ui.store';
import { setCurrencyFormat, formatMoney } from '@/utils/money';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';
import type { AppSettings } from '@/types/settings';
import type { AdminPaymentMethod, BranchInput, ManagedBranch } from '@/types/admin';
import type { Tax } from '@/types/catalog';

const SECTIONS = [
  { key: 'company', icon: Building2 }, { key: 'branches', icon: Store }, { key: 'users', icon: Users },
  { key: 'taxes', icon: Percent }, { key: 'currency', icon: Coins }, { key: 'payments', icon: CreditCard },
  { key: 'receipt', icon: Receipt }, { key: 'invoice', icon: Hash }, { key: 'pos', icon: ShoppingCart },
  { key: 'printer', icon: Printer }, { key: 'barcode', icon: Barcode }, { key: 'locale', icon: Languages },
  { key: 'theme', icon: Palette }, { key: 'notifications', icon: Bell },
] as const;
type Section = (typeof SECTIONS)[number]['key'];

export default function SettingsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const section = (SECTIONS.find((s) => s.key === params.get('s'))?.key ?? 'company') as Section;
  const go = (s: string) => setParams({ s }, { replace: true });
  const settings = useSettings();

  return (
    <>
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />
      <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <div className="lg:hidden">
          <Select value={section} onValueChange={go}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SECTIONS.map((s) => <SelectItem key={s.key} value={s.key}>{t(`settings.s_${s.key}`)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Card className="hidden h-fit p-2 lg:block">
          <nav aria-label={t('settings.title')}>
            {SECTIONS.map(({ key, icon: Icon }) => (
              <button key={key} type="button" onClick={() => go(key)} aria-current={section === key ? 'page' : undefined}
                className={cn('flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-start text-sm hover:bg-muted', section === key && 'bg-primary/10 font-semibold text-primary hover:bg-primary/10')}>
                <Icon className="h-4 w-4 shrink-0" />{t(`settings.s_${key}`)}
              </button>
            ))}
          </nav>
        </Card>
        <div className="min-w-0">
          {settings.isLoading || !settings.data ? <Skeleton className="h-96" /> : <SectionBody section={section} s={settings.data} />}
        </div>
      </div>
    </>
  );
}

function SectionBody({ section, s }: { section: Section; s: AppSettings }) {
  switch (section) {
    case 'company': return <CompanySection value={s.company} />;
    case 'branches': return <BranchesSection />;
    case 'users': return <UsersLink />;
    case 'taxes': return <TaxesSection />;
    case 'currency': return <CurrencySection value={s.currency} />;
    case 'payments': return <PaymentMethodsSection />;
    case 'receipt': return <ReceiptSection value={s.receipt} />;
    case 'invoice': return <InvoiceSection value={s.invoice} />;
    case 'pos': return <PosSection value={s.pos} />;
    case 'printer': return <PrinterSection value={s.printer} />;
    case 'barcode': return <BarcodeSection value={s.barcode} />;
    case 'locale': return <LocaleSection value={s.locale} />;
    case 'theme': return <ThemeSection />;
    case 'notifications': return <NotificationsSection value={s.notifications} />;
  }
}

// ───────────── shared helpers ─────────────
function Panel({ title, description, children, footer }: { title: string; description?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
      {footer && <div className="mt-5 flex items-center justify-end gap-2 border-t pt-4">{footer}</div>}
    </Card>
  );
}

/** Draft state for one settings key, saved company-wide with PUT /settings/:key. */
function useSettingDraft<T extends object>(key: keyof AppSettings, value: T, scope?: 'branch') {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<T>(value);
  useEffect(() => setDraft(value), [value]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  const save = useMutation({
    mutationFn: () => SettingsApi.update(key, draft, scope),
    onSuccess: () => { toast.success(t('common.saved')); void qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: toastError,
  });
  const set = <K extends keyof T>(k: K, v: T[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const footer = (
    <>
      {dirty && <Button variant="ghost" onClick={() => setDraft(value)}>{t('common.cancel')}</Button>}
      <Button onClick={() => save.mutate()} disabled={!dirty} loading={save.isPending}><Save /> {t('common.save')}</Button>
    </>
  );
  return { draft, set, setDraft, footer };
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useMemo(() => `t-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <label htmlFor={id} className="cursor-pointer">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const num = (v: string) => (v === '' ? 0 : Number(v));

// ───────────── company ─────────────
function CompanySection({ value }: { value: AppSettings['company'] }) {
  const { t } = useTranslation();
  const { draft, set, footer } = useSettingDraft('company', value);
  const f = (k: keyof AppSettings['company'], label: string, extra: { type?: string; wide?: boolean; dir?: 'ltr' } = {}) => (
    <FormField label={label} htmlFor={`c-${k}`} className={extra.wide ? 'sm:col-span-2' : undefined}>
      <Input id={`c-${k}`} type={extra.type} dir={extra.dir} value={(draft[k] as string | null | undefined) ?? ''} onChange={(e) => set(k, e.target.value)} />
    </FormField>
  );
  return (
    <Panel title={t('settings.s_company')} description={t('settings.companyHelp')} footer={footer}>
      <div className="grid gap-4 sm:grid-cols-2">
        {f('name', t('settings.companyName'))}
        {f('legalName', t('settings.legalName'))}
        {f('slogan', t('settings.slogan'), { wide: true })}
        {f('address', t('common.address'), { wide: true })}
        {f('phone', t('common.phone'), { type: 'tel', dir: 'ltr' })}
        {f('email', t('common.email'), { type: 'email', dir: 'ltr' })}
        {f('website', t('settings.website'), { dir: 'ltr' })}
        {f('taxId', t('settings.taxId'), { dir: 'ltr' })}
        {f('rccm', t('settings.rccm'), { dir: 'ltr' })}
        {f('logoUrl', t('settings.logoUrl'), { dir: 'ltr' })}
      </div>
    </Panel>
  );
}

// ───────────── branches & registers ─────────────
function BranchesSection() {
  const { t } = useTranslation();
  const canManage = useCan('branches.manage');
  const branches = useQuery({ queryKey: ['branches', 'manage'], queryFn: BranchAdminApi.list });
  const [editing, setEditing] = useState<ManagedBranch | 'new' | null>(null);
  const [register, setRegister] = useState<{ branch: ManagedBranch; reg: ManagedBranch['registers'][number] | null } | null>(null);
  return (
    <Panel title={t('settings.s_branches')} description={t('settings.branchesHelp')}>
      {canManage && <div className="mb-4 flex justify-end"><Button onClick={() => setEditing('new')}><Plus /> {t('settings.newBranch')}</Button></div>}
      <div className="space-y-3">
        {branches.data?.map((b) => (
          <div key={b.id} className={cn('rounded-lg border p-4', b.status === 'INACTIVE' && 'opacity-60')}>
            <div className="flex flex-wrap items-start gap-3">
              <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-bold text-primary">{b.code}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-semibold">
                  {b.name}
                  {b.isHeadOffice && <Badge variant="default"><Crown className="h-3 w-3" /> {t('settings.headOffice')}</Badge>}
                  <StatusBadge status={b.status} />
                </div>
                <div className="text-sm text-muted-foreground">{[b.address, b.city, b.phone].filter(Boolean).join(' · ') || '—'}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('settings.branchUsers', { count: b._count.users })}{b.defaultTax ? ` · ${t('settings.defaultTax')}: ${b.defaultTax.name}` : ''}
                </div>
              </div>
              {canManage && <Button variant="outline" size="sm" onClick={() => setEditing(b)}><Pencil /> {t('common.edit')}</Button>}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="text-xs font-medium text-muted-foreground">{t('settings.registers')}:</span>
              {b.registers.map((r) => (
                <button key={r.id} type="button" disabled={!canManage} onClick={() => setRegister({ branch: b, reg: r })}
                  className={cn('rounded-full border px-3 py-0.5 text-sm enabled:hover:bg-muted', r.status === 'INACTIVE' && 'text-muted-foreground line-through')}>
                  {r.name}
                </button>
              ))}
              {canManage && <Button variant="ghost" size="sm" onClick={() => setRegister({ branch: b, reg: null })}><Plus /> {t('settings.addRegister')}</Button>}
            </div>
          </div>
        ))}
      </div>
      <BranchDialog branch={editing === 'new' ? null : editing} open={!!editing} onOpenChange={(o) => !o && setEditing(null)} />
      <RegisterDialog target={register} onOpenChange={(o) => !o && setRegister(null)} />
    </Panel>
  );
}

function BranchDialog({ branch, open, onOpenChange }: { branch: ManagedBranch | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: TaxesApi.list, enabled: open });
  const empty: BranchInput = { code: '', name: '', address: '', city: '', phone: '', email: '', defaultTaxId: null, status: 'ACTIVE' };
  const [v, setV] = useState<BranchInput>(empty);
  useEffect(() => {
    if (open) setV(branch ? { code: branch.code, name: branch.name, address: branch.address ?? '', city: branch.city ?? '', phone: branch.phone ?? '', email: branch.email ?? '', defaultTaxId: branch.defaultTaxId, status: branch.status } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, branch]);
  const save = useMutation({
    mutationFn: () => (branch ? BranchAdminApi.update(branch.id, v) : BranchAdminApi.create(v)),
    onSuccess: () => {
      toast.success(branch ? t('common.updated') : t('common.created'));
      void qc.invalidateQueries({ queryKey: ['branches'] });
      onOpenChange(false);
    },
    onError: toastError,
  });
  const set = <K extends keyof BranchInput>(k: K, x: BranchInput[K]) => setV((p) => ({ ...p, [k]: x }));
  const valid = /^[A-Z0-9]{2,6}$/.test(v.code) && v.name.trim().length >= 2;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{branch ? t('settings.editBranch') : t('settings.newBranch')}</DialogTitle></DialogHeader>
        <form className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <FormField label={t('common.code')} htmlFor="b-code" required hint={t('settings.branchCodeHint')}>
            <Input id="b-code" className="font-mono uppercase" maxLength={6} value={v.code} onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
          </FormField>
          <FormField label={t('common.name')} htmlFor="b-name" required><Input id="b-name" value={v.name} onChange={(e) => set('name', e.target.value)} /></FormField>
          <FormField label={t('common.address')} htmlFor="b-addr" className="sm:col-span-2"><Input id="b-addr" value={v.address ?? ''} onChange={(e) => set('address', e.target.value)} /></FormField>
          <FormField label={t('settings.city')} htmlFor="b-city" className="sm:col-span-2"><Input id="b-city" value={v.city ?? ''} onChange={(e) => set('city', e.target.value)} /></FormField>
          <FormField label={t('common.phone')} htmlFor="b-phone" className="sm:col-span-2"><Input id="b-phone" type="tel" dir="ltr" value={v.phone ?? ''} onChange={(e) => set('phone', e.target.value)} /></FormField>
          <FormField label={t('settings.defaultTax')} className="sm:col-span-2">
            <Select value={v.defaultTaxId ?? 'none'} onValueChange={(x) => set('defaultTaxId', x === 'none' ? null : x)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {taxes.data?.filter((x) => x.status === 'ACTIVE').map((x) => <SelectItem key={x.id} value={x.id}>{x.name} ({Number(x.rate)} %)</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          {branch && !branch.isHeadOffice && (
            <div className="sm:col-span-2"><Toggle label={t('common.active')} checked={v.status === 'ACTIVE'} onChange={(on) => set('status', on ? 'ACTIVE' : 'INACTIVE')} /></div>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={!valid} loading={save.isPending}>{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RegisterDialog({ target, onOpenChange }: { target: { branch: ManagedBranch; reg: ManagedBranch['registers'][number] | null } | null; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  useEffect(() => {
    if (target) { setName(target.reg?.name ?? ''); setActive(target.reg?.status !== 'INACTIVE'); }
  }, [target]);
  const save = useMutation({
    mutationFn: () => {
      const body = { name, status: active ? 'ACTIVE' as const : 'INACTIVE' as const };
      return target!.reg ? BranchAdminApi.updateRegister(target!.branch.id, target!.reg.id, body) : BranchAdminApi.addRegister(target!.branch.id, body);
    },
    onSuccess: () => { toast.success(t('common.saved')); void qc.invalidateQueries({ queryKey: ['branches'] }); void qc.invalidateQueries({ queryKey: ['registers'] }); onOpenChange(false); },
    onError: toastError,
  });
  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{target?.reg ? t('settings.editRegister') : t('settings.addRegister')} · {target?.branch.name}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) save.mutate(); }}>
          <FormField label={t('common.name')} htmlFor="reg-name"><Input id="reg-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Caisse 2" /></FormField>
          {target?.reg && <Toggle label={t('common.active')} checked={active} onChange={setActive} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={name.trim().length < 2} loading={save.isPending}>{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsersLink() {
  const { t } = useTranslation();
  return (
    <Panel title={t('settings.s_users')} description={t('settings.usersHelp')}>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline"><Link to="/users"><Users /> {t('users.title')} <ExternalLink className="h-3.5 w-3.5" /></Link></Button>
        <Button asChild variant="outline"><Link to="/users?tab=roles">{t('users.rolesTitle')} <ExternalLink className="h-3.5 w-3.5" /></Link></Button>
        <Button asChild variant="outline"><Link to="/audit">{t('audit.title')} <ExternalLink className="h-3.5 w-3.5" /></Link></Button>
      </div>
    </Panel>
  );
}

// ───────────── taxes ─────────────
function TaxesSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: TaxesApi.list });
  const [editing, setEditing] = useState<Tax | 'new' | null>(null);
  const [v, setV] = useState({ name: '', code: '', rate: '', status: 'ACTIVE' as Tax['status'] });
  useEffect(() => {
    if (editing) setV(editing === 'new' ? { name: '', code: '', rate: '', status: 'ACTIVE' } : { name: editing.name, code: editing.code, rate: String(Number(editing.rate)), status: editing.status });
  }, [editing]);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...v, rate: num(v.rate) };
      return editing === 'new' ? TaxesApi.create(body) : TaxesApi.update((editing as Tax).id, body);
    },
    onSuccess: () => { toast.success(t('common.saved')); void qc.invalidateQueries({ queryKey: ['taxes'] }); setEditing(null); },
    onError: toastError,
  });
  const rate = Number(v.rate);
  const valid = v.name.trim() && v.code.trim() && v.rate !== '' && rate >= 0 && rate <= 100;
  return (
    <Panel title={t('settings.s_taxes')} description={t('settings.taxesHelp')}>
      <div className="mb-3 flex justify-end"><Button onClick={() => setEditing('new')}><Plus /> {t('settings.newTax')}</Button></div>
      <div className="divide-y rounded-lg border">
        {taxes.data?.map((x) => (
          <div key={x.id} className="flex items-center gap-3 p-3">
            <span className="w-16 font-mono text-xs text-muted-foreground">{x.code}</span>
            <span className="flex-1 font-medium">{x.name}</span>
            <span className="tabular font-semibold">{Number(x.rate)} %</span>
            <StatusBadge status={x.status} />
            <Button variant="ghost" size="icon" onClick={() => setEditing(x)} aria-label={t('common.edit')}><Pencil /></Button>
          </div>
        ))}
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing === 'new' ? t('settings.newTax') : t('settings.editTax')}</DialogTitle></DialogHeader>
          <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
            <FormField label={t('common.name')} htmlFor="tx-name" className="col-span-2"><Input id="tx-name" autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></FormField>
            <FormField label={t('common.code')} htmlFor="tx-code"><Input id="tx-code" className="font-mono uppercase" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} /></FormField>
            <FormField label={t('settings.rate')} htmlFor="tx-rate"><Input id="tx-rate" type="number" min={0} max={100} step="0.01" value={v.rate} onChange={(e) => setV({ ...v, rate: e.target.value })} /></FormField>
            {editing !== 'new' && <div className="col-span-2"><Toggle label={t('common.active')} checked={v.status === 'ACTIVE'} onChange={(on) => setV({ ...v, status: on ? 'ACTIVE' : 'INACTIVE' })} /></div>}
            {editing !== 'new' && <p className="col-span-2 text-xs text-muted-foreground">{t('settings.taxChangeHint')}</p>}
            <DialogFooter className="col-span-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={!valid} loading={save.isPending}>{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

// ───────────── currency ─────────────
function CurrencySection({ value }: { value: AppSettings['currency'] }) {
  const { t } = useTranslation();
  const { draft, set, footer } = useSettingDraft('currency', value);
  const preview = useMemo(() => {
    const before = { ...value };
    setCurrencyFormat(draft);
    const out = formatMoney(1234567.891);
    setCurrencyFormat(before);
    return out;
  }, [draft, value]);
  return (
    <Panel title={t('settings.s_currency')} description={t('settings.currencyHelp')} footer={footer}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('settings.currencyCode')} htmlFor="cu-code"><Input id="cu-code" maxLength={3} className="font-mono uppercase" value={draft.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></FormField>
        <FormField label={t('settings.currencySymbol')} htmlFor="cu-sym"><Input id="cu-sym" maxLength={8} value={draft.symbol} onChange={(e) => set('symbol', e.target.value)} /></FormField>
        <FormField label={t('settings.decimals')}>
          <Select value={String(draft.decimals)} onValueChange={(x) => set('decimals', Number(x))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{[0, 1, 2, 3].map((n) => <SelectItem key={n} value={String(n)}>{n === 0 ? "0 (1 000)" : `${n} (1 000,${"0".repeat(n)})`}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label={t('settings.symbolPosition')}>
          <Select value={draft.symbolPosition} onValueChange={(x) => set('symbolPosition', x as 'before' | 'after')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="before">{t('settings.before')}</SelectItem><SelectItem value="after">{t('settings.after')}</SelectItem></SelectContent>
          </Select>
        </FormField>
        <FormField label={t('settings.thousands')}>
          <Select value={draft.thousandsSeparator === '' ? 'none' : draft.thousandsSeparator === ' ' ? 'space' : draft.thousandsSeparator} onValueChange={(x) => set('thousandsSeparator', x === 'none' ? '' : x === 'space' ? ' ' : x)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value=",">1,000</SelectItem><SelectItem value="space">1 000</SelectItem><SelectItem value=".">1.000</SelectItem><SelectItem value="none">1000</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label={t('settings.preview')}><div className="flex h-10 items-center rounded-md bg-muted px-3 text-lg font-semibold tabular" dir="ltr">{preview}</div></FormField>
      </div>
    </Panel>
  );
}

// ───────────── payment methods ─────────────
const PM_TYPES = ['CASH', 'CARD', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CREDIT', 'OTHER'] as const;
function PaymentMethodsSection() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['payment-methods', 'admin'], queryFn: PaymentMethodAdminApi.list });
  const [editing, setEditing] = useState<AdminPaymentMethod | 'new' | null>(null);
  const empty: Omit<AdminPaymentMethod, 'id'> = { code: '', name: '', type: 'MOBILE_MONEY', provider: '', isActive: true, sortOrder: 0 };
  const [v, setV] = useState(empty);
  useEffect(() => {
    if (editing) setV(editing === 'new' ? { ...empty, sortOrder: (list.data?.length ?? 0) * 10 } : { ...editing, provider: editing.provider ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  const save = useMutation({
    mutationFn: () => {
      const body = { ...v, provider: v.provider || null };
      return editing === 'new' ? PaymentMethodAdminApi.create(body) : PaymentMethodAdminApi.update((editing as AdminPaymentMethod).id, body);
    },
    onSuccess: () => { toast.success(t('common.saved')); void qc.invalidateQueries({ queryKey: ['payment-methods'] }); setEditing(null); },
    onError: toastError,
  });
  const valid = /^[A-Z0-9_]{2,40}$/.test(v.code) && v.name.trim().length >= 2;
  return (
    <Panel title={t('settings.s_payments')} description={t('settings.paymentsHelp')}>
      <div className="mb-3 flex justify-end"><Button onClick={() => setEditing('new')}><Plus /> {t('settings.newPaymentMethod')}</Button></div>
      <div className="divide-y rounded-lg border">
        {list.data?.map((m) => (
          <div key={m.id} className={cn('flex items-center gap-3 p-3', !m.isActive && 'opacity-60')}>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{m.name}</div>
              <div className="font-mono text-xs text-muted-foreground">{m.code}{m.provider ? ` · ${m.provider}` : ''}</div>
            </div>
            <Badge variant="muted">{t(`settings.pm_${m.type}`)}</Badge>
            <StatusBadge status={m.isActive ? 'ACTIVE' : 'INACTIVE'} />
            <Button variant="ghost" size="icon" onClick={() => setEditing(m)} aria-label={t('common.edit')}><Pencil /></Button>
          </div>
        ))}
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing === 'new' ? t('settings.newPaymentMethod') : t('settings.editPaymentMethod')}</DialogTitle></DialogHeader>
          <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
            <FormField label={t('common.name')} htmlFor="pm-name" className="col-span-2"><Input id="pm-name" autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></FormField>
            <FormField label={t('common.code')} htmlFor="pm-code" hint={editing !== 'new' ? t('settings.codeLocked') : undefined}>
              <Input id="pm-code" className="font-mono uppercase" disabled={editing !== 'new'} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} />
            </FormField>
            <FormField label={t('settings.pmType')}>
              <Select value={v.type} onValueChange={(x) => setV({ ...v, type: x })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PM_TYPES.map((x) => <SelectItem key={x} value={x}>{t(`settings.pm_${x}`)}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
            <FormField label={t('settings.provider')} htmlFor="pm-prov"><Input id="pm-prov" value={v.provider ?? ''} onChange={(e) => setV({ ...v, provider: e.target.value })} placeholder="Airtel, Moov…" /></FormField>
            <FormField label={t('settings.sortOrder')} htmlFor="pm-sort"><Input id="pm-sort" type="number" min={0} value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: num(e.target.value) })} /></FormField>
            <div className="col-span-2"><Toggle label={t('common.active')} checked={v.isActive} onChange={(on) => setV({ ...v, isActive: on })} /></div>
            <DialogFooter className="col-span-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={!valid} loading={save.isPending}>{t('common.save')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

// ───────────── receipt / invoice / pos / printer / barcode ─────────────
function ReceiptSection({ value }: { value: AppSettings['receipt'] }) {
  const { t } = useTranslation();
  const { draft, set, footer } = useSettingDraft('receipt', value);
  return (
    <Panel title={t('settings.s_receipt')} description={t('settings.receiptHelp')} footer={footer}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('settings.paperWidth')}>
          <Select value={String(draft.paperWidth)} onValueChange={(x) => set('paperWidth', Number(x) as 58 | 80)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="58">58 mm</SelectItem><SelectItem value="80">80 mm</SelectItem></SelectContent>
          </Select>
        </FormField>
        <FormField label={t('settings.receiptFooter')} htmlFor="r-foot" className="sm:col-span-2">
          <textarea id="r-foot" rows={3} maxLength={300} value={draft.footer} onChange={(e) => set('footer', e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </FormField>
      </div>
      <div className="mt-2 divide-y">
        <Toggle label={t('settings.showLogo')} checked={draft.showLogo} onChange={(v) => set('showLogo', v)} />
        <Toggle label={t('settings.showTaxDetails')} checked={draft.showTaxDetails} onChange={(v) => set('showTaxDetails', v)} />
        <Toggle label={t('settings.showBarcode')} hint={t('settings.showBarcodeHint')} checked={draft.showBarcode} onChange={(v) => set('showBarcode', v)} />
        <Toggle label={t('settings.autoPrint')} hint={t('settings.autoPrintHint')} checked={draft.autoPrint} onChange={(v) => set('autoPrint', v)} />
      </div>
    </Panel>
  );
}

function InvoiceSection({ value }: { value: AppSettings['invoice'] }) {
  const { t } = useTranslation();
  const { draft, set, footer } = useSettingDraft('invoice', value);
  const example = draft.pattern
    .replace('{BRANCH}', 'NDJ').replace('{YEAR}', String(new Date().getFullYear())).replace('{SEQ}', '42'.padStart(draft.padding, '0'));
  const valid = draft.pattern.includes('{SEQ}');
  return (
    <Panel title={t('settings.s_invoice')} description={t('settings.invoiceHelp')} footer={footer}>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
        <FormField label={t('settings.pattern')} htmlFor="inv-p" error={valid ? undefined : t('settings.patternSeq')} hint={t('settings.patternHint')}>
          <Input id="inv-p" dir="ltr" className="font-mono" value={draft.pattern} onChange={(e) => set('pattern', e.target.value)} />
        </FormField>
        <FormField label={t('settings.padding')} htmlFor="inv-pad"><Input id="inv-pad" type="number" min={3} max={10} value={draft.padding} onChange={(e) => set('padding', Math.min(10, Math.max(3, num(e.target.value))))} /></FormField>
      </div>
      <div className="mt-4 rounded-lg bg-muted p-3 text-sm">{t('settings.preview')}: <span className="font-mono font-semibold" dir="ltr">{example}</span></div>
      <div className="mt-2"><Toggle label={t('settings.resetYearly')} checked={draft.resetYearly} onChange={(v) => set('resetYearly', v)} /></div>
    </Panel>
  );
}

function PosSection({ value }: { value: AppSettings['pos'] }) {
  const { t } = useTranslation();
  const { draft, set, footer } = useSettingDraft('pos', value);
  return (
    <Panel title={t('settings.s_pos')} description={t('settings.posHelp')} footer={footer}>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label={t('settings.largeDiscount')} htmlFor="pos-disc" hint={t('settings.largeDiscountHint')}><Input id="pos-disc" type="number" min={0} max={100} value={draft.largeDiscountPercent} onChange={(e) => set('largeDiscountPercent', num(e.target.value))} /></FormField>
        <FormField label={t('settings.quickProducts')} htmlFor="pos-quick"><Input id="pos-quick" type="number" min={6} max={200} value={draft.quickProductsLimit} onChange={(e) => set('quickProductsLimit', num(e.target.value))} /></FormField>
        <FormField label={t('settings.defaultPriceList')}>
          <Select value={draft.defaultPriceList} onValueChange={(x) => set('defaultPriceList', x as 'RETAIL' | 'WHOLESALE')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="RETAIL">{t('settings.retail')}</SelectItem><SelectItem value="WHOLESALE">{t('settings.wholesale')}</SelectItem></SelectContent>
          </Select>
        </FormField>
      </div>
      <div className="mt-2 divide-y">
        <Toggle label={t('settings.requireOpenRegister')} hint={t('settings.requireOpenRegisterHint')} checked={draft.requireOpenRegister} onChange={(v) => set('requireOpenRegister', v)} />
        <Toggle label={t('settings.allowNegativeStock')} hint={t('settings.allowNegativeStockHint')} checked={draft.allowNegativeStock} onChange={(v) => set('allowNegativeStock', v)} />
      </div>
    </Panel>
  );
}

function PrinterSection({ value }: { value: AppSettings['printer'] }) {
  const { t } = useTranslation();
  const { draft, setDraft, footer } = useSettingDraft('printer', value, 'branch');
  const esc = draft.type === 'ESCPOS';
  const branchName = useAuthStore((s) => s.user?.branches.find((b) => b.id === s.branchId)?.name);
  const test = useMutation({
    mutationFn: () => PrintApi.escpos(encodeTestPage(t('settings.testPrintBody'))),
    onSuccess: () => toast.success(t('settings.testPrintSent')),
    onError: toastError,
  });
  return (
    <Panel title={t('settings.s_printer')} description={t('settings.printerHelp', { branch: branchName ?? '' })}
      footer={<>{esc && <Button variant="outline" className="me-auto" onClick={() => test.mutate()} loading={test.isPending} disabled={JSON.stringify(draft) !== JSON.stringify(value)}><Printer /> {t('settings.testPrint')}</Button>}{footer}</>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['BROWSER', 'ESCPOS'] as const).map((type) => (
          <button key={type} type="button" onClick={() => setDraft({ ...draft, type, escpos: { ...draft.escpos, enabled: type === 'ESCPOS' } })}
            className={cn('rounded-lg border p-4 text-start transition-colors hover:bg-muted', draft.type === type && 'border-primary bg-primary/5 ring-1 ring-primary')}>
            <div className="font-semibold">{t(`settings.printer_${type}`)}</div>
            <div className="text-xs text-muted-foreground">{t(`settings.printer_${type}_help`)}</div>
          </button>
        ))}
      </div>
      {esc && (
        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
          <FormField label={t('settings.printerHost')} htmlFor="pr-host" hint={t('settings.printerHostHint')}>
            <Input id="pr-host" dir="ltr" className="font-mono" placeholder="192.168.1.50" value={draft.escpos.host ?? ''} onChange={(e) => setDraft({ ...draft, escpos: { ...draft.escpos, host: e.target.value || null } })} />
          </FormField>
          <FormField label={t('settings.printerPort')} htmlFor="pr-port"><Input id="pr-port" type="number" min={1} max={65535} value={draft.escpos.port} onChange={(e) => setDraft({ ...draft, escpos: { ...draft.escpos, port: num(e.target.value) } })} /></FormField>
        </div>
      )}
    </Panel>
  );
}

function BarcodeSection({ value }: { value: AppSettings['barcode'] }) {
  const { t } = useTranslation();
  const { draft, set, footer } = useSettingDraft('barcode', value);
  const valid = /^2\d$/.test(draft.internalPrefix);
  return (
    <Panel title={t('settings.s_barcode')} description={t('settings.barcodeHelp')} footer={footer}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('settings.barcodeFormat')}><Input value="EAN-13" disabled /></FormField>
        <FormField label={t('settings.internalPrefix')} htmlFor="bc-pre" error={valid ? undefined : t('settings.prefixRule')} hint={t('settings.prefixRule')}>
          <Input id="bc-pre" maxLength={2} className="font-mono" value={draft.internalPrefix} onChange={(e) => set('internalPrefix', e.target.value.replace(/\D/g, ''))} />
        </FormField>
      </div>
    </Panel>
  );
}

// ───────────── language, theme, notifications ─────────────
const TIMEZONES = ['Africa/Ndjamena', 'Africa/Lagos', 'Africa/Douala', 'Africa/Kinshasa', 'Africa/Khartoum', 'Africa/Cairo', 'Africa/Abidjan', 'Europe/Paris', 'UTC'];
function LocaleSection({ value }: { value: AppSettings['locale'] }) {
  const { t } = useTranslation();
  const { draft, set, footer } = useSettingDraft('locale', value);
  const langs = [['fr', 'Français'], ['ar', 'العربية'], ['en', 'English']] as const;
  const zones = TIMEZONES.includes(draft.timezone) ? TIMEZONES : [draft.timezone, ...TIMEZONES];
  return (
    <Panel title={t('settings.s_locale')} description={t('settings.localeHelp')} footer={footer}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('settings.defaultLanguage')}>
          <Select value={draft.default} onValueChange={(x) => set('default', x as 'fr')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{langs.filter(([c]) => draft.available.includes(c)).map(([c, n]) => <SelectItem key={c} value={c}>{n}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
        <FormField label={t('settings.timezone')} hint={t('settings.timezoneHint')}>
          <Select value={draft.timezone} onValueChange={(x) => set('timezone', x)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{zones.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
          </Select>
        </FormField>
      </div>
      <div className="mt-4 text-sm font-medium">{t('settings.availableLanguages')}</div>
      <div className="divide-y">
        {langs.map(([c, n]) => (
          <Toggle key={c} label={n} checked={draft.available.includes(c)} onChange={(on) => {
            const next = on ? [...draft.available, c] : draft.available.filter((x) => x !== c);
            if (!next.length) return;
            set('available', next);
            if (!next.includes(draft.default)) set('default', next[0]);
          }} />
        ))}
      </div>
    </Panel>
  );
}

function ThemeSection() {
  const { t } = useTranslation();
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const authed = useAuthStore((s) => !!s.user);
  const opts: { v: Theme; icon: typeof Sun }[] = [{ v: 'light', icon: Sun }, { v: 'dark', icon: Moon }, { v: 'system', icon: Monitor }];
  return (
    <Panel title={t('settings.s_theme')} description={t('settings.themeHelp')}>
      <div className="grid gap-3 sm:grid-cols-3">
        {opts.map(({ v, icon: Icon }) => (
          <button key={v} type="button" aria-pressed={theme === v}
            onClick={() => { setTheme(v); if (authed) void AuthApi.updatePreferences({ theme: v }).catch(() => undefined); }}
            className={cn('flex flex-col items-center gap-2 rounded-lg border p-5 transition-colors hover:bg-muted', theme === v && 'border-primary bg-primary/5 ring-1 ring-primary')}>
            <Icon className="h-6 w-6" />
            <span className="text-sm font-medium">{t(`header.${v}`)}</span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function NotificationsSection({ value }: { value: AppSettings['notifications'] }) {
  const { t } = useTranslation();
  const { draft, set, footer } = useSettingDraft('notifications', value);
  return (
    <Panel title={t('settings.s_notifications')} description={t('settings.notificationsHelp')} footer={footer}>
      <div className="divide-y">
        <Toggle label={t('settings.notifyLowStock')} hint={t('settings.notifyLowStockHint')} checked={draft.lowStock} onChange={(v) => set('lowStock', v)} />
        <Toggle label={t('settings.notifyLargeDiscount')} hint={t('settings.notifyLargeDiscountHint')} checked={draft.largeDiscount} onChange={(v) => set('largeDiscount', v)} />
      </div>
      <FormField label={t('settings.cashDiscrepancy')} htmlFor="n-cash" className="mt-3 max-w-xs" hint={t('settings.cashDiscrepancyHint')}>
        <Input id="n-cash" type="number" min={0} value={draft.cashDiscrepancyThreshold} onChange={(e) => set('cashDiscrepancyThreshold', num(e.target.value))} />
      </FormField>
    </Panel>
  );
}
