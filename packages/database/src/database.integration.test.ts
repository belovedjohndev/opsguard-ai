import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnvironment } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveApplicationDatabaseUrl } from './database-url.js';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsFolder = path.resolve(packageDirectory, 'migrations');
const testDatabasePrefix = 'opsguard_test_';

loadEnvironment({
  path: path.resolve(packageDirectory, '../../.env'),
  quiet: true,
});

const fixture = {
  tenantAId: randomUUID(),
  tenantBId: randomUUID(),
  userAId: randomUUID(),
  userBId: randomUUID(),
  membershipAId: randomUUID(),
  membershipBId: randomUUID(),
  requestAId: randomUUID(),
  requestBId: randomUUID(),
  promptAId: randomUUID(),
  promptBId: randomUUID(),
  modelConfigurationAId: randomUUID(),
  modelConfigurationBId: randomUUID(),
};

let adminClient: Client | undefined;
let testPool: Pool | undefined;
let testDatabaseName = '';

function quoteTestDatabaseIdentifier(databaseName: string): string {
  if (!/^opsguard_test_[0-9a-f]{32}$/.test(databaseName)) {
    throw new Error(`Refusing unsafe test database identifier: ${databaseName}`);
  }

  return `"${databaseName}"`;
}

function requireTestPool(): Pool {
  if (!testPool) {
    throw new Error('Database integration test pool is not initialized.');
  }

  return testPool;
}

function isPostgresError(error: unknown): error is { code: string; constraint?: string } {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as Record<string, unknown>;
  return typeof candidate['code'] === 'string';
}

async function expectPostgresFailure(
  operation: () => Promise<unknown>,
  expectedCode: string,
  expectedConstraint?: string,
): Promise<void> {
  let caughtError: unknown;

  try {
    await operation();
  } catch (error) {
    caughtError = error;
  }

  if (!isPostgresError(caughtError)) {
    throw new Error('Expected PostgreSQL to reject the fixture operation.', { cause: caughtError });
  }

  expect(caughtError.code).toBe(expectedCode);
  if (expectedConstraint) {
    expect(caughtError.constraint).toBe(expectedConstraint);
  }
}

