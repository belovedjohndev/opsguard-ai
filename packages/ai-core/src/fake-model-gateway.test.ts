import { describe, expect, it } from 'vitest';

import {
  FakeModelGateway,
  FakeModelGatewayExhaustedError,
  fakeModelGatewayExhaustedCode,
} from './fake-model-gateway.js';
import { createModelGatewayError, modelGatewayErrorCodes } from './model-errors.js';
import { createModelGatewayFailure, type ModelGatewayResult } from './model-gateway.js';
import {
  createModelPolicy,
  createModelRefusal,
  createModelSuccess,
  createOutputSchemaDescriptor,
  createStructuredModelRequest,
  type JsonValue,
  type ModelContractResult,
  type StructuredModelRequest,
} from './model-types.js';

const unwrap = <Value>(result: ModelContractResult<Value>): Value => {
  if (!result.ok) {
    throw new Error(`Unexpected contract failure: ${result.error.field}/${result.error.reason}`);
  }
  return result.value;
};

const createRequest = (
  signal?: AbortSignal,
): StructuredModelRequest<{ readonly category: string }> =>
  unwrap(
    createStructuredModelRequest({
      task: { name: 'classify', version: 'v1' },
      policy: unwrap(
        createModelPolicy({
          allowedProviderIds: ['provider-a'],
          allowedModelIds: ['model-a'],
          qualityTier: 'balanced',
          fallbackAllowed: false,
          maximumOutputTokens: 100,
        }),
      ),
      messages: [
        { role: 'system', content: 'Return structured data.' },
        { role: 'user', content: 'Classify this input.' },
      ],
      outputSchema: unwrap(
        createOutputSchemaDescriptor({
          name: 'classification',
          version: 'v1',
          schema: { type: 'object' },
          strict: true,
        }),
      ),
      timeoutMilliseconds: 1_000,
      ...(signal === undefined ? {} : { signal }),
      metadata: {
        applicationRequestId: 'request-1',
        correlationId: 'correlation-1',
        tenantId: 'tenant-1',
        promptVersion: 'prompt-v1',
        operationName: 'classify-request',
      },
    }),
  );

const success = () =>
  unwrap(
    createModelSuccess({
      output: { category: 'operations' },
      providerId: 'provider-a',
      modelId: 'model-a',
      providerRequestId: 'provider-request-1',
      usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
      completionState: 'completed',
      latencyMilliseconds: 20,
    }),
  );

const refusal = () =>
  unwrap(
    createModelRefusal({
      category: 'safety',
      providerId: 'provider-a',
      modelId: 'model-a',
      completionState: 'completed',
    }),
  );

describe('FakeModelGateway', () => {
  it('returns success, refusal, and normalized errors in FIFO order', async () => {
    const errors = modelGatewayErrorCodes.map((code) => {
      const error = unwrap(createModelGatewayError({ code, message: `safe ${code}` }));
      return createModelGatewayFailure(error);
    });
    const gateway = new FakeModelGateway([success(), refusal(), ...errors]);
    const request = createRequest();

    await expect(gateway.generateStructured(request)).resolves.toMatchObject({ status: 'success' });
    await expect(gateway.generateStructured(request)).resolves.toMatchObject({ status: 'refusal' });

    for (const code of modelGatewayErrorCodes) {
      await expect(gateway.generateStructured(request)).resolves.toMatchObject({
        status: 'error',
        error: { code },
      });
    }

    expect(gateway.requests).toHaveLength(modelGatewayErrorCodes.length + 2);
  });

  it('records complete defensive request snapshots and preserves cancellation identity', async () => {
    const controller = new AbortController();
    const request = createRequest(controller.signal);
    const gateway = new FakeModelGateway([success()]);

    await gateway.generateStructured(request);

    const history = gateway.requests;
    const recordedRequest = history[0];
    if (recordedRequest === undefined) {
      throw new Error('Expected one recorded request');
    }
    expect(history).not.toBe(gateway.requests);
    expect(Object.isFrozen(history)).toBe(true);
    expect(recordedRequest).not.toBe(request);
    expect(recordedRequest).toEqual(request);
    expect(recordedRequest.signal).toBe(controller.signal);
    expect(recordedRequest.messages).not.toBe(request.messages);
    expect(recordedRequest.outputSchema.schema).not.toBe(request.outputSchema.schema);
    expect(Object.isFrozen(recordedRequest.messages)).toBe(true);
    expect(() => (history as StructuredModelRequest<JsonValue>[]).push(request)).toThrow();
  });

  it('isolates configured outcomes from later caller mutation', async () => {
    const original = success();
    const mutableOutput = { category: 'operations' };
    const configured = {
      ...original,
      output: mutableOutput,
    } as ModelGatewayResult<JsonValue>;
    const gateway = new FakeModelGateway([configured]);

    mutableOutput.category = 'changed';
    const result = await gateway.generateStructured(createRequest());

    expect(result).toMatchObject({ status: 'success', output: { category: 'operations' } });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status === 'success') {
      expect(Object.isFrozen(result.output)).toBe(true);
    }
  });

  it('throws a stable test-only error when the queue is exhausted and records the call', async () => {
    const gateway = new FakeModelGateway([]);

    await expect(gateway.generateStructured(createRequest())).rejects.toMatchObject({
      name: 'FakeModelGatewayExhaustedError',
      code: fakeModelGatewayExhaustedCode,
      message: 'FakeModelGateway has no configured result for this call.',
    });
    await expect(gateway.generateStructured(createRequest())).rejects.toBeInstanceOf(
      FakeModelGatewayExhaustedError,
    );
    expect(gateway.requests).toHaveLength(2);
  });

  it('keeps queues and request histories isolated between instances', async () => {
    const first = new FakeModelGateway([success()]);
    const second = new FakeModelGateway([refusal()]);

    await expect(first.generateStructured(createRequest())).resolves.toMatchObject({
      status: 'success',
    });
    await expect(second.generateStructured(createRequest())).resolves.toMatchObject({
      status: 'refusal',
    });

    expect(first.requests).toHaveLength(1);
    expect(second.requests).toHaveLength(1);
    await expect(first.generateStructured(createRequest())).rejects.toBeInstanceOf(
      FakeModelGatewayExhaustedError,
    );
  });
});
