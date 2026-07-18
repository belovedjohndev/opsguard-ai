import { describe, expect, expectTypeOf, it } from 'vitest';

import { parseRequestId, type RequestId } from '../request/request-id.js';
import { parseTenantMembershipId } from '../tenant/membership-id.js';
import { parseTenantId, type TenantId } from '../tenant/tenant-id.js';
import { parseUserId, type UserId } from '../tenant/user-id.js';

const validUuid = '018f47d2-68df-7a8b-9c01-23456789abcd';

describe('branded UUID identifiers', () => {
  it.each([
    ['TenantId', parseTenantId],
    ['TenantMembershipId', parseTenantMembershipId],
    ['RequestId', parseRequestId],
    ['UserId', parseUserId],
  ] as const)('accepts a valid %s', (_identifier, parse) => {
    expect(parse(validUuid)).toEqual({ ok: true, value: validUuid });
  });

  it.each([
    ['malformed', 'not-a-uuid', 'malformed'],
    ['empty string', '', 'empty'],
    ['zero UUID', '00000000-0000-0000-0000-000000000000', 'empty'],
  ] as const)('rejects a %s', (_caseName, value, reason) => {
    expect(parseRequestId(value)).toEqual({
      ok: false,
      error: {
        code: 'INVALID_IDENTIFIER',
        identifier: 'RequestId',
        reason,
      },
    });
  });

  it('keeps identifier brands nominally distinct', () => {
    expectTypeOf<TenantId>().not.toEqualTypeOf<RequestId>();
    expectTypeOf<UserId>().not.toEqualTypeOf<TenantId>();
  });
});
