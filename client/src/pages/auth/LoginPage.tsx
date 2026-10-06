import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { FormField } from '@/components/shared/FormField';
import { AuthApi } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import { applyLanguage } from '@/i18n';
import { useUiStore } from '@/stores/ui.store';
import { errorMessage } from '@/utils/errors';
import { homePath } from '@/routes/nav';
import { AuthShell } from './AuthShell';

const schema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
  rememberMe: z.boolean(),
});
type Values = z.infer<typeof schema>;

const DEV_ACCOUNTS = [
  { u: 'admin', p: 'Admin@2026', r: 'Admin' },
  { u: 'manager', p: 'Manager@2026', r: 'Gérant' },
  { u: 'cashier', p: 'Caisse@2026', r: 'Caissier' },
];

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, setValue, watch, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: '', password: '', rememberMe: true },
  });

  if (status === 'authenticated' && user) return <Navigate to={homePath(user.permissions)} replace />;

  const onSubmit = async (v: Values) => {
    setError(null);
    try {
      const u = await AuthApi.login(v.identifier, v.password, v.rememberMe);
      applyLanguage(u.locale);
      useUiStore.getState().setTheme(u.theme);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : homePath(u.permissions), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <AuthShell>
      <h1 className="text-2xl font-bold tracking-tight">{t('auth.loginTitle')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('auth.loginSubtitle')}</p>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <FormField label={t('auth.identifier')} htmlFor="identifier" error={formState.errors.identifier && t('common.required')}>
          <Input id="identifier" autoComplete="username" autoFocus className="h-11" {...register('identifier')} aria-invalid={!!formState.errors.identifier} />
        </FormField>
        <FormField label={t('auth.password')} htmlFor="password" error={formState.errors.password && t('common.required')}>
          <div className="relative">
            <Input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" className="h-11 pe-11" {...register('password')} aria-invalid={!!formState.errors.password} />
            <button
              type="button"
              className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
              onClick={() => setShowPw((s) => !s)}
              aria-label={showPw ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </FormField>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox id="remember" checked={watch('rememberMe')} onCheckedChange={(c) => setValue('rememberMe', c === true)} />
            <Label htmlFor="remember" className="cursor-pointer font-normal">{t('auth.rememberMe')}</Label>
          </div>
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">{t('auth.forgotPassword')}</Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          {!formState.isSubmitting && <LogIn />} {t('auth.signIn')}
        </Button>
      </form>

      {import.meta.env.DEV && (
        <div className="mt-8 rounded-xl border border-dashed p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('auth.devAccounts')}</p>
          <div className="grid grid-cols-3 gap-2">
            {DEV_ACCOUNTS.map((a) => (
              <button
                key={a.u}
                type="button"
                className="rounded-lg border bg-card px-2 py-2 text-start text-xs hover:border-primary hover:bg-accent"
                onClick={() => {
                  setValue('identifier', a.u);
                  setValue('password', a.p);
                }}
              >
                <span className="block font-semibold">{a.u}</span>
                <span className="text-muted-foreground">{a.r}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  );
}
