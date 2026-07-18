import { describe, expect, it } from 'vitest';

import { parseTenantMembershipId } from '../tenant/membership-id.js';
import { parseTenantId } from '../tenant/tenant-id.js';
import { parseRequestId } from './request-id.js';
import { requestStatuses, type RequestStatus } from './request-status.js';
import { Request, type CreateRequestInput } from './request.js';

const tenantIdValue = '018f47d2-68df-7a8b-9c01-23456789abcd';
const membershipIdValue = '018f47d2-68df-7a8b-9c01-23456789abce';
const requestIdValue = '018f47d2-68df-7a8b-9c01-23456789abcf';
const createdAt = new Date('2026-07-18T09:00:00.000Z');

const tenantIdResult = parseTenantId(tenantIdValue);
const membershipIdResult = parseTenantMembershipId(membershipIdValue);
const requestIdResult = parseRequestId(requestIdValue);

if (!tenantIdResult.ok || !membershipIdResult.ok || !requestIdResult.ok) {
  throw new Error('Test UUID fixtures must be valid');
}

const validInput: CreateRequestInput = {
  id: requestIdResult.value,
  tenantId: tenantIdResult.value,
  sourceType: 'form',
  sourceReference: 'form-submission-42',
  createdByMembershipId: membershipIdResult.value,
  createdAt,
};

const createReceivedRequest = (): Request => {
  const result = Request.create(validInput);

  if (!result.ok) {
    throw new Error(`Expected valid request fixture, received ${result.error.code}`);
  }

  return result.value.request;
};

const pathsFromReceived: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  received: [],
  assessing: ['assessing'],
  needs_information: ['assessing', 'needs_information'],
  pending_review: ['assessing', 'pending_review'],
  rejected: ['assessing', 'rejected'],
  completed: ['assessing', 'completed'],
  failed: ['failed'],
};

const createRequestAtStatus = (status: RequestStatus): Request => {
  let request = createReceivedRequest();

  for (const [index, nextStatus] of pathsFromReceived[status].entries()) {
    const result = request.transition({
      nextStatus,
      changedAt: new Date(createdAt.getTime() + index + 1),
      changedByMembershipId: membershipIdResult.value,
    });

    if (!result.ok) {
      throw new Error(`Could not build ${status} request fixture: ${result.error.code}`);
    }

    request = result.value.request;
  }

  return request;
};

const allowedTransitionKeys = new Set([
  'received->assessing',
  'received->failed',
  'assessing->needs_information',
  'assessing->pending_review',
  'assessing->rejected',
  'assessing->completed',
  'assessing->failed',
  'needs_information->assessing',
  'needs_information->failed',
  'pending_review->assessing',
  'pending_review->needs_information',
  'pending_review->rejected',
  'pending_review->completed',
  'pending_review->failed',
]);

const statusPairs = requestStatuses.flatMap((currentStatus) =>
  requestStatuses.map((attemptedStatus) => ({
    currentStatus,
    attemptedStatus,
    allowed: allowedTransitionKeys.has(`${currentStatus}->${attemptedStatus}`),
  })),
);

describe('Request creation', () => {
  it('creates the documented initial aggregate and history state', () => {
    const result = Request.create(validInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.request.toSnapshot()).toEqual({
      id: requestIdValue,
      tenantId: tenantIdValue,
      sourceType: 'form',
      sourceReference: 'form-submission-42',
      createdByMembershipId: membershipIdValue,
      status: 'received',
      createdAt,
      updatedAt: createdAt,
    });
    expect(result.value.initialStatus).toEqual({
      kind: 'initial',
      tenantId: tenantIdValue,
      requestId: requestIdValue,
      previousStatus: null,
      nextStatus: 'received',
      changedAt: createdAt,
      changedByMembershipId: membershipIdValue,
    });
  });

  it.each([
    ['sourceType', { sourceType: 'chat' }, 'unsupported'],
    ['sourceReference', { sourceReference: '   ' }, 'required'],
    ['sourceReference', { sourceReference: 'x'.repeat(256) }, 'too_long'],
    ['createdAt', { createdAt: new Date(Number.NaN) }, 'invalid_timestamp'],
  ] as const)('rejects invalid %s data', (field, override, reason) => {
    const result = Request.create({ ...validInput, ...override });

    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_REQUEST_DATA', field, reason },
    });
  });

  it('does not expose a mutable status setter', () => {
    const request = createReceivedRequest();
    const statusDescriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(request) as object,
      'status',
    );

    expect(statusDescriptor?.set).toBeUndefined();
    expect(Object.isFrozen(request)).toBe(true);
  });
});

