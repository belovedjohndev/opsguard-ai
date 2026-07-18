import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { tenantMemberships, tenants } from './identity.js';
import { requests } from './requests.js';

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actorMembershipId: uuid('actor_membership_id'),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    occurredAt: timestamp('occurred_at', { mode: 'date', precision: 3, withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb('metadata')
      .default(sql`'{}'::jsonb`)
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'audit_events_tenant_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      columns: [table.tenantId, table.actorMembershipId],
      foreignColumns: [tenantMemberships.tenantId, tenantMemberships.id],
      name: 'audit_events_tenant_id_actor_membership_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      columns: [table.tenantId, table.entityId],
      foreignColumns: [requests.tenantId, requests.id],
      name: 'audit_events_tenant_id_entity_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique('audit_events_tenant_id_id_key').on(table.tenantId, table.id),
    check(
      'audit_events_event_type_format_check',
      sql`${table.eventType} ~ '^[a-z][a-z0-9_.-]{2,99}$'`,
    ),
    check('audit_events_entity_type_request_check', sql`${table.entityType} = 'request'`),
    check('audit_events_metadata_object_check', sql`jsonb_typeof(${table.metadata}) = 'object'`),
    check('audit_events_metadata_size_check', sql`octet_length(${table.metadata}::text) <= 16384`),
    index('audit_events_tenant_occurred_at_idx').on(table.tenantId, table.occurredAt),
    index('audit_events_tenant_entity_occurred_at_idx').on(
      table.tenantId,
      table.entityType,
      table.entityId,
      table.occurredAt,
    ),
    index('audit_events_tenant_actor_idx').on(table.tenantId, table.actorMembershipId),
  ],
);
