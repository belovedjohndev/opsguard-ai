import { parseBrandedUuid, type Brand, type InvalidIdentifierError } from '../shared/brand.js';
import type { Result } from '../shared/result.js';

export type UserId = Brand<string, 'UserId'>;

export const parseUserId = (value: string): Result<UserId, InvalidIdentifierError<'UserId'>> =>
  parseBrandedUuid(value, 'UserId');
