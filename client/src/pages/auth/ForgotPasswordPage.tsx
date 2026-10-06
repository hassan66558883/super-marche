import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/shared/FormField';
import { AuthApi } from '@/services/auth.service';
import { toastError } from '@/utils/errors';
import { AuthShell } from './AuthShell';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell>
      <h1 className="text-2xl font-bold tracking-tight">{t('auth.forgotTitle')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('auth.forgotHelp')}</p>
      {sent ? (
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> {sent}
        </div>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!identifier.trim()) return;
            setBusy(true);
            try {
              setSent((await AuthApi.forgotPassword(identifier)).message);
            } catch (err) {
              toastError(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <FormField label={t('auth.identifier')} htmlFor="fp-id">
            <Input id="fp-id" className="h-11" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoFocus />
          </FormField>
          <Button type="submit" size="lg" className="w-full" loading={busy}>{t('auth.sendLink')}</Button>
        </form>
      )}
      <Link to="/login" className="mt-6 inline-block text-sm font-medium text-primary hover:underline">← {t('auth.backToLogin')}</Link>
    </AuthShell>
  );
}
