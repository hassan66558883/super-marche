import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Pencil, KeyRound, UserX, UserCheck, ShieldCheck, Trash2, Lock, Save } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable } from '@/components/shared/DataTable';
import { SearchInput } from '@/components/shared/SearchInput';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { FormField } from '@/components/shared/FormField';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { UsersApi, RolesApi } from '@/services/admin.api';
import { BranchesApi } from '@/services/stock.api';
import { useAuthStore, useCan } from '@/stores/auth.store';
import { formatDateTime } from '@/utils/format';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';
import type { AdminUser, Role } from '@/types/admin';

/** System roles are stored in French; show their translated name when one exists. */
const useRoleName = () => {
  const { t } = useTranslation();
  return useCallback((r: { code: string; name: string }) => t(`users.role_${r.code}`, { defaultValue: r.name }), [t]);
};

export default function UsersPage() {
  const { t } = useTranslation();
  const canRoles = useCan('roles.manage');
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'roles' ? 'roles' : 'users';
  const setTab = (v: string) => setParams(v === 'roles' ? { tab: v } : {}, { replace: true });
  return (
    <>
      <PageHeader title={t('users.title')} description={t('users.subtitle')} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="users">{t('users.title')}</TabsTrigger>
          <TabsTrigger value="roles">{t('users.rolesTitle')}</TabsTrigger>
        </TabsList>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="roles"><RolesTab editable={canRoles} /></TabsContent>
      </Tabs>
    </>
  );
}

