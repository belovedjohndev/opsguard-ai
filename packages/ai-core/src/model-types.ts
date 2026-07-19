declare const modelIdentifierBrand: unique symbol;
declare const structuredModelRequestOutputBrand: unique symbol;

export type ProviderId = string & {
  readonly [modelIdentifierBrand]: 'ProviderId';
};

export type ModelId = string & {
  readonly [modelIdentifierBrand]: 'ModelId';
};

export type ProviderRequestId = string & {
  readonly [modelIdentifierBrand]: 'ProviderRequestId';
};

export type JsonPrimitive = boolean | null | number | string;
export type JsonArray = readonly JsonValue[];
export type JsonObject = Readonly<{ [key: string]: JsonValue }>;
export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export type ModelContractValidationReason =
  | 'empty'
  | 'inconsistent'
  | 'invalid_json'
  | 'not_finite'
  | 'not_integer'
  | 'out_of_range'
  | 'too_long'
  | 'unsupported';

export type ModelContractValidationError = Readonly<{
  code: 'INVALID_MODEL_CONTRACT';
  field: string;
  reason: ModelContractValidationReason;
}>;

export type ModelContractSuccess<Value> = Readonly<{
  ok: true;
  value: Value;
}>;

export type ModelContractFailure = Readonly<{
  ok: false;
  error: ModelContractValidationError;
}>;

export type ModelContractResult<Value> = ModelContractFailure | ModelContractSuccess<Value>;

export type ModelTask = Readonly<{
  name: string;
  version: string;
}>;

export const modelQualityTiers = Object.freeze(['economy', 'balanced', 'high'] as const);
export type ModelQualityTier = (typeof modelQualityTiers)[number];

export type ModelPolicy = Readonly<{
  allowedProviderIds: readonly ProviderId[];
  allowedModelIds: readonly ModelId[];
  qualityTier: ModelQualityTier;
  fallbackAllowed: boolean;
  maximumOutputTokens: number;
}>;

export const modelMessageRoles = Object.freeze(['system', 'user', 'assistant'] as const);
export type ModelMessageRole = (typeof modelMessageRoles)[number];

export type ModelMessage = Readonly<{
  role: ModelMessageRole;
  content: string;
}>;

export type OutputSchemaDescriptor = Readonly<{
  name: string;
  version: string;
  schema: JsonObject;
  strict: boolean;
}>;

export type ModelRequestMetadata = Readonly<{
  applicationRequestId: string;
  correlationId: string;
  tenantId: string;
  promptVersion: string;
  operationName: string;
}>;

export type StructuredModelRequest<TOutput extends JsonValue> = Readonly<{
  task: ModelTask;
  policy: ModelPolicy;
  messages: readonly ModelMessage[];
  outputSchema: OutputSchemaDescriptor;
  timeoutMilliseconds: number;
  signal?: AbortSignal;
  metadata: ModelRequestMetadata;
  readonly [structuredModelRequestOutputBrand]?: TOutput;
}>;

export const modelCompletionStates = Object.freeze(['completed', 'truncated'] as const);
export type ModelCompletionState = (typeof modelCompletionStates)[number];

export type ModelUsage = Readonly<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}>;

export type ModelSuccess<TOutput extends JsonValue> = Readonly<{
  status: 'success';
  output: TOutput;
  providerId: ProviderId;
  modelId: ModelId;
  providerRequestId?: ProviderRequestId;
  usage: ModelUsage;
  completionState: ModelCompletionState;
  latencyMilliseconds: number;
}>;

export const modelRefusalCategories = Object.freeze([
  'safety',
  'policy',
  'unsupported',
  'other',
] as const);
export type ModelRefusalCategory = (typeof modelRefusalCategories)[number];

export type ModelRefusal = Readonly<{
  status: 'refusal';
  refusal: Readonly<{
    category: ModelRefusalCategory;
  }>;
  providerId: ProviderId;
  modelId: ModelId;
  providerRequestId?: ProviderRequestId;
  usage?: ModelUsage;
  completionState: ModelCompletionState;
}>;

export type CreateModelPolicyInput = Readonly<{
  allowedProviderIds: readonly string[];
  allowedModelIds: readonly string[];
  qualityTier: ModelQualityTier;
  fallbackAllowed: boolean;
  maximumOutputTokens: number;
}>;

