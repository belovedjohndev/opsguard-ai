import { describe, expect, it } from 'vitest';

import { resolveApiRuntimeConfig } from './index.js';

describe('resolveApiRuntimeConfig', () => {
  it('uses loopback-safe development defaults', () => {
    expect(resolveApiRuntimeConfig({})).toEqual({
      assessmentTimeoutMilliseconds: 30_000,
      corsAllowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      host: '127.0.0.1',
      port: 3000,
    });
  });

  it('accepts an explicit host and port', () => {
    expect(
      resolveApiRuntimeConfig({
        API_HOST: '0.0.0.0',
        API_PORT: '8080',
      }),
    ).toEqual({
      assessmentTimeoutMilliseconds: 30_000,
      corsAllowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
      host: '0.0.0.0',
      port: 8080,
    });
  });

  it.each(['not-a-port', '1.5'])('rejects a non-integer API_PORT value: %s', (port) => {
    expect(() => resolveApiRuntimeConfig({ API_PORT: port })).toThrow('must be an integer');
  });

  it.each(['0', '65536'])('rejects an out-of-range API_PORT value: %s', (port) => {
    expect(() => resolveApiRuntimeConfig({ API_PORT: port })).toThrow(
      'must be between 1 and 65535',
    );
  });
});
