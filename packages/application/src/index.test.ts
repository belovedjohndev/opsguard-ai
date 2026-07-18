import { describe, expect, it } from 'vitest';

import * as workspace from './index.js';

describe('@opsguard/application foundation', () => {
  it('exposes the explicit application boundary', () => {
    expect(workspace).toMatchObject({
      CreateRequest: expect.any(Function),
    });
  });
});
