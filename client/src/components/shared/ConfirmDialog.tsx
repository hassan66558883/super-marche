import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  loading?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, requireReason, loading, onConfirm }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setReason(''); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title ?? t('common.confirmTitle')}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {requireReason && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-reason">{t('common.reason')} *</Label>
            <Textarea id="confirm-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            loading={loading}
            disabled={requireReason && reason.trim().length < 3}
            onClick={async () => { await onConfirm(reason.trim()); setReason(''); }}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
