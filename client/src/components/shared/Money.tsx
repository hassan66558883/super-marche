import { formatMoney, type Money as M } from '@/utils/money';
import { cn } from '@/utils/cn';

export function Money({ value, className, symbol = true }: { value: M | null | undefined; className?: string; symbol?: boolean }) {
  return <span className={cn('tabular whitespace-nowrap', className)}>{formatMoney(value ?? 0, { symbol })}</span>;
}
