import {
  createModelGatewayError,
  type CreateModelGatewayErrorInput,
  type ModelGatewayError,
  type ModelGatewayErrorCode,
  type ModelGatewayErrorFor,
} from './model-errors.js';
import {
  createModelGatewayFailure,
  type ModelGateway,
  type ModelGatewayResult,
} from './model-gateway.js';
import {
  createModelRefusal,
  createModelSuccess,
  createStructuredModelRequest,
  type JsonValue,
  type ModelRefusal,
  type ModelSuccess,
  type StructuredModelRequest,
} from './model-types.js';

export const fakeModelGatewayExhaustedCode = 'FAKE_MODEL_GATEWAY_EXHAUSTED' as const;

export class FakeModelGatewayExhaustedError extends Error {
  readonly code = fakeModelGatewayExhaustedCode;

  constructor() {
    super('FakeModelGateway has no configured result for this call.');
    this.name = 'FakeModelGatewayExhaustedError';
  }
}

const invalidFakeConfiguration = (): never => {
  throw new TypeError('FakeModelGateway received an invalid typed contract value.');
};

const cloneErrorFor = <Code extends ModelGatewayErrorCode>(
  error: ModelGatewayErrorFor<Code>,
): ModelGatewayErrorFor<Code> => {
  const input: CreateModelGatewayErrorInput<Code> = {
    code: error.code,
    message: error.message,
    ...(error.providerId === undefined ? {} : { providerId: error.providerId }),
    ...(error.modelId === undefined ? {} : { modelId: error.modelId }),
    ...(error.providerRequestId === undefined
      ? {}
      : { providerRequestId: error.providerRequestId }),
    ...(error.retryAfterMilliseconds === undefined
      ? {}
      : { retryAfterMilliseconds: error.retryAfterMilliseconds }),
    ...(error.phase === undefined ? {} : { phase: error.phase }),
  };
  const result = createModelGatewayError(input);
  return result.ok ? result.value : invalidFakeConfiguration();
};

const cloneError = (error: ModelGatewayError): ModelGatewayError => {
  switch (error.code) {
    case 'INVALID_REQUEST':
      return cloneErrorFor(error);
    case 'AUTHENTICATION':
      return cloneErrorFor(error);
    case 'PERMISSION_DENIED':
      return cloneErrorFor(error);
    case 'RATE_LIMITED':
      return cloneErrorFor(error);
    case 'TIMEOUT':
      return cloneErrorFor(error);
    case 'CANCELLED':
      return cloneErrorFor(error);
    case 'CONTEXT_LIMIT':
      return cloneErrorFor(error);
    case 'OUTPUT_SCHEMA_MISMATCH':
      return cloneErrorFor(error);
    case 'MALFORMED_RESPONSE':
      return cloneErrorFor(error);
    case 'UNAVAILABLE':
      return cloneErrorFor(error);
    case 'UNEXPECTED':
      return cloneErrorFor(error);
  }
};

const cloneRefusal = (result: ModelRefusal): ModelRefusal => {
  const cloned = createModelRefusal({
    category: result.refusal.category,
    providerId: result.providerId,
    modelId: result.modelId,
    ...(result.providerRequestId === undefined
      ? {}
      : { providerRequestId: result.providerRequestId }),
    ...(result.usage === undefined ? {} : { usage: result.usage }),
    completionState: result.completionState,
  });
  return cloned.ok ? cloned.value : invalidFakeConfiguration();
};

const cloneSuccess = (result: ModelSuccess<JsonValue>): ModelSuccess<JsonValue> => {
  const cloned = createModelSuccess({
    output: result.output,
    providerId: result.providerId,
    modelId: result.modelId,
    ...(result.providerRequestId === undefined
      ? {}
      : { providerRequestId: result.providerRequestId }),
    usage: result.usage,
    completionState: result.completionState,
    latencyMilliseconds: result.latencyMilliseconds,
  });
  return cloned.ok ? cloned.value : invalidFakeConfiguration();
};

const cloneResult = (result: ModelGatewayResult<JsonValue>): ModelGatewayResult<JsonValue> => {
  switch (result.status) {
    case 'success':
      return cloneSuccess(result);
    case 'refusal':
      return cloneRefusal(result);
    case 'error':
      return createModelGatewayFailure(cloneError(result.error));
  }
};

const cloneRequest = <TOutput extends JsonValue>(
  request: StructuredModelRequest<TOutput>,
): StructuredModelRequest<TOutput> => {
  const cloned = createStructuredModelRequest(request);
  return cloned.ok ? cloned.value : invalidFakeConfiguration();
};

export class FakeModelGateway implements ModelGateway {
  readonly #configuredResults: ModelGatewayResult<JsonValue>[];
  readonly #requests: StructuredModelRequest<JsonValue>[] = [];

  constructor(configuredResults: readonly ModelGatewayResult<JsonValue>[]) {
    this.#configuredResults = configuredResults.map(cloneResult);
  }

  get requests(): readonly StructuredModelRequest<JsonValue>[] {
    return Object.freeze([...this.#requests]);
  }

  async generateStructured<TOutput extends JsonValue>(
    request: StructuredModelRequest<TOutput>,
  ): Promise<ModelGatewayResult<TOutput>> {
    this.#requests.push(cloneRequest(request) as StructuredModelRequest<JsonValue>);

    const result = this.#configuredResults.shift();
    if (result === undefined) {
      throw new FakeModelGatewayExhaustedError();
    }

    return result as ModelGatewayResult<TOutput>;
  }
}
