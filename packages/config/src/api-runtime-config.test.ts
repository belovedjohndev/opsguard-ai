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

  it('uses the platform PORT when API_PORT is absent', () => {
    expect(resolveApiRuntimeConfig({ PORT: '10000' }).port).toBe(10_000);
  });

  it('gives an explicitly configured API_PORT precedence over PORT', () => {
    expect(resolveApiRuntimeConfig({ API_PORT: '8080', PORT: '10000' }).port).toBe(8_080);
  });

  it('rejects API_PORT instead of falling back to a valid platform PORT', () => {
    expect(() => resolveApiRuntimeConfig({ API_PORT: 'invalid', PORT: '10000' })).toThrow(
      'API_PORT must be an integer',
    );
  });

  it.each(['0', '65536', '1.5', '1e3', 'not-a-number'])(
    'rejects an invalid platform PORT: %s',
    (value) => {
      expect(() => resolveApiRuntimeConfig({ PORT: value })).toThrow('PORT');
    },
  );

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
