import {
  maximumAssessRequestTextLength,
  type AssessRequest,
  type AssessRequestError,
  type CreateRequest,
  type CreateRequestError,
} from '@opsguard/application';
import { requestSourceTypes } from '@opsguard/domain';
import type { FastifyInstance, FastifyReply, preHandlerAsyncHookHandler } from 'fastify';

import { sendApiError } from './http-errors.js';
import { requireTenantContext } from './request-context.js';

type CreateRequestBody = Readonly<{
  sourceReference: string;
  sourceType: string;
}>;

export type CreateRequestExecutor = Pick<CreateRequest, 'execute'>;
export type AssessRequestExecutor = Pick<AssessRequest, 'execute'>;

type AssessRequestBody = Readonly<{ requestText: string }>;
type AssessRequestParams = Readonly<{ requestId: string }>;

const createRequestBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sourceType', 'sourceReference'],
  properties: {
    sourceReference: { type: 'string', minLength: 1, maxLength: 255 },
    sourceType: { type: 'string', enum: requestSourceTypes },
  },
} as const;

const assessRequestBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['requestText'],
  properties: {
    requestText: { type: 'string', minLength: 1, maxLength: maximumAssessRequestTextLength },
  },
} as const;

const assessRequestParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['requestId'],
  properties: {
    requestId: { type: 'string', format: 'uuid' },
  },
} as const;

const sendCreateRequestError = (
  reply: FastifyReply,
  error: CreateRequestError,
  requestId: string,
): FastifyReply => {
  switch (error.code) {
    case 'INVALID_CREATE_REQUEST_INPUT':
      return sendApiError(reply, 400, 'INVALID_REQUEST', requestId);
    case 'REQUEST_ALREADY_EXISTS':
      return sendApiError(reply, 409, 'REQUEST_CONFLICT', requestId);
    case 'REQUEST_PERSISTENCE_UNAVAILABLE':
      return sendApiError(reply, 503, 'SERVICE_UNAVAILABLE', requestId);
    case 'UNEXPECTED_REQUEST_REPOSITORY_FAILURE':
      return sendApiError(reply, 500, 'INTERNAL_ERROR', requestId);
  }
};

const sendAssessRequestError = (
  reply: FastifyReply,
  error: AssessRequestError,
  requestId: string,
): FastifyReply => {
  switch (error.code) {
    case 'INVALID_ASSESS_REQUEST_INPUT':
      return sendApiError(reply, 400, 'INVALID_REQUEST', requestId);
    case 'REQUEST_NOT_FOUND':
      return sendApiError(reply, 404, 'REQUEST_NOT_FOUND', requestId);
    case 'REQUEST_STATE_CONFLICT':
      return sendApiError(reply, 409, 'REQUEST_STATE_CONFLICT', requestId);
    case 'ASSESSMENT_CONFIGURATION_CONFLICT':
      return sendApiError(reply, 409, 'ASSESSMENT_CONFIGURATION_CONFLICT', requestId);
    case 'ASSESSMENT_PERSISTENCE_UNAVAILABLE':
      return sendApiError(reply, 503, 'SERVICE_UNAVAILABLE', requestId);
    case 'UNEXPECTED_ASSESSMENT_FAILURE':
      return sendApiError(reply, 500, 'INTERNAL_ERROR', requestId);
  }
};

export const registerRequestRoutes = (
  app: FastifyInstance,
  createRequest: CreateRequestExecutor,
  assessRequest: AssessRequestExecutor,
  authenticateTenantContext: preHandlerAsyncHookHandler,
): void => {
  app.post<{ Body: CreateRequestBody }>(
    '/v1/requests',
    {
      preHandler: authenticateTenantContext,
      schema: { body: createRequestBodySchema },
    },
    async (request, reply) => {
      const context = requireTenantContext(request);
      const result = await createRequest.execute({
        actorMembershipId: context.membershipId,
        sourceReference: request.body.sourceReference,
        sourceType: request.body.sourceType,
        tenantId: context.tenantId,
      });

      if (!result.ok) {
        if (result.error.code === 'UNEXPECTED_REQUEST_REPOSITORY_FAILURE') {
          request.log.error(
            { failureCategory: result.error.code, requestId: request.id },
            'Request creation failed',
          );
        }

        return sendCreateRequestError(reply, result.error, request.id);
      }

      return reply.code(201).send({
        createdAt: result.value.createdAt.toISOString(),
        requestId: result.value.requestId,
        status: result.value.status,
        tenantId: result.value.tenantId,
      });
    },
  );

  app.post<{ Body: AssessRequestBody; Params: AssessRequestParams }>(
    '/v1/requests/:requestId/assessment',
    {
      preHandler: authenticateTenantContext,
      schema: { body: assessRequestBodySchema, params: assessRequestParamsSchema },
    },
    async (request, reply) => {
      const context = requireTenantContext(request);
      const result = await assessRequest.execute({
        actorMembershipId: context.membershipId,
        correlationId: request.id,
        requestId: request.params.requestId,
        requestText: request.body.requestText,
        tenantId: context.tenantId,
      });

      if (!result.ok) {
        if (result.error.code === 'UNEXPECTED_ASSESSMENT_FAILURE') {
          request.log.error(
            { failureCategory: result.error.code, requestId: request.id },
            'Request assessment failed',
          );
        }

        return sendAssessRequestError(reply, result.error, request.id);
      }

      if (result.value.aiRunStatus === 'succeeded') {
        return reply.code(200).send({
          requestId: result.value.requestId,
          correlationId: result.value.correlationId,
          status: result.value.status,
          aiRunStatus: result.value.aiRunStatus,
          assessment: result.value.assessment,
          decision: result.value.decision,
          provenance: result.value.provenance,
        });
      }

      return reply.code(200).send({
        requestId: result.value.requestId,
        correlationId: result.value.correlationId,
        status: result.value.status,
        aiRunStatus: result.value.aiRunStatus,
        provenance: result.value.provenance,
        failure: {
          code: result.value.failureCode,
          message: 'The model assessment could not be completed safely.',
        },
      });
    },
  );
};
