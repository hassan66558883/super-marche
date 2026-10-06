/* eslint-disable no-console */
import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_HOURS: z.coerce.number().positive().default(12),
  REFRESH_TTL_REMEMBER_DAYS: z.coerce.number().positive().default(30),
  COOKIE_SECURE: bool.default(false),
  /** Only for a closed LAN without HTTPS: lets production run with non-secure cookies */
  ALLOW_INSECURE_COOKIES: bool.default(false),
  COOKIE_DOMAIN: z.string().optional().transform((v) => (v ? v : undefined)),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  DEFAULT_CURRENCY: z.string().default('XAF'),
  DEFAULT_LOCALE: z.string().default('fr'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
};

if (env.isProd && /change-me|dev-secret|example/i.test(env.JWT_ACCESS_SECRET)) {
  console.error('❌ Refusing to start in production with a placeholder JWT secret. Generate one with: openssl rand -base64 48');
  process.exit(1);
}
if (env.isProd && !env.COOKIE_SECURE && !env.ALLOW_INSECURE_COOKIES) {
  console.error('❌ COOKIE_SECURE must be true in production (serve the app over HTTPS). Set ALLOW_INSECURE_COOKIES=true only on a closed LAN.');
  process.exit(1);
}
if (env.isProd && env.corsOrigins.some((o) => o.includes('localhost'))) {
  console.warn('⚠️  CORS_ORIGINS still contains localhost in production.');
}
