import { describe, expect, it } from 'vitest';

import * as workspace from './index.js';

describe('@opsguard/ai-core foundation', () => {
  it('loads without model-provider behavior', () => {
    expect(Object.keys(workspace)).toHaveLength(0);
  });
});
