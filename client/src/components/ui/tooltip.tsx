import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/utils/cn';

export const TooltipProvider = TooltipPrimitive.Provider;

/** Convenience wrapper: <Tip label="Rechercher" shortcut="F2"><Button/></Tip> */
export function Tip({ label, shortcut, children, side = 'bottom' }: { label: React.ReactNode; shortcut?: string; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn('z-50 flex items-center gap-2 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-md animate-in fade-in-0 zoom-in-95')}
        >
          {label}
          {shortcut && <kbd className="rounded border border-background/30 px-1 font-mono text-[10px]">{shortcut}</kbd>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
