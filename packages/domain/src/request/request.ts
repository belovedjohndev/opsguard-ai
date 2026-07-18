import { failure, success, type Result } from '../shared/result.js';
import type { TenantMembershipId } from '../tenant/membership-id.js';
import type { TenantId } from '../tenant/tenant-id.js';
import type { RequestId } from './request-id.js';
import type { InvalidRequestDataError, RequestTransitionError } from './request-errors.js';
import { parseRequestSourceType, type RequestSourceType } from './request-source.js';
import type { RequestStatus } from './request-status.js';
import {
  createInitialRequestStatus,
  createRequestTransition,
  type InitialRequestStatus,
  type RequestTransition,
} from './request-transition.js';

const maximumSourceReferenceLength = 255;

export type CreateRequestInput = Readonly<{
  id: RequestId;
  tenantId: TenantId;
  sourceType: string;
  sourceReference: string;
  createdByMembershipId: TenantMembershipId | null;
  createdAt: Date;
}>;

export type RequestSnapshot = Readonly<{
  id: RequestId;
  tenantId: TenantId;
  sourceType: RequestSourceType;
  sourceReference: string;
  createdByMembershipId: TenantMembershipId | null;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
}>;

export type RequestCreation = Readonly<{
  request: Request;
  initialStatus: InitialRequestStatus;
}>;

export type TransitionRequestInput = Readonly<{
  nextStatus: RequestStatus;
  changedAt: Date;
  changedByMembershipId: TenantMembershipId | null;
}>;

export type RequestTransitionResult = Readonly<{
  request: Request;
  transition: RequestTransition;
}>;

export class Request {
  readonly #id: RequestId;
  readonly #tenantId: TenantId;
  readonly #sourceType: RequestSourceType;
  readonly #sourceReference: string;
  readonly #createdByMembershipId: TenantMembershipId | null;
  readonly #status: RequestStatus;
  readonly #createdAtMilliseconds: number;
  readonly #updatedAtMilliseconds: number;

  private constructor(snapshot: RequestSnapshot) {
    this.#id = snapshot.id;
    this.#tenantId = snapshot.tenantId;
    this.#sourceType = snapshot.sourceType;
    this.#sourceReference = snapshot.sourceReference;
    this.#createdByMembershipId = snapshot.createdByMembershipId;
    this.#status = snapshot.status;
    this.#createdAtMilliseconds = snapshot.createdAt.getTime();
    this.#updatedAtMilliseconds = snapshot.updatedAt.getTime();
    Object.freeze(this);
  }

  static create(input: CreateRequestInput): Result<RequestCreation, InvalidRequestDataError> {
    const sourceTypeResult = parseRequestSourceType(input.sourceType);

    if (!sourceTypeResult.ok) {
      return sourceTypeResult;
    }

    if (input.sourceReference.trim().length === 0) {
      return failure({
        code: 'INVALID_REQUEST_DATA',
        field: 'sourceReference',
        reason: 'required',
      });
    }

    if (input.sourceReference.length > maximumSourceReferenceLength) {
      return failure({
        code: 'INVALID_REQUEST_DATA',
        field: 'sourceReference',
        reason: 'too_long',
      });
    }

    const createdAtMilliseconds = input.createdAt.getTime();

    if (!Number.isFinite(createdAtMilliseconds)) {
      return failure({
        code: 'INVALID_REQUEST_DATA',
        field: 'createdAt',
        reason: 'invalid_timestamp',
      });
    }

    const createdAt = new Date(createdAtMilliseconds);
    const request = new Request({
      id: input.id,
      tenantId: input.tenantId,
      sourceType: sourceTypeResult.value,
      sourceReference: input.sourceReference,
      createdByMembershipId: input.createdByMembershipId,
      status: 'received',
      createdAt,
      updatedAt: createdAt,
    });

    return success(
      Object.freeze({
        request,
        initialStatus: createInitialRequestStatus({
          tenantId: input.tenantId,
          requestId: input.id,
          changedAt: createdAt,
          changedByMembershipId: input.createdByMembershipId,
        }),
      }),
    );
  }

  get id(): RequestId {
    return this.#id;
  }

  get tenantId(): TenantId {
    return this.#tenantId;
  }

  get status(): RequestStatus {
    return this.#status;
  }

  get createdAt(): Date {
    return new Date(this.#createdAtMilliseconds);
  }

  get updatedAt(): Date {
    return new Date(this.#updatedAtMilliseconds);
  }

  transition(
    input: TransitionRequestInput,
  ): Result<RequestTransitionResult, RequestTransitionError> {
    const transitionResult = createRequestTransition({
      tenantId: this.#tenantId,
      requestId: this.#id,
      currentStatus: this.#status,
      attemptedStatus: input.nextStatus,
      currentUpdatedAt: new Date(this.#updatedAtMilliseconds),
      changedAt: input.changedAt,
      changedByMembershipId: input.changedByMembershipId,
    });

    if (!transitionResult.ok) {
      return transitionResult;
    }

    const nextRequest = new Request({
      id: this.#id,
      tenantId: this.#tenantId,
      sourceType: this.#sourceType,
      sourceReference: this.#sourceReference,
      createdByMembershipId: this.#createdByMembershipId,
      status: input.nextStatus,
      createdAt: new Date(this.#createdAtMilliseconds),
      updatedAt: transitionResult.value.changedAt,
    });

    return success(
      Object.freeze({
        request: nextRequest,
        transition: transitionResult.value,
      }),
    );
  }

  toSnapshot(): RequestSnapshot {
    return Object.freeze({
      id: this.#id,
      tenantId: this.#tenantId,
      sourceType: this.#sourceType,
      sourceReference: this.#sourceReference,
      createdByMembershipId: this.#createdByMembershipId,
      status: this.#status,
      createdAt: new Date(this.#createdAtMilliseconds),
      updatedAt: new Date(this.#updatedAtMilliseconds),
    });
  }
}
