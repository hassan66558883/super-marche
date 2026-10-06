import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Each test run gets its own throwaway database (technova_test_<timestamp>), created here,
 * migrated with `migrate deploy` (non-destructive) and seeded; it is dropped in teardown.
 * The developer's database is never touched.
 */
const BASE = process.env.TEST_DATABASE_BASE_URL ?? 'postgresql://technova:technova_dev@localhost:5432';

export default async function setup() {
  const name = `technova_test_${Date.now()}`;
  const admin = new PrismaClient({ datasourceUrl: `${BASE}/postgres` });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  await admin.$disconnect();

  const url = `${BASE}/${name}?schema=public`;
  process.env.TEST_DATABASE_URL = url;
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('npx tsx prisma/seed.ts', { env, stdio: 'pipe' });

  return async () => {
    const a = new PrismaClient({ datasourceUrl: `${BASE}/postgres` });
    await a.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await a.$disconnect();
  };
}
