import { cn } from '@/utils/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-9 w-9 shrink-0', className)} aria-hidden>
      <rect width="64" height="64" rx="16" className="fill-primary" />
      <path d="M16 20h32v7H35.5v21h-7V27H16z" fill="#fff" />
      <circle cx="46" cy="44" r="6" className="fill-secondary" />
    </svg>
  );
}

export function Logo({ compact, className, light }: { compact?: boolean; className?: string; light?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      {!compact && (
        <div className="leading-none">
          <div className={cn('text-[15px] font-extrabold tracking-tight', light ? 'text-white' : 'text-foreground')}>
            TECHNOVA <span className="text-secondary">POS</span>
          </div>
          <div className={cn('mt-1 text-[10px] font-medium uppercase tracking-[0.12em]', light ? 'text-white/60' : 'text-muted-foreground')}>
            Smart Business
          </div>
        </div>
      )}
    </div>
  );
}
