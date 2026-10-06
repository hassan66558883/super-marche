import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/shared/FormField';
import { AuthApi } from '@/services/auth.service';
import { toastError } from '@/utils/errors';
import { AuthShell } from './AuthShell';

export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = pw2.length > 0 && pw !== pw2;
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold tracking-tight">{t('auth.resetTitle')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('auth.passwordRules')}</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (mismatch || pw.length < 8) return;
          setBusy(true);
          try {
            await AuthApi.resetPassword(params.get('token') ?? '', pw);
            toast.success(t('auth.passwordChanged'));
            navigate('/login', { replace: true });
          } catch (err) {
            toastError(err);
          } finally {
            setBusy(false);
          }
        }}
      >
        <FormField label={t('auth.newPassword')} htmlFor="np">
          <Input id="np" type="password" autoComplete="new-password" className="h-11" value={pw} onChange={(e) => setPw(e.target.value)} />
        </FormField>
        <FormField label={t('auth.confirmPassword')} htmlFor="np2" error={mismatch ? t('auth.passwordMismatch') : undefined}>
          <Input id="np2" type="password" autoComplete="new-password" className="h-11" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!pw || mismatch}>{t('common.save')}</Button>
      </form>
      <Link to="/login" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">← {t('auth.backToLogin')}</Link>
    </AuthShell>
  );
}
