import type { FastifyReply } from 'fastify';

export type ApiErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'INTERNAL_ERROR'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'REQUEST_CONFLICT'
  | 'SERVICE_UNAVAILABLE'
  | 'TENANT_ACCESS_DENIED';

const publicMessages: Readonly<Record<ApiErrorCode, string>> = Object.freeze({
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  INTERNAL_ERROR: 'An internal error occurred.',
  INVALID_REQUEST: 'The request is invalid.',
  NOT_FOUND: 'The requested route was not found.',
  REQUEST_CONFLICT: 'A request with this source reference already exists.',
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
