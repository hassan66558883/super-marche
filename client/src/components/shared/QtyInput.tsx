import { Input } from '@/components/ui/input';
import { cn } from '@/utils/cn';

/** Compact decimal input for document lines (quantities, unit costs). Accepts "," as decimal separator. */
export function QtyInput({ value, onChange, className, invalid, ...rest }: {
  value: string; onChange: (v: string) => void; className?: string; invalid?: boolean; 'aria-label'?: string; disabled?: boolean; max?: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))}
      onFocus={(e) => e.target.select()}
      inputMode="decimal"
      className={cn('h-9 text-end tabular', invalid && 'border-destructive focus-visible:ring-destructive', className)}
      {...rest}
    />
  );
}