describe('Request transition matrix', () => {
  it.each(statusPairs)(
    '$currentStatus -> $attemptedStatus is allowed: $allowed',
    ({ currentStatus, attemptedStatus, allowed }) => {
      const request = createRequestAtStatus(currentStatus);
      const result = request.transition({
        nextStatus: attemptedStatus,
        changedAt: new Date(createdAt.getTime() + 100),
        changedByMembershipId: membershipIdResult.value,
      });

      expect(result.ok).toBe(allowed);
      expect(request.status).toBe(currentStatus);

      if (result.ok) {
        expect(result.value.request.status).toBe(attemptedStatus);
        expect(result.value.transition.previousStatus).toBe(currentStatus);
        expect(result.value.transition.nextStatus).toBe(attemptedStatus);
      }
    },
  );

  it.each(requestStatuses)('rejects the %s self-transition explicitly', (status) => {
    const request = createRequestAtStatus(status);
    const result = request.transition({
      nextStatus: status,
      changedAt: new Date(createdAt.getTime() + 100),
      changedByMembershipId: membershipIdResult.value,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INVALID_REQUEST_TRANSITION',
        currentStatus: status,
        attemptedStatus: status,
        reason: 'self_transition',
      },
    });
  });

  it.each(['rejected', 'completed', 'failed'] as const)(
    'rejects outgoing transitions from terminal status %s',
    (status) => {
      const request = createRequestAtStatus(status);
      const result = request.transition({
        nextStatus: 'assessing',
        changedAt: new Date(createdAt.getTime() + 100),
        changedByMembershipId: membershipIdResult.value,
      });

      expect(result).toEqual({
        ok: false,
        error: {
          code: 'TERMINAL_REQUEST_TRANSITION',
          currentStatus: status,
          attemptedStatus: 'assessing',
        },
      });
    },
  );

  it('preserves transition timestamp and actor metadata', () => {
    const request = createReceivedRequest();
    const changedAt = new Date('2026-07-18T09:01:00.000Z');
    const result = request.transition({
      nextStatus: 'assessing',
      changedAt,
      changedByMembershipId: membershipIdResult.value,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.transition).toEqual({
      kind: 'transition',
      tenantId: tenantIdValue,
      requestId: requestIdValue,
      previousStatus: 'received',
      nextStatus: 'assessing',
      changedAt,
      changedByMembershipId: membershipIdValue,
    });
  });

  it('does not mutate the aggregate when a transition fails', () => {
    const request = createReceivedRequest();
    const before = request.toSnapshot();
    const result = request.transition({
      nextStatus: 'completed',
      changedAt: new Date(createdAt.getTime() + 100),
      changedByMembershipId: membershipIdResult.value,
    });

    expect(result.ok).toBe(false);
    expect(request.toSnapshot()).toEqual(before);
  });

  it('rejects a transition timestamp before the current aggregate update', () => {
    const request = createRequestAtStatus('assessing');
    const result = request.transition({
      nextStatus: 'pending_review',
      changedAt: new Date(createdAt.getTime() - 1),
      changedByMembershipId: membershipIdResult.value,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INVALID_REQUEST_DATA',
        field: 'changedAt',
        reason: 'timestamp_before_current',
      },
    });
  });
});