export type CreateModelUsageInput = Readonly<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}>;

export type CreateStructuredModelRequestInput<TOutput extends JsonValue> = Readonly<{
  task: ModelTask;
  policy: ModelPolicy;
  messages: readonly ModelMessage[];
  outputSchema: OutputSchemaDescriptor;
  timeoutMilliseconds: number;
  signal?: AbortSignal;
  metadata: ModelRequestMetadata;
  readonly [structuredModelRequestOutputBrand]?: TOutput;
}>;

export type CreateModelSuccessInput<TOutput extends JsonValue> = Readonly<{
  output: TOutput;
  providerId: string;
  modelId: string;
  providerRequestId?: string;
  usage: CreateModelUsageInput;
  completionState: ModelCompletionState;
  latencyMilliseconds: number;
}>;

export type CreateModelRefusalInput = Readonly<{
  category: ModelRefusalCategory;
  providerId: string;
  modelId: string;
  providerRequestId?: string;
  usage?: CreateModelUsageInput;
  completionState: ModelCompletionState;
}>;

const maximumIdentifierLength = 255;
const maximumTaskPartLength = 128;
const maximumMetadataValueLength = 255;
const maximumMessageLength = 100_000;

export const modelContractSuccess = <Value>(value: Value): ModelContractSuccess<Value> =>
  Object.freeze({ ok: true, value });

export const modelContractFailure = (
  field: string,
  reason: ModelContractValidationReason,
): ModelContractFailure =>
  Object.freeze({
    ok: false,
    error: Object.freeze({ code: 'INVALID_MODEL_CONTRACT', field, reason }),
  });

const parseBoundedString = <Value extends string>(
  value: unknown,
  field: string,
  maximumLength: number,
): ModelContractResult<Value> => {
  if (typeof value !== 'string') {
    return modelContractFailure(field, 'unsupported');
  }

  if (value.trim().length === 0) {
    return modelContractFailure(field, 'empty');
  }

  if (value.length > maximumLength) {
    return modelContractFailure(field, 'too_long');
  }

  return modelContractSuccess(value as Value);
};

export const parseProviderId = (value: string): ModelContractResult<ProviderId> =>
  parseBoundedString(value, 'providerId', maximumIdentifierLength);

export const parseModelId = (value: string): ModelContractResult<ModelId> =>
  parseBoundedString(value, 'modelId', maximumIdentifierLength);

export const parseProviderRequestId = (value: string): ModelContractResult<ProviderRequestId> =>
  parseBoundedString(value, 'providerRequestId', maximumIdentifierLength);

export const createModelTask = (
  input: Readonly<{ name: string; version: string }>,
): ModelContractResult<ModelTask> => {
  const nameResult = parseBoundedString<string>(input.name, 'task.name', maximumTaskPartLength);
  if (!nameResult.ok) {
    return nameResult;
  }

  const versionResult = parseBoundedString<string>(
    input.version,
    'task.version',
    maximumTaskPartLength,
  );
  if (!versionResult.ok) {
    return versionResult;
  }

  return modelContractSuccess(
    Object.freeze({ name: nameResult.value, version: versionResult.value }),
  );
};

const parseIdentifierList = <Identifier extends string>(
  values: unknown,
  field: string,
  parser: (value: string) => ModelContractResult<Identifier>,
): ModelContractResult<readonly Identifier[]> => {
  if (!Array.isArray(values)) {
    return modelContractFailure(field, 'unsupported');
  }

  if (values.length === 0) {
    return modelContractFailure(field, 'empty');
  }

  const parsed: Identifier[] = [];
  for (const value of values as unknown[]) {
    if (typeof value !== 'string') {
      return modelContractFailure(field, 'unsupported');
    }

    const result = parser(value);
    if (!result.ok) {
      return modelContractFailure(field, result.error.reason);
    }
    parsed.push(result.value);
  }

  return modelContractSuccess(Object.freeze(parsed));
};

const validatePositiveInteger = (value: number, field: string): ModelContractResult<number> => {
  if (!Number.isFinite(value)) {
    return modelContractFailure(field, 'not_finite');
  }

  if (!Number.isInteger(value)) {
    return modelContractFailure(field, 'not_integer');
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    return modelContractFailure(field, 'out_of_range');
  }

  return modelContractSuccess(value);
};

