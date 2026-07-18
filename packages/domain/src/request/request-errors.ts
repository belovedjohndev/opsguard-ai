import type { RequestStatus } from './request-status.js';

export type RequestDataField = 'changedAt' | 'createdAt' | 'sourceReference' | 'sourceType';

export type InvalidRequestDataError = Readonly<{
  code: 'INVALID_REQUEST_DATA';
  field: RequestDataField;
  reason:
    'invalid_timestamp' | 'required' | 'timestamp_before_current' | 'too_long' | 'unsupported';
}>;

export type InvalidRequestTransitionError = Readonly<{
  code: 'INVALID_REQUEST_TRANSITION';
  currentStatus: RequestStatus;
  attemptedStatus: RequestStatus;
  reason: 'not_allowed' | 'self_transition';
}>;

export type TerminalRequestTransitionError = Readonly<{
  code: 'TERMINAL_REQUEST_TRANSITION';
  currentStatus: RequestStatus;
  attemptedStatus: RequestStatus;
}>;

export type RequestTransitionError =
  InvalidRequestDataError | InvalidRequestTransitionError | TerminalRequestTransitionError;
