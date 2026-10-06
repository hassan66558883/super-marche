import { type Tx } from '../utils/prisma.js';
import { SettingsService, type InvoiceSettings } from './settings.service.js';

/**
 * Gap-free, per-branch, per-year document numbers generated inside the caller's
 * transaction (the row lock on document_sequences serialises concurrent sales).
 *   SALE     → NDJ-2026-000001
 *   RETURN   → RET-NDJ-2026-000001
 *   PURCHASE → BC-NDJ-2026-000001
 *   TRANSFER → TR-NDJ-2026-000001
 */
const PREFIX: Record<string, string> = { SALE: '', RETURN: 'RET-', PURCHASE: 'BC-', TRANSFER: 'TR-' };

export const SequenceService = {
  async next(tx: Tx, branchId: string, docType: 'SALE' | 'RETURN' | 'PURCHASE' | 'TRANSFER', at = new Date()) {
    const settings = await SettingsService.get<InvoiceSettings>('invoice', branchId, tx);
    const year = settings.resetYearly ? at.getFullYear() : 0;
    const rows = await tx.$queryRaw<{ last_value: number }[]>`
      INSERT INTO document_sequences (id, branch_id, doc_type, year, last_value)
      VALUES (gen_random_uuid(), ${branchId}::uuid, ${docType}, ${year}, 1)
      ON CONFLICT (branch_id, doc_type, year) DO UPDATE SET last_value = document_sequences.last_value + 1
      RETURNING last_value`;
    const seq = rows[0].last_value;
    const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId }, select: { code: true } });
    const body = (settings.pattern || '{BRANCH}-{YEAR}-{SEQ}')
      .replace('{BRANCH}', branch.code)
      .replace('{YEAR}', String(at.getFullYear()))
      .replace('{SEQ}', String(seq).padStart(settings.padding || 6, '0'));
    return PREFIX[docType] + body;
  },
};
