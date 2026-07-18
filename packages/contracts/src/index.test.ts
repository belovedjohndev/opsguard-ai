import { describe, expect, it } from 'vitest';

import * as workspace from './index.js';

describe('@opsguard/contracts foundation', () => {
  it('loads without transport or domain contracts', () => {
    expect(Object.keys(workspace)).toHaveLength(0);
  });
});
