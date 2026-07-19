import { pgEnum } from 'drizzle-orm/pg-core';

export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended']);

export const membershipRoleEnum = pgEnum('membership_role', [
  'owner',
  'operations_manager',
  'reviewer',
  'operator',
  'auditor',
]);

export const membershipStatusEnum = pgEnum('membership_status', ['active', 'suspended']);

export const requestSourceTypeEnum = pgEnum('request_source_type', [
  'form',
  'email',
  'webhook',
  'service_account',
]);

export const requestStatusEnum = pgEnum('request_status', [
  'received',
  'assessing',
  'needs_information',
  'pending_review',
  'rejected',
  'completed',
  'failed',
]);

export const aiRunStatusEnum = pgEnum('ai_run_status', [
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);
