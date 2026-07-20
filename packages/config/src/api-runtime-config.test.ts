import { describe, expect, it } from 'vitest';

import { resolveApiRuntimeConfig } from './api-runtime-config.js';

describe('resolveApiRuntimeConfig', () => {
  it('uses loopback API and Vite development defaults', () => {
    expect(resolveApiRuntimeConfig({})).toEqual({
      assessmentTimeoutMilliseconds: 30_000,
      corsAllowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      host: '127.0.0.1',
      port: 3000,
    });
  });

  it('resolves an explicit deployment allowlist and timeout', () => {
    expect(
      resolveApiRuntimeConfig({
        API_CORS_ALLOWED_ORIGINS: 'https://demo.example.test, https://preview.example.test',
        ASSESSMENT_TIMEOUT_MS: '45000',
      }),
    ).toMatchObject({
      assessmentTimeoutMilliseconds: 45_000,
      corsAllowedOrigins: ['https://demo.example.test', 'https://preview.example.test'],
    });
  });

  it.each([
    ['*', 'explicit origins'],
    ['https://demo.example.test/path', 'invalid origin'],
    ['javascript:alert(1)', 'invalid origin'],
  ])('rejects unsafe CORS configuration %s', (value, message) => {
    expect(() => resolveApiRuntimeConfig({ API_CORS_ALLOWED_ORIGINS: value })).toThrow(message);
  });

  it.each(['999', '120001', '1.5', 'not-a-number'])(
    'rejects an invalid assessment timeout: %s',
    (value) => {
      expect(() => resolveApiRuntimeConfig({ ASSESSMENT_TIMEOUT_MS: value })).toThrow(
        'ASSESSMENT_TIMEOUT_MS',
      );
    },
  );
});
