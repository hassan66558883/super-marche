import i18n from '@/i18n';
import { formatMoney, formatNumber } from '@/utils/money';

/** Theme-aware series colours (CSS variables switch with dark mode) */
export const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--secondary))',
  'hsl(var(--warning))',
  'hsl(199 85% 45%)',
  'hsl(262 60% 58%)',
  'hsl(340 70% 55%)',
  'hsl(45 90% 50%)',
  'hsl(var(--muted-foreground))',
];

const localeTag = () => (i18n.language === 'ar' ? 'ar-TD-u-nu-latn' : i18n.language === 'en' ? 'en-GB' : 'fr-FR');

/** 1 250 000 → "1,3 M" for axis ticks */
export const compact = (v: number | string) =>
  new Intl.NumberFormat(localeTag(), { notation: 'compact', maximumFractionDigits: 1 }).format(Number(v));

export const isRtl = () => i18n.dir() === 'rtl';

export const axisProps = {
  tick: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = { stroke: 'hsl(var(--border))', strokeDasharray: '3 3', vertical: false } as const;

interface TooltipEntry { name?: string | number; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }

/** Tooltip styled like the app's popovers; money values formatted with the currency */
export function ChartTooltip({ active, payload, label, labelFormatter, money = true }: {
  active?: boolean; payload?: TooltipEntry[]; label?: string | number; labelFormatter?: (l: string | number) => string; money?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <div className="mb-1 font-semibold">{labelFormatter ? labelFormatter(label) : label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ms-auto ps-3 font-semibold tabular">{money ? formatMoney(p.value ?? 0) : formatNumber(p.value ?? 0, 0)}</span>
        </div>
      ))}
    </div>
  );
}
