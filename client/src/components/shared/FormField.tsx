import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/utils/cn';

export function FormField({ label, htmlFor, error, hint, required, children, className }: {
  label: ReactNode; htmlFor?: string; error?: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ms-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error ? <p className="text-xs font-medium text-destructive" role="alert">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
