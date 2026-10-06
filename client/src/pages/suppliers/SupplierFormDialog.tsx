import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { FormField } from '@/components/shared/FormField';
import { SuppliersApi } from '@/services/stock.api';
import { toastError } from '@/utils/errors';
import type { Supplier } from '@/types/stock';

const schema = z.object({
  name: z.string().trim().min(1),
  company: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().or(z.literal('')).optional(),
  address: z.string().trim().optional(),
  taxId: z.string().trim().optional(),
  paymentTerms: z.string().trim().optional(),
  active: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function SupplierFormDialog({ open, supplier, onOpenChange, onSaved }: {
  open: boolean; supplier?: Supplier | null; onOpenChange: (o: boolean) => void; onSaved?: (s: Supplier) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset({
      name: supplier?.name ?? '', company: supplier?.company ?? '', phone: supplier?.phone ?? '', email: supplier?.email ?? '',
      address: supplier?.address ?? '', taxId: supplier?.taxId ?? '', paymentTerms: supplier?.paymentTerms ?? '', active: (supplier?.status ?? 'ACTIVE') === 'ACTIVE',
    });
  }, [open, supplier, reset]);

  const save = useMutation({
    mutationFn: ({ active, ...v }: Values) => {
      const body = {
        name: v.name, company: v.company || null, phone: v.phone || null, email: v.email || null, address: v.address || null,
        taxId: v.taxId || null, paymentTerms: v.paymentTerms || null, status: active ? 'ACTIVE' : 'INACTIVE',
      } as const;
      return supplier ? SuppliersApi.update(supplier.id, body) : SuppliersApi.create(body);
    },
    onSuccess: (s) => {
      toast.success(supplier ? t('common.updated') : t('common.created'));
      void qc.invalidateQueries({ queryKey: ['suppliers'] });
      void qc.invalidateQueries({ queryKey: ['supplier', s.id] });
      onSaved?.(s);
      onOpenChange(false);
    },
    onError: toastError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{supplier ? t('suppliers.edit') : t('suppliers.new')}</DialogTitle></DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
          <FormField label={t('common.name')} htmlFor="s-name" required error={errors.name && t('common.required')}>
            <Input id="s-name" autoFocus {...register('name')} aria-invalid={!!errors.name} />
          </FormField>
          <FormField label={t('suppliers.company')} htmlFor="s-company"><Input id="s-company" {...register('company')} /></FormField>
          <FormField label={t('common.phone')} htmlFor="s-phone"><Input id="s-phone" type="tel" inputMode="tel" placeholder="+235 66 00 00 00" {...register('phone')} /></FormField>
          <FormField label={t('common.email')} htmlFor="s-email" error={errors.email && t('suppliers.invalidEmail')}><Input id="s-email" type="email" {...register('email')} /></FormField>
          <FormField label={t('common.address')} htmlFor="s-addr" className="sm:col-span-2"><Input id="s-addr" {...register('address')} /></FormField>
          <FormField label={t('customers.taxId')} htmlFor="s-tax"><Input id="s-tax" {...register('taxId')} /></FormField>
          <FormField label={t('suppliers.paymentTerms')} htmlFor="s-terms"><Input id="s-terms" placeholder={t('suppliers.termsHint')} {...register('paymentTerms')} /></FormField>
          {supplier && (
            <label className="flex items-center justify-between rounded-lg border p-3 text-sm sm:col-span-2">
              <span className="font-medium">{t('common.active')}</span>
              <Controller control={control} name="active" render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} />} />
            </label>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={save.isPending}>{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
