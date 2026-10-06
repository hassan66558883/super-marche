import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';

export default function DashboardPage() {
  const { t } = useTranslation();
  return <PageHeader title={t('dashboard.title')} description={t('dashboard.subtitle')} />;
}