const validateNonNegativeInteger = (value: number, field: string): ModelContractResult<number> => {
  if (!Number.isFinite(value)) {
    return modelContractFailure(field, 'not_finite');
  }

  if (!Number.isInteger(value)) {
    return modelContractFailure(field, 'not_integer');
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    return modelContractFailure(field, 'out_of_range');
  }

  return modelContractSuccess(value);
};

export const createModelPolicy = (
  input: CreateModelPolicyInput,
): ModelContractResult<ModelPolicy> => {
  const providerIdsResult = parseIdentifierList(
    input.allowedProviderIds,
    'policy.allowedProviderIds',
    parseProviderId,
  );
  if (!providerIdsResult.ok) {
    return providerIdsResult;
  }

  const modelIdsResult = parseIdentifierList(
    input.allowedModelIds,
    'policy.allowedModelIds',
    parseModelId,
  );
  if (!modelIdsResult.ok) {
    return modelIdsResult;
  }

  const maximumOutputTokensResult = validatePositiveInteger(
    input.maximumOutputTokens,
    'policy.maximumOutputTokens',
  );
  if (!maximumOutputTokensResult.ok) {
    return maximumOutputTokensResult;
  }

  if (!modelQualityTiers.includes(input.qualityTier)) {
    return modelContractFailure('policy.qualityTier', 'unsupported');
  }

  if (typeof input.fallbackAllowed !== 'boolean') {
    return modelContractFailure('policy.fallbackAllowed', 'unsupported');
  }

  return modelContractSuccess(
    Object.freeze({
      allowedProviderIds: providerIdsResult.value,
      allowedModelIds: modelIdsResult.value,
      qualityTier: input.qualityTier,
      fallbackAllowed: input.fallbackAllowed,
      maximumOutputTokens: maximumOutputTokensResult.value,
    }),
  );
};

interface JsonCloneContext {
  readonly seen: WeakSet<object>;
  readonly field: string;
}

const cloneJsonValue = (
  value: unknown,
  context: JsonCloneContext,
): ModelContractResult<JsonValue> => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return modelContractSuccess(value);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? modelContractSuccess(value)
      : modelContractFailure(context.field, 'invalid_json');
  }

  if (typeof value !== 'object') {
    return modelContractFailure(context.field, 'invalid_json');
  }

  if (context.seen.has(value)) {
    return modelContractFailure(context.field, 'invalid_json');
  }
  context.seen.add(value);

  if (Array.isArray(value)) {
    const copy: JsonValue[] = [];
    for (const entry of value) {
      const entryResult = cloneJsonValue(entry, context);
      if (!entryResult.ok) {
        return entryResult;
      }
      copy.push(entryResult.value);
    }
    context.seen.delete(value);
    return modelContractSuccess(Object.freeze(copy));
  }

  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    return modelContractFailure(context.field, 'invalid_json');
  }

  const copy: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      return modelContractFailure(context.field, 'invalid_json');
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
      return modelContractFailure(context.field, 'invalid_json');
    }

    const entryResult = cloneJsonValue(descriptor.value, context);
    if (!entryResult.ok) {
      return entryResult;
    }
    copy[key] = entryResult.value;
  }

  context.seen.delete(value);
  return modelContractSuccess(Object.freeze(copy));
};

export const copyJsonValue = (value: unknown, field: string): ModelContractResult<JsonValue> =>
  cloneJsonValue(value, { seen: new WeakSet(), field });

export const createOutputSchemaDescriptor = (
  input: Readonly<{
    name: string;
    version: string;
    schema: JsonObject;
    strict: boolean;
  }>,
): ModelContractResult<OutputSchemaDescriptor> => {
  const nameResult = parseBoundedString<string>(
    input.name,
    'outputSchema.name',
    maximumTaskPartLength,
  );
  if (!nameResult.ok) {
    return nameResult;
  }

  const versionResult = parseBoundedString<string>(
    input.version,
    'outputSchema.version',
    maximumTaskPartLength,
  );
  if (!versionResult.ok) {
    return versionResult;
  }

  const schemaResult = copyJsonValue(input.schema, 'outputSchema.schema');
  if (!schemaResult.ok) {
    return schemaResult;
  }

  if (Array.isArray(schemaResult.value) || schemaResult.value === null) {
    return modelContractFailure('outputSchema.schema', 'invalid_json');
  }

  if (typeof schemaResult.value !== 'object') {
    return modelContractFailure('outputSchema.schema', 'invalid_json');
  }

  if (typeof input.strict !== 'boolean') {
    return modelContractFailure('outputSchema.strict', 'unsupported');
  }

  return modelContractSuccess(
    Object.freeze({
      name: nameResult.value,
      version: versionResult.value,
      schema: schemaResult.value as JsonObject,
      strict: input.strict,
    }),
  );
};

