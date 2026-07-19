import OpenAI from 'openai';

import {
  createModelGatewayError,
  type ModelGatewayErrorCode,
  type ModelGatewayErrorPhase,
} from '../../model-errors.js';
import { createModelGatewayFailure, type ModelGatewayFailure } from '../../model-gateway.js';
import { parseProviderRequestId } from '../../model-types.js';

const providerId = 'openai';
const maximumRetryAfterMilliseconds = 86_400_000;

const safeProviderRequestId = (value: string | null | undefined): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  const result = parseProviderRequestId(value);
  return result.ok ? result.value : undefined;
};

export const createOpenAIFailure = <Code extends ModelGatewayErrorCode>(
  code: Code,
  message: string,
  modelId: string,
  phase: ModelGatewayErrorPhase,
  options: Readonly<{
    providerRequestId?: string;
    retryAfterMilliseconds?: number;
  }> = {},
): ModelGatewayFailure => {
  const error = createModelGatewayError({
    code,
    message,
    providerId,
    modelId,
    phase,
    ...(options.providerRequestId === undefined
      ? {}
      : { providerRequestId: options.providerRequestId }),
    ...(options.retryAfterMilliseconds === undefined
      ? {}
      : { retryAfterMilliseconds: options.retryAfterMilliseconds }),
  });

  if (error.ok) {
    // The Day 8 error constructor proves the code-specific retryability invariant here.
    // TypeScript cannot reduce its generic mapped type back to the indexed error union.
    return Object.freeze({ status: 'error', error: error.value }) as ModelGatewayFailure;
  }

  const fallback = createModelGatewayError({
    code: 'UNEXPECTED',
    message: 'The OpenAI adapter could not normalize the provider result.',
    providerId,
    phase,
  });

  if (!fallback.ok) {
    throw new Error('OpenAI adapter invariant failure.');
  }

  return createModelGatewayFailure(fallback.value);
};

const parseRetryAfterMilliseconds = (headers: Headers | undefined): number | undefined => {
  if (headers === undefined) {
    return undefined;
  }

  const millisecondsHeader = headers.get('retry-after-ms');
  if (millisecondsHeader !== null && /^\d+$/.test(millisecondsHeader)) {
    const milliseconds = Number(millisecondsHeader);
    if (
      Number.isSafeInteger(milliseconds) &&
      milliseconds >= 0 &&
      milliseconds <= maximumRetryAfterMilliseconds
    ) {
      return milliseconds;
    }
  }

  const secondsHeader = headers.get('retry-after');
  if (secondsHeader !== null && /^\d+$/.test(secondsHeader)) {
    const milliseconds = Number(secondsHeader) * 1_000;
    if (
      Number.isSafeInteger(milliseconds) &&
      milliseconds >= 0 &&
      milliseconds <= maximumRetryAfterMilliseconds
    ) {
      return milliseconds;
    }
  }

  return undefined;
};

const mapApiErrorCode = (
  error: Readonly<{ status?: number | undefined; code?: string | null | undefined }>,
): ModelGatewayErrorCode => {
  if (error.status === 401) {
    return 'AUTHENTICATION';
  }
  if (error.status === 403) {
    return 'PERMISSION_DENIED';
  }
  if (error.status === 429) {
    return 'RATE_LIMITED';
  }
  if (error.status !== undefined && error.status >= 500) {
    return 'UNAVAILABLE';
  }
  if (error.code === 'context_length_exceeded' || error.code === 'context_window_exceeded') {
    return 'CONTEXT_LIMIT';
  }
  if (error.status === 400 || error.status === 404 || error.status === 422) {
    return 'INVALID_REQUEST';
  }
  return 'UNEXPECTED';
};

const safeMessageForCode = (code: ModelGatewayErrorCode): string => {
  const messages: Readonly<Record<ModelGatewayErrorCode, string>> = {
    INVALID_REQUEST: 'OpenAI rejected the model request.',
    AUTHENTICATION: 'OpenAI authentication failed.',
    PERMISSION_DENIED: 'OpenAI denied access to the requested model operation.',
    RATE_LIMITED: 'OpenAI rate limited the model request.',
    TIMEOUT: 'The OpenAI request timed out.',
    CANCELLED: 'The OpenAI request was cancelled.',
    CONTEXT_LIMIT: 'The OpenAI request exceeded the model context limit.',
    OUTPUT_SCHEMA_MISMATCH: 'OpenAI did not return the required structured output.',
    MALFORMED_RESPONSE: 'OpenAI returned a malformed response.',
    UNAVAILABLE: 'OpenAI is temporarily unavailable.',
    UNEXPECTED: 'The OpenAI request failed unexpectedly.',
  };

  return messages[code];
};

export const mapOpenAIError = (
  error: unknown,
  modelId: string,
  signal: AbortSignal | undefined,
): ModelGatewayFailure => {
  if (signal?.aborted === true || error instanceof OpenAI.APIUserAbortError) {
    return createOpenAIFailure('CANCELLED', safeMessageForCode('CANCELLED'), modelId, 'transport');
  }

  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return createOpenAIFailure('TIMEOUT', safeMessageForCode('TIMEOUT'), modelId, 'transport');
  }

  if (error instanceof OpenAI.APIConnectionError) {
    return createOpenAIFailure(
      'UNAVAILABLE',
      safeMessageForCode('UNAVAILABLE'),
      modelId,
      'transport',
    );
  }

  if (error instanceof OpenAI.APIError) {
    const code = mapApiErrorCode(error);
    const requestId = safeProviderRequestId(error.requestID);
    const retryAfterMilliseconds =
      code === 'RATE_LIMITED' ? parseRetryAfterMilliseconds(error.headers) : undefined;

    return createOpenAIFailure(code, safeMessageForCode(code), modelId, 'response', {
      ...(requestId === undefined ? {} : { providerRequestId: requestId }),
      ...(retryAfterMilliseconds === undefined ? {} : { retryAfterMilliseconds }),
    });
  }

  return createOpenAIFailure('UNEXPECTED', safeMessageForCode('UNEXPECTED'), modelId, 'transport');
};
