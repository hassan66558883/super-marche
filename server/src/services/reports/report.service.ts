import type { Request } from 'express';
import { prisma } from '../../utils/prisma.js';
import { businessTz } from '../../utils/tz.js';
import { D } from '../../utils/money.js';
import { badRequest, forbidden, notFound } from '../../utils/errors.js';
import { hasPermission } from '../../middleware/auth.js';
import type { PermissionCode } from '../../config/permissions.js';
import { SettingsService, type CompanySettings } from '../settings.service.js';
import { REPORTS, type ReportData, type ReportDef } from './definitions.js';
import { localRange, localToday, addDaysIso } from './time.js';
import { COLUMNS, TITLES, VALUES, label, type Lang } from './labels.js';

export interface ReportQuery { from?: string; to?: string; scope?: 'branch' | 'all'; lang?: Lang }

export interface ReportResult extends ReportData {
  key: string;
  title: string;
  columns: (ReportData['columns'][number] & { label: string })[];
  /** Translations of the enum values present in the rows (statuses, reasons) */
  valueLabels: Record<string, string>;
  from: string;
  to: string;
  tz: string;
  branchLabel: string | null;
  company: string;
  generatedAt: string;
  generatedBy: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 1100;

/** Business time zone (company setting, kept in memory by utils/tz) */
export async function timezone(_branchId?: string | null) {
  return businessTz();
}

export function canRun(req: Request, def: ReportDef) {
  return def.permissions.every((p) => hasPermission(req, p as PermissionCode));
}

export const ReportService = {
  catalog(req: Request) {
    return REPORTS.map((r) => ({ key: r.key, group: r.group, maxDays: r.maxDays ?? MAX_DAYS, allowed: canRun(req, r) }));
  },

  async run(req: Request, key: string, q: ReportQuery): Promise<ReportResult> {
    const def = REPORTS.find((r) => r.key === key);
    if (!def) throw notFound('REPORT_NOT_FOUND', 'Rapport introuvable');
    if (!canRun(req, def)) throw forbidden('Accès refusé à ce rapport', 'REPORT_FORBIDDEN');
    const lang: Lang = q.lang ?? 'fr';
    const tz = await timezone(req.branchId);
    const today = localToday(tz);
    const to = q.to ?? today;
    const from = q.from ?? addDaysIso(to, -29);
    if (!ISO.test(from) || !ISO.test(to)) throw badRequest('INVALID_DATE', 'Dates invalides (AAAA-MM-JJ)');
    if (from > to) throw badRequest('INVALID_RANGE', 'La date de début doit précéder la date de fin');
    const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
    if (days > (def.maxDays ?? MAX_DAYS)) throw badRequest('RANGE_TOO_LARGE', `Période trop longue (${def.maxDays ?? MAX_DAYS} jours maximum)`, { maxDays: def.maxDays ?? MAX_DAYS });

    const all = q.scope === 'all';
    if (all && !hasPermission(req, 'branches.all')) throw forbidden('Accès refusé aux autres succursales', 'BRANCH_FORBIDDEN');
    const branchIds = all ? req.auth!.branchIds : [req.branchId!];
    const { gte, lt } = localRange(from, to, tz);
    const data = await def.build({ branchIds, from, to, gte, lt, tz, viewCost: hasPermission(req, 'products.view_cost') });
    // Margin of the totals row = total profit / total net revenue (never a sum of percentages)
    if (data.totals && data.columns.some((c) => c.key === 'margin') && data.totals.profit != null && data.totals.revenueNet != null) {
      const net = D(data.totals.revenueNet as string);
      data.totals.margin = net.isZero() ? '0' : D(data.totals.profit as string).div(net).mul(100).toFixed(1);
    }

    const [company, branch, user] = await Promise.all([
      SettingsService.get<CompanySettings>('company'),
      all ? null : prisma.branch.findUnique({ where: { id: req.branchId! }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { fullName: true } }),
    ]);
    const valueLabels: Record<string, string> = {};
    for (const c of data.columns.filter((x) => x.type === 'enum')) {
      for (const row of data.rows) { const v = row[c.key]; if (typeof v === 'string') valueLabels[v] = label(VALUES, v, lang); }
    }
    return {
      ...data,
      valueLabels,
      key,
      title: label(TITLES, key, lang),
      columns: data.columns.map((c) => ({ ...c, label: label(COLUMNS, c.key, lang) })),
      from, to, tz,
      branchLabel: branch?.name ?? null,
      company: company.name ?? 'TECHNOVA POS',
      generatedAt: new Date().toISOString(),
      generatedBy: user?.fullName ?? '',
    };
  },
};
