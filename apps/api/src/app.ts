import { randomUUID } from 'node:crypto';

import type { ActiveMembershipResolver } from '@opsguard/auth';
import cors from '@fastify/cors';
import Fastify from 'fastify';

import { sendApiError } from './http-errors.js';
import { createTenantContextAuthenticator } from './request-context.js';
import {
  registerRequestRoutes,
  type AssessRequestExecutor,
  type CreateRequestExecutor,
} from './request-routes.js';

export type BuildApiAppOptions = Readonly<{
  activeMembershipResolver: ActiveMembershipResolver;
  assessRequest: AssessRequestExecutor;
  corsAllowedOrigins: readonly string[];
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

  const allowedOrigins = new Set(options.corsAllowedOrigins);
  app.addHook('onRequest', (request, reply, done) => {
    const origin = request.headers.origin;
    if (origin !== undefined && (typeof origin !== 'string' || !allowedOrigins.has(origin))) {
      void sendApiError(reply, 403, 'ORIGIN_NOT_ALLOWED', request.id);
      return;
    }

    done();
  });

  void app.register(cors, {
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    origin: [...allowedOrigins],
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
    options.assessRequest,
    createTenantContextAuthenticator(options.activeMembershipResolver),
  );

  return app;
};
