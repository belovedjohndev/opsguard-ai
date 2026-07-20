import type { FastifyReply } from 'fastify';

export type ApiErrorCode =
  | 'ASSESSMENT_CONFIGURATION_CONFLICT'
  | 'AUTHENTICATION_REQUIRED'
  | 'INTERNAL_ERROR'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'ORIGIN_NOT_ALLOWED'
  | 'REQUEST_CONFLICT'
  | 'REQUEST_NOT_FOUND'
  | 'REQUEST_STATE_CONFLICT'
  | 'SERVICE_UNAVAILABLE'
  | 'TENANT_ACCESS_DENIED';

const publicMessages: Readonly<Record<ApiErrorCode, string>> = Object.freeze({
  ASSESSMENT_CONFIGURATION_CONFLICT: 'The assessment configuration is unavailable.',
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  INTERNAL_ERROR: 'An internal error occurred.',
  INVALID_REQUEST: 'The request is invalid.',
  NOT_FOUND: 'The requested route was not found.',
  ORIGIN_NOT_ALLOWED: 'The request origin is not allowed.',
  REQUEST_CONFLICT: 'A request with this source reference already exists.',
  REQUEST_NOT_FOUND: 'The request was not found.',
  REQUEST_STATE_CONFLICT: 'The request cannot be assessed in its current state.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable.',
  TENANT_ACCESS_DENIED: 'Access to the selected tenant is denied.',
});

export const sendApiError = (
  reply: FastifyReply,
  statusCode: number,
  code: ApiErrorCode,
  requestId: string,
): FastifyReply =>
  reply.code(statusCode).send({
    error: {
      code,
      message: publicMessages[code],
    },
    requestId,
  });
