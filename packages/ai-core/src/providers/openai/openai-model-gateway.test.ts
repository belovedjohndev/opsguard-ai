import { describe, expect, it, vi } from 'vitest';

import {
  createModelPolicy,
  createOutputSchemaDescriptor,
  createStructuredModelRequest,
  type JsonObject,
  type StructuredModelRequest,
} from '../../index.js';
import { createOpenAIModelGateway } from './index.js';

type TestOutput = Readonly<{ answer: string }>;

const apiKey = 'test-api-key-never-log';
const configuredModelId = 'configured-model';

const responsePayload = (
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> => ({
  id: 'resp_internal_not_request_id',
  object: 'response',
  created_at: 1,
  status: 'completed',
  model: 'resolved-model-2026-07-19',
  output: [
    {
      id: 'message_1',
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text: '{"answer":"accepted"}', annotations: [] }],
    },
  ],
  usage: {
    input_tokens: 12,
    output_tokens: 5,
    total_tokens: 17,
    input_tokens_details: { cached_tokens: 3, cache_write_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 2 },
  },
  incomplete_details: null,
  error: null,
  ...overrides,
});

const createRequest = (
  options: Readonly<{
    allowedProviderIds?: readonly string[];
    allowedModelIds?: readonly string[];
    schemaName?: string;
    timeoutMilliseconds?: number;
    signal?: AbortSignal;
  }> = {},
): StructuredModelRequest<TestOutput> => {
  const policy = createModelPolicy({
    allowedProviderIds: options.allowedProviderIds ?? ['openai'],
    allowedModelIds: options.allowedModelIds ?? [configuredModelId],
    qualityTier: 'balanced',
    fallbackAllowed: false,
    maximumOutputTokens: 240,
  });
  if (!policy.ok) {
    throw new Error('Test policy setup failed.');
  }

  const outputSchema = createOutputSchemaDescriptor({
    name: options.schemaName ?? 'test_output_v1',
    version: '1',
    schema: {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
      additionalProperties: false,
    } as JsonObject,
    strict: true,
  });
  if (!outputSchema.ok) {
    throw new Error('Test schema setup failed.');
  }

  const request = createStructuredModelRequest<TestOutput>({
    task: { name: 'adapter-test', version: '1' },
    policy: policy.value,
    messages: [
      { role: 'system', content: 'Return JSON only.' },
      { role: 'user', content: 'Provide the answer.' },
      { role: 'assistant', content: 'Acknowledged.' },
    ],
    outputSchema: outputSchema.value,
    timeoutMilliseconds: options.timeoutMilliseconds ?? 1_000,
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    metadata: {
      applicationRequestId: 'application-secret-id',
      correlationId: 'correlation-secret-id',
      tenantId: 'tenant-secret-id',
      promptVersion: 'prompt-secret-version',
      operationName: 'operation-secret-name',
    },
  });
  if (!request.ok) {
    throw new Error('Test request setup failed.');
  }

  return request.value;
};

type RecordedCall = Readonly<{
  url: string;
  body: unknown;
  timeoutSignal: AbortSignal | null;
}>;

const createFetchHarness = (
  payload: Readonly<Record<string, unknown>>,
  options: Readonly<{
    status?: number;
    headers?: Readonly<Record<string, string>>;
  }> = {},
) => {
  const calls: RecordedCall[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push(
      Object.freeze({
        url: String(input),
        body,
        timeoutSignal: init?.signal ?? null,
      }),
    );

    return new Response(JSON.stringify(payload), {
      status: options.status ?? 200,
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'request_123',
        ...options.headers,
      },
    });
  };

  return { calls, fakeFetch };
};

