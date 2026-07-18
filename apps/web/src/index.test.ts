import { describe, expect, it } from 'vitest';

import * as workspace from './index.js';

describe('@opsguard/web foundation', () => {
  it('loads without application behavior', () => {
    expect(Object.keys(workspace)).toHaveLength(0);
  });
});