export const createModelRequestMetadata = (
  input: ModelRequestMetadata,
): ModelContractResult<ModelRequestMetadata> => {
  const fields = [
    ['applicationRequestId', input.applicationRequestId],
    ['correlationId', input.correlationId],
    ['tenantId', input.tenantId],
    ['promptVersion', input.promptVersion],
    ['operationName', input.operationName],
  ] as const;

  for (const [field, value] of fields) {
    const result = parseBoundedString<string>(
      value,
      `metadata.${field}`,
      maximumMetadataValueLength,
    );
    if (!result.ok) {
      return result;
    }
  }

  return modelContractSuccess(Object.freeze({ ...input }));
};

const copyMessages = (messages: unknown): ModelContractResult<readonly ModelMessage[]> => {
  if (!Array.isArray(messages)) {
    return modelContractFailure('messages', 'unsupported');
  }

  if (messages.length === 0) {
    return modelContractFailure('messages', 'empty');
  }

  const copy: ModelMessage[] = [];
  for (const entry of messages as unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return modelContractFailure('messages', 'unsupported');
    }

    const message = entry as Readonly<{ role?: unknown; content?: unknown }>;
    if (!modelMessageRoles.includes(message.role as ModelMessageRole)) {
      return modelContractFailure('messages.role', 'unsupported');
    }

    const contentResult = parseBoundedString<string>(
      message.content,
      'messages.content',
      maximumMessageLength,
    );
    if (!contentResult.ok) {
      return contentResult;
    }

    copy.push(
      Object.freeze({ role: message.role as ModelMessageRole, content: contentResult.value }),
    );
  }

  return modelContractSuccess(Object.freeze(copy));
};

export const createStructuredModelRequest = <TOutput extends JsonValue>(
  input: CreateStructuredModelRequestInput<TOutput>,
): ModelContractResult<StructuredModelRequest<TOutput>> => {
  const taskResult = createModelTask(input.task);
  if (!taskResult.ok) {
    return taskResult;
  }

  const policyResult = createModelPolicy(input.policy);
  if (!policyResult.ok) {
    return policyResult;
  }

  const messagesResult = copyMessages(input.messages);
  if (!messagesResult.ok) {
    return messagesResult;
  }

  const schemaResult = createOutputSchemaDescriptor(input.outputSchema);
  if (!schemaResult.ok) {
    return schemaResult;
  }

  const timeoutResult = validatePositiveInteger(input.timeoutMilliseconds, 'timeoutMilliseconds');
  if (!timeoutResult.ok) {
    return timeoutResult;
  }

  const metadataResult = createModelRequestMetadata(input.metadata);
  if (!metadataResult.ok) {
    return metadataResult;
  }

  return modelContractSuccess(
    Object.freeze({
      task: taskResult.value,
      policy: policyResult.value,
      messages: messagesResult.value,
      outputSchema: schemaResult.value,
      timeoutMilliseconds: timeoutResult.value,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      metadata: metadataResult.value,
    }),
  );
};

export const createModelUsage = (input: CreateModelUsageInput): ModelContractResult<ModelUsage> => {
  const requiredCounts = [
    ['usage.inputTokens', input.inputTokens],
    ['usage.outputTokens', input.outputTokens],
    ['usage.totalTokens', input.totalTokens],
  ] as const;

  for (const [field, value] of requiredCounts) {
    const result = validateNonNegativeInteger(value, field);
    if (!result.ok) {
      return result;
    }
  }

  if (input.totalTokens !== input.inputTokens + input.outputTokens) {
    return modelContractFailure('usage.totalTokens', 'inconsistent');
  }

  if (input.cachedInputTokens !== undefined) {
    const result = validateNonNegativeInteger(input.cachedInputTokens, 'usage.cachedInputTokens');
    if (!result.ok) {
      return result;
    }
    if (input.cachedInputTokens > input.inputTokens) {
      return modelContractFailure('usage.cachedInputTokens', 'inconsistent');
    }
  }

  if (input.reasoningTokens !== undefined) {
    const result = validateNonNegativeInteger(input.reasoningTokens, 'usage.reasoningTokens');
    if (!result.ok) {
      return result;
    }
    if (input.reasoningTokens > input.outputTokens) {
      return modelContractFailure('usage.reasoningTokens', 'inconsistent');
    }
  }

  return modelContractSuccess(
    Object.freeze({
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.totalTokens,
      ...(input.cachedInputTokens === undefined
        ? {}
        : { cachedInputTokens: input.cachedInputTokens }),
      ...(input.reasoningTokens === undefined ? {} : { reasoningTokens: input.reasoningTokens }),
    }),
  );
};

