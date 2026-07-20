import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { AssessRequest, CreateRequest } from '@opsguard/application';
import { createModelSuccess, FakeModelGateway } from '@opsguard/ai-core';
import {
  DrizzleActiveMembershipResolver,
  DrizzleRequestAssessmentRepository,
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
  const modelSuccess = createModelSuccess({
    output: {
      schemaVersion: 'request-assessment-v1',
      intent: 'new_service_request',
      confidence: 0.97,
      customer: {
        name: 'Maria Santos',
        email: 'maria.santos@example.test',
        phone: null,
        accountReference: null,
      },
      serviceRequest: {
        summary: 'Install a new split-system air conditioner.',
        requestedService: 'new split-system air conditioner',
        requestedTiming: 'next Tuesday',
        location: '42 Pine Street, Cebu City',
      },
      urgencyIndicators: ['time_sensitive'],
      missingInformation: [],
      proposedRoute: 'sales',
      evidenceReferences: [],
    },
    providerId: 'synthetic-provider',
    modelId: 'synthetic-model',
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    completionState: 'completed',
    latencyMilliseconds: 25,
  });
  if (!modelSuccess.ok) throw new Error('API integration model fixture must be valid.');
  const app = buildApiApp({
    activeMembershipResolver: new DrizzleActiveMembershipResolver(database),
    assessRequest: new AssessRequest({
      clock: () => new Date(),
      modelConfiguration: {
        configurationKey: 'request.assessment.integration',
        provider: 'synthetic-provider',
        model: 'synthetic-model',
      },
      modelGateway: new FakeModelGateway([modelSuccess.value]),
      requestAssessmentRepository: new DrizzleRequestAssessmentRepository(database),
      timeoutMilliseconds: 10_000,
    }),
    corsAllowedOrigins: ['http://localhost:5173'],
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

  it('assesses a tenant-owned request and persists validated policy and provenance records', async () => {
    const app = buildDatabaseBackedApp();
    const requestText =
      'Maria Santos at maria.santos@example.test needs a new split-system air conditioner installed at 42 Pine Street, Cebu City next Tuesday.';
    const created = await app.inject({
      headers: tenantAHeaders,
      method: 'POST',
      payload: { sourceReference: `api-assessment-${randomUUID()}`, sourceType: 'form' },
      url: '/v1/requests',
    });
    const createdBody = created.json<{ requestId: string }>();

    const assessed = await app.inject({
      headers: tenantAHeaders,
      method: 'POST',
      payload: { requestText, tenantId: fixture.tenantBId },
      url: `/v1/requests/${createdBody.requestId}/assessment`,
    });

    expect(assessed.statusCode).toBe(200);
    expect(assessed.json()).toMatchObject({
      requestId: createdBody.requestId,
      status: 'pending_review',
      aiRunStatus: 'succeeded',
      assessment: { intent: 'new_service_request', proposedRoute: 'sales' },
      decision: {
        effectiveRoute: 'sales',
        requiresReview: false,
        modelRouteOverridden: false,
      },
      provenance: {
        promptKey: 'request.assessment',
        promptVersion: 2,
        provider: 'synthetic-provider',
        model: 'synthetic-model',
      },
    });
    expect(assessed.json<{ correlationId: string }>().correlationId).toBe(
      assessed.headers['x-request-id'],
    );

    const persisted = await requireTestPool().query<{
      assessment_count: string;
      request_status: string;
      run_status: string;
    }>(
      `SELECT
         r.status AS request_status,
         (SELECT count(*) FROM ai_runs ar
           WHERE ar.tenant_id = r.tenant_id AND ar.request_id = r.id
             AND ar.status = 'succeeded') AS run_status,
         (SELECT count(*) FROM request_assessments ra
           WHERE ra.tenant_id = r.tenant_id AND ra.request_id = r.id) AS assessment_count
       FROM requests r
       WHERE r.tenant_id = $1 AND r.id = $2`,
      [fixture.tenantAId, createdBody.requestId],
    );
    expect(persisted.rows).toEqual([
      { assessment_count: '1', request_status: 'pending_review', run_status: '1' },
    ]);
  });

  it('does not reveal a request across an active tenant boundary', async () => {
    const app = buildDatabaseBackedApp();
    const created = await app.inject({
      headers: tenantAHeaders,
      method: 'POST',
      payload: { sourceReference: `api-cross-tenant-${randomUUID()}`, sourceType: 'form' },
      url: '/v1/requests',
    });
    const createdBody = created.json<{ requestId: string }>();

    const response = await app.inject({
      headers: {
        'x-opsguard-tenant-id': fixture.tenantBId,
        'x-opsguard-user-id': fixture.userBId,
      },
      method: 'POST',
      payload: { requestText: 'Synthetic cross-tenant attempt.' },
      url: `/v1/requests/${createdBody.requestId}/assessment`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'REQUEST_NOT_FOUND' } });
  });
});