describe('OpenAI model gateway request mapping', () => {
  it('maps the provider-neutral request through one SDK Responses call', async () => {
    const harness = createFetchHarness(responsePayload());
    const readings = [100, 142];
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: harness.fakeFetch,
      monotonicNow: () => readings.shift() ?? 142,
    });

    const result = await gateway.generateStructured(createRequest());

    expect(harness.calls).toHaveLength(1);
    expect(harness.calls[0]?.url).toBe('https://api.openai.com/v1/responses');
    expect(harness.calls[0]?.body).toEqual({
      model: configuredModelId,
      input: [
        { role: 'system', content: 'Return JSON only.' },
        { role: 'user', content: 'Provide the answer.' },
        { role: 'assistant', content: 'Acknowledged.' },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'test_output_v1',
          schema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
            additionalProperties: false,
          },
          strict: true,
        },
      },
      max_output_tokens: 240,
      store: false,
    });
    expect(JSON.stringify(harness.calls[0]?.body)).not.toContain(apiKey);
    expect(JSON.stringify(harness.calls[0]?.body)).not.toContain('tenant-secret-id');
    expect(harness.calls[0]?.timeoutSignal).toBeInstanceOf(AbortSignal);
    expect(result).toEqual({
      status: 'success',
      output: { answer: 'accepted' },
      providerId: 'openai',
      modelId: 'resolved-model-2026-07-19',
      providerRequestId: 'request_123',
      usage: {
        inputTokens: 12,
        outputTokens: 5,
        totalTokens: 17,
        cachedInputTokens: 3,
        reasoningTokens: 2,
      },
      completionState: 'completed',
      latencyMilliseconds: 42,
    });
  });

  it.each([
    { request: createRequest({ allowedProviderIds: ['another'] }), reason: 'provider' },
    { request: createRequest({ allowedModelIds: ['another'] }), reason: 'model' },
    { request: createRequest({ schemaName: 'invalid schema name' }), reason: 'schema' },
  ])('rejects a disallowed $reason before fetch', async ({ request }) => {
    const harness = createFetchHarness(responsePayload());
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: harness.fakeFetch,
    });

    const result = await gateway.generateStructured(request);

    expect(harness.calls).toHaveLength(0);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('INVALID_REQUEST');
      expect(result.error.phase).toBe('request');
    }
  });

  it('does not allow environment base URL redirection', async () => {
    const previous = process.env['OPENAI_BASE_URL'];
    process.env['OPENAI_BASE_URL'] = 'https://redirect.invalid/v1';
    try {
      const harness = createFetchHarness(responsePayload());
      const gateway = createOpenAIModelGateway({
        apiKey,
        modelId: configuredModelId,
        fetch: harness.fakeFetch,
      });
      await gateway.generateStructured(createRequest());
      expect(harness.calls[0]?.url).toBe('https://api.openai.com/v1/responses');
    } finally {
      if (previous === undefined) {
        delete process.env['OPENAI_BASE_URL'];
      } else {
        process.env['OPENAI_BASE_URL'] = previous;
      }
    }
  });

  it('does not mutate requests or share state between adapter instances', async () => {
    const request = createRequest();
    const before = JSON.stringify(request);
    const firstHarness = createFetchHarness(responsePayload());
    const secondHarness = createFetchHarness(
      responsePayload({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{"answer":"second"}', annotations: [] }],
          },
        ],
      }),
    );
    const first = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: firstHarness.fakeFetch,
    });
    const second = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: secondHarness.fakeFetch,
    });

    const [firstResult, secondResult] = await Promise.all([
      first.generateStructured(request),
      second.generateStructured(request),
    ]);

    expect(JSON.stringify(request)).toBe(before);
    expect(firstHarness.calls).toHaveLength(1);
    expect(secondHarness.calls).toHaveLength(1);
    expect(firstResult.status).toBe('success');
    expect(secondResult.status).toBe('success');
    if (firstResult.status === 'success' && secondResult.status === 'success') {
      expect(firstResult.output).toEqual({ answer: 'accepted' });
      expect(secondResult.output).toEqual({ answer: 'second' });
      expect(Object.isFrozen(firstResult.output)).toBe(true);
    }
  });

  it('does not write requests, responses, or SDK errors to the console', async () => {
    const spies = [
      vi.spyOn(console, 'debug').mockImplementation(() => undefined),
      vi.spyOn(console, 'info').mockImplementation(() => undefined),
      vi.spyOn(console, 'warn').mockImplementation(() => undefined),
      vi.spyOn(console, 'error').mockImplementation(() => undefined),
    ];
    try {
      const harness = createFetchHarness(
        { error: { message: 'raw provider error', type: 'server_error', code: 'server_error' } },
        { status: 500 },
      );
      const gateway = createOpenAIModelGateway({
        apiKey,
        modelId: configuredModelId,
        fetch: harness.fakeFetch,
      });

      await gateway.generateStructured(createRequest());

      for (const spy of spies) {
        expect(spy).not.toHaveBeenCalled();
      }
    } finally {
      for (const spy of spies) {
        spy.mockRestore();
      }
    }
  });
});

