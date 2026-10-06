import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Monitor, ShieldCheck, KeyRound, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/shared/FormField';
import { PageHeader } from '@/components/shared/PageHeader';
import { AuthApi } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import { formatDateTime } from '@/utils/format';
import { toastError } from '@/utils/errors';

export default function ProfilePage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user)!;
  const qc = useQueryClient();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');

  useEffect(() => {
    if (location.hash === '#password') document.getElementById('password')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const sessions = useQuery({ queryKey: ['sessions'], queryFn: AuthApi.sessions });
  const revoke = useMutation({
    mutationFn: AuthApi.revokeSession,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
    onError: toastError,
  });
  const change = useMutation({
    mutationFn: () => AuthApi.changePassword(cur, pw),
    onSuccess: () => {
      toast.success(t('auth.passwordChanged'));
      setCur(''); setPw(''); setPw2('');
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: toastError,
  });
  const setDefaultBranch = useMutation({
    mutationFn: (id: string) => AuthApi.updatePreferences({ defaultBranchId: id }),
    onSuccess: () => toast.success(t('common.saved')),
    onError: toastError,
  });
  const mismatch = pw2.length > 0 && pw !== pw2;

  return (
    <>
      <PageHeader title={t('auth.profile')} description={`@${user.username}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> {user.fullName}</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {user.roles.map((r) => <Badge key={r.code}>{r.name}</Badge>)}
            </div>
            <FormField label={<span className="flex items-center gap-2"><Building2 className="h-4 w-4" /> {t('users.defaultBranch')}</span>}>
              <Select defaultValue={user.defaultBranchId ?? undefined} onValueChange={(v) => setDefaultBranch.mutate(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {user.branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <p className="text-xs text-muted-foreground">{t('users.permissions')}: {user.permissions.length}</p>
          </CardContent>
        </Card>

        <Card id="password">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /> {t('auth.changePassword')}</CardTitle>
            <CardDescription>{t('auth.passwordRules')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!mismatch && pw) change.mutate(); }}>
              <FormField label={t('auth.currentPassword')} htmlFor="cur">
                <Input id="cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
              </FormField>
              <FormField label={t('auth.newPassword')} htmlFor="new">
                <Input id="new" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              </FormField>
              <FormField label={t('auth.confirmPassword')} htmlFor="new2" error={mismatch ? t('auth.passwordMismatch') : undefined}>
                <Input id="new2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
              </FormField>
              <Button type="submit" loading={change.isPending} disabled={!cur || !pw || mismatch}>{t('common.save')}</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Monitor className="h-4 w-4 text-primary" /> {t('auth.sessions')}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {sessions.data?.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.userAgent ?? t('common.unknown')}</div>
                  <div className="text-xs text-muted-foreground">{s.ipAddress} · {formatDateTime(s.lastUsedAt)}</div>
                </div>
                {s.current ? <Badge variant="success">{t('auth.currentSession')}</Badge> : (
                  <Button variant="outline" size="sm" onClick={() => revoke.mutate(s.id)}>{t('auth.revoke')}</Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
