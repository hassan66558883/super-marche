import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  Banknote, CreditCard, Smartphone, HandCoins, TrendingUp, Receipt, ShoppingBasket, Coins, PackageMinus, PackageX, RefreshCw, ArrowRight,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Money } from '@/components/shared/Money';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CHART_COLORS, ChartTooltip, axisProps, compact, gridProps, isRtl } from '@/components/charts/chart-utils';
import { ReportsApi } from '@/services/report.api';
import { useAuthStore, useCan, useCurrentBranch } from '@/stores/auth.store';
import { formatMoney, formatNumber, formatQty } from '@/utils/money';
import { formatDate, formatTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { Dashboard, DashboardPeriod } from '@/types/report';

export default function DashboardPage() {
  const { t } = useTranslation();
  const branchId = useAuthStore((s) => s.branchId);
  const branch = useCurrentBranch();
  const canAll = useCan('branches.all');
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const [scope, setScope] = useState<'branch' | 'all'>('branch');
  const q = useQuery({
    queryKey: ['dashboard', period, scope, branchId],
    queryFn: () => ReportsApi.dashboard(period, scope),
    refetchInterval: 60_000,
  });
  const d = q.data;

  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        description={d ? `${period === 'today' ? formatDate(d.to) : `${formatDate(d.from)} – ${formatDate(d.to)}`} · ${scope === 'all' ? t('dashboard.allBranches') : branch?.name ?? ''}` : t('dashboard.subtitle')}
        actions={
          <>
            {canAll && (
              <Select value={scope} onValueChange={(v) => setScope(v as 'branch' | 'all')}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="branch">{branch?.name ?? t('header.branch')}</SelectItem>
                  <SelectItem value="all">{t('dashboard.allBranches')}</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Tabs value={period} onValueChange={(v) => setPeriod(v as DashboardPeriod)}>
              <TabsList>
                <TabsTrigger value="today">{t('dashboard.periodToday')}</TabsTrigger>
                <TabsTrigger value="week">{t('dashboard.week')}</TabsTrigger>
                <TabsTrigger value="month">{t('dashboard.periodMonth')}</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="icon" onClick={() => void q.refetch()} aria-label={t('common.refresh')} disabled={q.isFetching}>
              <RefreshCw className={cn(q.isFetching && 'animate-spin')} />
            </Button>
          </>
        }
      />
      {!d ? <DashboardSkeleton /> : d.salesVisible ? <SalesDashboard d={d} /> : <StockOnly d={d} />}
    </>
  );
}

function SalesDashboard({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  const canCost = d.kpis.profit !== undefined;
  const k = d.kpis;
  const periodLabel = d.period === 'today' ? t('dashboard.todaySales') : t('dashboard.periodSales');
  return (
    <div className="space-y-4">
      <div className={cn('grid gap-3 sm:grid-cols-2', canCost ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
        <Kpi icon={TrendingUp} tone="primary" label={periodLabel} value={<Money value={k.sales} />}
          hint={k.returns && Number(k.returns) > 0 ? `${t('dashboard.returnsDeducted')} ${formatMoney(k.returns)}` : undefined} />
        {canCost && <Kpi icon={Coins} tone="success" label={d.period === 'today' ? t('dashboard.todayProfit') : t('dashboard.profit')} value={<Money value={k.profit} />}
          hint={Number(k.sales) > 0 ? `${t('dashboard.margin')} ${formatNumber((Number(k.profit) / (Number(k.sales) || 1)) * 100, 1)} %` : undefined} />}
        <Kpi icon={Receipt} tone="info" label={t('dashboard.transactions')} value={formatNumber(k.transactions ?? 0, 0)} />
        <Kpi icon={ShoppingBasket} tone="warning" label={t('dashboard.avgBasket')} value={<Money value={k.avgBasket} />} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <MiniKpi icon={Banknote} label={t('dashboard.cashSales')} value={<Money value={k.cash} />} />
        <MiniKpi icon={CreditCard} label={t('dashboard.cardSales')} value={<Money value={k.card} />} />
        <MiniKpi icon={Smartphone} label={t('dashboard.mobileSales')} value={<Money value={k.mobileMoney} />} />
        <MiniKpi icon={HandCoins} label={t('dashboard.creditSales')} value={<Money value={k.credit} />} to="/sales?unpaid=true" />
        <MiniKpi icon={PackageMinus} label={t('dashboard.lowStock')} value={k.lowStock} tone={k.lowStock ? 'warning' : undefined} to="/inventory?tab=stock&stock=low" />
        <MiniKpi icon={PackageX} label={t('dashboard.outOfStock')} value={k.outOfStock} tone={k.outOfStock ? 'destructive' : undefined} to="/inventory?tab=stock&stock=out" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SalesChart d={d} className="xl:col-span-2" />
        <PaymentsChart d={d} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {canCost && <ProfitChart d={d} />}
        <TopProducts d={d} />
        <TopCategories d={d} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {d.byBranch.length > 1 && <BranchChart d={d} />}
        <RecentSales d={d} className={d.byBranch.length > 1 ? 'xl:col-span-2' : 'xl:col-span-3'} />
      </div>
    </div>
  );
}

// ───────────── KPI cards ─────────────
const TONES = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  destructive: 'bg-destructive/10 text-destructive',
} as const;

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: React.ElementType; label: string; value: ReactNode; hint?: string; tone: keyof typeof TONES }) {
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', TONES[tone])}><Icon className="h-6 w-6" /></span>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="truncate text-xl font-bold tabular 2xl:text-2xl">{value}</div>
        {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
      </div>
    </Card>
  );
}

function MiniKpi({ icon: Icon, label, value, tone, to }: { icon: React.ElementType; label: string; value: ReactNode; tone?: 'warning' | 'destructive'; to?: string }) {
  const body = (
    <Card className={cn('flex h-full items-center gap-3 p-3', to && 'transition hover:shadow-md')}>
      <Icon className={cn('h-5 w-5 shrink-0 text-muted-foreground', tone === 'warning' && 'text-warning', tone === 'destructive' && 'text-destructive')} />
      <div className="min-w-0">
        <div className="truncate text-xs text-muted-foreground">{label}</div>
        <div className={cn('truncate font-semibold tabular', tone === 'warning' && 'text-warning', tone === 'destructive' && 'text-destructive')}>{value}</div>
      </div>
    </Card>
  );
  return to ? <Link to={to} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

// ───────────── charts ─────────────
function ChartCard({ title, action, children, className, empty }: { title: string; action?: ReactNode; children: ReactNode; className?: string; empty?: boolean }) {
  const { t } = useTranslation();
  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{empty ? <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">{t('dashboard.noData')}</div> : children}</CardContent>
    </Card>
  );
}

const shortDay = (iso: string) => { const [, m, dd] = iso.split('-'); return `${dd}/${m}`; };

function SalesChart({ d, className }: { d: Dashboard; className?: string }) {
  const { t } = useTranslation();
  const [view, setView] = useState<'hours' | 'week' | 'month'>(d.period === 'today' ? 'hours' : d.period === 'week' ? 'week' : 'month');
  const rtl = isRtl();
  const trend = (view === 'week' ? d.trend.slice(-7) : d.trend).map((x) => ({ ...x, sales: Number(x.sales) }));
  // Business hours only, unless sales happened outside them
  const hours = d.byHour.filter((h) => (h.hour >= 7 && h.hour <= 22) || h.transactions > 0).map((h) => ({ ...h, sales: Number(h.sales), label: `${String(h.hour).padStart(2, '0')}h` }));
  return (
    <ChartCard
      title={t('dashboard.salesTrend')}
      className={className}
      empty={view === 'hours' ? !hours.some((h) => h.transactions > 0) : !trend.some((x) => x.sales > 0)}
      action={
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList className="h-8">
            {d.period === 'today' && <TabsTrigger value="hours" className="h-6 px-2 text-xs">{t('dashboard.byHour')}</TabsTrigger>}
            <TabsTrigger value="week" className="h-6 px-2 text-xs">{t('dashboard.week')}</TabsTrigger>
            <TabsTrigger value="month" className="h-6 px-2 text-xs">{t('dashboard.month')}</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      <div className="h-64" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          {view === 'hours' ? (
            <BarChart data={hours} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} reversed={rtl} interval="preserveStartEnd" />
              <YAxis {...axisProps} orientation={rtl ? 'right' : 'left'} tickFormatter={compact} width={48} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip />} />
              <Bar dataKey="sales" name={t('dashboard.revenue')} fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          ) : (
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="day" {...axisProps} tickFormatter={shortDay} reversed={rtl} minTickGap={16} />
              <YAxis {...axisProps} orientation={rtl ? 'right' : 'left'} tickFormatter={compact} width={48} />
              <Tooltip content={<ChartTooltip labelFormatter={(l) => formatDate(String(l))} />} />
              <Area type="monotone" dataKey="sales" name={t('dashboard.revenue')} stroke={CHART_COLORS[0]} strokeWidth={2} fill="url(#salesFill)" />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function ProfitChart({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  const rtl = isRtl();
  const data = d.trend.map((x) => ({ day: x.day, profit: Number(x.profit ?? 0) }));
  return (
    <ChartCard title={t('dashboard.profitTrend')} empty={data.every((x) => x.profit === 0)}>
      <div className="h-56" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="day" {...axisProps} tickFormatter={shortDay} reversed={rtl} minTickGap={16} />
            <YAxis {...axisProps} orientation={rtl ? 'right' : 'left'} tickFormatter={compact} width={48} />
            <Tooltip content={<ChartTooltip labelFormatter={(l) => formatDate(String(l))} />} />
            <Line type="monotone" dataKey="profit" name={t('dashboard.profit')} stroke={CHART_COLORS[1]} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function PaymentsChart({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  const data = d.payments.map((p) => ({ name: p.name, value: Number(p.amount) })).filter((p) => p.value > 0);
  const total = data.reduce((a, p) => a + p.value, 0);
  return (
    <ChartCard title={t('dashboard.paymentDistribution')} empty={!data.length}>
      <div className="relative h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="95%" paddingAngle={2} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">{t('common.total')}</span>
          <span className="text-sm font-bold tabular">{compact(total)}</span>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {data.map((p, i) => (
          <li key={p.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="truncate">{p.name}</span>
            <span className="ms-auto text-xs text-muted-foreground">{formatNumber((p.value / total) * 100, 0)} %</span>
            <Money value={p.value} className="w-28 text-end font-medium" />
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

function RankList({ items }: { items: { label: string; value: number; sub?: string }[] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ol className="space-y-3">
      {items.map((it, i) => (
        <li key={i}>
          <div className="flex items-baseline gap-2 text-sm">
            <span className="w-4 shrink-0 text-xs font-semibold text-muted-foreground">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate font-medium" title={it.label}>{it.label}</span>
            {it.sub && <span className="shrink-0 text-xs text-muted-foreground">{it.sub}</span>}
            <Money value={it.value} className="shrink-0 font-semibold" />
          </div>
          <div className="ms-6 mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function TopProducts({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('dashboard.topProducts')} empty={!d.topProducts.length}
      action={<Button asChild variant="ghost" size="sm"><Link to="/reports/sales-by-product">{t('dashboard.viewAll')} <ArrowRight className="rtl:rotate-180" /></Link></Button>}>
      <RankList items={d.topProducts.slice(0, 6).map((p) => ({ label: p.name, value: Number(p.revenue), sub: `× ${formatQty(p.qty)}` }))} />
    </ChartCard>
  );
}

function TopCategories({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('dashboard.topCategories')} empty={!d.topCategories.length}>
      <RankList items={d.topCategories.map((c) => ({ label: c.name ?? t('dashboard.uncategorized'), value: Number(c.revenue) }))} />
    </ChartCard>
  );
}

function BranchChart({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  const data = d.byBranch.map((b) => ({ name: b.name, sales: Number(b.sales) }));
  return (
    <ChartCard title={t('dashboard.salesByBranch')}>
      <div className="h-64" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid {...gridProps} horizontal={false} vertical />
            <XAxis type="number" {...axisProps} tickFormatter={compact} />
            <YAxis type="category" dataKey="name" {...axisProps} width={110} />
            <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip />} />
            <Bar dataKey="sales" name={t('dashboard.revenue')} radius={[0, 4, 4, 0]} maxBarSize={22}>
              {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function RecentSales({ d, className }: { d: Dashboard; className?: string }) {
  const { t } = useTranslation();
  return (
    <ChartCard title={t('dashboard.recentTransactions')} className={className} empty={!d.recent.length}
      action={<Button asChild variant="ghost" size="sm"><Link to="/sales">{t('dashboard.viewAll')} <ArrowRight className="rtl:rotate-180" /></Link></Button>}>
      <ul className="divide-y">
        {d.recent.map((s) => (
          <li key={s.id}>
            <Link to={`/sales/${s.id}`} className="flex items-center gap-3 py-2.5 text-sm hover:bg-muted/50 sm:px-2">
              <span className="w-12 shrink-0 text-xs text-muted-foreground tabular">{formatTime(s.createdAt)}</span>
              <span className="w-40 shrink-0 truncate font-mono text-xs font-semibold">{s.invoiceNumber}</span>
              <span className="hidden min-w-0 flex-1 truncate sm:block">{s.customer?.name ?? <span className="text-muted-foreground">{t('common.walkIn')}</span>}</span>
              <span className="hidden truncate text-xs text-muted-foreground md:block md:w-32">{s.cashier.fullName}</span>
              <span className="ms-auto shrink-0">
                {s.status === 'COMPLETED' ? (s.paymentStatus !== 'PAID' && <StatusBadge status={s.paymentStatus} ns="sales.payment" />) : <StatusBadge status={s.status} ns="sales.status" />}
              </span>
              <Money value={s.total} className={cn('w-28 shrink-0 text-end font-semibold', s.status === 'CANCELLED' && 'text-muted-foreground line-through')} />
            </Link>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

// ───────────── stock-only view & skeleton ─────────────
function StockOnly({ d }: { d: Dashboard }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/inventory?tab=stock&stock=low"><Kpi icon={PackageMinus} tone="warning" label={t('dashboard.lowStock')} value={d.kpis.lowStock} /></Link>
        <Link to="/inventory?tab=stock&stock=out"><Kpi icon={PackageX} tone="destructive" label={t('dashboard.outOfStock')} value={d.kpis.outOfStock} /></Link>
      </div>
      <Card className="p-6 text-sm text-muted-foreground">{t('dashboard.stockOnly')}</Card>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      <div className="grid gap-4 xl:grid-cols-3"><Skeleton className="h-80 xl:col-span-2" /><Skeleton className="h-80" /></div>
    </div>
  );
}
