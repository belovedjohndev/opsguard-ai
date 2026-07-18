import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CreateRequest } from '@opsguard/application';
import {
  DrizzleActiveMembershipResolver,
  DrizzleRequestRepository,
  resolveApplicationDatabaseUrl,
} from '@opsguard/database';
import * as databaseSchema from '@opsguard/database';
import { config as loadEnvironment } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { FastifyInstance } from 'fastify';
import { Client, Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApiApp } from './app.js';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsFolder = path.resolve(packageDirectory, '../../packages/database/migrations');
const testDatabasePrefix = 'opsguard_test_';

loadEnvironment({ path: path.resolve(packageDirectory, '../../.env'), quiet: true });

const fixture = {
  membershipAId: randomUUID(),
  membershipBId: randomUUID(),
  tenantAId: randomUUID(),
  tenantBId: randomUUID(),
  userAId: randomUUID(),
  userBId: randomUUID(),
};

let adminClient: Client | undefined;
let testPool: Pool | undefined;
let testDatabaseName = '';
const apps: FastifyInstance[] = [];

const quoteTestDatabaseIdentifier = (databaseName: string): string => {
  if (!/^opsguard_test_[0-9a-f]{32}$/.test(databaseName)) {
    throw new Error(`Refusing unsafe test database identifier: ${databaseName}`);
  }

  return `"${databaseName}"`;
};

const requireTestPool = (): Pool => {
  if (!testPool) {
    throw new Error('API integration test pool is not initialized.');
  }

  return testPool;
};

const buildDatabaseBackedApp = (): FastifyInstance => {
  const database = drizzle(requireTestPool(), { schema: databaseSchema });
  const app = buildApiApp({
    activeMembershipResolver: new DrizzleActiveMembershipResolver(database),
    createRequest: new CreateRequest({
      clock: () => new Date('2026-07-18T10:00:00.000Z'),
      generateRequestId: () => randomUUID(),
      requestRepository: new DrizzleRequestRepository(database),
    }),
  });
  apps.push(app);
  return app;
};

beforeAll(async () => {
  const adminUrl = resolveApplicationDatabaseUrl(process.env);
  testDatabaseName = `${testDatabasePrefix}${randomUUID().replaceAll('-', '')}`;
  const quotedDatabaseName = quoteTestDatabaseIdentifier(testDatabaseName);

  adminClient = new Client({
    application_name: 'opsguard-api-integration-admin',
    connectionString: adminUrl,
  });
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE ${quotedDatabaseName} TEMPLATE template0`);

  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${testDatabaseName}`;
  testPool = new Pool({
    application_name: 'opsguard-api-integration',
    connectionString: testUrl.toString(),
    max: 4,
  });

  const pool = requireTestPool();
  await migrate(drizzle(pool), { migrationsFolder });
  await pool.query(
    `INSERT INTO tenants (id, slug, name)
     VALUES ($1, 'api-tenant-a', 'API Tenant A'), ($2, 'api-tenant-b', 'API Tenant B')`,
    [fixture.tenantAId, fixture.tenantBId],
  );
  await pool.query(
    `INSERT INTO users (id, email)
     VALUES ($1, 'api-user-a@example.test'), ($2, 'api-user-b@example.test')`,
    [fixture.userAId, fixture.userBId],
  );
  await pool.query(
    `INSERT INTO tenant_memberships (id, tenant_id, user_id, role)
     VALUES ($1, $2, $3, 'operator'), ($4, $5, $6, 'reviewer')`,
    [
      fixture.membershipAId,
      fixture.tenantAId,
      fixture.userAId,
      fixture.membershipBId,
      fixture.tenantBId,
      fixture.userBId,
    ],
  );
}, 30_000);

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

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

const tenantAHeaders = {
  'x-opsguard-tenant-id': fixture.tenantAId,
  'x-opsguard-user-id': fixture.userAId,
};

