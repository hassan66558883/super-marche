import net from 'node:net';
import { SettingsService } from './settings.service.js';
import { AppError, badRequest } from '../utils/errors.js';

const MAX_BYTES = 256 * 1024;
const TIMEOUT_MS = 5000;

interface PrinterSettings { type: 'BROWSER' | 'ESCPOS'; escpos: { enabled: boolean; host: string | null; port: number } }

/**
 * Network print bridge for ESC/POS thermal printers (raw TCP, usually port 9100).
 * The target always comes from the branch's printer settings, never from the request,
 * so the endpoint cannot be used to reach arbitrary hosts.
 */
export const PrintService = {
  async sendEscPos(branchId: string, base64: string) {
    const printer = (await SettingsService.get('printer', branchId)) as PrinterSettings | null;
    if (!printer || printer.type !== 'ESCPOS' || !printer.escpos?.enabled || !printer.escpos.host) {
      throw badRequest('PRINTER_NOT_CONFIGURED', 'Aucune imprimante ESC/POS configurée pour cette succursale');
    }
    const data = Buffer.from(base64, 'base64');
    if (!data.length || data.length > MAX_BYTES) throw badRequest('PRINT_PAYLOAD_INVALID', 'Données d’impression invalides');
    const { host, port } = printer.escpos;
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const fail = (err: Error) => { socket.destroy(); reject(new AppError(502, 'PRINTER_UNREACHABLE', `Imprimante injoignable (${host}:${port}) : ${err.message}`)); };
      socket.setTimeout(TIMEOUT_MS, () => fail(new Error('timeout')));
      socket.once('error', fail);
      socket.once('connect', () => socket.end(data, () => resolve()));
    });
    return { bytes: data.length };
  },
};
