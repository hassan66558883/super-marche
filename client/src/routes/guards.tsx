import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldX } from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { homePath } from './nav';

export function RequireAuth() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  if (status === 'unknown') return <FullScreenLoader />;
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Frontend guard mirrors backend RBAC (the API still enforces every permission). */
export function RequirePermission({ permission, anyOf, children }: { permission?: string; anyOf?: string[]; children: React.ReactNode }) {
  const perms = useAuthStore((s) => s.user?.permissions ?? []);
  const allowed = (!permission || perms.includes(permission)) && (!anyOf || anyOf.some((p) => perms.includes(p)));
  return allowed ? <>{children}</> : <Forbidden />;
}

export function HomeRedirect({ children }: { children: React.ReactNode }) {
  const perms = useAuthStore((s) => s.user?.permissions ?? []);
  if (!perms.includes('dashboard.view')) return <Navigate to={homePath(perms)} replace />;
  return <>{children}</>;
}

export function Forbidden() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldX className="h-7 w-7" />
      </span>
      <h1 className="text-xl font-bold">{t('errors.forbiddenPage')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('errors.forbiddenHelp')}</p>
      <Button asChild className="mt-6" variant="outline">
        <Link to="/">{t('errors.goHome')}</Link>
      </Button>
    </div>
  );
}

export function FullScreenLoader() {
  return (
    <div className="flex h-full items-center justify-center" role="status" aria-label="Chargement">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
    </div>
  );
}
