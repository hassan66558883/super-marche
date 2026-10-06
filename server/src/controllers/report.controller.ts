import type { Request, Response } from 'express';
import { parseQuery } from '../middleware/validate.js';
import { ok } from '../utils/http.js';
import { reportExportQuery, reportQuery, dashboardQuery } from '../validators/report.validators.js';
import { ReportService } from '../services/reports/report.service.js';
import { DashboardService } from '../services/reports/dashboard.service.js';
import { fileName, toCsv, toPdf, toXlsx } from '../services/reports/export.js';
import { SettingsService } from '../services/settings.service.js';
import { AuditService } from '../services/audit.service.js';

const MIME = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
} as const;

export const ReportController = {
  catalog(req: Request, res: Response) { return ok(res, ReportService.catalog(req)); },

  async run(req: Request, res: Response) {
    return ok(res, await ReportService.run(req, String(req.params.type), parseQuery(reportQuery, req)));
  },

  async export(req: Request, res: Response) {
    const q = parseQuery(reportExportQuery, req);
    const lang = q.lang ?? 'fr';
    const report = await ReportService.run(req, String(req.params.type), { ...q, lang });
    const currency = (await SettingsService.get<{ symbol?: string }>('currency')).symbol ?? 'FCFA';
    const opts = { lang, currency };
    const body = q.format === 'pdf' ? await toPdf(report, opts) : q.format === 'xlsx' ? await toXlsx(report, opts) : toCsv(report, opts);
    await AuditService.log({
      action: 'EXPORT', module: 'reports', recordId: report.key,
      description: `Export ${q.format.toUpperCase()} : ${report.title}`,
      metadata: { format: q.format, from: report.from, to: report.to, scope: q.scope ?? 'branch', rows: report.rows.length },
    }, req);
    const name = fileName(report, q.format);
    res.setHeader('Content-Type', MIME[q.format]);
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(body);
  },

  async dashboard(req: Request, res: Response) {
    return ok(res, await DashboardService.get(req, parseQuery(dashboardQuery, req)));
  },
};
