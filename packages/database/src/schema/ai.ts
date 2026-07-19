import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { aiRunStatusEnum } from './enums.js';
import { tenants } from './identity.js';
import { requests } from './requests.js';

export const promptVersions = pgTable(
  'prompt_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    promptKey: varchar('prompt_key', { length: 100 }).notNull(),
    version: integer('version').notNull(),
    contentSha256: varchar('content_sha256', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'prompt_versions_tenant_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique('prompt_versions_tenant_id_id_key').on(table.tenantId, table.id),
    unique('prompt_versions_tenant_key_version_key').on(
      table.tenantId,
      table.promptKey,
      table.version,
    ),
    check(
      'prompt_versions_prompt_key_format_check',
      sql`${table.promptKey} ~ '^[a-z][a-z0-9_.-]{1,99}$'`,
    ),
    check('prompt_versions_version_positive_check', sql`${table.version} > 0`),
    check(
      'prompt_versions_content_sha256_format_check',
      sql`${table.contentSha256} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const modelConfigurations = pgTable(
  'model_configurations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    configurationKey: varchar('configuration_key', { length: 100 }).notNull(),
    provider: varchar('provider', { length: 100 }).notNull(),
    model: varchar('model', { length: 200 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'model_configurations_tenant_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique('model_configurations_tenant_id_id_key').on(table.tenantId, table.id),
    unique('model_configurations_tenant_configuration_key_key').on(
      table.tenantId,
      table.configurationKey,
    ),
    check(
      'model_configurations_configuration_key_format_check',
      sql`${table.configurationKey} ~ '^[a-z][a-z0-9_.-]{1,99}$'`,
    ),
    check('model_configurations_provider_not_blank_check', sql`btrim(${table.provider}) <> ''`),
    check('model_configurations_model_not_blank_check', sql`btrim(${table.model}) <> ''`),
  ],
);

export const aiRuns = pgTable(
  'ai_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    requestId: uuid('request_id').notNull(),
    promptVersionId: uuid('prompt_version_id').notNull(),
    modelConfigurationId: uuid('model_configuration_id').notNull(),
    status: aiRunStatusEnum('status').default('running').notNull(),
    providerRequestId: varchar('provider_request_id', { length: 255 }),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    latencyMs: integer('latency_ms'),
    errorClassification: varchar('error_classification', { length: 100 }),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true })
      .defaultNow()
      .notNull(),
    startedAt: timestamp('started_at', { mode: 'date', precision: 3, withTimezone: true }),
    completedAt: timestamp('completed_at', { mode: 'date', precision: 3, withTimezone: true }),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'ai_runs_tenant_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      columns: [table.tenantId, table.requestId],
      foreignColumns: [requests.tenantId, requests.id],
      name: 'ai_runs_tenant_id_request_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      columns: [table.tenantId, table.promptVersionId],
      foreignColumns: [promptVersions.tenantId, promptVersions.id],
      name: 'ai_runs_tenant_id_prompt_version_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      columns: [table.tenantId, table.modelConfigurationId],
      foreignColumns: [modelConfigurations.tenantId, modelConfigurations.id],
      name: 'ai_runs_tenant_id_model_configuration_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique('ai_runs_tenant_id_id_key').on(table.tenantId, table.id),
    uniqueIndex('ai_runs_tenant_model_provider_request_key')
      .on(table.tenantId, table.modelConfigurationId, table.providerRequestId)
      .where(sql`${table.providerRequestId} IS NOT NULL`),
    check(
      'ai_runs_input_tokens_nonnegative_check',
      sql`${table.inputTokens} IS NULL OR ${table.inputTokens} >= 0`,
    ),
    check(
      'ai_runs_output_tokens_nonnegative_check',
      sql`${table.outputTokens} IS NULL OR ${table.outputTokens} >= 0`,
    ),
    check(
      'ai_runs_latency_ms_nonnegative_check',
      sql`${table.latencyMs} IS NULL OR ${table.latencyMs} >= 0`,
    ),
    check(
      'ai_runs_timeline_check',
      sql`(${table.startedAt} IS NULL OR ${table.startedAt} >= ${table.createdAt})
        AND (${table.completedAt} IS NULL OR
          (${table.startedAt} IS NOT NULL AND ${table.completedAt} >= ${table.startedAt}))`,
    ),
    index('ai_runs_tenant_request_created_at_idx').on(
      table.tenantId,
      table.requestId,
      table.createdAt,
    ),
    index('ai_runs_tenant_prompt_version_idx').on(table.tenantId, table.promptVersionId),
    index('ai_runs_tenant_model_configuration_idx').on(table.tenantId, table.modelConfigurationId),
  ],
);

export const requestAssessments = pgTable(
  'request_assessments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    requestId: uuid('request_id').notNull(),
    aiRunId: uuid('ai_run_id').notNull(),
    schemaVersion: varchar('schema_version', { length: 50 }).notNull(),
    intent: varchar('intent', { length: 50 }).notNull(),
    confidenceBasisPoints: integer('confidence_basis_points').notNull(),
    proposedRoute: varchar('proposed_route', { length: 50 }).notNull(),
    effectiveRoute: varchar('effective_route', { length: 50 }).notNull(),
    requiresReview: boolean('requires_review').notNull(),
    customer: jsonb('customer').notNull(),
    serviceRequest: jsonb('service_request').notNull(),
    urgencyIndicators: jsonb('urgency_indicators').notNull(),
    missingInformation: jsonb('missing_information').notNull(),
    evidenceReferences: jsonb('evidence_references').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'request_assessments_tenant_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      columns: [table.tenantId, table.requestId],
      foreignColumns: [requests.tenantId, requests.id],
      name: 'request_assessments_tenant_id_request_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      columns: [table.tenantId, table.aiRunId],
      foreignColumns: [aiRuns.tenantId, aiRuns.id],
      name: 'request_assessments_tenant_id_ai_run_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique('request_assessments_tenant_id_id_key').on(table.tenantId, table.id),
    unique('request_assessments_tenant_ai_run_key').on(table.tenantId, table.aiRunId),
    check(
      'request_assessments_schema_version_check',
      sql`${table.schemaVersion} = 'request-assessment-v1'`,
    ),
    check(
      'request_assessments_confidence_basis_points_check',
      sql`${table.confidenceBasisPoints} BETWEEN 0 AND 10000`,
    ),
    check(
      'request_assessments_intent_check',
      sql`${table.intent} IN ('new_service_request', 'support_request', 'billing_request', 'complaint', 'cancellation_request', 'general_inquiry', 'unrelated', 'unknown')`,
    ),
    check(
      'request_assessments_proposed_route_check',
      sql`${table.proposedRoute} IN ('sales', 'support', 'billing', 'operations', 'manual_review', 'reject_unrelated')`,
    ),
    check(
      'request_assessments_effective_route_check',
      sql`${table.effectiveRoute} IN ('sales', 'support', 'billing', 'operations', 'manual_review', 'reject_unrelated')`,
    ),
    check(
      'request_assessments_customer_object_check',
      sql`jsonb_typeof(${table.customer}) = 'object'`,
    ),
    check(
      'request_assessments_service_request_object_check',
      sql`jsonb_typeof(${table.serviceRequest}) = 'object'`,
    ),
    check(
      'request_assessments_urgency_array_check',
      sql`jsonb_typeof(${table.urgencyIndicators}) = 'array'`,
    ),
    check(
      'request_assessments_missing_information_array_check',
      sql`jsonb_typeof(${table.missingInformation}) = 'array'`,
    ),
    check(
      'request_assessments_evidence_references_array_check',
      sql`jsonb_typeof(${table.evidenceReferences}) = 'array'`,
    ),
    check(
      'request_assessments_json_size_check',
      sql`octet_length(${table.customer}::text) + octet_length(${table.serviceRequest}::text) + octet_length(${table.urgencyIndicators}::text) + octet_length(${table.missingInformation}::text) + octet_length(${table.evidenceReferences}::text) <= 16384`,
    ),
    index('request_assessments_tenant_request_created_at_idx').on(
      table.tenantId,
      table.requestId,
      table.createdAt,
    ),
  ],
);
