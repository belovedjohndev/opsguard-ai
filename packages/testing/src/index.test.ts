import { describe, expect, it } from 'vitest';

import * as workspace from './index.js';

describe('@opsguard/testing foundation', () => {
  it('loads without shared test abstractions', () => {
    expect(Object.keys(workspace)).toHaveLength(0);
  });
});
