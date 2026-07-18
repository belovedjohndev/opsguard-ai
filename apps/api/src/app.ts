import { randomUUID } from 'node:crypto';

import type { ActiveMembershipResolver } from '@opsguard/auth';
import Fastify from 'fastify';

import { sendApiError } from './http-errors.js';
import { createTenantContextAuthenticator } from './request-context.js';
import { registerRequestRoutes, type CreateRequestExecutor } from './request-routes.js';

export type BuildApiAppOptions = Readonly<{
  activeMembershipResolver: ActiveMembershipResolver;
  createRequest: CreateRequestExecutor;
  generateRequestId?: () => string;
  logger?: boolean;
}>;

const isBadRequestError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const errorRecord = error as Readonly<Record<string, unknown>>;
  return errorRecord['validation'] !== undefined || errorRecord['statusCode'] === 400;
};

export const buildApiApp = (options: BuildApiAppOptions) => {
  const generateRequestId = options.generateRequestId ?? randomUUID;
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: true } },
    genReqId: () => generateRequestId(),
    logger: options.logger ?? false,
    requestIdHeader: false,
  });

  app.addHook('onRequest', (request, reply, done) => {
    void reply.header('x-request-id', request.id);
    done();
  });

  app.decorateRequest('tenantContext', null);

  app.setErrorHandler((error, request, reply) => {
    if (isBadRequestError(error)) {
      return sendApiError(reply, 400, 'INVALID_REQUEST', request.id);
    }

    request.log.error(
      { failureCategory: 'UNHANDLED_HTTP_ERROR', requestId: request.id },
      'Unhandled HTTP error',
    );
    return sendApiError(reply, 500, 'INTERNAL_ERROR', request.id);
  });

  app.setNotFoundHandler((request, reply) => sendApiError(reply, 404, 'NOT_FOUND', request.id));

  app.get('/health', async () => ({ status: 'ok' as const }));
  registerRequestRoutes(
    app,
    options.createRequest,
    createTenantContextAuthenticator(options.activeMembershipResolver),
  );

  return app;
};
