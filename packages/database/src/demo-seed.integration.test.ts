import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnvironment } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveApplicationDatabaseUrl } from './database-url.js';
import { demoSeed, seedDemoTenant } from './demo-seed.js';
import * as schema from './schema/index.js';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsFolder = path.resolve(packageDirectory, 'migrations');
const testDatabasePrefix = 'opsguard_test_';

loadEnvironment({ path: path.resolve(packageDirectory, '../../.env'), quiet: true });

let adminClient: Client | undefined;
let testPool: Pool | undefined;
let testDatabaseName = '';

const quoteTestDatabaseIdentifier = (databaseName: string): string => {
  if (!/^opsguard_test_[0-9a-f]{32}$/.test(databaseName)) {
    throw new Error(`Refusing unsafe test database identifier: ${databaseName}`);
  }

  return `"${databaseName}"`;
};

const requireTestPool = (): Pool => {
  if (!testPool) throw new Error('Demo seed integration test pool is not initialized.');
  return testPool;
};

beforeAll(async () => {
  const adminUrl = resolveApplicationDatabaseUrl(process.env);
  testDatabaseName = `${testDatabasePrefix}${randomUUID().replaceAll('-', '')}`;
  const quotedDatabaseName = quoteTestDatabaseIdentifier(testDatabaseName);

  adminClient = new Client({
    application_name: 'opsguard-demo-seed-integration-admin',
    connectionString: adminUrl,
  });
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE ${quotedDatabaseName} TEMPLATE template0`);

  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${testDatabaseName}`;
  testPool = new Pool({
    application_name: 'opsguard-demo-seed-integration',
    connectionString: testUrl.toString(),
    max: 2,
  });
  await migrate(drizzle(requireTestPool()), { migrationsFolder });
}, 30_000);

afterAll(async () => {
  await testPool?.end();

  if (adminClient && testDatabaseName) {
    const quotedDatabaseName = quoteTestDatabaseIdentifier(testDatabaseName);
    await adminClient.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [testDatabaseName],
    );
    await adminClient.query(`DROP DATABASE IF EXISTS ${quotedDatabaseName}`);
  }

  await adminClient?.end();
}, 30_000);

describe.sequential('synthetic demo seed', () => {
  it('is idempotent and preserves the stable active tenant membership', async () => {
    const database = drizzle(requireTestPool(), { schema });

    await seedDemoTenant(database);
    await seedDemoTenant(database);

    const rows = await requireTestPool().query<{
      membership_count: string;
      membership_id: string;
      membership_status: string;
      role: string;
      tenant_count: string;
      tenant_id: string;
      tenant_status: string;
      user_count: string;
      user_id: string;
    }>(
      `SELECT
         t.id AS tenant_id,
         t.status AS tenant_status,
         u.id AS user_id,
         tm.id AS membership_id,
         tm.status AS membership_status,
         tm.role,
         (SELECT count(*) FROM tenants WHERE id = $1) AS tenant_count,
         (SELECT count(*) FROM users WHERE id = $2) AS user_count,
         (SELECT count(*) FROM tenant_memberships WHERE id = $3) AS membership_count
       FROM tenants t
       JOIN tenant_memberships tm ON tm.tenant_id = t.id
       JOIN users u ON u.id = tm.user_id
       WHERE t.id = $1 AND u.id = $2 AND tm.id = $3`,
      [demoSeed.tenant.id, demoSeed.user.id, demoSeed.membership.id],
    );

    expect(rows.rows).toEqual([
      {
        membership_count: '1',
        membership_id: demoSeed.membership.id,
        membership_status: 'active',
        role: 'operator',
        tenant_count: '1',
        tenant_id: demoSeed.tenant.id,
        tenant_status: 'active',
        user_count: '1',
        user_id: demoSeed.user.id,
      },
    ]);
  });
});
