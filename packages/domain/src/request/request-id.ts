import { parseBrandedUuid, type Brand, type InvalidIdentifierError } from '../shared/brand.js';
import type { Result } from '../shared/result.js';

export type RequestId = Brand<string, 'RequestId'>;

export const parseRequestId = (
  value: string,
): Result<RequestId, InvalidIdentifierError<'RequestId'>> => parseBrandedUuid(value, 'RequestId');
