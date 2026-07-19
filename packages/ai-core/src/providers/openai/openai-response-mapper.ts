import type { Response } from 'openai/resources/responses/responses.js';

import { createModelGatewayFailure, type ModelGatewayResult } from '../../model-gateway.js';
import {
  copyJsonValue,
  createModelRefusal,
  createModelSuccess,
  parseProviderRequestId,
  type CreateModelUsageInput,
  type JsonValue,
  type ModelCompletionState,
} from '../../model-types.js';
import { createOpenAIFailure } from './openai-error-mapper.js';

type OpenAIResponse = Response & Readonly<{ _request_id?: string | null }>;

const readRequestId = (response: OpenAIResponse): string | undefined => {
  if (response._request_id === null || response._request_id === undefined) {
    return undefined;
  }

  const result = parseProviderRequestId(response._request_id);
  return result.ok ? result.value : undefined;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mapUsage = (usage: unknown): CreateModelUsageInput | undefined => {
  if (!isRecord(usage)) {
    return undefined;
  }

  const inputTokens = usage['input_tokens'];
  const outputTokens = usage['output_tokens'];
  const totalTokens = usage['total_tokens'];
  if (
    typeof inputTokens !== 'number' ||
    typeof outputTokens !== 'number' ||
    typeof totalTokens !== 'number'
  ) {
    return undefined;
  }

  const inputDetails = usage['input_tokens_details'];
  const outputDetails = usage['output_tokens_details'];
  const cachedInputTokens = isRecord(inputDetails) ? inputDetails['cached_tokens'] : undefined;
  const reasoningTokens = isRecord(outputDetails) ? outputDetails['reasoning_tokens'] : undefined;
  if (
    (cachedInputTokens !== undefined && typeof cachedInputTokens !== 'number') ||
    (reasoningTokens !== undefined && typeof reasoningTokens !== 'number')
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
  };
};

const extractContent = (
  response: OpenAIResponse,
): Readonly<{ texts: readonly string[]; refusals: number }> => {
  const texts: string[] = [];
  let refusals = 0;

  for (const item of response.output) {
    if (item.type !== 'message') {
      continue;
    }

    for (const content of item.content) {
      if (content.type === 'output_text') {
        texts.push(content.text);
      } else if (content.type === 'refusal') {
        refusals += 1;
      }
    }
  }

  return Object.freeze({ texts: Object.freeze(texts), refusals });
};

const mapFailedResponse = (response: OpenAIResponse, configuredModelId: string) => {
  const providerRequestId = readRequestId(response);
  const code = response.error?.code;

  if (code === 'rate_limit_exceeded') {
    return createOpenAIFailure(
      'RATE_LIMITED',
      'OpenAI rate limited the model request.',
      configuredModelId,
      'response',
      providerRequestId === undefined ? {} : { providerRequestId },
    );
  }

  if (code === 'server_error' || code === 'vector_store_timeout') {
    return createOpenAIFailure(
      'UNAVAILABLE',
      'OpenAI is temporarily unavailable.',
      configuredModelId,
      'response',
      providerRequestId === undefined ? {} : { providerRequestId },
    );
  }

  if (code === 'bio_policy' || code === 'image_content_policy_violation') {
    return createOpenAIFailure(
      'PERMISSION_DENIED',
      'OpenAI denied the requested model operation.',
      configuredModelId,
      'response',
      providerRequestId === undefined ? {} : { providerRequestId },
    );
  }

  return createOpenAIFailure(
    'INVALID_REQUEST',
    'OpenAI rejected the model request.',
    configuredModelId,
    'response',
    providerRequestId === undefined ? {} : { providerRequestId },
  );
};

export const mapOpenAIResponse = <TOutput extends JsonValue>(
  response: OpenAIResponse,
  configuredModelId: string,
  latencyMilliseconds: number,
): ModelGatewayResult<TOutput> => {
  const providerRequestId = readRequestId(response);

  if (response.status === 'failed') {
    return mapFailedResponse(response, configuredModelId);
  }

  if (response.status === 'cancelled') {
    return createOpenAIFailure(
      'CANCELLED',
      'The OpenAI request was cancelled.',
      configuredModelId,
      'response',
      providerRequestId === undefined ? {} : { providerRequestId },
    );
  }

  if (
    response.status === undefined ||
    response.status === 'queued' ||
    response.status === 'in_progress'
  ) {
    return createOpenAIFailure(
      response.status === undefined ? 'MALFORMED_RESPONSE' : 'UNEXPECTED',
      'OpenAI returned a response in an invalid terminal state.',
      configuredModelId,
      'response',
      providerRequestId === undefined ? {} : { providerRequestId },
    );
  }

  const completionState: ModelCompletionState =
    response.status === 'incomplete' ? 'truncated' : 'completed';
  const content = extractContent(response);
  const usage = response.usage === undefined ? undefined : mapUsage(response.usage);

  if (response.usage !== undefined && usage === undefined) {
    return createOpenAIFailure(
      'MALFORMED_RESPONSE',
      'OpenAI returned malformed usage metadata.',
      configuredModelId,
      'response',
      providerRequestId === undefined ? {} : { providerRequestId },
    );
  }

  if (content.refusals === 1 && content.texts.length === 0) {
    const refusal = createModelRefusal({
      category: 'safety',
      providerId: 'openai',
      modelId: response.model,
      ...(providerRequestId === undefined ? {} : { providerRequestId }),
      ...(usage === undefined ? {} : { usage }),
      completionState,
    });

    return refusal.ok
      ? refusal.value
      : createOpenAIFailure(
          'MALFORMED_RESPONSE',
          'OpenAI returned invalid refusal metadata.',
          configuredModelId,
          'response',
          providerRequestId === undefined ? {} : { providerRequestId },
        );
  }

  if (content.refusals !== 0 || content.texts.length !== 1) {
    const code =
      response.status === 'incomplete' &&
      response.incomplete_details?.reason === 'max_output_tokens'
        ? 'MALFORMED_RESPONSE'
        : 'OUTPUT_SCHEMA_MISMATCH';
    return createOpenAIFailure(
      code,
      'OpenAI did not return exactly one structured output.',
      configuredModelId,
      'response',
      providerRequestId === undefined ? {} : { providerRequestId },
    );
  }

  if (
    response.status === 'incomplete' &&
    response.incomplete_details?.reason !== 'max_output_tokens'
  ) {
    return createOpenAIFailure(
      'OUTPUT_SCHEMA_MISMATCH',
      'OpenAI did not complete the required structured output.',
      configuredModelId,
      'response',
      providerRequestId === undefined ? {} : { providerRequestId },
    );
  }

  const outputText = content.texts[0];
  if (outputText === undefined) {
    return createOpenAIFailure(
      'OUTPUT_SCHEMA_MISMATCH',
      'OpenAI did not return structured output.',
      configuredModelId,
      'response',
      providerRequestId === undefined ? {} : { providerRequestId },
    );
  }

  let parsedOutput: unknown;
  try {
    parsedOutput = JSON.parse(outputText);
  } catch {
    return createOpenAIFailure(
      'MALFORMED_RESPONSE',
      'OpenAI returned invalid JSON output.',
      configuredModelId,
      'response',
      providerRequestId === undefined ? {} : { providerRequestId },
    );
  }

  const output = copyJsonValue(parsedOutput, 'openai.response.output');
  if (!output.ok) {
    return createOpenAIFailure(
      'MALFORMED_RESPONSE',
      'OpenAI returned unsupported JSON output.',
      configuredModelId,
      'response',
      providerRequestId === undefined ? {} : { providerRequestId },
    );
  }

  if (usage === undefined) {
    return createOpenAIFailure(
      'MALFORMED_RESPONSE',
      'OpenAI returned a successful response without usage metadata.',
      configuredModelId,
      'response',
      providerRequestId === undefined ? {} : { providerRequestId },
    );
  }

  const success = createModelSuccess<TOutput>({
    output: output.value as TOutput,
    providerId: 'openai',
    modelId: response.model,
    ...(providerRequestId === undefined ? {} : { providerRequestId }),
    usage,
    completionState,
    latencyMilliseconds,
  });

  return success.ok
    ? success.value
    : createModelGatewayFailure(
        createOpenAIFailure(
          'MALFORMED_RESPONSE',
          'OpenAI returned invalid result metadata.',
          configuredModelId,
          'response',
          providerRequestId === undefined ? {} : { providerRequestId },
        ).error,
      );
};
