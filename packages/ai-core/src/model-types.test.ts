import { describe, expect, it } from 'vitest';

import {
  createModelPolicy,
  createModelRefusal,
  createModelRequestMetadata,
  createModelSuccess,
  createModelTask,
  createModelUsage,
  createOutputSchemaDescriptor,
  createStructuredModelRequest,
  modelCompletionStates,
  modelMessageRoles,
  modelQualityTiers,
  modelRefusalCategories,
  parseModelId,
  parseProviderId,
  parseProviderRequestId,
  type JsonObject,
  type JsonValue,
  type ModelContractResult,
  type ModelPolicy,
  type ModelRequestMetadata,
  type ModelTask,
  type OutputSchemaDescriptor,
} from './model-types.js';

const unwrap = <Value>(result: ModelContractResult<Value>): Value => {
  if (!result.ok) {
    throw new Error(`Unexpected contract failure: ${result.error.field}/${result.error.reason}`);
  }
  return result.value;
};

const expectFailure = (
  result: ModelContractResult<unknown>,
  field: string,
  reason: string,
): void => {
  expect(result).toEqual({
    ok: false,
    error: { code: 'INVALID_MODEL_CONTRACT', field, reason },
  });
  expect(Object.isFrozen(result)).toBe(true);
  if (!result.ok) {
    expect(Object.isFrozen(result.error)).toBe(true);
  }
};

const validTask = (): ModelTask => unwrap(createModelTask({ name: 'classify', version: 'v1' }));

const validPolicy = (): ModelPolicy =>
  unwrap(
    createModelPolicy({
      allowedProviderIds: ['provider-a'],
      allowedModelIds: ['model-a'],
      qualityTier: 'balanced',
      fallbackAllowed: false,
      maximumOutputTokens: 512,
    }),
  );

const validOutputSchema = (): OutputSchemaDescriptor =>
  unwrap(
    createOutputSchemaDescriptor({
      name: 'classification',
      version: 'v1',
      schema: { type: 'object', required: ['category'] },
      strict: true,
    }),
  );

const validMetadata = (): ModelRequestMetadata =>
  unwrap(
    createModelRequestMetadata({
      applicationRequestId: 'request-1',
      correlationId: 'correlation-1',
      tenantId: 'tenant-1',
      promptVersion: 'prompt-v1',
      operationName: 'classify-request',
    }),
  );