describe('OpenAI model gateway result normalization', () => {
  it('maps a typed refusal without exposing refusal text', async () => {
    const harness = createFetchHarness(
      responsePayload({
        output: [
          {
            id: 'message_1',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'refusal', refusal: 'raw refusal must not escape' }],
          },
        ],
      }),
    );
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: harness.fakeFetch,
    });

    const result = await gateway.generateStructured(createRequest());

    expect(result.status).toBe('refusal');
    expect(result).toMatchObject({
      refusal: { category: 'safety' },
      providerId: 'openai',
      modelId: 'resolved-model-2026-07-19',
      providerRequestId: 'request_123',
      completionState: 'completed',
    });
    expect(JSON.stringify(result)).not.toContain('raw refusal');
  });

  it('maps complete JSON after max-output truncation with a truncated state', async () => {
    const harness = createFetchHarness(
      responsePayload({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      }),
    );
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: harness.fakeFetch,
    });

    const result = await gateway.generateStructured(createRequest());

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.completionState).toBe('truncated');
    }
  });

  it.each([
    {
      payload: responsePayload({
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '{invalid', annotations: [] }],
          },
        ],
      }),
      code: 'MALFORMED_RESPONSE',
    },
    { payload: responsePayload({ usage: undefined }), code: 'MALFORMED_RESPONSE' },
    {
      payload: responsePayload({ usage: { input_tokens: 'not-a-number' } }),
      code: 'MALFORMED_RESPONSE',
    },
    {
      payload: responsePayload({
        status: 'incomplete',
        incomplete_details: { reason: 'content_filter' },
      }),
      code: 'OUTPUT_SCHEMA_MISMATCH',
    },
    {
      payload: responsePayload({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [],
      }),
      code: 'MALFORMED_RESPONSE',
    },
    { payload: responsePayload({ status: 'queued' }), code: 'UNEXPECTED' },
    {
      payload: responsePayload({
        status: 'failed',
        error: { code: 'server_error', message: 'raw provider error' },
      }),
      code: 'UNAVAILABLE',
    },
    { payload: responsePayload({ status: undefined }), code: 'MALFORMED_RESPONSE' },
  ])('normalizes invalid terminal output as $code', async ({ payload, code }) => {
    const harness = createFetchHarness(payload);
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: harness.fakeFetch,
    });

    const result = await gateway.generateStructured(createRequest());

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe(code);
      expect(result.error.phase).toBe('response');
    }
  });

  it('rejects inconsistent provider usage instead of estimating it', async () => {
    const harness = createFetchHarness(
      responsePayload({
        usage: {
          input_tokens: 12,
          output_tokens: 5,
          total_tokens: 99,
          input_tokens_details: { cached_tokens: 3, cache_write_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 2 },
        },
      }),
    );
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: harness.fakeFetch,
    });

    const result = await gateway.generateStructured(createRequest());

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('MALFORMED_RESPONSE');
    }
  });
});

