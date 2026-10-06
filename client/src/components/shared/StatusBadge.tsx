import { useTranslation } from 'react-i18next';
import { Badge, type BadgeVariant } from '@/components/ui/badge';

const TONES: Record<string, BadgeVariant> = {
  ACTIVE: 'success', INACTIVE: 'muted', LOCKED: 'destructive',
  COMPLETED: 'success', CANCELLED: 'destructive', REFUNDED: 'warning', PARTIALLY_REFUNDED: 'warning',
  PAID: 'success', PARTIAL: 'warning', CREDIT: 'default',
  DRAFT: 'muted', PENDING: 'warning', REQUESTED: 'warning', APPROVED: 'default', IN_TRANSIT: 'default', RECEIVED: 'success',
  OPEN: 'success', CLOSED: 'muted', RECORDED: 'success', VOID: 'destructive',
};

/** Status pill: `ns` picks the translation namespace prefix, e.g. ns="sales.status" → sales.statusCOMPLETED */
export function StatusBadge({ status, ns }: { status: string; ns?: string }) {
  const { t, i18n } = useTranslation();
  const key = ns ? `${ns}${status}` : status === 'ACTIVE' ? 'common.active' : status === 'INACTIVE' ? 'common.inactive' : '';
  const label = key && i18n.exists(key) ? t(key) : status;
  return <Badge variant={TONES[status] ?? 'muted'}>{label}</Badge>;
}
