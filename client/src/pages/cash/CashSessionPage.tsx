import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { CashApi } from '@/services/sales.api';
import { formatDateTime } from '@/utils/format';
import { SessionView } from './SessionView';

export default function CashSessionPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: s } = useQuery({ queryKey: ['cash', 'session', id], queryFn: () => CashApi.session(id!) });
  if (!s) return <Skeleton className="h-96" />;
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3">{s.session.register.name} <StatusBadge status={s.session.status} ns="cash.status" /></span>}
        description={`${s.session.openedBy.fullName} · ${formatDateTime(s.session.openedAt)}${s.session.closedAt ? ` → ${formatDateTime(s.session.closedAt)}` : ''}`}
        actions={<Button variant="outline" asChild><Link to="/cash?tab=history"><ArrowLeft className="flip-rtl" /> {t('common.back')}</Link></Button>}
      />
      <SessionView summary={s} onChanged={(z) => {
        if (z) qc.setQueryData(['cash', 'session', id], { ...z, movements: s.movements });
        void qc.invalidateQueries({ queryKey: ['cash'] });
      }} />
    </>
  );
}
