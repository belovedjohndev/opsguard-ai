import { describe, expect, it } from 'vitest';

import { failure, success, type Result } from './result.js';

describe('Result', () => {
  it('narrows successful values through the ok discriminator', () => {
    const readResult = (result: Result<number, string>): number | string => {
      if (result.ok) {
        return result.value;
      }

      return result.error;
    };

    expect(readResult(success(42))).toBe(42);
  });

  it('narrows expected failures through the ok discriminator', () => {
    const readResult = (result: Result<number, string>): number | string => {
      if (!result.ok) {
        return result.error;
      }

      return result.value;
    };

    expect(readResult(failure('not-available'))).toBe('not-available');
  });
});
