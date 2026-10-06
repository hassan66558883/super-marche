import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="text-7xl font-black tracking-tight text-primary/20">404</div>
      <h1 className="mt-2 text-xl font-bold">{t('errors.notFoundPage')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('errors.notFoundHelp')}</p>
      <Button asChild className="mt-6"><Link to="/">{t('errors.goHome')}</Link></Button>
    </div>
  );
}
