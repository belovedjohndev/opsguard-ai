import type { InitialRequestStatus, Request, Result } from '@opsguard/domain';

export type CreateRequestPersistence = Readonly<{
  request: Request;
  initialStatus: InitialRequestStatus;
}>;

export type RequestRepositoryError =
  | Readonly<{ code: 'CONFLICT' }>
  | Readonly<{ code: 'UNAVAILABLE' }>
  | Readonly<{ code: 'UNEXPECTED' }>;

export interface RequestRepository {
  /**
   * Persists the request and its initial status-history row in one transaction.
   * Implementations must commit both records or neither record.
   */
  createRequest(input: CreateRequestPersistence): Promise<Result<void, RequestRepositoryError>>;
}