describe.sequential('request creation API with PostgreSQL', () => {
  it('persists one tenant-scoped request, initial history row, and audit event', async () => {
    const app = buildDatabaseBackedApp();
    const response = await app.inject({
      headers: tenantAHeaders,
      method: 'POST',
      payload: { sourceReference: 'api-valid-source', sourceType: 'form' },
      url: '/v1/requests',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: 'received', tenantId: fixture.tenantAId });

    const result = await requireTestPool().query<{
      audit_count: string;
      history_count: string;
      request_count: string;
    }>(
      `SELECT
         (SELECT count(*) FROM requests WHERE tenant_id = $1 AND source_reference = $2) AS request_count,
         (SELECT count(*) FROM request_status_history h
            JOIN requests r ON r.id = h.request_id AND r.tenant_id = h.tenant_id
            WHERE r.tenant_id = $1 AND r.source_reference = $2) AS history_count,
         (SELECT count(*) FROM audit_events a
            JOIN requests r ON r.id = a.entity_id AND r.tenant_id = a.tenant_id
            WHERE r.tenant_id = $1 AND r.source_reference = $2
              AND a.event_type = 'request.created') AS audit_count`,
      [fixture.tenantAId, 'api-valid-source'],
    );
    expect(result.rows[0]).toEqual({
      audit_count: '1',
      history_count: '1',
      request_count: '1',
    });
  });

  it('rejects missing identity without persisting a request', async () => {
    const app = buildDatabaseBackedApp();
    const response = await app.inject({
      method: 'POST',
      payload: { sourceReference: 'api-missing-identity', sourceType: 'email' },
      url: '/v1/requests',
    });

    expect(response.statusCode).toBe(401);
    const count = await requireTestPool().query<{ count: string }>(
      `SELECT count(*) FROM requests WHERE source_reference = 'api-missing-identity'`,
    );
    expect(count.rows[0]?.count).toBe('0');
  });

  it('ignores a body tenant spoof and persists only under verified tenant A', async () => {
    const app = buildDatabaseBackedApp();
    const response = await app.inject({
      headers: tenantAHeaders,
      method: 'POST',
      payload: {
        sourceReference: 'api-body-spoof',
        sourceType: 'webhook',
        tenantId: fixture.tenantBId,
      },
      url: '/v1/requests',
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ tenantId: fixture.tenantAId });
    const tenants = await requireTestPool().query<{ tenant_id: string }>(
      `SELECT tenant_id FROM requests WHERE source_reference = 'api-body-spoof'`,
    );
    expect(tenants.rows).toEqual([{ tenant_id: fixture.tenantAId }]);
  });

  it('rejects a valid user paired with a tenant where that user has no membership', async () => {
    const app = buildDatabaseBackedApp();
    const response = await app.inject({
      headers: {
        'x-opsguard-tenant-id': fixture.tenantBId,
        'x-opsguard-user-id': fixture.userAId,
      },
      method: 'POST',
      payload: { sourceReference: 'api-membership-spoof', sourceType: 'service_account' },
      url: '/v1/requests',
    });

    expect(response.statusCode).toBe(403);
    const count = await requireTestPool().query<{ count: string }>(
      `SELECT count(*) FROM requests WHERE source_reference = 'api-membership-spoof'`,
    );
    expect(count.rows[0]?.count).toBe('0');
  });

  it('returns 409 for a duplicate source without a second partial write', async () => {
    const app = buildDatabaseBackedApp();
    const request = {
      headers: tenantAHeaders,
      method: 'POST' as const,
      payload: { sourceReference: 'api-duplicate-source', sourceType: 'email' },
      url: '/v1/requests',
    };

    const first = await app.inject(request);
    const duplicate = await app.inject(request);

    expect(first.statusCode).toBe(201);
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ error: { code: 'REQUEST_CONFLICT' } });
    const counts = await requireTestPool().query<{
      audit_count: string;
      history_count: string;
      request_count: string;
    }>(
      `SELECT
         (SELECT count(*) FROM requests WHERE tenant_id = $1 AND source_reference = $2) AS request_count,
         (SELECT count(*) FROM request_status_history h
            JOIN requests r ON r.id = h.request_id AND r.tenant_id = h.tenant_id
            WHERE r.tenant_id = $1 AND r.source_reference = $2) AS history_count,
         (SELECT count(*) FROM audit_events a
            JOIN requests r ON r.id = a.entity_id AND r.tenant_id = a.tenant_id
            WHERE r.tenant_id = $1 AND r.source_reference = $2) AS audit_count`,
      [fixture.tenantAId, 'api-duplicate-source'],
    );
    expect(counts.rows[0]).toEqual({
      audit_count: '1',
      history_count: '1',
      request_count: '1',
    });
  });
});
