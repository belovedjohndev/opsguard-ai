import { parseBrandedUuid, type Brand, type InvalidIdentifierError } from '../shared/brand.js';
import type { Result } from '../shared/result.js';

export type TenantId = Brand<string, 'TenantId'>;

export const parseTenantId = (
  value: string,
): Result<TenantId, InvalidIdentifierError<'TenantId'>> => parseBrandedUuid(value, 'TenantId');