describe('OpenAI model gateway error normalization', () => {
  it.each([
    { status: 400, code: 'invalid_request_error', expected: 'INVALID_REQUEST' },
    { status: 400, code: 'context_length_exceeded', expected: 'CONTEXT_LIMIT' },
    { status: 401, code: 'invalid_api_key', expected: 'AUTHENTICATION' },
    { status: 403, code: 'permission_denied', expected: 'PERMISSION_DENIED' },
    { status: 500, code: 'server_error', expected: 'UNAVAILABLE' },
  ])('maps HTTP $status to $expected without SDK retries', async ({ status, code, expected }) => {
    const harness = createFetchHarness(
      { error: { message: 'raw provider detail must not escape', type: 'provider_error', code } },
      { status },
    );
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: harness.fakeFetch,
    });

    const result = await gateway.generateStructured(createRequest());

    expect(harness.calls).toHaveLength(1);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe(expected);
      expect(result.error.providerRequestId).toBe('request_123');
      expect(result.error.message).not.toContain('raw provider detail');
    }
  });

  it('maps bounded numeric retry-after metadata', async () => {
    const harness = createFetchHarness(
      { error: { message: 'rate limited', type: 'rate_limit_error', code: 'rate_limit_exceeded' } },
      { status: 429, headers: { 'retry-after-ms': '2500' } },
    );
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: harness.fakeFetch,
    });

    const result = await gateway.generateStructured(createRequest());

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).toMatchObject({
        code: 'RATE_LIMITED',
        retryable: true,
        retryAfterMilliseconds: 2_500,
      });
    }
  });

  it('drops unsafe retry-after metadata', async () => {
    const harness = createFetchHarness(
      { error: { message: 'rate limited', type: 'rate_limit_error', code: 'rate_limit_exceeded' } },
      { status: 429, headers: { 'retry-after-ms': '86400001', 'retry-after': 'not-a-number' } },
    );
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: harness.fakeFetch,
    });

    const result = await gateway.generateStructured(createRequest());

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error).not.toHaveProperty('retryAfterMilliseconds');
    }
  });

  it('returns cancellation before fetch for an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const harness = createFetchHarness(responsePayload());
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: harness.fakeFetch,
    });

    const result = await gateway.generateStructured(createRequest({ signal: controller.signal }));

    expect(harness.calls).toHaveLength(0);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('CANCELLED');
      expect(result.error.phase).toBe('request');
    }
  });

  it('maps an in-flight caller abort to cancellation without retrying', async () => {
    const controller = new AbortController();
    let calls = 0;
    let announceStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      announceStarted = resolve;
    });
    const fakeFetch: typeof fetch = async (_input, init) => {
      calls += 1;
      announceStarted?.();
      return await new Promise<Response>((_resolve, reject) => {
        const rejectAbort = () => reject(new DOMException('caller aborted', 'AbortError'));
        if (init?.signal?.aborted === true) {
          rejectAbort();
          return;
        }
        init?.signal?.addEventListener('abort', rejectAbort, { once: true });
      });
    };
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: fakeFetch,
    });
    const pending = gateway.generateStructured(createRequest({ signal: controller.signal }));
    await started;

    controller.abort();
    const result = await pending;

    expect(calls).toBe(1);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('CANCELLED');
      expect(result.error.code).not.toBe('TIMEOUT');
      expect(result.error.retryable).toBe(false);
    }
  });

  it('maps the SDK timeout path without retrying', async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async (_input, init) => {
      calls += 1;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          {
            once: true,
          },
        );
      });
    };
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: fakeFetch,
    });

    const result = await gateway.generateStructured(createRequest({ timeoutMilliseconds: 5 }));

    expect(calls).toBe(1);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('TIMEOUT');
      expect(result.error.retryable).toBe(true);
    }
  });

  it('maps an SDK connection failure without allowing the exception to escape', async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls += 1;
      throw new TypeError('raw network failure');
    };
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: fakeFetch,
    });

    const result = await gateway.generateStructured(createRequest());

    expect(calls).toBe(1);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('UNAVAILABLE');
      expect(result.error.message).not.toContain('raw network failure');
    }
  });

  it('normalizes an unclassified adapter exception as unexpected', async () => {
    const harness = createFetchHarness(responsePayload());
    let clockReads = 0;
    const gateway = createOpenAIModelGateway({
      apiKey,
      modelId: configuredModelId,
      fetch: harness.fakeFetch,
      monotonicNow: () => {
        clockReads += 1;
        if (clockReads > 1) {
          throw new Error('raw clock failure');
        }
        return 0;
      },
    });

    const result = await gateway.generateStructured(createRequest());

    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.error.code).toBe('UNEXPECTED');
      expect(result.error.message).not.toContain('raw clock failure');
    }
  });

  it('throws fixed construction errors that never contain credentials', () => {
    expect(() => createOpenAIModelGateway({ apiKey, modelId: '' })).toThrow(
      'OpenAI adapter modelId configuration is invalid.',
    );
    try {
      createOpenAIModelGateway({ apiKey: 'credential-that-must-not-escape', modelId: '' });
    } catch (error: unknown) {
      expect(String(error)).not.toContain('credential-that-must-not-escape');
    }
  });
});
