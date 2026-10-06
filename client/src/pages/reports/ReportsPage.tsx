import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, FileType2, Inbox, Lock,
  TrendingUp, Coins, Boxes, Users, ClipboardList,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TFoot, TH, THead, TR } from '@/components/ui/table';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { CHART_COLORS, ChartTooltip, axisProps, compact, gridProps, isRtl } from '@/components/charts/chart-utils';
import { ReportsApi } from '@/services/report.api';
import { useAuthStore, useCan, useCurrentBranch } from '@/stores/auth.store';
import { formatMoney, formatNumber, formatQty } from '@/utils/money';
import { formatDate, formatDateTime, isoDay, addDays } from '@/utils/format';
import { toastError } from '@/utils/errors';
import { cn } from '@/utils/cn';
import type { Cell as ReportCell, ColType, Report, ReportCatalogItem } from '@/types/report';

const GROUPS: { key: ReportCatalogItem['group']; icon: React.ElementType }[] = [
  { key: 'sales', icon: TrendingUp },
  { key: 'finance', icon: Coins },
  { key: 'stock', icon: Boxes },
  { key: 'partners', icon: Users },
  { key: 'operations', icon: ClipboardList },
];

type Preset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

function presetRange(p: Exclude<Preset, 'custom'>): [string, string] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (p) {
    case 'today': return [isoDay(now), isoDay(now)];
    case 'yesterday': return [isoDay(addDays(now, -1)), isoDay(addDays(now, -1))];
    case 'last7': return [isoDay(addDays(now, -6)), isoDay(now)];
    case 'last30': return [isoDay(addDays(now, -29)), isoDay(now)];
    case 'thisMonth': return [isoDay(new Date(y, m, 1)), isoDay(now)];
    case 'lastMonth': return [isoDay(new Date(y, m - 1, 1)), isoDay(new Date(y, m, 0))];
    case 'thisYear': return [isoDay(new Date(y, 0, 1)), isoDay(now)];
  }
}

const NUMERIC: ColType[] = ['money', 'qty', 'int', 'percent'];
const PAGE = 50;

function fmt(v: ReportCell, type: ColType, labels: Record<string, string>): string {
  if (v === null || v === undefined || v === '') return '—';
  switch (type) {
    case 'money': return formatMoney(v, { symbol: false });
    case 'qty': return formatQty(v);
    case 'int': return formatNumber(v, 0);
    case 'percent': return `${formatNumber(v, 1)} %`;
    case 'date': return /^\d{4}-\d{2}$/.test(String(v)) ? String(v) : formatDate(String(v));
    case 'datetime': return formatDateTime(String(v));
    case 'enum': return labels[String(v)] ?? String(v);
    default: return String(v);
  }
}

