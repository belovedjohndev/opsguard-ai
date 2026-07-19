import { describe, expect, it } from 'vitest';

import {
  createModelPolicy,
  createOutputSchemaDescriptor,
  createStructuredModelRequest,
  type JsonObject,
  type JsonValue,
} from '../../index.js';
import { createOpenAIModelGateway } from './index.js';

const integrationFlag = process.env['RUN_OPENAI_INTEGRATION_TESTS'] ?? 'false';
if (integrationFlag !== 'true' && integrationFlag !== 'false') {
  throw new Error('RUN_OPENAI_INTEGRATION_TESTS must be exactly true or false.');
}

const requiredEnvironmentValue = (name: 'OPENAI_API_KEY' | 'OPENAI_MODEL'): string => {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required for the OpenAI integration test.`);
  }
  return value.trim();
};

describe.skipIf(integrationFlag !== 'true')('OpenAI model gateway live integration', () => {
  it('returns one normalized structured result without exposing response content', async () => {
    const modelId = requiredEnvironmentValue('OPENAI_MODEL');
    const policy = createModelPolicy({
      allowedProviderIds: ['openai'],
      allowedModelIds: [modelId],
      qualityTier: 'balanced',
      fallbackAllowed: false,
      maximumOutputTokens: 64,
    });
    const outputSchema = createOutputSchemaDescriptor({
      name: 'opsguard_day9_smoke',
      version: '1',
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' } },
        required: ['ok'],
        additionalProperties: false,
      } as JsonObject,
      strict: true,
    });
    if (!policy.ok || !outputSchema.ok) {
      throw new Error('OpenAI integration contract setup failed.');
    }

    const request = createStructuredModelRequest<JsonValue>({
      task: { name: 'openai-live-smoke', version: '1' },
      policy: policy.value,
      messages: [{ role: 'user', content: 'Return an object with ok set to true.' }],
      outputSchema: outputSchema.value,
      timeoutMilliseconds: 30_000,
      metadata: {
        applicationRequestId: 'day9-live-smoke',
        correlationId: 'day9-live-smoke',
        tenantId: 'local-integration-test',
        promptVersion: 'day9-smoke-v1',
        operationName: 'openai-adapter-live-smoke',
      },
    });
    if (!request.ok) {
      throw new Error('OpenAI integration request setup failed.');
    }

    const gateway = createOpenAIModelGateway({
      apiKey: requiredEnvironmentValue('OPENAI_API_KEY'),
      modelId,
    });
    const result = await gateway.generateStructured(request.value);

    expect(['success', 'refusal']).toContain(result.status);
    if (result.status === 'success' || result.status === 'refusal') {
      expect(result.providerId).toBe('openai');
      expect(result.modelId.length).toBeGreaterThan(0);
      if (result.usage !== undefined) {
        expect(result.usage.inputTokens).toBeGreaterThanOrEqual(0);
        expect(result.usage.outputTokens).toBeGreaterThanOrEqual(0);
        expect(result.usage.totalTokens).toBe(result.usage.inputTokens + result.usage.outputTokens);
      }
      if (result.providerRequestId !== undefined) {
        expect(result.providerRequestId.length).toBeGreaterThan(0);
      }
    }
  }, 45_000);
});
