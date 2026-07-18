import { describe, expect, it } from 'vitest';

import * as workspace from './index.js';

describe('@opsguard/domain foundation', () => {
  it('loads without domain behavior', () => {
    expect(Object.keys(workspace)).toHaveLength(0);
  });
});