// ───────────── users ─────────────
function UsersTab() {
  const { t } = useTranslation();
  const roleName = useRoleName();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user?.id);
  const canCreate = useCan('users.create');
  const canEdit = useCan('users.edit');
  const canDisable = useCan('users.delete');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [roleId, setRoleId] = useState('all');
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [toggling, setToggling] = useState<AdminUser | null>(null);
  const roles = useQuery({ queryKey: ['roles'], queryFn: RolesApi.list });
  const q = { page, pageSize: 25, search: search || undefined, status: status === 'all' ? undefined : status, roleId: roleId === 'all' ? undefined : roleId };
  const { data, isFetching } = useQuery({ queryKey: ['users', q], queryFn: () => UsersApi.list(q), placeholderData: keepPreviousData });
  const toggle = useMutation({
    mutationFn: (u: AdminUser) => UsersApi.setStatus(u.id, u.status === 'ACTIVE' && !u.locked ? 'INACTIVE' : 'ACTIVE'),
    onSuccess: () => { toast.success(t('common.updated')); setToggling(null); void qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: toastError,
  });

  const columns = useMemo<ColumnDef<AdminUser, unknown>[]>(() => [
    {
      id: 'name', header: t('users.fullName'),
      cell: ({ row: { original: u } }) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
            {u.fullName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{u.fullName}{u.id === me && <span className="ms-1.5 text-xs text-muted-foreground">({t('users.you')})</span>}</div>
            <div className="truncate text-xs text-muted-foreground">{u.username}{u.email ? ` · ${u.email}` : ''}</div>
          </div>
        </div>
      ),
    },
    { id: 'roles', header: t('users.roles'), cell: ({ row }) => <div className="flex flex-wrap gap-1">{row.original.roles.map((r) => <Badge key={r.id} variant={r.code === 'SUPER_ADMIN' ? 'default' : 'muted'}>{roleName(r)}</Badge>)}</div> },
    { id: 'branches', header: t('users.branches'), cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.branches.map((b) => b.code).join(', ')}</span> },
    { id: 'lastLogin', header: t('users.lastLogin'), cell: ({ row }) => <span className="whitespace-nowrap text-sm text-muted-foreground">{row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : t('users.never')}</span> },
    { id: 'status', header: t('common.status'), cell: ({ row }) => <StatusBadge status={row.original.locked ? 'LOCKED' : row.original.status} ns="users.status" /> },
    {
      id: 'actions', header: '', meta: { className: 'w-0' },
      cell: ({ row: { original: u } }) => (canEdit || canDisable) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">{t('common.actions')}</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEdit && <DropdownMenuItem onSelect={() => setEditing(u)}><Pencil /> {t('common.edit')}</DropdownMenuItem>}
            {canEdit && <DropdownMenuItem onSelect={() => setResetting(u)}><KeyRound /> {t('users.resetPassword')}</DropdownMenuItem>}
            {canDisable && u.id !== me && (
              <DropdownMenuItem onSelect={() => setToggling(u)} className={cn(u.status === 'ACTIVE' && !u.locked && 'text-destructive')}>
                {u.status === 'ACTIVE' && !u.locked ? <><UserX /> {t('users.disable')}</> : <><UserCheck /> {u.locked ? t('users.unlock') : t('users.enable')}</>}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ], [t, me, canEdit, canDisable, roleName]);

  return (
    <>
      <div className="mb-4 flex flex-col flex-wrap gap-2 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('users.searchPlaceholder')} className="lg:w-72" />
        <Select value={roleId} onValueChange={(v) => { setRoleId(v); setPage(1); }}>
          <SelectTrigger className="lg:w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('users.roles')}: {t('common.all')}</SelectItem>
            {roles.data?.map((r) => <SelectItem key={r.id} value={r.id}>{roleName(r)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.status')}: {t('common.all')}</SelectItem>
            <SelectItem value="ACTIVE">{t('users.statusACTIVE')}</SelectItem>
            <SelectItem value="INACTIVE">{t('users.statusINACTIVE')}</SelectItem>
            <SelectItem value="LOCKED">{t('users.statusLOCKED')}</SelectItem>
          </SelectContent>
        </Select>
        {canCreate && <Button className="lg:ms-auto" onClick={() => setEditing('new')}><Plus /> {t('users.new')}</Button>}
      </div>
      <DataTable columns={columns} data={data?.items} loading={isFetching && !data} page={page} pageSize={25} total={data?.meta.total} onPageChange={setPage}
        rowClassName={(u) => (u.status === 'INACTIVE' ? 'opacity-60' : undefined)} />
      <UserFormDialog open={!!editing} user={editing === 'new' ? null : editing} roles={roles.data ?? []} onOpenChange={(o) => !o && setEditing(null)} />
      <ResetPasswordDialog user={resetting} onOpenChange={(o) => !o && setResetting(null)} />
      <ConfirmDialog open={!!toggling} onOpenChange={(o) => !o && setToggling(null)}
        title={toggling ? (toggling.status === 'ACTIVE' && !toggling.locked ? t('users.disableTitle', { name: toggling.fullName }) : t('users.enableTitle', { name: toggling.fullName })) : ''}
        description={toggling?.status === 'ACTIVE' && !toggling.locked ? t('users.disableHelp') : undefined}
        destructive={toggling?.status === 'ACTIVE' && !toggling?.locked} loading={toggle.isPending} onConfirm={() => { if (toggling) toggle.mutate(toggling); }} />
    </>
  );
}

const passwordRule = z.string().min(8).regex(/[A-Za-z]/).regex(/[0-9]/);

function UserFormDialog({ open, user, roles, onOpenChange }: { open: boolean; user: AdminUser | null; roles: Role[]; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const roleName = useRoleName();
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user?.id);
  const branches = useQuery({ queryKey: ['branches'], queryFn: BranchesApi.list, enabled: open });
  const schema = useMemo(() => z.object({
    fullName: z.string().trim().min(2),
    username: z.string().trim().toLowerCase().min(3).regex(/^[a-z0-9._-]+$/),
    email: z.string().trim().email().or(z.literal('')),
    phone: z.string().trim(),
    password: user ? z.string().optional() : passwordRule,
    roleIds: z.array(z.string()).min(1),
    branchIds: z.array(z.string()).min(1),
    defaultBranchId: z.string().min(1),
    locale: z.enum(['fr', 'ar', 'en']),
  }).refine((v) => v.branchIds.includes(v.defaultBranchId), { path: ['defaultBranchId'] }), [user]);
  type Values = z.infer<typeof schema>;
  const { register, handleSubmit, reset, control, watch, setValue, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset({
      fullName: user?.fullName ?? '', username: user?.username ?? '', email: user?.email ?? '', phone: user?.phone ?? '', password: '',
      roleIds: user?.roles.map((r) => r.id) ?? [], branchIds: user?.branches.map((b) => b.id) ?? [],
      defaultBranchId: user?.defaultBranchId ?? '', locale: user?.locale ?? 'fr',
    });
  }, [open, user, reset]);

  const branchIds = watch('branchIds') ?? [];
  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = { ...v, email: v.email || null, phone: v.phone || null, password: user ? undefined : v.password };
      return user ? UsersApi.update(user.id, body) : UsersApi.create(body);
    },
    onSuccess: () => { toast.success(user ? t('common.updated') : t('common.created')); void qc.invalidateQueries({ queryKey: ['users'] }); onOpenChange(false); },
    onError: toastError,
  });
  const self = user?.id === me;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{user ? t('users.edit') : t('users.new')}</DialogTitle></DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
          <FormField label={t('users.fullName')} htmlFor="u-name" required error={errors.fullName && t('common.required')}>
            <Input id="u-name" autoFocus {...register('fullName')} aria-invalid={!!errors.fullName} />
          </FormField>
          <FormField label={t('users.username')} htmlFor="u-username" required error={errors.username && t('users.usernameRule')}>
            <Input id="u-username" autoComplete="off" {...register('username')} aria-invalid={!!errors.username} />
          </FormField>
          <FormField label={t('common.email')} htmlFor="u-email" error={errors.email && t('suppliers.invalidEmail')}><Input id="u-email" type="email" {...register('email')} /></FormField>
          <FormField label={t('common.phone')} htmlFor="u-phone"><Input id="u-phone" type="tel" {...register('phone')} /></FormField>
          {!user && (
            <FormField label={t('users.tempPassword')} htmlFor="u-pass" required className="sm:col-span-2" error={errors.password && t('users.passwordRule')} hint={t('users.passwordRule')}>
              <Input id="u-pass" type="password" autoComplete="new-password" {...register('password')} aria-invalid={!!errors.password} />
            </FormField>
          )}
          <FormField label={t('users.roles')} required className="sm:col-span-2" error={errors.roleIds && t('users.pickRole')} hint={self ? t('users.selfRoles') : undefined}>
            <Controller control={control} name="roleIds" render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => {
                  const on = field.value?.includes(r.id);
                  return (
                    <button type="button" key={r.id} disabled={self} aria-pressed={on}
                      onClick={() => field.onChange(on ? field.value.filter((x) => x !== r.id) : [...(field.value ?? []), r.id])}
                      className={cn('rounded-full border px-3 py-1 text-sm transition-colors disabled:opacity-60', on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                      {roleName(r)}
                    </button>
                  );
                })}
              </div>
            )} />
          </FormField>
          <FormField label={t('users.branches')} required className="sm:col-span-2" error={errors.branchIds && t('users.pickBranch')}>
            <Controller control={control} name="branchIds" render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {branches.data?.map((b) => {
                  const on = field.value?.includes(b.id);
                  return (
                    <button type="button" key={b.id} aria-pressed={on}
                      onClick={() => {
                        const next = on ? field.value.filter((x) => x !== b.id) : [...(field.value ?? []), b.id];
                        field.onChange(next);
                        if (next.length === 1 || !next.includes(watch('defaultBranchId'))) setValue('defaultBranchId', next[0] ?? '');
                      }}
                      className={cn('rounded-full border px-3 py-1 text-sm transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                      {b.name}
                    </button>
                  );
                })}
              </div>
            )} />
          </FormField>
          <FormField label={t('users.defaultBranch')} required error={errors.defaultBranchId && t('common.required')}>
            <Controller control={control} name="defaultBranchId" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{branches.data?.filter((b) => branchIds.includes(b.id)).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            )} />
          </FormField>
          <FormField label={t('header.language')}>
            <Controller control={control} name="locale" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="fr">Français</SelectItem><SelectItem value="ar">العربية</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
              </Select>
            )} />
          </FormField>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={save.isPending}>{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onOpenChange }: { user: AdminUser | null; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  useEffect(() => { if (user) setPassword(''); }, [user]);
  const valid = passwordRule.safeParse(password).success;
  const m = useMutation({
    mutationFn: () => UsersApi.resetPassword(user!.id, password),
    onSuccess: () => { toast.success(t('users.passwordReset')); onOpenChange(false); },
    onError: toastError,
  });
  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('users.resetPassword')}</DialogTitle>
          <DialogDescription>{user && t('users.resetHelp', { name: user.fullName })}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); if (valid) m.mutate(); }} className="space-y-4">
          <FormField label={t('users.newPassword')} htmlFor="rp-pass" hint={t('users.passwordRule')}>
            <Input id="rp-pass" type="password" autoComplete="new-password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={!valid} loading={m.isPending}><KeyRound /> {t('users.resetPassword')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── roles & permissions ─────────────