export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { key } = useParams();
  const navigate = useNavigate();
  const branchId = useAuthStore((s) => s.branchId);
  const branch = useCurrentBranch();
  const canAll = useCan('branches.all');
  const canExport = useCan('reports.export');
  const [preset, setPreset] = useState<Preset>('thisMonth');
  const [[from, to], setRange] = useState(presetRange('thisMonth'));
  const [scope, setScope] = useState<'branch' | 'all'>('branch');
  const [exporting, setExporting] = useState<string | null>(null);

  const catalog = useQuery({ queryKey: ['reports', 'catalog'], queryFn: ReportsApi.catalog });
  const allowed = catalog.data?.filter((r) => r.allowed) ?? [];
  const current = catalog.data?.find((r) => r.key === key) ?? null;
  const params = { from, to, scope, lang: i18n.language };
  const report = useQuery({
    queryKey: ['report', key, params, branchId],
    queryFn: () => ReportsApi.run(key!, params),
    enabled: !!key && !!current?.allowed,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const choosePreset = (p: Preset) => { setPreset(p); if (p !== 'custom') setRange(presetRange(p)); };
  const doExport = async (format: 'pdf' | 'xlsx' | 'csv') => {
    if (!key) return;
    setExporting(format);
    try { await ReportsApi.export(key, format, params); toast.success(t('reports.exported')); } catch (e) { toastError(e); } finally { setExporting(null); }
  };
  const data = report.data && report.data.key === key ? report.data : undefined;

  return (
    <>
      <PageHeader title={t('reports.title')} description={t('reports.subtitle')} />
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Report picker: list on desktop, select on mobile */}
        <div className="lg:hidden">
          <Select value={key ?? ''} onValueChange={(v) => navigate(`/reports/${v}`)}>
            <SelectTrigger><SelectValue placeholder={t('reports.choose')} /></SelectTrigger>
            <SelectContent>
              {GROUPS.map((g) => {
                const items = allowed.filter((r) => r.group === g.key);
                return items.length ? (
                  <SelectGroup key={g.key}><SelectLabel>{t(`reports.group_${g.key}`)}</SelectLabel>
                    {items.map((r) => <SelectItem key={r.key} value={r.key}>{t(`reports.r_${r.key}`)}</SelectItem>)}
                  </SelectGroup>
                ) : null;
              })}
            </SelectContent>
          </Select>
        </div>
        <Card className="hidden h-fit p-2 lg:block">
          {catalog.isLoading && <div className="space-y-2 p-2">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-7" />)}</div>}
          {GROUPS.map((g) => {
            const items = catalog.data?.filter((r) => r.group === g.key) ?? [];
            if (!items.length) return null;
            return (
              <div key={g.key} className="mb-2">
                <div className="flex items-center gap-2 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><g.icon className="h-3.5 w-3.5" />{t(`reports.group_${g.key}`)}</div>
                <ul>
                  {items.map((r) => (
                    <li key={r.key}>
                      {r.allowed ? (
                        <Link to={`/reports/${r.key}`} className={cn('block rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-muted', r.key === key && 'bg-primary/10 font-semibold text-primary hover:bg-primary/10')}>
                          {t(`reports.r_${r.key}`)}
                        </Link>
                      ) : (
                        <span className="flex items-center justify-between rounded-md px-3 py-1.5 text-sm text-muted-foreground/60" title={t('reports.notAllowed')}>
                          {t(`reports.r_${r.key}`)}<Lock className="h-3 w-3" />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </Card>

        <div className="min-w-0 space-y-4">
          {!key ? (
            <Card className="flex flex-col items-center justify-center gap-2 p-16 text-center text-muted-foreground">
              <FileText className="h-10 w-10" />
              <div className="font-medium text-foreground">{t('reports.choose')}</div>
              <div className="text-sm">{t('reports.chooseHelp')}</div>
            </Card>
          ) : current && !current.allowed ? (
            <Card className="p-10 text-center text-muted-foreground">{t('reports.notAllowed')}</Card>
          ) : (
            <>
              <Card className="flex flex-col gap-3 p-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold">{key ? t(`reports.r_${key}`) : ''}</h2>
                  <p className="text-xs text-muted-foreground">
                    {data?.snapshot ? t('reports.snapshot') : current ? t('reports.maxDays', { n: current.maxDays }) : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {data?.snapshot && <span className="me-auto" />}
                  {!data?.snapshot && (
                    <>
                      <Select value={preset} onValueChange={(v) => choosePreset(v as Preset)}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(['today', 'yesterday', 'last7', 'last30', 'thisMonth', 'lastMonth', 'thisYear', 'custom'] as const).map((p) => (
                            <SelectItem key={p} value={p}>{t(`reports.preset_${p}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input type="date" value={from} max={to} onChange={(e) => { setPreset('custom'); setRange([e.target.value, to]); }} className="w-40" aria-label={t('common.from')} />
                      <span className="text-muted-foreground">→</span>
                      <Input type="date" value={to} min={from} onChange={(e) => { setPreset('custom'); setRange([from, e.target.value]); }} className="w-40" aria-label={t('common.to')} />
                    </>
                  )}
                  {canAll && (
                    <Select value={scope} onValueChange={(v) => setScope(v as 'branch' | 'all')}>
                      <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="branch">{branch?.name ?? t('header.branch')}</SelectItem>
                        <SelectItem value="all">{t('dashboard.allBranches')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {canExport && (
                    <div className="ms-auto">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button loading={!!exporting} disabled={!data}><Download /> {t('common.export')}</Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => void doExport('pdf')}><FileType2 /> PDF</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void doExport('xlsx')}><FileSpreadsheet /> Excel (.xlsx)</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void doExport('csv')}><FileText /> CSV</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    </div>
                  )}
                </div>
              </Card>

              {report.isError ? (
                <Card className="p-10 text-center text-sm text-destructive">{(report.error as Error).message}</Card>
              ) : !data ? (
                <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>
              ) : (
                <ReportView report={data} loading={report.isFetching} />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

function ReportView({ report, loading }: { report: Report; loading: boolean }) {
  const { t } = useTranslation();
  // Headline figures: the first money/int totals
  const headline = report.columns.filter((c) => ['money', 'int', 'percent'].includes(c.type) && report.totals?.[c.key] != null).slice(0, 4);
  return (
    <div className={cn('space-y-4 transition-opacity', loading && 'opacity-60')}>
      {headline.length > 0 && report.rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {headline.map((c) => (
            <Card key={c.key} className="p-4">
              <div className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className="mt-1 truncate text-xl font-bold tabular">{c.type === 'money' ? formatMoney(report.totals![c.key]) : fmt(report.totals![c.key], c.type, report.valueLabels)}</div>
            </Card>
          ))}
        </div>
      )}
      {report.chart && report.rows.length > 0 && <ReportChart report={report} />}
      <ReportTable report={report} />
      <p className="text-xs text-muted-foreground">
        {t('reports.generated', { date: formatDateTime(report.generatedAt), name: report.generatedBy })} · {report.branchLabel ?? t('dashboard.allBranches')} · {t('reports.rowCount', { count: report.rows.length })}
      </p>
    </div>
  );
}

function ReportChart({ report }: { report: Report }) {
  const chart = report.chart!;
  const rtl = isRtl();
  const xCol = report.columns.find((c) => c.key === chart.x);
  const ys = chart.y.map((k) => report.columns.find((c) => c.key === k)).filter(Boolean) as Report['columns'];
  if (!xCol || !ys.length) return null;
  const xLabel = (v: ReportCell) => (xCol.type === 'date' ? fmt(v, 'date', {}).slice(0, 5) : String(v ?? '—'));
  let data = report.rows.map((r) => ({ x: r[chart.x], ...Object.fromEntries(ys.map((y) => [y.key, Number(r[y.key] ?? 0)])) }));
  if (chart.kind !== 'line') data = [...data].sort((a, b) => Number(b[ys[0].key as keyof typeof b]) - Number(a[ys[0].key as keyof typeof a])).slice(0, chart.kind === 'pie' ? 8 : 15);

  const pieTotal = chart.kind === 'pie' ? data.reduce((a, d) => a + Number(d[ys[0].key as keyof typeof d] ?? 0), 0) : 0;
  return (
    <Card className={cn('p-4', chart.kind === 'pie' && 'grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
      <div className="h-72" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          {chart.kind === 'pie' ? (
            <PieChart>
              <Pie data={data} dataKey={ys[0].key} nameKey="x" innerRadius="58%" outerRadius="92%" paddingAngle={2} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
                {data.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          ) : chart.kind === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="x" {...axisProps} tickFormatter={xLabel} reversed={rtl} minTickGap={16} />
              <YAxis {...axisProps} orientation={rtl ? 'right' : 'left'} tickFormatter={compact} width={52} />
              <Tooltip content={<ChartTooltip labelFormatter={(l) => fmt(l, xCol.type, {})} />} />
              {ys.map((y, i) => <Line key={y.key} type="monotone" dataKey={y.key} name={y.label} stroke={CHART_COLORS[i]} strokeWidth={2} dot={data.length < 40} />)}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="x" {...axisProps} tickFormatter={(v) => xLabel(v).slice(0, 14)} reversed={rtl} interval={0} angle={data.length > 6 ? -30 : 0} textAnchor={data.length > 6 ? 'end' : 'middle'} height={data.length > 6 ? 70 : 30} />
              <YAxis {...axisProps} orientation={rtl ? 'right' : 'left'} tickFormatter={compact} width={52} />
              <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} content={<ChartTooltip labelFormatter={(l) => fmt(l, xCol.type, {})} />} />
              {ys.map((y, i) => <Bar key={y.key} dataKey={y.key} name={y.label} fill={CHART_COLORS[i]} radius={[4, 4, 0, 0]} maxBarSize={36} />)}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {chart.kind === 'pie' && (
        <ul className="space-y-2 text-sm">
          {data.map((d, i) => {
            const v = Number(d[ys[0].key as keyof typeof d] ?? 0);
            return (
              <li key={i} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span className="min-w-0 flex-1 truncate">{String(d.x ?? '—')}</span>
                <span className="text-xs text-muted-foreground">{pieTotal ? formatNumber((v / pieTotal) * 100, 1) : 0} %</span>
                <span className="w-32 text-end font-medium tabular">{formatMoney(v)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ReportTable({ report }: { report: Report }) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const rows = useMemo(() => {
    if (!sort) return report.rows;
    const col = report.columns.find((c) => c.key === sort.key);
    const num = col && NUMERIC.includes(col.type);
    return [...report.rows].sort((a, b) => {
      const x = a[sort.key]; const y = b[sort.key];
      const r = num ? Number(x ?? 0) - Number(y ?? 0) : String(x ?? '').localeCompare(String(y ?? ''));
      return sort.desc ? -r : r;
    });
  }, [report, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const hasTotals = report.totals && Object.keys(report.totals).length > 0 && rows.length > 0;
  const toggle = (k: string) => { setPage(1); setSort((s) => (s?.key !== k ? { key: k, desc: true } : s.desc ? { key: k, desc: false } : null)); };

  return (
    <Card className="overflow-hidden">
      <div className="max-h-[70vh] overflow-auto scroll-thin">
        <Table>
          <THead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
            <TR>
              {report.columns.map((c) => (
                <TH key={c.key} className={cn('whitespace-nowrap', NUMERIC.includes(c.type) && 'text-end')}>
                  <button type="button" onClick={() => toggle(c.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                    {c.label}
                    {sort?.key === c.key && (sort.desc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                  </button>
                </TH>
              ))}
            </TR>
          </THead>
          <TBody>
            {shown.length === 0 ? (
              <TR><TD colSpan={report.columns.length} className="py-14 text-center text-muted-foreground"><Inbox className="mx-auto mb-2 h-8 w-8" />{t('reports.empty')}</TD></TR>
            ) : shown.map((r, i) => (
              <TR key={i}>
                {report.columns.map((c) => (
                  <TD key={c.key} className={cn('whitespace-nowrap', NUMERIC.includes(c.type) && 'text-end tabular', c.type === 'text' && 'max-w-72 truncate',
                    c.type === 'money' && Number(r[c.key]) < 0 && 'text-destructive')} title={c.type === 'text' ? String(r[c.key] ?? '') : undefined}>
                    {fmt(r[c.key], c.type, report.valueLabels)}
                  </TD>
                ))}
              </TR>
            ))}
          </TBody>
          {hasTotals && (
            <TFoot className="sticky bottom-0 bg-muted/95 font-semibold backdrop-blur">
              <TR>
                {report.columns.map((c, i) => (
                  <TD key={c.key} className={cn('whitespace-nowrap', NUMERIC.includes(c.type) && 'text-end tabular')}>
                    {i === 0 ? t('reports.totals') : report.totals![c.key] != null ? fmt(report.totals![c.key], c.type, report.valueLabels) : ''}
                  </TD>
                ))}
              </TR>
            </TFoot>
          )}
        </Table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 border-t p-2 text-sm">
          <span className="text-muted-foreground">{t('common.page')} {page} {t('common.of')} {pages}</span>
          <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label={t('common.previous')}><ChevronLeft className="rtl:rotate-180" /></Button>
          <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pages} aria-label={t('common.next')}><ChevronRight className="rtl:rotate-180" /></Button>
        </div>
      )}
    </Card>
  );
}
