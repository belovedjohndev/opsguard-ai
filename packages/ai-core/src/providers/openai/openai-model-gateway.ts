import OpenAI from 'openai';

import type { ModelGateway, ModelGatewayResult } from '../../model-gateway.js';
import {
  parseModelId,
  parseProviderId,
  type JsonValue,
  type ModelId,
  type ProviderId,
  type StructuredModelRequest,
} from '../../model-types.js';
import { createOpenAIFailure, mapOpenAIError } from './openai-error-mapper.js';
import { mapOpenAIResponse } from './openai-response-mapper.js';

const openAIProviderIdResult = parseProviderId('openai');
if (!openAIProviderIdResult.ok) {
  throw new Error('OpenAI adapter provider invariant failure.');
}
const openAIProviderId: ProviderId = openAIProviderIdResult.value;
const openAIBaseUrl = 'https://api.openai.com/v1';
const maximumApiKeyLength = 4_096;
const openAISchemaNamePattern = /^[A-Za-z0-9_-]{1,64}$/;

export type OpenAIModelGatewayConfig = Readonly<{
  apiKey: string;
  modelId: string;
  fetch?: typeof fetch;
  monotonicNow?: () => number;
}>;

const resolveRequiredConfigValue = (
  value: string,
  name: 'apiKey' | 'modelId',
  maximumLength: number,
): string => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maximumLength) {
    throw new Error(`OpenAI adapter ${name} configuration is invalid.`);
  }

  return value.trim();
};

const measureLatency = (start: number, end: number): number | undefined => {
  const elapsed = Math.round(end - start);
  return Number.isSafeInteger(elapsed) && elapsed >= 0 ? elapsed : undefined;
};

class OpenAIModelGateway implements ModelGateway {
  readonly #client: OpenAI;
  readonly #modelId: ModelId;
  readonly #monotonicNow: () => number;

  constructor(config: OpenAIModelGatewayConfig) {
    const apiKey = resolveRequiredConfigValue(config.apiKey, 'apiKey', maximumApiKeyLength);
    const modelId = resolveRequiredConfigValue(config.modelId, 'modelId', 255);
    const modelIdResult = parseModelId(modelId);
    if (!modelIdResult.ok) {
      throw new Error('OpenAI adapter modelId configuration is invalid.');
    }

    this.#modelId = modelIdResult.value;
    this.#monotonicNow = config.monotonicNow ?? (() => performance.now());
    this.#client = new OpenAI({
      apiKey,
      baseURL: openAIBaseUrl,
      maxRetries: 0,
      logLevel: 'off',
      ...(config.fetch === undefined ? {} : { fetch: config.fetch }),
    });
  }

  async generateStructured<TOutput extends JsonValue>(
    request: StructuredModelRequest<TOutput>,
  ): Promise<ModelGatewayResult<TOutput>> {
    if (
      !request.policy.allowedProviderIds.includes(openAIProviderId) ||
      !request.policy.allowedModelIds.includes(this.#modelId)
    ) {
      return createOpenAIFailure(
        'INVALID_REQUEST',
        'The request policy does not allow the configured OpenAI model.',
        this.#modelId,
        'request',
      );
    }

    if (!openAISchemaNamePattern.test(request.outputSchema.name)) {
      return createOpenAIFailure(
        'INVALID_REQUEST',
        'The output schema name is incompatible with OpenAI.',
        this.#modelId,
        'request',
      );
    }

    if (request.signal?.aborted === true) {
      return createOpenAIFailure(
        'CANCELLED',
        'The OpenAI request was cancelled.',
        this.#modelId,
        'request',
      );
    }

    let startedAt: number;
    try {
      startedAt = this.#monotonicNow();
    } catch {
      return createOpenAIFailure(
        'UNEXPECTED',
        'The OpenAI adapter clock failed.',
        this.#modelId,
        'request',
      );
    }

    try {
      const response = await this.#client.responses.create(
        {
          model: this.#modelId,
          input: request.messages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          text: {
            format: {
              type: 'json_schema',
              name: request.outputSchema.name,
              schema: request.outputSchema.schema,
              strict: request.outputSchema.strict,
            },
          },
          max_output_tokens: request.policy.maximumOutputTokens,
          store: false,
        },
        {
          timeout: request.timeoutMilliseconds,
          ...(request.signal === undefined ? {} : { signal: request.signal }),
        },
      );

      const latencyMilliseconds = measureLatency(startedAt, this.#monotonicNow());
      if (latencyMilliseconds === undefined) {
        return createOpenAIFailure(
          'UNEXPECTED',
          'The OpenAI adapter clock returned an invalid duration.',
          this.#modelId,
          'response',
        );
      }

      return mapOpenAIResponse<TOutput>(response, this.#modelId, latencyMilliseconds);
    } catch (error: unknown) {
      return mapOpenAIError(error, this.#modelId, request.signal);
    }
  }
}

export const createOpenAIModelGateway = (config: OpenAIModelGatewayConfig): ModelGateway =>
  new OpenAIModelGateway(config);
