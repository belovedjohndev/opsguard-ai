import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
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
    status: aiRunStatusEnum('status').default('queued').notNull(),
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
