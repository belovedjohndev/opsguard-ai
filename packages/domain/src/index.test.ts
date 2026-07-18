import { describe, expect, it } from 'vitest';

import * as workspace from './index.js';

describe('@opsguard/domain foundation', () => {
  it('exposes the explicit domain boundary', () => {
    expect(workspace).toMatchObject({
      failure: expect.any(Function),
      parseRequestId: expect.any(Function),
      parseTenantId: expect.any(Function),
      parseTenantMembershipId: expect.any(Function),
      success: expect.any(Function),
    });
  });
});
