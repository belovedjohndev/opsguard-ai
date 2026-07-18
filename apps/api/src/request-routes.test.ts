import type {
  CreateRequestCommand,
  CreateRequestError,
  CreateRequestOutput,
} from '@opsguard/application';
import {
  membershipRoles,
  type ActiveMembershipResolverError,
  type ActiveTenantMembership,
} from '@opsguard/auth';
import { failure, parseTenantMembershipId, success, type Result } from '@opsguard/domain';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApiApp } from './index.js';

const correlationId = '81881e5f-c076-4d2d-903d-1438947f196c';
const requestId = '52c46b7f-ef13-4404-9cf5-c236ba1150a2';
const tenantId = '4812ccee-5d6c-45c6-ad57-d46d520f1f7c';
const otherTenantId = '3781c89c-d83b-4280-b4fb-3f13e2669c6e';
const userId = '00e2cf32-3f3f-4b41-81aa-e7686c5c8701';
const membershipId = 'ca28dc37-59b7-44da-9ca7-40bb91d42415';
const createdAt = new Date('2026-07-18T09:00:00.000Z');

const parsedMembershipId = parseTenantMembershipId(membershipId);
if (!parsedMembershipId.ok) {
  throw new Error('Invalid membership fixture.');
}

type MembershipResult = Result<ActiveTenantMembership | null, ActiveMembershipResolverError>;
type CreationResult = Result<CreateRequestOutput, CreateRequestError>;

type TestAppOptions = Readonly<{
  creationResult?: CreationResult;
  membershipResult?: MembershipResult;
  onCreate?: (command: CreateRequestCommand) => void;
  onResolve?: () => void;
}>;

const activeMembership = success(
  Object.freeze({
    membershipId: parsedMembershipId.value,
    role: 'operator' as const,
  }),
);

const createdRequest = success(
  Object.freeze({
    createdAt,
    requestId,
    status: 'received' as const,
    tenantId,
  }),
);

const apps: FastifyInstance[] = [];

const buildTestApp = (options: TestAppOptions = {}): FastifyInstance => {
  const app = buildApiApp({
    activeMembershipResolver: {
      resolveActiveMembership: async () => {
        options.onResolve?.();
        return options.membershipResult ?? activeMembership;
      },
    },
    createRequest: {
      execute: async (command) => {
        options.onCreate?.(command);
        return options.creationResult ?? createdRequest;
      },
    },
    generateRequestId: () => correlationId,
  });
  apps.push(app);
  return app;
};

const identityHeaders = {
  'x-opsguard-tenant-id': tenantId,
  'x-opsguard-user-id': userId,
};

