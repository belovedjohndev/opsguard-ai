import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { membershipRoleEnum, membershipStatusEnum, tenantStatusEnum } from './enums.js';

function mutableTimestamps() {
  return {
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true })
      .defaultNow()
      .notNull(),
  };
}

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 63 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    status: tenantStatusEnum('status').default('active').notNull(),
    ...mutableTimestamps(),
  },
  (table) => [
    unique('tenants_slug_key').on(table.slug),
    check('tenants_slug_format_check', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
    check('tenants_name_not_blank_check', sql`btrim(${table.name}) <> ''`),
  ],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 320 }).notNull(),
    ...mutableTimestamps(),
  },
  (table) => [
    unique('users_email_key').on(table.email),
    check(
      'users_email_normalized_check',
      sql`${table.email} = lower(btrim(${table.email})) AND position('@' in ${table.email}) > 1`,
    ),
  ],
);

export const tenantMemberships = pgTable(
  'tenant_memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    role: membershipRoleEnum('role').notNull(),
    status: membershipStatusEnum('status').default('active').notNull(),
    ...mutableTimestamps(),
  },
  (table) => [
    foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
      name: 'tenant_memberships_tenant_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'tenant_memberships_user_id_fkey',
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    unique('tenant_memberships_tenant_id_id_key').on(table.tenantId, table.id),
    unique('tenant_memberships_tenant_id_user_id_key').on(table.tenantId, table.userId),
    index('tenant_memberships_user_id_idx').on(table.userId),
    index('tenant_memberships_tenant_id_status_idx').on(table.tenantId, table.status),
  ],
);