beforeAll(async () => {
  const adminUrl = resolveApplicationDatabaseUrl(process.env);
  testDatabaseName = `${testDatabasePrefix}${randomUUID().replaceAll('-', '')}`;
  const quotedDatabaseName = quoteTestDatabaseIdentifier(testDatabaseName);

  adminClient = new Client({
    application_name: 'opsguard-database-integration-admin',
    connectionString: adminUrl,
  });
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE ${quotedDatabaseName} TEMPLATE template0`);

  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${testDatabaseName}`;
  testPool = new Pool({
    application_name: 'opsguard-database-integration',
    connectionString: testUrl.toString(),
    max: 4,
  });
  await testPool.query('SELECT 1');
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

describe.sequential('initial PostgreSQL migration', () => {
  it('applies all migrations to a completely empty isolated database', async () => {
    const pool = requireTestPool();
    await migrate(drizzle(pool), { migrationsFolder });

    const result = await pool.query<{ table_name: string }>(
      `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
    );

    expect(result.rows.map((row) => row.table_name)).toEqual([
      'ai_runs',
      'audit_events',
      'model_configurations',
      'prompt_versions',
      'request_assessments',
      'request_status_history',
      'requests',
      'tenant_memberships',
      'tenants',
      'users',
    ]);
  }, 30_000);

  it('accepts a valid same-tenant fixture for both tenants', async () => {
    const pool = requireTestPool();

    await pool.query(
      `INSERT INTO tenants (id, slug, name)
       VALUES ($1, 'tenant-a', 'Tenant A'), ($2, 'tenant-b', 'Tenant B')`,
      [fixture.tenantAId, fixture.tenantBId],
    );
    await pool.query(
      `INSERT INTO users (id, email)
       VALUES ($1, 'operator-a@example.test'), ($2, 'operator-b@example.test')`,
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
    await pool.query(
      `INSERT INTO requests
         (id, tenant_id, source_type, source_reference, created_by_membership_id)
       VALUES
         ($1, $2, 'form', 'fixture-request-a', $3),
         ($4, $5, 'webhook', 'fixture-request-b', $6)`,
      [
        fixture.requestAId,
        fixture.tenantAId,
        fixture.membershipAId,
        fixture.requestBId,
        fixture.tenantBId,
        fixture.membershipBId,
      ],
    );
    await pool.query(
      `INSERT INTO request_status_history
         (tenant_id, request_id, is_initial, previous_status, next_status, changed_by_membership_id)
       VALUES
         ($1, $2, true, NULL, 'received', $3),
         ($4, $5, true, NULL, 'received', $6)`,
      [
        fixture.tenantAId,
        fixture.requestAId,
        fixture.membershipAId,
        fixture.tenantBId,
        fixture.requestBId,
        fixture.membershipBId,
      ],
    );
    await pool.query(
      `INSERT INTO prompt_versions (id, tenant_id, prompt_key, version, content_sha256)
       VALUES
         ($1, $2, 'request.assessment', 1, $3),
         ($4, $5, 'request.assessment', 1, $6)`,
      [
        fixture.promptAId,
        fixture.tenantAId,
        'a'.repeat(64),
        fixture.promptBId,
        fixture.tenantBId,
        'b'.repeat(64),
      ],
    );
    await pool.query(
      `INSERT INTO model_configurations
         (id, tenant_id, configuration_key, provider, model)
       VALUES
         ($1, $2, 'assessment.default', 'synthetic-provider', 'synthetic-model-a'),
         ($3, $4, 'assessment.default', 'synthetic-provider', 'synthetic-model-b')`,
      [
        fixture.modelConfigurationAId,
        fixture.tenantAId,
        fixture.modelConfigurationBId,
        fixture.tenantBId,
      ],
    );
    await pool.query(
      `INSERT INTO ai_runs
         (tenant_id, request_id, prompt_version_id, model_configuration_id, status,
          provider_request_id, input_tokens, output_tokens, latency_ms, started_at, completed_at)
       VALUES ($1, $2, $3, $4, 'succeeded', 'synthetic-run-a', 12, 5, 25, now(), now())`,
      [fixture.tenantAId, fixture.requestAId, fixture.promptAId, fixture.modelConfigurationAId],
    );
    await pool.query(
      `INSERT INTO audit_events
         (tenant_id, actor_membership_id, event_type, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'request.received', 'request', $3, $4::jsonb)`,
      [
        fixture.tenantAId,
        fixture.membershipAId,
        fixture.requestAId,
        JSON.stringify({ correlationId: 'synthetic-fixture-a' }),
      ],
    );

    const result = await pool.query<{ count: string }>(
      `SELECT count(*)
       FROM requests r
       JOIN tenant_memberships m
         ON m.tenant_id = r.tenant_id AND m.id = r.created_by_membership_id`,
    );
    expect(result.rows[0]?.count).toBe('2');
  });

  it('rejects cross-tenant request, history, AI, and audit relationships', async () => {
    const pool = requireTestPool();

    await expectPostgresFailure(
      () =>
        pool.query(
          `INSERT INTO requests
             (tenant_id, source_type, source_reference, created_by_membership_id)
           VALUES ($1, 'form', 'cross-tenant-creator', $2)`,
          [fixture.tenantBId, fixture.membershipAId],
        ),
      '23503',
      'requests_tenant_id_created_by_membership_id_fkey',
    );
    await expectPostgresFailure(
      () =>
        pool.query(
          `INSERT INTO request_status_history
             (tenant_id, request_id, is_initial, previous_status, next_status)
           VALUES ($1, $2, true, NULL, 'received')`,
          [fixture.tenantBId, fixture.requestAId],
        ),
      '23503',
      'request_status_history_tenant_id_request_id_fkey',
    );
    await expectPostgresFailure(
      () =>
        pool.query(
          `INSERT INTO ai_runs
             (tenant_id, request_id, prompt_version_id, model_configuration_id)
           VALUES ($1, $2, $3, $4)`,
          [fixture.tenantBId, fixture.requestAId, fixture.promptBId, fixture.modelConfigurationBId],
        ),
      '23503',
      'ai_runs_tenant_id_request_id_fkey',
    );
    await expectPostgresFailure(
      () =>
        pool.query(
          `INSERT INTO audit_events
             (tenant_id, actor_membership_id, event_type, entity_type, entity_id)
           VALUES ($1, $2, 'request.cross_tenant', 'request', $3)`,
          [fixture.tenantBId, fixture.membershipBId, fixture.requestAId],
        ),
      '23503',
      'audit_events_tenant_id_entity_id_fkey',
    );
  });

  it('enforces membership, enum, usage, and prompt-version constraints', async () => {
    const pool = requireTestPool();

    await expectPostgresFailure(
      () =>
        pool.query(
          `INSERT INTO tenant_memberships (tenant_id, user_id, role)
           VALUES ($1, $2, 'operator')`,
          [fixture.tenantAId, fixture.userAId],
        ),
      '23505',
      'tenant_memberships_tenant_id_user_id_key',
    );
    await expectPostgresFailure(
      () =>
        pool.query(
          `INSERT INTO tenant_memberships (tenant_id, user_id, role)
           VALUES ($1, $2, 'super_admin')`,
          [fixture.tenantAId, fixture.userBId],
        ),
      '22P02',
    );
    await expectPostgresFailure(
      () =>
        pool.query(
          `INSERT INTO ai_runs
             (tenant_id, request_id, prompt_version_id, model_configuration_id, input_tokens)
           VALUES ($1, $2, $3, $4, -1)`,
          [fixture.tenantAId, fixture.requestAId, fixture.promptAId, fixture.modelConfigurationAId],
        ),
      '23514',
      'ai_runs_input_tokens_nonnegative_check',
    );
    await expectPostgresFailure(
      () =>
        pool.query(
          `INSERT INTO prompt_versions (tenant_id, prompt_key, version, content_sha256)
           VALUES ($1, 'request.assessment', 1, $2)`,
          [fixture.tenantAId, 'c'.repeat(64)],
        ),
      '23505',
      'prompt_versions_tenant_key_version_key',
    );
  });
});