const parseResultIdentity = (
  input: Readonly<{ providerId: string; modelId: string; providerRequestId?: string }>,
): ModelContractResult<
  Readonly<{
    providerId: ProviderId;
    modelId: ModelId;
    providerRequestId?: ProviderRequestId;
  }>
> => {
  const providerIdResult = parseProviderId(input.providerId);
  if (!providerIdResult.ok) {
    return providerIdResult;
  }

  const modelIdResult = parseModelId(input.modelId);
  if (!modelIdResult.ok) {
    return modelIdResult;
  }

  if (input.providerRequestId === undefined) {
    return modelContractSuccess(
      Object.freeze({ providerId: providerIdResult.value, modelId: modelIdResult.value }),
    );
  }

  const providerRequestIdResult = parseProviderRequestId(input.providerRequestId);
  if (!providerRequestIdResult.ok) {
    return providerRequestIdResult;
  }

  return modelContractSuccess(
    Object.freeze({
      providerId: providerIdResult.value,
      modelId: modelIdResult.value,
      providerRequestId: providerRequestIdResult.value,
    }),
  );
};

export const createModelSuccess = <TOutput extends JsonValue>(
  input: CreateModelSuccessInput<TOutput>,
): ModelContractResult<ModelSuccess<TOutput>> => {
  const identityResult = parseResultIdentity(input);
  if (!identityResult.ok) {
    return identityResult;
  }

  const outputResult = copyJsonValue(input.output, 'success.output');
  if (!outputResult.ok) {
    return outputResult;
  }

  const usageResult = createModelUsage(input.usage);
  if (!usageResult.ok) {
    return usageResult;
  }

  const latencyResult = validateNonNegativeInteger(
    input.latencyMilliseconds,
    'success.latencyMilliseconds',
  );
  if (!latencyResult.ok) {
    return latencyResult;
  }

  if (!modelCompletionStates.includes(input.completionState)) {
    return modelContractFailure('success.completionState', 'unsupported');
  }

  return modelContractSuccess(
    Object.freeze({
      status: 'success',
      output: outputResult.value as TOutput,
      providerId: identityResult.value.providerId,
      modelId: identityResult.value.modelId,
      ...('providerRequestId' in identityResult.value
        ? { providerRequestId: identityResult.value.providerRequestId }
        : {}),
      usage: usageResult.value,
      completionState: input.completionState,
      latencyMilliseconds: latencyResult.value,
    }),
  );
};

export const createModelRefusal = (
  input: CreateModelRefusalInput,
): ModelContractResult<ModelRefusal> => {
  const identityResult = parseResultIdentity(input);
  if (!identityResult.ok) {
    return identityResult;
  }

  if (!modelRefusalCategories.includes(input.category)) {
    return modelContractFailure('refusal.category', 'unsupported');
  }

  if (!modelCompletionStates.includes(input.completionState)) {
    return modelContractFailure('refusal.completionState', 'unsupported');
  }

  const usageResult = input.usage === undefined ? undefined : createModelUsage(input.usage);
  if (usageResult !== undefined && !usageResult.ok) {
    return usageResult;
  }

  return modelContractSuccess(
    Object.freeze({
      status: 'refusal',
      refusal: Object.freeze({ category: input.category }),
      providerId: identityResult.value.providerId,
      modelId: identityResult.value.modelId,
      ...('providerRequestId' in identityResult.value
        ? { providerRequestId: identityResult.value.providerRequestId }
        : {}),
      ...(usageResult === undefined ? {} : { usage: usageResult.value }),
      completionState: input.completionState,
    }),
  );
};
