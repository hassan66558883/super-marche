import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/shared/FormField';
import { Money } from '@/components/shared/Money';
import { ExpensesApi } from '@/services/expense.api';
import { CashApi, PaymentMethodsApi } from '@/services/sales.api';
import { useAuthStore } from '@/stores/auth.store';
import { D, formatNumber, parseAmount } from '@/utils/money';
import { isoDay } from '@/utils/format';
import { toastError } from '@/utils/errors';
import type { Expense } from '@/types/expense';

/** Record an expense; cash can be taken from the caller's open register. */
export function ExpenseFormDialog({ open, onOpenChange, onSaved, defaultFromRegister }: {
  open: boolean; onOpenChange: (o: boolean) => void; onSaved?: (e: Expense) => void; defaultFromRegister?: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const branchId = useAuthStore((s) => s.branchId);
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: () => ExpensesApi.categories(), enabled: open });
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: PaymentMethodsApi.list, enabled: open });
  const current = useQuery({ queryKey: ['cash', 'current', branchId], queryFn: CashApi.current, enabled: open });
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(isoDay());
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [fromRegister, setFromRegister] = useState(false);

  const hasSession = !!current.data;
  useEffect(() => {
    if (!open) return;
    setCategoryId(''); setAmount(''); setDescription(''); setDate(isoDay()); setMethod('CASH'); setReference('');
  }, [open]);
  useEffect(() => { if (open) setFromRegister(!!defaultFromRegister || hasSession); }, [open, hasSession, defaultFromRegister]);

  const methodType = methods.data?.find((m) => m.code === method)?.type;
  const useRegister = methodType === 'CASH' && fromRegister && hasSession;
  const tooMuch = useRegister && D(amount || 0).gt(D(current.data?.expected));
  const valid = !!categoryId && D(amount || 0).gt(0) && description.trim().length >= 2 && !tooMuch;

  const save = useMutation({
    mutationFn: () => ExpensesApi.create({ categoryId, amount: Number(amount), description: description.trim(), expenseDate: date, method, reference: reference || null, fromRegister: useRegister }),
    onSuccess: (e) => {
      toast.success(t('expenses.recorded'));
      void qc.invalidateQueries({ queryKey: ['expenses'] });
      void qc.invalidateQueries({ queryKey: ['cash'] });
      onSaved?.(e);
      onOpenChange(false);
    },
    onError: toastError,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('expenses.new')}</DialogTitle>
          <DialogDescription>{t('expenses.formHelp')}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <FormField label={t('common.amount')} htmlFor="exp-amount" required error={tooMuch ? t('cash.insufficientCash') : undefined} className="sm:col-span-2">
            <Input id="exp-amount" value={amount ? formatNumber(amount) : ''} onChange={(e) => setAmount(parseAmount(e.target.value))} inputMode="numeric" className="h-12 text-end text-xl font-bold" autoFocus />
          </FormField>
          <FormField label={t('expenses.category')} htmlFor="exp-cat" required>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="exp-cat"><SelectValue placeholder={t('common.select')} /></SelectTrigger>
              <SelectContent>{categories.data?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField label={t('common.date')} htmlFor="exp-date"><Input id="exp-date" type="date" value={date} max={isoDay()} onChange={(e) => setDate(e.target.value)} /></FormField>
          <FormField label={t('common.description')} htmlFor="exp-desc" required className="sm:col-span-2">
            <Input id="exp-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('expenses.descriptionHint')} />
          </FormField>
          <FormField label={t('expenses.paymentMethod')} htmlFor="exp-method">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="exp-method"><SelectValue /></SelectTrigger>
              <SelectContent>{methods.data?.filter((m) => m.type !== 'CREDIT' && m.isActive).map((m) => <SelectItem key={m.code} value={m.code}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormField label={t('common.reference')} htmlFor="exp-ref"><Input id="exp-ref" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('expenses.referenceHint')} /></FormField>
          {methodType === 'CASH' && (
            <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm sm:col-span-2">
              <span>
                <span className="font-medium">{t('suppliers.fromRegister')}</span>
                <span className="block text-xs text-muted-foreground">
                  {hasSession ? <>{current.data?.session.register.name} · {t('cash.expected')}: <Money value={current.data?.expected} /></> : t('cash.noOpenSession')}
                </span>
              </span>
              <Switch checked={useRegister} onCheckedChange={setFromRegister} disabled={!hasSession} />
            </label>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={!valid} loading={save.isPending}>{t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
