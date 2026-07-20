import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FinalizeAssessmentRun, InitializeAssessmentRun } from '@opsguard/application';
import type { RequestId, TenantId, TenantMembershipId } from '@opsguard/domain';
import { config as loadEnvironment } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveApplicationDatabaseUrl } from './database-url.js';
import { DrizzleRequestAssessmentRepository } from './request-assessment-repository.js';
import * as schema from './schema/index.js';

const packageDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsFolder = path.resolve(packageDirectory, 'migrations');
const testDatabasePrefix = 'opsguard_test_';

loadEnvironment({
  path: path.resolve(packageDirectory, '../../.env'),
  quiet: true,
});

const fixture = {
  membershipId: randomUUID(),
  tenantId: randomUUID(),
  otherTenantId: randomUUID(),
  userId: randomUUID(),
};

const prompt = {
  key: 'request.assessment',
  version: 1,
  contentSha256: 'a'.repeat(64),
} as const;

const modelConfiguration = {
  configurationKey: 'request.assessment.default',
  provider: 'openai',
  model: 'integration-test-model',
} as const;

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
    throw new Error('Request assessment integration test pool is not initialized.');
  }

  return testPool;
};

const asTenantId = (value: string): TenantId => value as TenantId;
const asRequestId = (value: string): RequestId => value as RequestId;
const asMembershipId = (value: string): TenantMembershipId => value as TenantMembershipId;

const insertReceivedRequest = async (
  pool: Pool,
  input: {
    requestId: string;
    sourceReference: string;
    createdAt: Date;
  },
): Promise<void> => {
  await pool.query(
    `INSERT INTO requests (
       id,
       tenant_id,
       source_type,
       source_reference,
       created_by_membership_id,
       status,
       created_at,
       updated_at
     )
     VALUES ($1, $2, 'form', $3, $4, 'received', $5, $5)`,
    [
      input.requestId,
      fixture.tenantId,
      input.sourceReference,
      fixture.membershipId,
      input.createdAt,
    ],
  );

  await pool.query(
    `INSERT INTO request_status_history (
       tenant_id,
       request_id,
       is_initial,
       previous_status,
       next_status,
       changed_by_membership_id,
       changed_at
     )
     VALUES ($1, $2, true, null, 'received', $3, $4)`,
    [fixture.tenantId, input.requestId, fixture.membershipId, input.createdAt],
  );
};

const initializeInput = (
  requestId: string,
  changedAt: Date,
  overrides: Partial<{
    contentSha256: string;
    promptKey: string;
    tenantId: string;
  }> = {},
): InitializeAssessmentRun =>
  ({
    tenantId: asTenantId(overrides.tenantId ?? fixture.tenantId),
    requestId: asRequestId(requestId),
    actorMembershipId: asMembershipId(fixture.membershipId),
    transition: {
      kind: 'transition',
      tenantId: asTenantId(overrides.tenantId ?? fixture.tenantId),
      requestId: asRequestId(requestId),
      previousStatus: 'received',
      nextStatus: 'assessing',
      changedByMembershipId: asMembershipId(fixture.membershipId),
      changedAt,
    },
    prompt: {
      ...prompt,
      key: overrides.promptKey ?? prompt.key,
      contentSha256: overrides.contentSha256 ?? prompt.contentSha256,
    },
    modelConfiguration,
  }) satisfies InitializeAssessmentRun;

const successfulFinalizeInput = (
  requestId: string,
  aiRunId: string,
  changedAt: Date,
): FinalizeAssessmentRun =>
  ({
    tenantId: asTenantId(fixture.tenantId),
    requestId: asRequestId(requestId),
    aiRunId,
    actorMembershipId: asMembershipId(fixture.membershipId),
    transition: {
      kind: 'transition',
      tenantId: asTenantId(fixture.tenantId),
      requestId: asRequestId(requestId),
      previousStatus: 'assessing',
      nextStatus: 'completed',
      changedByMembershipId: asMembershipId(fixture.membershipId),
      changedAt,
    },
    outcome: {
      status: 'succeeded',
      assessment: {
        schemaVersion: 'request-assessment-v1',
        intent: 'support_request',
        confidence: 0.92,
        customer: {
          name: 'Test Customer',
          email: 'customer@example.test',
          phone: null,
          accountReference: 'acct-123',
        },
        serviceRequest: {
          summary: 'Existing service is unavailable.',
          requestedService: 'Restore service',
          requestedTiming: 'As soon as possible',
          location: null,
        },
        urgencyIndicators: ['service_outage'],
        missingInformation: [],
        proposedRoute: 'support',
        evidenceReferences: [
          {
            field: 'serviceRequest.summary',
            start: 0,
            end: 20,
          },
        ],
      },
      effectiveRoute: 'support',
      requiresReview: false,
      completion: {
        providerRequestId: 'provider-request-integration-1',
        usage: {
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
        },
        latencyMilliseconds: 321,
      },
    },
  }) satisfies FinalizeAssessmentRun;

