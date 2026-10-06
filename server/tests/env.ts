// Every test file talks to the per-run database created in global-setup (never the dev/prod one).
process.env.NODE_ENV = 'test';
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL not set by global setup');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_ACCESS_SECRET ??= 'test-secret-test-secret-test-secret-0123456789';
