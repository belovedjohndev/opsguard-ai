import { describe, expect, it } from 'vitest';

import {
  createModelGatewayError,
  modelGatewayErrorCodes,
  modelGatewayErrorRetryability,
} from './model-errors.js';
import { createModelGatewayFailure } from './model-gateway.js';
import type { ModelContractResult } from './model-types.js';

const expectFailure = (
  result: ModelContractResult<unknown>,
  field: string,
  reason: string,
): void => {
  expect(result).toEqual({
    ok: false,
    error: { code: 'INVALID_MODEL_CONTRACT', field, reason },
  });
};

describe('normalized model gateway errors', () => {
  it('derives deterministic retryability for every error code', () => {
    expect(modelGatewayErrorCodes).toEqual([
      'INVALID_REQUEST',
      'AUTHENTICATION',
      'PERMISSION_DENIED',
      'RATE_LIMITED',
      'TIMEOUT',
      'CANCELLED',
      'CONTEXT_LIMIT',
      'OUTPUT_SCHEMA_MISMATCH',
      'MALFORMED_RESPONSE',
      'UNAVAILABLE',
      'UNEXPECTED',
    ]);
    expect(Object.isFrozen(modelGatewayErrorCodes)).toBe(true);
    expect(Object.isFrozen(modelGatewayErrorRetryability)).toBe(true);

    for (const code of modelGatewayErrorCodes) {
      const result = createModelGatewayError({ code, message: `Safe ${code} description` });
      if (!result.ok) {
        throw new Error(`Unexpected failure for ${code}`);
      }

      expect(result.value).toEqual({
        code,
        message: `Safe ${code} description`,
        retryable: modelGatewayErrorRetryability[code],
      });
      expect(Object.isFrozen(result.value)).toBe(true);
    }
  });

  it('constructs bounded correlation fields without provider causes or raw responses', () => {
    const result = createModelGatewayError({
      code: 'RATE_LIMITED',
      message: 'Provider capacity limit was reached.',
      providerId: 'provider-a',
      modelId: 'model-a',
      providerRequestId: 'provider-request-1',
      retryAfterMilliseconds: 1_000,
      phase: 'response',
    });
    if (!result.ok) {
      throw new Error('Expected valid error');
    }

    expect(result.value).toEqual({
      code: 'RATE_LIMITED',
      message: 'Provider capacity limit was reached.',
      retryable: true,
      providerId: 'provider-a',
      modelId: 'model-a',
      providerRequestId: 'provider-request-1',
      retryAfterMilliseconds: 1_000,
      phase: 'response',
    });
    expect(result.value).not.toHaveProperty('cause');
    expect(result.value).not.toHaveProperty('response');

    const failure = createModelGatewayFailure(result.value);
    expect(failure).toEqual({ status: 'error', error: result.value });
    expect(Object.isFrozen(failure)).toBe(true);
  });

  it.each([
    [{ code: 'NOT_REAL', message: 'safe' }, 'error.code', 'unsupported'],
    [{ code: 'TIMEOUT', message: ' ' }, 'error.message', 'empty'],
    [{ code: 'TIMEOUT', message: 'x'.repeat(513) }, 'error.message', 'too_long'],
    [{ code: 'TIMEOUT', message: 'safe', providerId: '' }, 'providerId', 'empty'],
    [{ code: 'TIMEOUT', message: 'safe', modelId: '' }, 'modelId', 'empty'],
    [{ code: 'TIMEOUT', message: 'safe', providerRequestId: '' }, 'providerRequestId', 'empty'],
    [
      { code: 'RATE_LIMITED', message: 'safe', retryAfterMilliseconds: -1 },
      'error.retryAfterMilliseconds',
      'out_of_range',
    ],
    [
      { code: 'RATE_LIMITED', message: 'safe', retryAfterMilliseconds: 1.5 },
      'error.retryAfterMilliseconds',
      'not_integer',
    ],
    [
      { code: 'RATE_LIMITED', message: 'safe', retryAfterMilliseconds: Number.NaN },
      'error.retryAfterMilliseconds',
      'not_finite',
    ],
    [
      {
        code: 'RATE_LIMITED',
        message: 'safe',
        retryAfterMilliseconds: Number.MAX_SAFE_INTEGER + 1,
      },
      'error.retryAfterMilliseconds',
      'out_of_range',
    ],
    [{ code: 'TIMEOUT', message: 'safe', phase: 'unknown' }, 'error.phase', 'unsupported'],
  ])('rejects unsafe or malformed error input', (input, field, reason) => {
    expectFailure(createModelGatewayError(input as never), field, reason);
  });
});
