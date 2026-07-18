import { describe, expect, it } from 'vitest';

import * as workspace from './index.js';

describe('@opsguard/observability foundation', () => {
  it('loads without telemetry behavior', () => {
    expect(Object.keys(workspace)).toHaveLength(0);
  });
});
