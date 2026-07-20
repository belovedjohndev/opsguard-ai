import type { ModelCompletionState, ModelUsage } from '@opsguard/ai-core';
import type {
  Request,
  RequestAssessmentRoute,
  RequestAssessmentV1,
  RequestId,
  RequestTransition,
  Result,
  TenantId,
  TenantMembershipId,
} from '@opsguard/domain';

export type AssessmentRepositoryError =
  | Readonly<{ code: 'NOT_FOUND' }>
  | Readonly<{ code: 'STALE_STATE' }>
  | Readonly<{ code: 'CONFLICT' }>
  | Readonly<{ code: 'UNAVAILABLE' }>
  | Readonly<{ code: 'UNEXPECTED' }>;

export type AssessmentRequestContext = Readonly<{ request: Request }>;

export type AssessmentModelConfiguration = Readonly<{
  configurationKey: string;
  provider: string;
  model: string;
}>;

export type InitializeAssessmentRun = Readonly<{
  tenantId: TenantId;
  requestId: RequestId;
  actorMembershipId: TenantMembershipId | null;
  transition: RequestTransition;
  prompt: Readonly<{ key: string; version: number; contentSha256: string }>;
  modelConfiguration: AssessmentModelConfiguration;
}>;

export type InitializedAssessmentRun = Readonly<{ aiRunId: string }>;

export type AssessmentCompletion = Readonly<{
  providerRequestId?: string;
  usage?: ModelUsage;
  completionState?: ModelCompletionState;
  latencyMilliseconds?: number;
}>;

export type FinalizeAssessmentRun = Readonly<{
  tenantId: TenantId;
  requestId: RequestId;
  aiRunId: string;
  actorMembershipId: TenantMembershipId | null;
  transition: RequestTransition;
  outcome:
    | Readonly<{
        status: 'succeeded';
        assessment: RequestAssessmentV1;
        effectiveRoute: RequestAssessmentRoute;
        requiresReview: boolean;
        completion: AssessmentCompletion;
      }>
    | Readonly<{
        status: 'failed' | 'cancelled';
        failureCode: string;
        completion: AssessmentCompletion;
      }>;
}>;

export interface RequestAssessmentRepository {
  loadRequestContext(
    input: Readonly<{ tenantId: TenantId; requestId: RequestId }>,
  ): Promise<Result<AssessmentRequestContext | null, AssessmentRepositoryError>>;
  initializeAssessmentRun(
    input: InitializeAssessmentRun,
  ): Promise<Result<InitializedAssessmentRun, AssessmentRepositoryError>>;
  finalizeAssessmentRun(
    input: FinalizeAssessmentRun,
  ): Promise<Result<void, AssessmentRepositoryError>>;
}
