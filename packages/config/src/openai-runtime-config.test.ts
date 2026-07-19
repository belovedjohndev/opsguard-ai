import { describe, expect, it } from 'vitest';

import {
  resolveOpenAIIntegrationTestEnabled,
  resolveOpenAIRuntimeConfig,
} from './openai-runtime-config.js';

describe('resolveOpenAIRuntimeConfig', () => {
  it('resolves explicit credentials and trims stable string values', () => {
    const config = resolveOpenAIRuntimeConfig({
      OPENAI_API_KEY: '  test-key  ',
      OPENAI_MODEL: '  configured-model  ',
      RUN_OPENAI_INTEGRATION_TESTS: 'true',
    });

    expect(config).toEqual({
      apiKey: 'test-key',
      modelId: 'configured-model',
      runIntegrationTests: true,
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it.each([
    [{ OPENAI_MODEL: 'model' }, 'OPENAI_API_KEY'],
    [{ OPENAI_API_KEY: 'key' }, 'OPENAI_MODEL'],
    [{ OPENAI_API_KEY: '   ', OPENAI_MODEL: 'model' }, 'OPENAI_API_KEY'],
    [{ OPENAI_API_KEY: 'key', OPENAI_MODEL: '   ' }, 'OPENAI_MODEL'],
  ])('requires explicit enabled configuration without revealing values', (environment, name) => {
    expect(() => resolveOpenAIRuntimeConfig(environment)).toThrow(`${name} is required`);
  });

  it('rejects an oversized model ID', () => {
    expect(() =>
      resolveOpenAIRuntimeConfig({
        OPENAI_API_KEY: 'test-key',
        OPENAI_MODEL: 'x'.repeat(256),
      }),
    ).toThrow('OPENAI_MODEL must not exceed 255 characters');
  });

  it('does not include the API key in any validation error', () => {
    const apiKey = 'secret-value-that-must-not-appear';

    try {
      resolveOpenAIRuntimeConfig({
        OPENAI_API_KEY: apiKey,
        OPENAI_MODEL: 'model',
        RUN_OPENAI_INTEGRATION_TESTS: 'TRUE',
      });
      throw new Error('Expected configuration validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain(apiKey);
    }
  });
});

describe('resolveOpenAIIntegrationTestEnabled', () => {
  it.each([
    [undefined, false],
    ['false', false],
    ['true', true],
  ])('maps %s deterministically', (value, expected) => {
    expect(resolveOpenAIIntegrationTestEnabled({ RUN_OPENAI_INTEGRATION_TESTS: value })).toBe(
      expected,
    );
  });

  it.each(['', 'TRUE', 'False', '1', 'yes', ' true '])(
    'rejects a non-explicit boolean value: %s',
    (value) => {
      expect(() =>
        resolveOpenAIIntegrationTestEnabled({ RUN_OPENAI_INTEGRATION_TESTS: value }),
      ).toThrow('must be true or false');
    },
  );
});
