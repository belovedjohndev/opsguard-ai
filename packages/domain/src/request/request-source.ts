import { failure, success, type Result } from '../shared/result.js';
import type { InvalidRequestDataError } from './request-errors.js';

export const requestSourceTypes = ['form', 'email', 'webhook', 'service_account'] as const;

export type RequestSourceType = (typeof requestSourceTypes)[number];

const requestSourceTypeSet: ReadonlySet<string> = new Set(requestSourceTypes);

export const parseRequestSourceType = (
  value: string,
): Result<RequestSourceType, InvalidRequestDataError> =>
  requestSourceTypeSet.has(value)
    ? success(value as RequestSourceType)
    : failure({ code: 'INVALID_REQUEST_DATA', field: 'sourceType', reason: 'unsupported' });
