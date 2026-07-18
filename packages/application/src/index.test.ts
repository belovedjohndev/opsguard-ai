import { describe, expect, it } from 'vitest';

import * as workspace from './index.js';

describe('@opsguard/application foundation', () => {
  it('loads without use-case behavior', () => {
    expect(Object.keys(workspace)).toHaveLength(0);
  });
});
