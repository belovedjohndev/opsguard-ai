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
      APP_POSTGRES_URL: '   ',
      APP_POSTGRES_USER: 'opsguard_app',
    });
    const parsed = new URL(connectionUrl);

    expect(parsed.hostname).toBe('127.0.0.1');
    expect(parsed.port).toBe('55436');
    expect(parsed.username).toBe('opsguard_app');
    expect(parsed.password).toBe('local%20password');
    expect(parsed.pathname).toBe('/opsguard_app_dev');
  });

  it('uses the managed URL before incomplete or invalid local settings', () => {
    const managedUrl =
      'postgresql://render_user:render_password@internal.example.test:5432/opsguard';

    expect(
      resolveApplicationDatabaseUrl({
        APP_POSTGRES_URL: managedUrl,
        APP_POSTGRES_PORT: 'not-a-port',
      }),
    ).toBe(managedUrl);
  });

  it.each([
    'postgres://render_user:render_password@internal.example.test:5432/opsguard',
    'postgresql://render_user:render_password@internal.example.test:5432/opsguard',
  ])('accepts a supported managed PostgreSQL protocol: %s', (managedUrl) => {
    expect(resolveApplicationDatabaseUrl({ APP_POSTGRES_URL: managedUrl })).toBe(managedUrl);
  });

  it('preserves managed URL query and SSL parameters', () => {
    const managedUrl =
      'postgresql://render_user:render_password@internal.example.test:5432/opsguard?sslmode=require&connect_timeout=10';

    expect(resolveApplicationDatabaseUrl({ APP_POSTGRES_URL: `  ${managedUrl}  ` })).toBe(
      managedUrl,
    );
  });

  it.each([
    [
      'postgresql://render_user:deployment-secret@',
      'Database configuration error: APP_POSTGRES_URL must be a valid PostgreSQL URL.',
    ],
    [
      'https://render_user:deployment-secret@internal.example.test/opsguard',
      'Database configuration error: APP_POSTGRES_URL must use postgres: or postgresql:.',
    ],
  ])('rejects an invalid managed URL without exposing credentials', (managedUrl, message) => {
    let caught: unknown;

    try {
      resolveApplicationDatabaseUrl({ APP_POSTGRES_URL: managedUrl });
    } catch (error) {
      caught = error;
    }

    expect(caught).toEqual(new Error(message));
    expect(String(caught)).not.toContain('deployment-secret');
    expect(String(caught)).not.toContain(managedUrl);
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
