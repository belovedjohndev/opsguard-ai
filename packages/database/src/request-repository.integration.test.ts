import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CreateRequest } from '@opsguard/application';
import { parseTenantId, parseUserId } from '@opsguard/domain';
import { config as loadEnvironment } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DrizzleActiveMembershipResolver } from './active-membership-resolver.js';
import { resolveApplicationDatabaseUrl } from './database-url.js';
import { DrizzleRequestRepository } from './request-repository.js';
import * as schema from './schema/index.js';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsFolder = path.resolve(packageDirectory, 'migrations');
const testDatabasePrefix = 'opsguard_test_';

loadEnvironment({
  path: path.resolve(packageDirectory, '../../.env'),
  quiet: true,
});

const fixture = {
  activeMembershipId: randomUUID(),
  activeTenantId: randomUUID(),
  activeUserId: randomUUID(),
  suspendedMembershipId: randomUUID(),
  suspendedTenantId: randomUUID(),
  suspendedTenantMembershipId: randomUUID(),
  suspendedTenantUserId: randomUUID(),
  suspendedUserId: randomUUID(),
};

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
  if (!testPool) {
    throw new Error('Request adapter integration test pool is not initialized.');
  }

  return testPool;
};

beforeAll(async () => {
  const adminUrl = resolveApplicationDatabaseUrl(process.env);
  testDatabaseName = `${testDatabasePrefix}${randomUUID().replaceAll('-', '')}`;
  const quotedDatabaseName = quoteTestDatabaseIdentifier(testDatabaseName);

  adminClient = new Client({
    application_name: 'opsguard-request-adapter-integration-admin',
    connectionString: adminUrl,
  });
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE ${quotedDatabaseName} TEMPLATE template0`);

  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${testDatabaseName}`;
  testPool = new Pool({
    application_name: 'opsguard-request-adapter-integration',
    connectionString: testUrl.toString(),
    max: 4,
  });

  const pool = requireTestPool();
  await migrate(drizzle(pool), { migrationsFolder });
  await pool.query(
    `INSERT INTO tenants (id, slug, name, status)
     VALUES
       ($1, 'active-tenant', 'Active Tenant', 'active'),
       ($2, 'suspended-tenant', 'Suspended Tenant', 'suspended')`,
    [fixture.activeTenantId, fixture.suspendedTenantId],
  );
  await pool.query(
    `INSERT INTO users (id, email)
     VALUES
       ($1, 'active@example.test'),
       ($2, 'suspended-membership@example.test'),
       ($3, 'suspended-tenant@example.test')`,
    [fixture.activeUserId, fixture.suspendedUserId, fixture.suspendedTenantUserId],
  );
  await pool.query(
    `INSERT INTO tenant_memberships (id, tenant_id, user_id, role, status)
     VALUES
       ($1, $2, $3, 'operator', 'active'),
       ($4, $2, $5, 'reviewer', 'suspended'),
       ($6, $7, $8, 'owner', 'active')`,
    [
      fixture.activeMembershipId,
      fixture.activeTenantId,
      fixture.activeUserId,
      fixture.suspendedMembershipId,
      fixture.suspendedUserId,
      fixture.suspendedTenantMembershipId,
      fixture.suspendedTenantId,
      fixture.suspendedTenantUserId,
    ],
  );
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

describe.sequential('Drizzle request creation adapters', () => {
  it('resolves only active membership in an active tenant', async () => {
    const database = drizzle(requireTestPool(), { schema });
    const resolver = new DrizzleActiveMembershipResolver(database);
    const activeUserId = parseUserId(fixture.activeUserId);
    const suspendedUserId = parseUserId(fixture.suspendedUserId);
    const suspendedTenantUserId = parseUserId(fixture.suspendedTenantUserId);
    const activeTenantId = parseTenantId(fixture.activeTenantId);
    const suspendedTenantId = parseTenantId(fixture.suspendedTenantId);

    if (
      !activeUserId.ok ||
      !suspendedUserId.ok ||
      !suspendedTenantUserId.ok ||
      !activeTenantId.ok ||
      !suspendedTenantId.ok
    ) {
      throw new Error('Invalid tenant-context integration fixture.');
    }

    const active = await resolver.resolveActiveMembership({
      tenantId: activeTenantId.value,
      userId: activeUserId.value,
    });
    const suspendedMembership = await resolver.resolveActiveMembership({
      tenantId: activeTenantId.value,
      userId: suspendedUserId.value,
    });
    const suspendedTenant = await resolver.resolveActiveMembership({
      tenantId: suspendedTenantId.value,
      userId: suspendedTenantUserId.value,
    });
    const crossTenant = await resolver.resolveActiveMembership({
      tenantId: suspendedTenantId.value,
      userId: activeUserId.value,
    });

    expect(active).toEqual({
      ok: true,
      value: { membershipId: fixture.activeMembershipId, role: 'operator' },
    });
    expect(suspendedMembership).toEqual({ ok: true, value: null });
    expect(suspendedTenant).toEqual({ ok: true, value: null });
    expect(crossTenant).toEqual({ ok: true, value: null });
  });

  it('persists request, initial history, and a minimal creation audit atomically', async () => {
    const pool = requireTestPool();
    const generatedRequestId = randomUUID();
    const createdAt = new Date('2026-07-18T09:00:00.000Z');
    const useCase = new CreateRequest({
      clock: () => createdAt,
      generateRequestId: () => generatedRequestId,
      requestRepository: new DrizzleRequestRepository(drizzle(pool, { schema })),
    });

    const result = await useCase.execute({
      actorMembershipId: fixture.activeMembershipId,
      sourceReference: 'adapter-valid-source',
      sourceType: 'form',
      tenantId: fixture.activeTenantId,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        createdAt,
        requestId: generatedRequestId,
        status: 'received',
        tenantId: fixture.activeTenantId,
      },
    });

    const persisted = await pool.query<{
      actor_membership_id: string;
      event_type: string;
      history_tenant_id: string;
      metadata: unknown;
      request_tenant_id: string;
    }>(
      `SELECT
         a.actor_membership_id,
         a.event_type,
         a.metadata,
         h.tenant_id AS history_tenant_id,
         r.tenant_id AS request_tenant_id
       FROM requests r
       JOIN request_status_history h ON h.request_id = r.id AND h.tenant_id = r.tenant_id
       JOIN audit_events a ON a.entity_id = r.id AND a.tenant_id = r.tenant_id
       WHERE r.id = $1`,
      [generatedRequestId],
    );

    expect(persisted.rows).toEqual([
      {
        actor_membership_id: fixture.activeMembershipId,
        event_type: 'request.created',
        history_tenant_id: fixture.activeTenantId,
        metadata: { sourceType: 'form', status: 'received' },
        request_tenant_id: fixture.activeTenantId,
      },
    ]);
  });

  it('maps only the tenant-scoped source constraint to a conflict', async () => {
    const pool = requireTestPool();
    const useCase = new CreateRequest({
      clock: () => new Date('2026-07-18T09:05:00.000Z'),
      generateRequestId: () => randomUUID(),
      requestRepository: new DrizzleRequestRepository(drizzle(pool, { schema })),
    });

    const result = await useCase.execute({
      actorMembershipId: fixture.activeMembershipId,
      sourceReference: 'adapter-valid-source',
      sourceType: 'form',
      tenantId: fixture.activeTenantId,
    });

    expect(result).toEqual({ ok: false, error: { code: 'REQUEST_ALREADY_EXISTS' } });
    const count = await pool.query<{ count: string }>(
      `SELECT count(*) FROM requests
       WHERE tenant_id = $1 AND source_type = 'form' AND source_reference = 'adapter-valid-source'`,
      [fixture.activeTenantId],
    );
    expect(count.rows[0]?.count).toBe('1');
  });

  it('rolls back request and history when the audit insert fails', async () => {
    const pool = requireTestPool();
    const generatedRequestId = randomUUID();
    await pool.query(`
      CREATE FUNCTION fail_test_request_created_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.event_type = 'request.created' AND NEW.metadata->>'sourceType' = 'webhook' THEN
          RAISE EXCEPTION 'forced test audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_test_request_created_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_test_request_created_audit();
    `);

    const useCase = new CreateRequest({
      clock: () => new Date('2026-07-18T09:10:00.000Z'),
      generateRequestId: () => generatedRequestId,
      requestRepository: new DrizzleRequestRepository(drizzle(pool, { schema })),
    });
    const result = await useCase.execute({
      actorMembershipId: fixture.activeMembershipId,
      sourceReference: 'adapter-rollback-source',
      sourceType: 'webhook',
      tenantId: fixture.activeTenantId,
    });

    expect(result).toEqual({
      ok: false,
      error: { code: 'UNEXPECTED_REQUEST_REPOSITORY_FAILURE' },
    });
    const counts = await pool.query<{
      audit_count: string;
      history_count: string;
      request_count: string;
    }>(
      `SELECT
         (SELECT count(*) FROM requests WHERE id = $1) AS request_count,
         (SELECT count(*) FROM request_status_history WHERE request_id = $1) AS history_count,
         (SELECT count(*) FROM audit_events WHERE entity_id = $1) AS audit_count`,
      [generatedRequestId],
    );
    expect(counts.rows[0]).toEqual({
      audit_count: '0',
      history_count: '0',
      request_count: '0',
    });
  });
});
