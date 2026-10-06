import * as React from 'react';
import { cn } from '@/utils/cn';

export const Separator = ({ className, vertical }: { className?: string; vertical?: boolean }) => (
  <div role="separator" aria-orientation={vertical ? 'vertical' : 'horizontal'} className={cn('shrink-0 bg-border', vertical ? 'h-full w-px' : 'h-px w-full', className)} />
);

export const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />
);

export const Kbd = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground', className)}>
    {children}
  </kbd>
);
