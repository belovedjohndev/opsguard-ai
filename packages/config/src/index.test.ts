import { describe, expect, it } from 'vitest';

import * as workspace from './index.js';

describe('@opsguard/config foundation', () => {
  it('loads without runtime configuration', () => {
    expect(Object.keys(workspace)).toHaveLength(0);
  });
});
