import { parseTenantId, parseTenantMembershipId, parseUserId } from '@opsguard/domain';
import { describe, expect, it } from 'vitest';

import { canCreateRequest, createVerifiedTenantContext, membershipRoles } from './index.js';

const userId = parseUserId('018f47d2-68df-7a8b-9c01-23456789abca');
const tenantId = parseTenantId('018f47d2-68df-7a8b-9c01-23456789abcb');
const membershipId = parseTenantMembershipId('018f47d2-68df-7a8b-9c01-23456789abcc');

if (!userId.ok || !tenantId.ok || !membershipId.ok) {
  throw new Error('Auth test UUID fixtures must be valid');
}

describe('@opsguard/auth tenant context', () => {
  it.each(membershipRoles)('allows active %s membership to create a request', (role) => {
    const context = createVerifiedTenantContext({
      userId: userId.value,
      tenantId: tenantId.value,
      membershipId: membershipId.value,
      role,
      requestId: '9b697dc3-2fbf-435f-a511-b16316722ac4',
    });

    expect(canCreateRequest(context)).toBe(true);
    expect(Object.isFrozen(context)).toBe(true);
  });
});