beforeAll(async () => {
  const adminUrl = resolveApplicationDatabaseUrl(process.env);
  testDatabaseName = `${testDatabasePrefix}${randomUUID().replaceAll('-', '')}`;
  const quotedDatabaseName = quoteTestDatabaseIdentifier(testDatabaseName);

  adminClient = new Client({
    application_name: 'opsguard-request-assessment-integration-admin',
    connectionString: adminUrl,
  });
  await adminClient.connect();
  await adminClient.query(`CREATE DATABASE ${quotedDatabaseName} TEMPLATE template0`);

  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${testDatabaseName}`;
  testPool = new Pool({
    application_name: 'opsguard-request-assessment-integration',
    connectionString: testUrl.toString(),
    max: 4,
  });

  const pool = requireTestPool();
  await migrate(drizzle(pool), { migrationsFolder });

  await pool.query(
    `INSERT INTO tenants (id, slug, name, status)
     VALUES
       ($1, 'assessment-tenant', 'Assessment Tenant', 'active'),
       ($2, 'assessment-other', 'Assessment Other Tenant', 'active')`,
    [fixture.tenantId, fixture.otherTenantId],
  );

  await pool.query(
    `INSERT INTO users (id, email)
     VALUES ($1, 'assessment-operator@example.test')`,
    [fixture.userId],
  );

  await pool.query(
    `INSERT INTO tenant_memberships (id, tenant_id, user_id, role, status)
     VALUES ($1, $2, $3, 'operator', 'active')`,
    [fixture.membershipId, fixture.tenantId, fixture.userId],
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

describe.sequential('Drizzle request assessment repository', () => {
  it('initializes the request transition, versions, running AI run, and audit atomically', async () => {
    const pool = requireTestPool();
    const requestId = randomUUID();
    const createdAt = new Date('2026-07-20T00:00:00.000Z');
    const startedAt = new Date('2026-07-20T00:01:00.000Z');

    await insertReceivedRequest(pool, {
      requestId,
      sourceReference: `assessment-init-${requestId}`,
      createdAt,
    });

    const repository = new DrizzleRequestAssessmentRepository(drizzle(pool, { schema }));

    const crossTenantLoad = await repository.loadRequestContext({
      tenantId: asTenantId(fixture.otherTenantId),
      requestId: asRequestId(requestId),
    });
    expect(crossTenantLoad).toEqual({ ok: true, value: null });

    const initialized = await repository.initializeAssessmentRun(
      initializeInput(requestId, startedAt),
    );

    expect(initialized.ok).toBe(true);
    if (!initialized.ok) {
      throw new Error(`Unexpected initialization failure: ${initialized.error.code}`);
    }

    const persisted = await pool.query<{
      ai_run_status: string;
      audit_event_type: string;
      history_next_status: string;
      model: string;
      prompt_hash: string;
      request_status: string;
    }>(
      `SELECT
         r.status AS request_status,
         h.next_status AS history_next_status,
         ar.status AS ai_run_status,
         pv.content_sha256 AS prompt_hash,
         mc.model,
         ae.event_type AS audit_event_type
       FROM requests r
       JOIN request_status_history h
         ON h.tenant_id = r.tenant_id
        AND h.request_id = r.id
        AND h.is_initial = false
       JOIN ai_runs ar
         ON ar.tenant_id = r.tenant_id
        AND ar.request_id = r.id
       JOIN prompt_versions pv
         ON pv.tenant_id = ar.tenant_id
        AND pv.id = ar.prompt_version_id
       JOIN model_configurations mc
         ON mc.tenant_id = ar.tenant_id
        AND mc.id = ar.model_configuration_id
       JOIN audit_events ae
         ON ae.tenant_id = r.tenant_id
        AND ae.entity_id = r.id
        AND ae.event_type = 'request.assessment_started'
       WHERE r.tenant_id = $1 AND r.id = $2`,
      [fixture.tenantId, requestId],
    );

    expect(persisted.rows).toEqual([
      {
        ai_run_status: 'running',
        audit_event_type: 'request.assessment_started',
        history_next_status: 'assessing',
        model: modelConfiguration.model,
        prompt_hash: prompt.contentSha256,
        request_status: 'assessing',
      },
    ]);
  });

  it('finalizes a successful assessment and persists only validated structured fields', async () => {
    const pool = requireTestPool();
    const requestId = randomUUID();
    const createdAt = new Date('2026-07-20T01:00:00.000Z');
    const startedAt = new Date('2026-07-20T01:01:00.000Z');
    const completedAt = new Date('2026-07-20T01:02:00.000Z');

    await insertReceivedRequest(pool, {
      requestId,
      sourceReference: `assessment-success-${requestId}`,
      createdAt,
    });

    const repository = new DrizzleRequestAssessmentRepository(drizzle(pool, { schema }));
    const initialized = await repository.initializeAssessmentRun(
      initializeInput(requestId, startedAt),
    );

    expect(initialized.ok).toBe(true);
    if (!initialized.ok) {
      throw new Error(`Unexpected initialization failure: ${initialized.error.code}`);
    }

    const finalized = await repository.finalizeAssessmentRun(
      successfulFinalizeInput(requestId, initialized.value.aiRunId, completedAt),
    );

    expect(finalized).toEqual({ ok: true, value: undefined });

    const persisted = await pool.query<{
      ai_run_status: string;
      audit_event_type: string;
      confidence_basis_points: number;
      effective_route: string;
      error_classification: string | null;
      input_tokens: number;
      intent: string;
      output_tokens: number;
      provider_request_id: string;
      request_status: string;
      requires_review: boolean;
      schema_version: string;
    }>(
      `SELECT
         r.status AS request_status,
         ar.status AS ai_run_status,
         ar.provider_request_id,
         ar.input_tokens,
         ar.output_tokens,
         ar.error_classification,
         ra.schema_version,
         ra.intent,
         ra.confidence_basis_points,
         ra.effective_route,
         ra.requires_review,
         ae.event_type AS audit_event_type
       FROM requests r
       JOIN ai_runs ar
         ON ar.tenant_id = r.tenant_id
        AND ar.request_id = r.id
       JOIN request_assessments ra
         ON ra.tenant_id = ar.tenant_id
        AND ra.ai_run_id = ar.id
       JOIN audit_events ae
         ON ae.tenant_id = r.tenant_id
        AND ae.entity_id = r.id
        AND ae.event_type = 'request.assessment_completed'
       WHERE r.tenant_id = $1 AND r.id = $2`,
      [fixture.tenantId, requestId],
    );

    expect(persisted.rows).toEqual([
      {
        ai_run_status: 'succeeded',
        audit_event_type: 'request.assessment_completed',
        confidence_basis_points: 9200,
        effective_route: 'support',
        error_classification: null,
        input_tokens: 120,
        intent: 'support_request',
        output_tokens: 45,
        provider_request_id: 'provider-request-integration-1',
        request_status: 'completed',
        requires_review: false,
        schema_version: 'request-assessment-v1',
      },
    ]);

    const metadata = await pool.query<{ metadata: Record<string, unknown> }>(
      `SELECT metadata
       FROM audit_events
       WHERE tenant_id = $1
         AND entity_id = $2
         AND event_type = 'request.assessment_completed'`,
      [fixture.tenantId, requestId],
    );

    expect(metadata.rows[0]?.metadata).toEqual({
      effectiveRoute: 'support',
      intent: 'support_request',
      proposedRoute: 'support',
      requiresReview: false,
      schemaVersion: 'request-assessment-v1',
    });
    expect(JSON.stringify(metadata.rows[0]?.metadata)).not.toContain('customer@example.test');
    expect(JSON.stringify(metadata.rows[0]?.metadata)).not.toContain(
      'Existing service is unavailable.',
    );
  });

  it('rolls back initialization when an existing prompt version has a conflicting hash', async () => {
    const pool = requireTestPool();
    const requestId = randomUUID();
    const createdAt = new Date('2026-07-20T02:00:00.000Z');
    const startedAt = new Date('2026-07-20T02:01:00.000Z');

    await insertReceivedRequest(pool, {
      requestId,
      sourceReference: `assessment-prompt-conflict-${requestId}`,
      createdAt,
    });

    const conflictingPromptKey = 'request.assessment.conflict';

    await pool.query(
      `INSERT INTO prompt_versions (
         tenant_id,
         prompt_key,
         version,
         content_sha256
       )
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, prompt_key, version) DO UPDATE
       SET content_sha256 = EXCLUDED.content_sha256`,
      [fixture.tenantId, conflictingPromptKey, prompt.version, 'b'.repeat(64)],
    );

    const repository = new DrizzleRequestAssessmentRepository(drizzle(pool, { schema }));
    const result = await repository.initializeAssessmentRun(
      initializeInput(requestId, startedAt, {
        promptKey: conflictingPromptKey,
      }),
    );

    expect(result).toEqual({ ok: false, error: { code: 'CONFLICT' } });

    const persisted = await pool.query<{
      ai_run_count: string;
      non_initial_history_count: string;
      request_status: string;
      started_audit_count: string;
    }>(
      `SELECT
         r.status AS request_status,
         (SELECT count(*) FROM ai_runs ar
           WHERE ar.tenant_id = r.tenant_id AND ar.request_id = r.id) AS ai_run_count,
         (SELECT count(*) FROM request_status_history h
           WHERE h.tenant_id = r.tenant_id
             AND h.request_id = r.id
             AND h.is_initial = false) AS non_initial_history_count,
         (SELECT count(*) FROM audit_events ae
           WHERE ae.tenant_id = r.tenant_id
             AND ae.entity_id = r.id
             AND ae.event_type = 'request.assessment_started') AS started_audit_count
       FROM requests r
       WHERE r.tenant_id = $1 AND r.id = $2`,
      [fixture.tenantId, requestId],
    );

    expect(persisted.rows).toEqual([
      {
        ai_run_count: '0',
        non_initial_history_count: '0',
        request_status: 'received',
        started_audit_count: '0',
      },
    ]);
  });

  it('rolls back finalization when the final audit insert fails', async () => {
    const pool = requireTestPool();
    const requestId = randomUUID();
    const createdAt = new Date('2026-07-20T03:00:00.000Z');
    const startedAt = new Date('2026-07-20T03:01:00.000Z');
    const completedAt = new Date('2026-07-20T03:02:00.000Z');

    await insertReceivedRequest(pool, {
      requestId,
      sourceReference: `assessment-finalize-rollback-${requestId}`,
      createdAt,
    });

    const repository = new DrizzleRequestAssessmentRepository(drizzle(pool, { schema }));
    const initialized = await repository.initializeAssessmentRun(
      initializeInput(requestId, startedAt),
    );

    expect(initialized.ok).toBe(true);
    if (!initialized.ok) {
      throw new Error(`Unexpected initialization failure: ${initialized.error.code}`);
    }

    await pool.query(`
      CREATE FUNCTION fail_test_assessment_completed_audit() RETURNS trigger AS $$
      BEGIN
        IF NEW.event_type = 'request.assessment_completed' THEN
          RAISE EXCEPTION 'forced assessment completion audit failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER fail_test_assessment_completed_audit_trigger
      BEFORE INSERT ON audit_events
      FOR EACH ROW EXECUTE FUNCTION fail_test_assessment_completed_audit();
    `);

    const finalized = await repository.finalizeAssessmentRun(
      successfulFinalizeInput(requestId, initialized.value.aiRunId, completedAt),
    );

    expect(finalized).toEqual({ ok: false, error: { code: 'UNEXPECTED' } });

    const persisted = await pool.query<{
      ai_run_status: string;
      assessment_count: string;
      final_history_count: string;
      request_status: string;
    }>(
      `SELECT
         r.status AS request_status,
         ar.status AS ai_run_status,
         (SELECT count(*) FROM request_assessments ra
           WHERE ra.tenant_id = r.tenant_id AND ra.request_id = r.id) AS assessment_count,
         (SELECT count(*) FROM request_status_history h
           WHERE h.tenant_id = r.tenant_id
             AND h.request_id = r.id
             AND h.previous_status = 'assessing') AS final_history_count
       FROM requests r
       JOIN ai_runs ar
         ON ar.tenant_id = r.tenant_id
        AND ar.request_id = r.id
       WHERE r.tenant_id = $1 AND r.id = $2`,
      [fixture.tenantId, requestId],
    );

    expect(persisted.rows).toEqual([
      {
        ai_run_status: 'running',
        assessment_count: '0',
        final_history_count: '0',
        request_status: 'assessing',
      },
    ]);
  });
});
