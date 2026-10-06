import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { SettingsService, PUBLIC_KEYS } from '../services/settings.service.js';
import { settingSchemas } from '../validators/settings.validators.js';
import { ok } from '../utils/http.js';
import { badRequest } from '../utils/errors.js';
import { AuditService } from '../services/audit.service.js';
import { setBusinessTz } from '../utils/tz.js';

export const SettingsController = {
  async all(req: Request, res: Response) {
    return ok(res, await SettingsService.getAll(req.branchId));
  },

  async update(req: Request, res: Response) {
    const key = String(req.params.key);
    if (!PUBLIC_KEYS.includes(key) || !settingSchemas[key]) throw badRequest('UNKNOWN_SETTING', `Paramètre inconnu: ${key}`);
    const value = settingSchemas[key].parse(req.body);
    const branchScoped = req.query.scope === 'branch';
    const before = await SettingsService.get(key, branchScoped ? req.branchId : null);
    await SettingsService.set(key, value, branchScoped ? req.branchId! : null);
    if (key === 'locale' && !branchScoped) setBusinessTz((value as { timezone?: string }).timezone);
    await AuditService.log({ action: 'UPDATE', module: 'settings', recordId: key, description: `Paramètres « ${key} » modifiés`, metadata: { before, after: value } as Prisma.InputJsonValue }, req);
    return ok(res, await SettingsService.get(key, req.branchId));
  },
};
