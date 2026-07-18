import { parseBrandedUuid, type Brand, type InvalidIdentifierError } from '../shared/brand.js';
import type { Result } from '../shared/result.js';

export type TenantMembershipId = Brand<string, 'TenantMembershipId'>;

export const parseTenantMembershipId = (
  value: string,
): Result<TenantMembershipId, InvalidIdentifierError<'TenantMembershipId'>> =>
  parseBrandedUuid(value, 'TenantMembershipId');
