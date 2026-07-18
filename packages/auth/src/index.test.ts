import { describe, expect, it } from 'vitest';

import * as workspace from './index.js';

describe('@opsguard/auth foundation', () => {
  it('loads without authorization behavior', () => {
    expect(Object.keys(workspace)).toHaveLength(0);
  });
});