function RolesTab({ editable }: { editable: boolean }) {
  const { t, i18n } = useTranslation();
  const roleName = useRoleName();
  const qc = useQueryClient();
  const myPerms = useAuthStore((s) => s.user?.permissions ?? []);
  const isSuper = useAuthStore((s) => s.user?.roles?.some((r) => (typeof r === 'string' ? r : r.code) === 'SUPER_ADMIN') ?? false);
  const roles = useQuery({ queryKey: ['roles'], queryFn: RolesApi.list });
  const perms = useQuery({ queryKey: ['permissions'], queryFn: RolesApi.permissions });
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<{ code: string; name: string; description: string; maxDiscountPercent: string; permissions: string[] } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const role = roles.data?.find((r) => r.id === selected) ?? null;

  useEffect(() => {
    if (!roles.data?.length) return;
    if (selected === null) setSelected(roles.data[0].id);
  }, [roles.data, selected]);
  useEffect(() => {
    if (selected === 'new') setDraft({ code: '', name: '', description: '', maxDiscountPercent: '0', permissions: [] });
    else if (role) setDraft({ code: role.code, name: role.name, description: role.description ?? '', maxDiscountPercent: role.maxDiscountPercent, permissions: role.permissions });
  }, [selected, role]);

  const modules = useMemo(() => {
    const m = new Map<string, { code: string; description: string }[]>();
    for (const p of perms.data ?? []) m.set(p.module, [...(m.get(p.module) ?? []), p]);
    return [...m.entries()];
  }, [perms.data]);
  const locked = !editable || role?.code === 'SUPER_ADMIN';
  const canGrant = (code: string) => isSuper || myPerms.includes(code);

  const save = useMutation({
    mutationFn: () => {
      const body = { code: draft!.code, name: draft!.name, description: draft!.description || null, maxDiscountPercent: Number(draft!.maxDiscountPercent || 0), permissions: draft!.permissions };
      return selected === 'new' ? RolesApi.create(body) : RolesApi.update(selected!, body);
    },
    onSuccess: (r) => { toast.success(t('common.saved')); void qc.invalidateQueries({ queryKey: ['roles'] }); setSelected(r.id); },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: () => RolesApi.remove(selected!),
    onSuccess: () => { toast.success(t('common.deleted')); setDeleting(false); setSelected(null); void qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: toastError,
  });
  const toggle = (code: string, on: boolean) => setDraft((d) => d && ({ ...d, permissions: on ? [...d.permissions, code] : d.permissions.filter((x) => x !== code) }));
  const dirty = draft && (selected === 'new' || (role && (draft.name !== role.name || draft.description !== (role.description ?? '') || Number(draft.maxDiscountPercent) !== Number(role.maxDiscountPercent) || [...draft.permissions].sort().join() !== role.permissions.join())));

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="h-fit p-2">
        <ul>
          {roles.data?.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setSelected(r.id)}
                className={cn('flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-sm hover:bg-muted', selected === r.id && 'bg-primary/10 font-semibold text-primary hover:bg-primary/10')}>
                {r.isSystem ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <span className="h-4 w-4 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{roleName(r)}</span>
                <span className="text-xs text-muted-foreground">{t('users.userCount', { count: r.userCount })}</span>
              </button>
            </li>
          ))}
        </ul>
        {editable && <Button variant="outline" className="mt-2 w-full" onClick={() => setSelected('new')}><Plus /> {t('users.newRole')}</Button>}
      </Card>

      {draft && (
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_140px]">
            <FormField label={t('common.name')} htmlFor="r-name"><Input id="r-name" value={draft.name} disabled={locked} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></FormField>
            <FormField label={t('users.roleCode')} htmlFor="r-code" hint={role?.isSystem ? t('users.systemRole') : undefined}>
              <Input id="r-code" value={draft.code} disabled={locked || !!role?.isSystem} className="font-mono uppercase" onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })} />
            </FormField>
            <FormField label={t('users.maxDiscount')} htmlFor="r-disc"><Input id="r-disc" type="number" min={0} max={100} value={draft.maxDiscountPercent} disabled={locked} onChange={(e) => setDraft({ ...draft, maxDiscountPercent: e.target.value })} /></FormField>
            <FormField label={t('common.description')} htmlFor="r-desc" className="sm:col-span-3"><Input id="r-desc" value={draft.description} disabled={locked} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></FormField>
          </div>
          {role?.code === 'SUPER_ADMIN' && <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><Lock className="h-3.5 w-3.5" />{t('users.superAdminLocked')}</p>}

          <div className="mt-5 flex items-center justify-between">
            <h3 className="font-semibold">{t('users.permissions')} <span className="text-sm font-normal text-muted-foreground">({draft.permissions.length})</span></h3>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {modules.map(([module, list]) => {
              const all = list.every((p) => draft.permissions.includes(p.code));
              return (
                <div key={module} className="rounded-lg border p-3">
                  <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={all} disabled={locked || list.some((p) => !canGrant(p.code))}
                      onChange={(e) => list.forEach((p) => toggle(p.code, e.target.checked) )} />
                    {t(`users.module_${module}`, { defaultValue: module })}
                  </label>
                  <ul className="space-y-1.5">
                    {list.map((p) => (
                      <li key={p.code}>
                        <label className={cn('flex items-start gap-2 text-sm', (!canGrant(p.code) && !locked) && 'opacity-50')}>
                          <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" checked={draft.permissions.includes(p.code)} disabled={locked || !canGrant(p.code)}
                            onChange={(e) => toggle(p.code, e.target.checked)} />
                          <span>
                            {t(`perm.${p.code.replace('.', '_')}`, { defaultValue: p.description })}
                            {i18n.language !== 'fr' && <span className="ms-1 font-mono text-[10px] text-muted-foreground">{p.code}</span>}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          {!locked && (
            <div className="mt-4 flex items-center justify-end gap-2 border-t pt-4">
              {role && !role.isSystem && <Button variant="ghost" className="me-auto text-destructive" onClick={() => setDeleting(true)} disabled={role.userCount > 0} title={role.userCount ? t('users.roleInUse') : undefined}><Trash2 /> {t('common.delete')}</Button>}
              <Button onClick={() => save.mutate()} disabled={!dirty || draft.name.trim().length < 2 || draft.code.length < 2} loading={save.isPending}><Save /> {t('common.save')}</Button>
            </div>
          )}
        </Card>
      )}
      <ConfirmDialog open={deleting} onOpenChange={setDeleting} title={t('users.deleteRole', { name: role ? roleName(role) : '' })} destructive loading={remove.isPending} onConfirm={() => remove.mutate()} />
    </div>
  );
}
