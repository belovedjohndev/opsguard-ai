export type OpenAIRuntimeConfig = Readonly<{
  apiKey: string;
  modelId: string;
  runIntegrationTests: boolean;
}>;

const maximumModelIdLength = 255;

const requireSecret = (
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
): string => {
  const value = environment[name]?.trim();

  if (value === undefined || value.length === 0) {
    throw new Error(`OpenAI configuration error: ${name} is required.`);
  }

  return value;
};

export const resolveOpenAIIntegrationTestEnabled = (
  environment: Readonly<Record<string, string | undefined>>,
): boolean => {
  const value = environment['RUN_OPENAI_INTEGRATION_TESTS'];

  if (value === undefined) {
    return false;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error(
    'OpenAI configuration error: RUN_OPENAI_INTEGRATION_TESTS must be true or false.',
  );
};

export const resolveOpenAIRuntimeConfig = (
  environment: Readonly<Record<string, string | undefined>>,
): OpenAIRuntimeConfig => {
  const apiKey = requireSecret(environment, 'OPENAI_API_KEY');
  const modelId = requireSecret(environment, 'OPENAI_MODEL');

  if (modelId.length > maximumModelIdLength) {
    throw new Error('OpenAI configuration error: OPENAI_MODEL must not exceed 255 characters.');
  }

  return Object.freeze({
    apiKey,
    modelId,
    runIntegrationTests: resolveOpenAIIntegrationTestEnabled(environment),
  });
};
