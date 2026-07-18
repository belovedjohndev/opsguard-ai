import { describe, expect, it } from 'vitest';

import * as workspace from './index.js';

describe('@opsguard/database foundation', () => {
  it('loads without persistence behavior', () => {
    expect(Object.keys(workspace)).toHaveLength(0);
  });
});
