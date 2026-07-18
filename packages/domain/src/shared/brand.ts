import { failure, success, type Result } from './result.js';

declare const brand: unique symbol;

export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name;
};

export type IdentifierKind = 'RequestId' | 'TenantId' | 'TenantMembershipId';

export type InvalidIdentifierError<Kind extends IdentifierKind = IdentifierKind> = Readonly<{
  code: 'INVALID_IDENTIFIER';
  identifier: Kind;
  reason: 'empty' | 'malformed';
}>;

const canonicalUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const zeroUuid = '00000000-0000-0000-0000-000000000000';

export const parseBrandedUuid = <Kind extends IdentifierKind>(
  value: string,
  identifier: Kind,
): Result<Brand<string, Kind>, InvalidIdentifierError<Kind>> => {
  if (value.length === 0 || value.toLowerCase() === zeroUuid) {
    return failure({ code: 'INVALID_IDENTIFIER', identifier, reason: 'empty' });
  }

  if (!canonicalUuidPattern.test(value)) {
    return failure({ code: 'INVALID_IDENTIFIER', identifier, reason: 'malformed' });
  }

  return success(value.toLowerCase() as Brand<string, Kind>);
};
