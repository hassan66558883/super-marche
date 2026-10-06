import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from './FormField';
import { CustomersApi } from '@/services/catalog.api';
import { toastError } from '@/utils/errors';
import { useCan } from '@/stores/auth.store';
import type { Customer } from '@/types/catalog';

const schema = z.object({
  type: z.enum(['WALK_IN', 'REGISTERED', 'BUSINESS']),
  name: z.string().trim().min(1),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().or(z.literal('')).optional(),
  address: z.string().optional(),
  taxId: z.string().optional(),
  creditLimit: z.coerce.number().min(0),
  paymentTermsDays: z.coerce.number().int().min(0).max(365),
  notes: z.string().optional(),
});
type Values = z.input<typeof schema>;
type Parsed = z.output<typeof schema>;

/** Create / edit a customer. Used by the customers page and directly from the POS (+ Ajouter client). */
export function CustomerFormDialog({ open, customer, onOpenChange, onSaved, initialName }: {
  open: boolean; customer?: Customer | null; onOpenChange: (o: boolean) => void; onSaved?: (c: Customer) => void; initialName?: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canEdit = useCan('customers.edit');
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<Values, unknown, Parsed>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset({
      type: customer?.type ?? 'REGISTERED', name: customer?.name ?? initialName ?? '', phone: customer?.phone ?? '', email: customer?.email ?? '',
      address: customer?.address ?? '', taxId: customer?.taxId ?? '', creditLimit: customer?.creditLimit ?? '0',
      paymentTermsDays: customer?.paymentTermsDays ?? 30, notes: customer?.notes ?? '',
    } as unknown as Values);
  }, [open, customer, initialName, reset]);

  const save = useMutation({
    mutationFn: (v: Parsed) => {
      const body = { ...v, phone: v.phone || null, email: v.email || null, address: v.address || null, taxId: v.taxId || null, notes: v.notes || null, status: customer?.status ?? 'ACTIVE' } as const;
      return customer ? CustomersApi.update(customer.id, body) : CustomersApi.create(body);
    },
    onSuccess: (c) => {
      toast.success(customer ? t('common.updated') : t('common.created'));
      void qc.invalidateQueries({ queryKey: ['customers'] });
      void qc.invalidateQueries({ queryKey: ['customer', c.id] });
      onSaved?.(c);
      onOpenChange(false);
    },
    onError: toastError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{customer ? t('customers.edit') : t('customers.new')}</DialogTitle></DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
          <FormField label={t('common.name')} htmlFor="c-name" required error={errors.name && t('common.required')} className="sm:col-span-2">
            <Input id="c-name" autoFocus {...register('name')} aria-invalid={!!errors.name} />
          </FormField>
          <FormField label={t('common.type')} htmlFor="c-type">
            <Controller control={control} name="type" render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="c-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REGISTERED">{t('customers.typeREGISTERED')}</SelectItem>
                  <SelectItem value="BUSINESS">{t('customers.typeBUSINESS')}</SelectItem>
                </SelectContent>
              </Select>
            )} />
          </FormField>
          <FormField label={t('common.phone')} htmlFor="c-phone"><Input id="c-phone" type="tel" inputMode="tel" placeholder="+235 66 00 00 00" {...register('phone')} /></FormField>
          <FormField label={t('common.email')} htmlFor="c-email" error={errors.email && 'E-mail invalide'}><Input id="c-email" type="email" {...register('email')} /></FormField>
          <FormField label={t('customers.taxId')} htmlFor="c-tax"><Input id="c-tax" {...register('taxId')} /></FormField>
          <FormField label={t('common.address')} htmlFor="c-addr" className="sm:col-span-2"><Input id="c-addr" {...register('address')} /></FormField>
          <FormField label={t('customers.creditLimit')} htmlFor="c-limit" hint={!canEdit && customer ? t('common.permissionDenied') : undefined}>
            <Input id="c-limit" type="number" min={0} step="any" {...register('creditLimit')} disabled={!!customer && !canEdit} />
          </FormField>
          <FormField label={t('customers.paymentTerms')} htmlFor="c-terms"><Input id="c-terms" type="number" min={0} max={365} {...register('paymentTermsDays')} /></FormField>
          <FormField label={t('common.notes')} htmlFor="c-notes" className="sm:col-span-2"><Textarea id="c-notes" rows={2} {...register('notes')} /></FormField>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={save.isPending}>{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
