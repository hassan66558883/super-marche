import { env } from './config/env.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { prisma } from './utils/prisma.js';
import { setBusinessTz } from './utils/tz.js';
import { SettingsService } from './services/settings.service.js';

const app = createApp();
// Business time zone from the company settings (day boundaries for filters and reports)
setBusinessTz((await SettingsService.get<{ timezone?: string }>('locale').catch(() => ({}) as { timezone?: string })).timezone);
const server = app.listen(env.PORT, () => {
  logger.info(`TECHNOVA POS API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