describe('model identifier and request invariants', () => {
  it('freezes public contract vocabularies', () => {
    expect(Object.isFrozen(modelQualityTiers)).toBe(true);
    expect(Object.isFrozen(modelMessageRoles)).toBe(true);
    expect(Object.isFrozen(modelCompletionStates)).toBe(true);
    expect(Object.isFrozen(modelRefusalCategories)).toBe(true);
  });

  it.each([
    ['provider', parseProviderId],
    ['model', parseModelId],
    ['provider request', parseProviderRequestId],
  ])('constructs bounded open %s identifiers', (_name, parser) => {
    const result = parser('open-identifier');

    expect(unwrap(result)).toBe('open-identifier');
    expectFailure(
      parser('   '),
      parser === parseModelId
        ? 'modelId'
        : parser === parseProviderId
          ? 'providerId'
          : 'providerRequestId',
      'empty',
    );
    expectFailure(
      parser('x'.repeat(256)),
      parser === parseModelId
        ? 'modelId'
        : parser === parseProviderId
          ? 'providerId'
          : 'providerRequestId',
      'too_long',
    );
    expectFailure(
      parser(42 as never),
      parser === parseModelId
        ? 'modelId'
        : parser === parseProviderId
          ? 'providerId'
          : 'providerRequestId',
      'unsupported',
    );
  });

  it('constructs a complete immutable request and retains cancellation identity', () => {
    const controller = new AbortController();
    const mutableSchema: Record<string, JsonValue> = {
      type: 'object',
      properties: { category: { type: 'string' } },
    };
    const mutableProviders = ['provider-a'];
    const mutableMessages = [{ role: 'system' as const, content: 'Return structured data.' }];

    const result = createStructuredModelRequest<{ readonly category: string }>({
      task: validTask(),
      policy: {
        ...validPolicy(),
        allowedProviderIds: mutableProviders.map((id) => unwrap(parseProviderId(id))),
      },
      messages: mutableMessages,
      outputSchema: {
        ...validOutputSchema(),
        schema: mutableSchema,
      },
      timeoutMilliseconds: 2_000,
      signal: controller.signal,
      metadata: validMetadata(),
    });
    const request = unwrap(result);

    mutableProviders[0] = 'changed';
    const firstMutableMessage = mutableMessages[0];
    if (firstMutableMessage === undefined) {
      throw new Error('Expected one mutable message');
    }
    firstMutableMessage.content = 'changed';
    mutableSchema.type = 'array';

    expect(request.policy.allowedProviderIds).toEqual(['provider-a']);
    expect(request.messages).toEqual([{ role: 'system', content: 'Return structured data.' }]);
    expect(request.outputSchema.schema).toMatchObject({ type: 'object' });
    expect(request.signal).toBe(controller.signal);
    expect(Object.isFrozen(request)).toBe(true);
    expect(Object.isFrozen(request.policy.allowedProviderIds)).toBe(true);
    expect(Object.isFrozen(request.messages[0])).toBe(true);
    expect(Object.isFrozen(request.outputSchema.schema)).toBe(true);
  });

  it.each([
    [{ name: '', version: 'v1' }, 'task.name', 'empty'],
    [{ name: 'task', version: 'x'.repeat(129) }, 'task.version', 'too_long'],
  ] as const)('rejects invalid task input', (input, field, reason) => {
    expectFailure(createModelTask(input), field, reason);
  });

  it.each([
    [
      {
        allowedProviderIds: [],
        allowedModelIds: ['m'],
        qualityTier: 'balanced',
        fallbackAllowed: false,
        maximumOutputTokens: 1,
      },
      'policy.allowedProviderIds',
      'empty',
    ],
    [
      {
        allowedProviderIds: ['p'],
        allowedModelIds: [],
        qualityTier: 'balanced',
        fallbackAllowed: false,
        maximumOutputTokens: 1,
      },
      'policy.allowedModelIds',
      'empty',
    ],
    [
      {
        allowedProviderIds: ['p'],
        allowedModelIds: ['m'],
        qualityTier: 'invalid',
        fallbackAllowed: false,
        maximumOutputTokens: 1,
      },
      'policy.qualityTier',
      'unsupported',
    ],
    [
      {
        allowedProviderIds: ['p'],
        allowedModelIds: ['m'],
        qualityTier: 'balanced',
        fallbackAllowed: 'false',
        maximumOutputTokens: 1,
      },
      'policy.fallbackAllowed',
      'unsupported',
    ],
    [
      {
        allowedProviderIds: ['p'],
        allowedModelIds: ['m'],
        qualityTier: 'balanced',
        fallbackAllowed: false,
        maximumOutputTokens: 0,
      },
      'policy.maximumOutputTokens',
      'out_of_range',
    ],
    [
      {
        allowedProviderIds: ['p'],
        allowedModelIds: ['m'],
        qualityTier: 'balanced',
        fallbackAllowed: false,
        maximumOutputTokens: 1.5,
      },
      'policy.maximumOutputTokens',
      'not_integer',
    ],
    [
      {
        allowedProviderIds: ['p'],
        allowedModelIds: ['m'],
        qualityTier: 'balanced',
        fallbackAllowed: false,
        maximumOutputTokens: Number.POSITIVE_INFINITY,
      },
      'policy.maximumOutputTokens',
      'not_finite',
    ],
    [
      {
        allowedProviderIds: ['p'],
        allowedModelIds: ['m'],
        qualityTier: 'balanced',
        fallbackAllowed: false,
        maximumOutputTokens: Number.MAX_SAFE_INTEGER + 1,
      },
      'policy.maximumOutputTokens',
      'out_of_range',
    ],
  ])('rejects invalid policy input', (input, field, reason) => {
    expectFailure(createModelPolicy(input as never), field, reason);
  });

  it('copies shared JSON values without treating them as cycles', () => {
    const shared = { type: 'string' };
    const descriptor = unwrap(
      createOutputSchemaDescriptor({
        name: 'shared',
        version: 'v1',
        schema: { properties: { first: shared, second: shared } },
        strict: true,
      }),
    );

    expect(descriptor.schema).toEqual({ properties: { first: shared, second: shared } });
    expect(descriptor.schema).not.toBe(shared);
  });

  it('rejects arrays, cycles, non-finite values, accessors, and invalid strict flags in schemas', () => {
    const cycle: Record<string, JsonValue> = {};
    cycle.self = cycle;
    const accessor = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => 'hidden behavior',
    });

    expectFailure(
      createOutputSchemaDescriptor({ name: 'x', version: 'v1', schema: [] as never, strict: true }),
      'outputSchema.schema',
      'invalid_json',
    );
    expectFailure(
      createOutputSchemaDescriptor({ name: 'x', version: 'v1', schema: cycle, strict: true }),
      'outputSchema.schema',
      'invalid_json',
    );
    expectFailure(
      createOutputSchemaDescriptor({
        name: 'x',
        version: 'v1',
        schema: { value: Number.NaN },
        strict: true,
      }),
      'outputSchema.schema',
      'invalid_json',
    );
    expectFailure(
      createOutputSchemaDescriptor({
        name: 'x',
        version: 'v1',
        schema: accessor as JsonObject,
        strict: true,
      }),
      'outputSchema.schema',
      'invalid_json',
    );
    expectFailure(
      createOutputSchemaDescriptor({
        name: 'x',
        version: 'v1',
        schema: {},
        strict: 'true' as never,
      }),
      'outputSchema.strict',
      'unsupported',
    );
  });

  it.each([
    [{ messages: [], timeoutMilliseconds: 1 }, 'messages', 'empty'],
    [{ messages: 'not-an-array', timeoutMilliseconds: 1 }, 'messages', 'unsupported'],
    [{ messages: [null], timeoutMilliseconds: 1 }, 'messages', 'unsupported'],
    [
      { messages: [{ role: 'tool', content: 'x' }], timeoutMilliseconds: 1 },
      'messages.role',
      'unsupported',
    ],
    [
      { messages: [{ role: 'user', content: '' }], timeoutMilliseconds: 1 },
      'messages.content',
      'empty',
    ],
    [
      { messages: [{ role: 'user', content: 'x' }], timeoutMilliseconds: 0 },
      'timeoutMilliseconds',
      'out_of_range',
    ],
  ])('rejects invalid request input', (override, field, reason) => {
    expectFailure(
      createStructuredModelRequest({
        task: validTask(),
        policy: validPolicy(),
        messages: [{ role: 'user', content: 'input' }],
        outputSchema: validOutputSchema(),
        timeoutMilliseconds: 1,
        metadata: validMetadata(),
        ...override,
      } as never),
      field,
      reason,
    );
  });

  it('rejects empty and oversized request metadata', () => {
    expectFailure(
      createModelRequestMetadata({ ...validMetadata(), tenantId: '' }),
      'metadata.tenantId',
      'empty',
    );
    expectFailure(
      createModelRequestMetadata({ ...validMetadata(), promptVersion: 'x'.repeat(256) }),
      'metadata.promptVersion',
      'too_long',
    );
  });
});

