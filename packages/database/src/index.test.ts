import { describe, expect, it } from 'vitest';
import { getTableName } from 'drizzle-orm';

import {
  aiRuns,
  auditEvents,
  modelConfigurations,
  promptVersions,
  requests,
  requestStatusHistory,
  resolveApplicationDatabaseUrl,
  tenantMemberships,
  tenants,
  users,
} from './index.js';

describe('@opsguard/database schema foundation', () => {
  it('exports exactly the nine Day 4 tables', () => {
    const tableNames = [
      tenants,
      users,
      tenantMemberships,
      requests,
      requestStatusHistory,
      aiRuns,
      promptVersions,
      modelConfigurations,
      auditEvents,
    ]
      .map((table) => getTableName(table))
      .sort();

    expect(tableNames).toEqual([
      'ai_runs',
      'audit_events',
      'model_configurations',
      'prompt_versions',
      'request_status_history',
      'requests',
      'tenant_memberships',
      'tenants',
      'users',
    ]);
  });

  it('constructs the application URL from existing local settings', () => {
    const connectionUrl = resolveApplicationDatabaseUrl({
      APP_POSTGRES_DATABASE: 'opsguard_app_dev',
      APP_POSTGRES_PASSWORD: 'local password',
      APP_POSTGRES_PORT: '55436',
      APP_POSTGRES_USER: 'opsguard_app',
    });
    const parsed = new URL(connectionUrl);

    expect(parsed.hostname).toBe('127.0.0.1');
    expect(parsed.port).toBe('55436');
    expect(parsed.username).toBe('opsguard_app');
    expect(parsed.password).toBe('local%20password');
    expect(parsed.pathname).toBe('/opsguard_app_dev');
  });

  it('refuses missing, invalid, and Temporal database settings', () => {
    expect(() => resolveApplicationDatabaseUrl({})).toThrow('APP_POSTGRES_PORT is required');
    expect(() =>
      resolveApplicationDatabaseUrl({
        APP_POSTGRES_DATABASE: 'opsguard_app_dev',
        APP_POSTGRES_PASSWORD: 'password',
        APP_POSTGRES_PORT: '70000',
        APP_POSTGRES_USER: 'opsguard_app',
      }),
    ).toThrow('must be between 1 and 65535');
    expect(() =>
      resolveApplicationDatabaseUrl({
        APP_POSTGRES_DATABASE: 'opsguard_temporal_admin',
        APP_POSTGRES_PASSWORD: 'password',
        APP_POSTGRES_PORT: '5432',
        APP_POSTGRES_USER: 'opsguard_app',
        TEMPORAL_POSTGRES_ADMIN_DATABASE: 'opsguard_temporal_admin',
      }),
    ).toThrow('cannot target Temporal persistence');
  });
});
