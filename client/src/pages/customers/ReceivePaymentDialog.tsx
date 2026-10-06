import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/shared/FormField';
import { Money } from '@/components/shared/Money';
import { CustomersApi } from '@/services/catalog.api';
import { PaymentMethodsApi } from '@/services/sales.api';
import { D } from '@/utils/money';
import { toastError } from '@/utils/errors';
import type { Customer } from '@/types/catalog';

export function ReceivePaymentDialog({ open, customer, onOpenChange }: { open: boolean; customer: Customer; onOpenChange: (o: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: PaymentMethodsApi.list, enabled: open });
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  useEffect(() => { if (open) { setAmount(D(customer.balance).toFixed()); setReference(''); setMethod('CASH'); } }, [open, customer.balance]);

  const pay = useMutation({
    mutationFn: () => CustomersApi.receivePayment(customer.id, { amount: Number(amount), method, reference: reference || undefined }),
    onSuccess: () => {
      toast.success(t('customers.paymentReceived'));
      void qc.invalidateQueries({ queryKey: ['customer', customer.id] });
      void qc.invalidateQueries({ queryKey: ['customers'] });
      onOpenChange(false);
    },
    onError: toastError,
  });
  const valid = D(amount).gt(0) && D(amount).lte(D(customer.balance));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('customers.receivePayment')}</DialogTitle>
          <DialogDescription>{customer.name} — {t('customers.balance')}: <Money value={customer.balance} className="font-semibold text-foreground" /></DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid) pay.mutate(); }}>
          <FormField label={t('common.amount')} htmlFor="pay-amount" required>
            <Input id="pay-amount" type="number" min={1} step="any" inputMode="decimal" className="h-12 text-lg font-semibold" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </FormField>
          <FormField label={t('expenses.paymentMethod')} htmlFor="pay-method">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="pay-method"><SelectValue /></SelectTrigger>
              <SelectContent>
                {methods.data?.filter((m) => m.type !== 'CREDIT' && m.isActive).map((m) => <SelectItem key={m.code} value={m.code}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormField>
          {method !== 'CASH' && (
            <FormField label={t('pos.paymentReference')} htmlFor="pay-ref"><Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} /></FormField>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="secondary" loading={pay.isPending} disabled={!valid}>{t('common.confirm')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
