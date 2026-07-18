import type {
  InitialRequestStatus,
  Request,
  RequestId,
  RequestSourceType,
  Result,
  TenantId,
  TenantMembershipId,
} from '@opsguard/domain';

export type RequestCreationAuditEvent = Readonly<{
  tenantId: TenantId;
  actorMembershipId: TenantMembershipId;
  eventType: 'request.created';
  entityType: 'request';
  entityId: RequestId;
  occurredAt: Date;
  metadata: Readonly<{
    status: 'received';
    sourceType: RequestSourceType;
  }>;
}>;

export type CreateRequestPersistence = Readonly<{
  request: Request;
  initialStatus: InitialRequestStatus;
  auditEvent: RequestCreationAuditEvent;
}>;

export type RequestRepositoryError =
  | Readonly<{ code: 'CONFLICT' }>
  | Readonly<{ code: 'UNAVAILABLE' }>
  | Readonly<{ code: 'UNEXPECTED' }>;

export interface RequestRepository {
  /**
   * Persists the request, initial status-history row, and creation audit event in one transaction.
   * Implementations must commit all three records or none of them.
   */
  createRequest(input: CreateRequestPersistence): Promise<Result<void, RequestRepositoryError>>;
}