const validPayload = {
  sourceReference: 'form-submission-42',
  sourceType: 'form',
};

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('POST /v1/requests', () => {
  it('creates a request from verified tenant context and strips a body tenant ID', async () => {
    let receivedCommand: CreateRequestCommand | undefined;
    const app = buildTestApp({ onCreate: (command) => (receivedCommand = command) });

    const response = await app.inject({
      headers: identityHeaders,
      method: 'POST',
      payload: { ...validPayload, tenantId: otherTenantId },
      url: '/v1/requests',
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['x-request-id']).toBe(correlationId);
    expect(response.json()).toEqual({
      createdAt: createdAt.toISOString(),
      requestId,
      status: 'received',
      tenantId,
    });
    expect(receivedCommand).toEqual({
      actorMembershipId: membershipId,
      sourceReference: validPayload.sourceReference,
      sourceType: validPayload.sourceType,
      tenantId,
    });
  });

  it.each(membershipRoles)('allows an active %s membership to create', async (role) => {
    const app = buildTestApp({
      membershipResult: success(Object.freeze({ membershipId: parsedMembershipId.value, role })),
    });

    const response = await app.inject({
      headers: identityHeaders,
      method: 'POST',
      payload: validPayload,
      url: '/v1/requests',
    });

    expect(response.statusCode).toBe(201);
  });

  it('does not trust a client-supplied request ID', async () => {
    const app = buildTestApp();

    const response = await app.inject({
      headers: { ...identityHeaders, 'x-request-id': 'client-controlled-value' },
      method: 'POST',
      payload: validPayload,
      url: '/v1/requests',
    });

    expect(response.headers['x-request-id']).toBe(correlationId);
    expect(response.headers['x-request-id']).not.toBe('client-controlled-value');
  });

  it('returns a safe 400 response for malformed JSON before resolving membership', async () => {
    let resolverCalled = false;
    const app = buildTestApp({ onResolve: () => (resolverCalled = true) });

    const response = await app.inject({
      headers: { ...identityHeaders, 'content-type': 'application/json' },
      method: 'POST',
      payload: '{"sourceType":',
      url: '/v1/requests',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'INVALID_REQUEST', message: 'The request is invalid.' },
      requestId: correlationId,
    });
    expect(resolverCalled).toBe(false);
  });

  it.each([
    [{ sourceReference: 'source-only' }, 'missing sourceType'],
    [{ sourceReference: '', sourceType: 'form' }, 'empty sourceReference'],
    [{ sourceReference: 'source', sourceType: 'unsupported' }, 'unsupported sourceType'],
  ])('returns 400 for %s (%s)', async (payload, caseName) => {
    void caseName;
    const app = buildTestApp();
    const response = await app.inject({
      headers: identityHeaders,
      method: 'POST',
      payload,
      url: '/v1/requests',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'INVALID_REQUEST' },
      requestId: correlationId,
    });
  });

  it('returns 401 with matching correlation IDs when identity is missing', async () => {
    const app = buildTestApp();
    const response = await app.inject({
      headers: { 'x-request-id': 'client-controlled-value' },
      method: 'POST',
      payload: validPayload,
      url: '/v1/requests',
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['x-request-id']).toBe(correlationId);
    expect(response.json()).toEqual({
      error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' },
      requestId: correlationId,
    });
  });

  it('returns 401 for malformed identity without resolving membership', async () => {
    let resolverCalled = false;
    const app = buildTestApp({ onResolve: () => (resolverCalled = true) });
    const response = await app.inject({
      headers: {
        'x-opsguard-tenant-id': tenantId,
        'x-opsguard-user-id': 'not-a-uuid',
      },
      method: 'POST',
      payload: validPayload,
      url: '/v1/requests',
    });

    expect(response.statusCode).toBe(401);
    expect(resolverCalled).toBe(false);
  });

  it('returns 403 without revealing why active membership was not found', async () => {
    const app = buildTestApp({ membershipResult: success(null) });
    const response = await app.inject({
      headers: identityHeaders,
      method: 'POST',
      payload: validPayload,
      url: '/v1/requests',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: 'TENANT_ACCESS_DENIED',
        message: 'Access to the selected tenant is denied.',
      },
      requestId: correlationId,
    });
  });

  it.each([
    [failure({ code: 'UNAVAILABLE' as const }), 503, 'SERVICE_UNAVAILABLE'],
    [failure({ code: 'UNEXPECTED' as const }), 500, 'INTERNAL_ERROR'],
  ])('maps membership failure to %i %s', async (membershipResult, status, code) => {
    const app = buildTestApp({ membershipResult });
    const response = await app.inject({
      headers: identityHeaders,
      method: 'POST',
      payload: validPayload,
      url: '/v1/requests',
    });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ error: { code }, requestId: correlationId });
  });

  it.each([
    [
      failure({
        code: 'INVALID_CREATE_REQUEST_INPUT' as const,
        field: 'sourceType' as const,
        reason: 'unsupported' as const,
      }),
      400,
      'INVALID_REQUEST',
    ],
    [failure({ code: 'REQUEST_ALREADY_EXISTS' as const }), 409, 'REQUEST_CONFLICT'],
    [failure({ code: 'REQUEST_PERSISTENCE_UNAVAILABLE' as const }), 503, 'SERVICE_UNAVAILABLE'],
    [failure({ code: 'UNEXPECTED_REQUEST_REPOSITORY_FAILURE' as const }), 500, 'INTERNAL_ERROR'],
  ] satisfies readonly (readonly [CreationResult, number, string])[])(
    'maps application failure to %i %s',
    async (creationResult, status, code) => {
      const app = buildTestApp({ creationResult });
      const response = await app.inject({
        headers: identityHeaders,
        method: 'POST',
        payload: validPayload,
        url: '/v1/requests',
      });

      expect(response.statusCode).toBe(status);
      expect(response.json()).toMatchObject({ error: { code }, requestId: correlationId });
    },
  );

  it('redacts thrown internal details', async () => {
    const secret = 'postgres://admin:secret@database/internal';
    const app = buildApiApp({
      activeMembershipResolver: {
        resolveActiveMembership: async () => activeMembership,
      },
      createRequest: {
        execute: async () => {
          throw new Error(secret);
        },
      },
      generateRequestId: () => correlationId,
    });
    apps.push(app);

    const response = await app.inject({
      headers: identityHeaders,
      method: 'POST',
      payload: validPayload,
      url: '/v1/requests',
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain(secret);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      requestId: correlationId,
    });
  });
});
