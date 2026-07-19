import {
  modelContractFailure,
  modelContractSuccess,
  parseModelId,
  parseProviderId,
  parseProviderRequestId,
  type ModelContractResult,
  type ModelId,
  type ProviderId,
  type ProviderRequestId,
} from './model-types.js';

export const modelGatewayErrorCodes = Object.freeze([
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
] as const);

export type ModelGatewayErrorCode = (typeof modelGatewayErrorCodes)[number];

export const modelGatewayErrorRetryability = Object.freeze({
  INVALID_REQUEST: false,
  AUTHENTICATION: false,
  PERMISSION_DENIED: false,
  RATE_LIMITED: true,
  TIMEOUT: true,
  CANCELLED: false,
  CONTEXT_LIMIT: false,
  OUTPUT_SCHEMA_MISMATCH: false,
  MALFORMED_RESPONSE: false,
  UNAVAILABLE: true,
  UNEXPECTED: false,
} as const satisfies Readonly<Record<ModelGatewayErrorCode, boolean>>);

export const modelGatewayErrorPhases = Object.freeze(['request', 'transport', 'response'] as const);
export type ModelGatewayErrorPhase = (typeof modelGatewayErrorPhases)[number];

type ModelGatewayErrorRetryability = typeof modelGatewayErrorRetryability;

export type ModelGatewayErrorFor<Code extends ModelGatewayErrorCode> = Readonly<{
  code: Code;
  message: string;
  retryable: ModelGatewayErrorRetryability[Code];
  providerId?: ProviderId;
  modelId?: ModelId;
  providerRequestId?: ProviderRequestId;
  retryAfterMilliseconds?: number;
  phase?: ModelGatewayErrorPhase;
}>;

export type ModelGatewayError = {
  [Code in ModelGatewayErrorCode]: ModelGatewayErrorFor<Code>;
}[ModelGatewayErrorCode];

export type CreateModelGatewayErrorInput<Code extends ModelGatewayErrorCode> = Readonly<{
  code: Code;
  message: string;
  providerId?: string;
  modelId?: string;
  providerRequestId?: string;
  retryAfterMilliseconds?: number;
  phase?: ModelGatewayErrorPhase;
}>;

const maximumSafeErrorMessageLength = 512;

export const createModelGatewayError = <Code extends ModelGatewayErrorCode>(
  input: CreateModelGatewayErrorInput<Code>,
): ModelContractResult<ModelGatewayErrorFor<Code>> => {
  if (!modelGatewayErrorCodes.includes(input.code)) {
    return modelContractFailure('error.code', 'unsupported');
  }

  if (typeof input.message !== 'string' || input.message.trim().length === 0) {
    return modelContractFailure('error.message', 'empty');
  }

  if (input.message.length > maximumSafeErrorMessageLength) {
    return modelContractFailure('error.message', 'too_long');
  }

  const providerIdResult =
    input.providerId === undefined ? undefined : parseProviderId(input.providerId);
  if (providerIdResult !== undefined && !providerIdResult.ok) {
    return providerIdResult;
  }

  const modelIdResult = input.modelId === undefined ? undefined : parseModelId(input.modelId);
  if (modelIdResult !== undefined && !modelIdResult.ok) {
    return modelIdResult;
  }

  const providerRequestIdResult =
    input.providerRequestId === undefined
      ? undefined
      : parseProviderRequestId(input.providerRequestId);
  if (providerRequestIdResult !== undefined && !providerRequestIdResult.ok) {
    return providerRequestIdResult;
  }

  if (input.retryAfterMilliseconds !== undefined) {
    if (!Number.isFinite(input.retryAfterMilliseconds)) {
      return modelContractFailure('error.retryAfterMilliseconds', 'not_finite');
    }
    if (!Number.isInteger(input.retryAfterMilliseconds)) {
      return modelContractFailure('error.retryAfterMilliseconds', 'not_integer');
    }
    if (!Number.isSafeInteger(input.retryAfterMilliseconds) || input.retryAfterMilliseconds < 0) {
      return modelContractFailure('error.retryAfterMilliseconds', 'out_of_range');
    }
  }

  if (input.phase !== undefined && !modelGatewayErrorPhases.includes(input.phase)) {
    return modelContractFailure('error.phase', 'unsupported');
  }

  return modelContractSuccess(
    Object.freeze({
      code: input.code,
      message: input.message,
      retryable: modelGatewayErrorRetryability[input.code],
      ...(providerIdResult === undefined ? {} : { providerId: providerIdResult.value }),
      ...(modelIdResult === undefined ? {} : { modelId: modelIdResult.value }),
      ...(providerRequestIdResult === undefined
        ? {}
        : { providerRequestId: providerRequestIdResult.value }),
      ...(input.retryAfterMilliseconds === undefined
        ? {}
        : { retryAfterMilliseconds: input.retryAfterMilliseconds }),
      ...(input.phase === undefined ? {} : { phase: input.phase }),
    }),
  );
};
