import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { requestSourceTypeEnum, requestStatusEnum } from './enums.js';
import { tenantMemberships, tenants } from './identity.js';

export const requests = pgTable(
  'requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    sourceType: requestSourceTypeEnum('source_type').notNull(),
    sourceReference: varchar('source_reference', { length: 255 }).notNull(),
    createdByMembershipId: uuid('created_by_membership_id'),
    status: requestStatusEnum('status').default('received').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'requests_tenant_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      columns: [table.tenantId, table.createdByMembershipId],
      foreignColumns: [tenantMemberships.tenantId, tenantMemberships.id],
      name: 'requests_tenant_id_created_by_membership_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique('requests_tenant_id_id_key').on(table.tenantId, table.id),
    unique('requests_tenant_id_source_key').on(
      table.tenantId,
      table.sourceType,
      table.sourceReference,
    ),
    check('requests_source_reference_not_blank_check', sql`btrim(${table.sourceReference}) <> ''`),
    index('requests_tenant_id_status_created_at_idx').on(
      table.tenantId,
      table.status,
      table.createdAt,
    ),
    index('requests_tenant_id_creator_idx').on(table.tenantId, table.createdByMembershipId),
  ],
);

export const requestStatusHistory = pgTable(
  'request_status_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    requestId: uuid('request_id').notNull(),
    isInitial: boolean('is_initial').default(false).notNull(),
    previousStatus: requestStatusEnum('previous_status'),
    nextStatus: requestStatusEnum('next_status').notNull(),
    changedByMembershipId: uuid('changed_by_membership_id'),
    changedAt: timestamp('changed_at', { mode: 'date', precision: 3, withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'request_status_history_tenant_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      columns: [table.tenantId, table.requestId],
      foreignColumns: [requests.tenantId, requests.id],
      name: 'request_status_history_tenant_id_request_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      columns: [table.tenantId, table.changedByMembershipId],
      foreignColumns: [tenantMemberships.tenantId, tenantMemberships.id],
      name: 'request_status_history_tenant_id_changed_by_membership_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique('request_status_history_tenant_id_id_key').on(table.tenantId, table.id),
    uniqueIndex('request_status_history_one_initial_per_request_idx')
      .on(table.tenantId, table.requestId)
      .where(sql`${table.isInitial}`),
    check(
      'request_status_history_initial_previous_status_check',
      sql`${table.isInitial} = (${table.previousStatus} IS NULL)`,
    ),
    check(
      'request_status_history_status_changed_check',
      sql`${table.previousStatus} IS NULL OR ${table.previousStatus} <> ${table.nextStatus}`,
    ),
    index('request_status_history_tenant_request_changed_at_idx').on(
      table.tenantId,
      table.requestId,
      table.changedAt,
    ),
    index('request_status_history_tenant_actor_idx').on(
      table.tenantId,
      table.changedByMembershipId,
    ),
  ],
);
