import { failure, success, type Result } from '../shared/result.js';
import type { TenantMembershipId } from '../tenant/membership-id.js';
import type { TenantId } from '../tenant/tenant-id.js';
import type { RequestId } from './request-id.js';
import type { RequestTransitionError } from './request-errors.js';
import {
  isAllowedRequestTransition,
  isTerminalRequestStatus,
  type RequestStatus,
} from './request-status.js';

export type InitialRequestStatus = Readonly<{
  kind: 'initial';
  tenantId: TenantId;
  requestId: RequestId;
  previousStatus: null;
  nextStatus: 'received';
  changedAt: Date;
  changedByMembershipId: TenantMembershipId | null;
}>;

export type RequestTransition = Readonly<{
  kind: 'transition';
  tenantId: TenantId;
  requestId: RequestId;
  previousStatus: RequestStatus;
  nextStatus: RequestStatus;
  changedAt: Date;
  changedByMembershipId: TenantMembershipId | null;
}>;

export type CreateRequestTransitionInput = Readonly<{
  tenantId: TenantId;
  requestId: RequestId;
  currentStatus: RequestStatus;
  attemptedStatus: RequestStatus;
  currentUpdatedAt: Date;
  changedAt: Date;
  changedByMembershipId: TenantMembershipId | null;
}>;

export const createInitialRequestStatus = (input: {
  readonly tenantId: TenantId;
  readonly requestId: RequestId;
  readonly changedAt: Date;
  readonly changedByMembershipId: TenantMembershipId | null;
}): InitialRequestStatus =>
  Object.freeze({
    kind: 'initial',
    tenantId: input.tenantId,
    requestId: input.requestId,
    previousStatus: null,
    nextStatus: 'received',
    changedAt: new Date(input.changedAt.getTime()),
    changedByMembershipId: input.changedByMembershipId,
  });

export const createRequestTransition = (
  input: CreateRequestTransitionInput,
): Result<RequestTransition, RequestTransitionError> => {
  const changedAtMilliseconds = input.changedAt.getTime();

  if (!Number.isFinite(changedAtMilliseconds)) {
    return failure({
      code: 'INVALID_REQUEST_DATA',
      field: 'changedAt',
      reason: 'invalid_timestamp',
    });
  }

  if (changedAtMilliseconds < input.currentUpdatedAt.getTime()) {
    return failure({
      code: 'INVALID_REQUEST_DATA',
      field: 'changedAt',
      reason: 'timestamp_before_current',
    });
  }

  if (input.currentStatus === input.attemptedStatus) {
    return failure({
      code: 'INVALID_REQUEST_TRANSITION',
      currentStatus: input.currentStatus,
      attemptedStatus: input.attemptedStatus,
      reason: 'self_transition',
    });
  }

  if (isTerminalRequestStatus(input.currentStatus)) {
    return failure({
      code: 'TERMINAL_REQUEST_TRANSITION',
      currentStatus: input.currentStatus,
      attemptedStatus: input.attemptedStatus,
    });
  }

  if (!isAllowedRequestTransition(input.currentStatus, input.attemptedStatus)) {
    return failure({
      code: 'INVALID_REQUEST_TRANSITION',
      currentStatus: input.currentStatus,
      attemptedStatus: input.attemptedStatus,
      reason: 'not_allowed',
    });
  }

  return success(
    Object.freeze({
      kind: 'transition',
      tenantId: input.tenantId,
      requestId: input.requestId,
      previousStatus: input.currentStatus,
      nextStatus: input.attemptedStatus,
      changedAt: new Date(changedAtMilliseconds),
      changedByMembershipId: input.changedByMembershipId,
    }),
  );
};