describe('usage and result invariants', () => {
  it('constructs consistent immutable usage', () => {
    const usage = unwrap(
      createModelUsage({
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cachedInputTokens: 4,
        reasoningTokens: 2,
      }),
    );

    expect(usage).toEqual({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cachedInputTokens: 4,
      reasoningTokens: 2,
    });
    expect(Object.isFrozen(usage)).toBe(true);
  });

  it.each([
    [{ inputTokens: -1, outputTokens: 0, totalTokens: -1 }, 'usage.inputTokens', 'out_of_range'],
    [{ inputTokens: 1.5, outputTokens: 0, totalTokens: 1.5 }, 'usage.inputTokens', 'not_integer'],
    [
      { inputTokens: Number.NaN, outputTokens: 0, totalTokens: 0 },
      'usage.inputTokens',
      'not_finite',
    ],
    [{ inputTokens: 1, outputTokens: 1, totalTokens: 3 }, 'usage.totalTokens', 'inconsistent'],
    [
      { inputTokens: 1, outputTokens: 1, totalTokens: 2, cachedInputTokens: 2 },
      'usage.cachedInputTokens',
      'inconsistent',
    ],
    [
      { inputTokens: 1, outputTokens: 1, totalTokens: 2, reasoningTokens: 2 },
      'usage.reasoningTokens',
      'inconsistent',
    ],
  ])('rejects invalid usage input', (input, field, reason) => {
    expectFailure(createModelUsage(input), field, reason);
  });

  it('constructs success with copied output, identity, usage, completion, and latency', () => {
    const output = { category: 'operations', scores: [1, 2] };
    const success = unwrap(
      createModelSuccess({
        output,
        providerId: 'provider-a',
        modelId: 'model-a',
        providerRequestId: 'provider-request-1',
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
        completionState: 'completed',
        latencyMilliseconds: 25,
      }),
    );

    output.category = 'changed';
    expect(success).toMatchObject({
      status: 'success',
      output: { category: 'operations', scores: [1, 2] },
      providerId: 'provider-a',
      modelId: 'model-a',
      providerRequestId: 'provider-request-1',
      completionState: 'completed',
      latencyMilliseconds: 25,
    });
    expect(Object.isFrozen(success)).toBe(true);
    expect(Object.isFrozen(success.output)).toBe(true);
  });

  it.each([
    [
      { providerId: '', completionState: 'completed', latencyMilliseconds: 0 },
      'providerId',
      'empty',
    ],
    [
      { providerId: 'p', completionState: 'invalid', latencyMilliseconds: 0 },
      'success.completionState',
      'unsupported',
    ],
    [
      { providerId: 'p', completionState: 'completed', latencyMilliseconds: -1 },
      'success.latencyMilliseconds',
      'out_of_range',
    ],
  ])('rejects malformed success input', (override, field, reason) => {
    expectFailure(
      createModelSuccess({
        output: { value: true },
        providerId: 'provider-a',
        modelId: 'model-a',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        completionState: 'completed',
        latencyMilliseconds: 0,
        ...override,
      } as never),
      field,
      reason,
    );
  });

  it('constructs refusal without structured output or raw refusal text', () => {
    const refusal = unwrap(
      createModelRefusal({
        category: 'safety',
        providerId: 'provider-a',
        modelId: 'model-a',
        providerRequestId: 'provider-request-1',
        usage: { inputTokens: 3, outputTokens: 0, totalTokens: 3 },
        completionState: 'completed',
      }),
    );

    expect(refusal).toEqual({
      status: 'refusal',
      refusal: { category: 'safety' },
      providerId: 'provider-a',
      modelId: 'model-a',
      providerRequestId: 'provider-request-1',
      usage: { inputTokens: 3, outputTokens: 0, totalTokens: 3 },
      completionState: 'completed',
    });
    expect(refusal).not.toHaveProperty('output');
    expect(Object.isFrozen(refusal.refusal)).toBe(true);
  });

  it.each([
    [{ category: 'invalid', completionState: 'completed' }, 'refusal.category'],
    [{ category: 'policy', completionState: 'invalid' }, 'refusal.completionState'],
  ])('rejects malformed refusal input', (override, field) => {
    expectFailure(
      createModelRefusal({
        category: 'policy',
        providerId: 'provider-a',
        modelId: 'model-a',
        completionState: 'completed',
        ...override,
      } as never),
      field,
      'unsupported',
    );
  });
});
