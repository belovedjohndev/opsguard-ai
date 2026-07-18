import {
  canCreateRequest,
  createVerifiedTenantContext,
  type ActiveMembershipResolver,
  type VerifiedTenantContext,
} from '@opsguard/auth';
import { parseTenantId, parseUserId } from '@opsguard/domain';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { sendApiError } from './http-errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext: VerifiedTenantContext | null;
  }
}

const getSingleHeader = (request: FastifyRequest, name: string): string | null => {
  const value = request.headers[name];
  return typeof value === 'string' ? value : null;
};

export const createTenantContextAuthenticator = (resolver: ActiveMembershipResolver) =>
  async function authenticateTenantContext(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const rawUserId = getSingleHeader(request, 'x-opsguard-user-id');
    const rawTenantId = getSingleHeader(request, 'x-opsguard-tenant-id');

    if (rawUserId === null || rawTenantId === null) {
      void sendApiError(reply, 401, 'AUTHENTICATION_REQUIRED', request.id);
      return;
    }

    const userId = parseUserId(rawUserId);
    const tenantId = parseTenantId(rawTenantId);

    if (!userId.ok || !tenantId.ok) {
      void sendApiError(reply, 401, 'AUTHENTICATION_REQUIRED', request.id);
      return;
    }

    const membership = await resolver.resolveActiveMembership({
      tenantId: tenantId.value,
      userId: userId.value,
    });

    if (!membership.ok) {
      const unavailable = membership.error.code === 'UNAVAILABLE';
      request.log.error(
        { failureCategory: membership.error.code, requestId: request.id },
        'Tenant membership resolution failed',
      );
      void sendApiError(
        reply,
        unavailable ? 503 : 500,
        unavailable ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR',
        request.id,
      );
      return;
    }

    if (membership.value === null) {
      void sendApiError(reply, 403, 'TENANT_ACCESS_DENIED', request.id);
      return;
    }

    const context = createVerifiedTenantContext({
      membershipId: membership.value.membershipId,
      requestId: request.id,
      role: membership.value.role,
      tenantId: tenantId.value,
      userId: userId.value,
    });

    if (!canCreateRequest(context)) {
      void sendApiError(reply, 403, 'TENANT_ACCESS_DENIED', request.id);
      return;
    }

    request.tenantContext = context;
  };

export const requireTenantContext = (request: FastifyRequest): VerifiedTenantContext => {
  if (request.tenantContext === null) {
    throw new Error('Verified tenant context is required.');
  }

  return request.tenantContext;
};
