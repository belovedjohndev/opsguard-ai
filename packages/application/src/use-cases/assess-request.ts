import {
  createModelPolicy,
  createModelRequestMetadata,
  createModelTask,
  createOutputSchemaDescriptor,
  createStructuredModelRequest,
  type ModelGateway,
  type ModelGatewayResult,
  type JsonValue,
} from '@opsguard/ai-core';
import {
  determineRequestAssessmentReview,
  failure,
  parseRequestAssessmentV1,
  parseRequestId,
  parseTenantId,
  parseTenantMembershipId,
  success,
  type RequestAssessmentV1,
  type Result,
} from '@opsguard/domain';

import {
  createRequestAssessmentUserMessage,
  requestAssessmentOutputSchema,
  requestAssessmentPromptKey,
  requestAssessmentPromptSha256,
  requestAssessmentPromptVersion,
  requestAssessmentSystemPrompt,
} from '../request-assessment-prompt.js';
import type {
  AssessmentCompletion,
  AssessmentModelConfiguration,
  FinalizeAssessmentRun,
  RequestAssessmentRepository,
} from '../ports/request-assessment-repository.js';

const maximumRequestTextLength = 20_000;
const maximumCorrelationIdLength = 255;

export type AssessRequestCommand = Readonly<{
  tenantId: string;
  requestId: string;
  actorMembershipId: string | null;
  correlationId: string;
  requestText: string;
  signal?: AbortSignal;
}>;

export type AssessRequestError =
  | Readonly<{ code: 'INVALID_ASSESS_REQUEST_INPUT'; field: string }>
  | Readonly<{ code: 'REQUEST_NOT_FOUND' }>
  | Readonly<{ code: 'REQUEST_STATE_CONFLICT' }>
  | Readonly<{ code: 'ASSESSMENT_PERSISTENCE_UNAVAILABLE' }>
  | Readonly<{ code: 'ASSESSMENT_CONFIGURATION_CONFLICT' }>
  | Readonly<{ code: 'UNEXPECTED_ASSESSMENT_FAILURE' }>;

export type AssessRequestOutput = Readonly<{
  requestId: string;
  status: 'pending_review';
  aiRunStatus: 'succeeded' | 'failed' | 'cancelled';
  effectiveRoute?: string;
  requiresReview?: boolean;
  failureCode?: string;
}>;

export type AssessRequestDependencies = Readonly<{
  requestAssessmentRepository: RequestAssessmentRepository;
  modelGateway: ModelGateway;
  modelConfiguration: AssessmentModelConfiguration;
  clock: () => Date;
  timeoutMilliseconds: number;
}>;

const mapRepositoryError = (error: { code: string }): AssessRequestError => {
  switch (error.code) {
    case 'NOT_FOUND':
      return { code: 'REQUEST_NOT_FOUND' };
    case 'STALE_STATE':
      return { code: 'REQUEST_STATE_CONFLICT' };
    case 'CONFLICT':
      return { code: 'ASSESSMENT_CONFIGURATION_CONFLICT' };
    case 'UNAVAILABLE':
      return { code: 'ASSESSMENT_PERSISTENCE_UNAVAILABLE' };
    default:
      return { code: 'UNEXPECTED_ASSESSMENT_FAILURE' };
  }
};

const safeCompletion = (result: ModelGatewayResult<JsonValue>): AssessmentCompletion => {
  switch (result.status) {
    case 'success':
      return Object.freeze({
        ...(result.providerRequestId === undefined
          ? {}
          : { providerRequestId: result.providerRequestId }),
        usage: result.usage,
        completionState: result.completionState,
        latencyMilliseconds: result.latencyMilliseconds,
      });
    case 'refusal':
      return Object.freeze({
        ...(result.providerRequestId === undefined
          ? {}
          : { providerRequestId: result.providerRequestId }),
        ...(result.usage === undefined ? {} : { usage: result.usage }),
        completionState: result.completionState,
      });
    case 'error':
      return Object.freeze(
        result.error.providerRequestId === undefined
          ? {}
          : { providerRequestId: result.error.providerRequestId },
      );
  }
};

export class AssessRequest {
  readonly #repository: RequestAssessmentRepository;
  readonly #modelGateway: ModelGateway;
  readonly #modelConfiguration: AssessmentModelConfiguration;
  readonly #clock: () => Date;
  readonly #timeoutMilliseconds: number;

  constructor(dependencies: AssessRequestDependencies) {
    this.#repository = dependencies.requestAssessmentRepository;
    this.#modelGateway = dependencies.modelGateway;
    this.#modelConfiguration = dependencies.modelConfiguration;
    this.#clock = dependencies.clock;
    this.#timeoutMilliseconds = dependencies.timeoutMilliseconds;
    Object.freeze(this);
  }

  async execute(
    command: AssessRequestCommand,
  ): Promise<Result<AssessRequestOutput, AssessRequestError>> {
    const tenantId = parseTenantId(command.tenantId);
    const requestId = parseRequestId(command.requestId);
    const actorMembershipId =
      command.actorMembershipId === null
        ? success(null)
        : parseTenantMembershipId(command.actorMembershipId);
    if (!tenantId.ok) return failure({ code: 'INVALID_ASSESS_REQUEST_INPUT', field: 'tenantId' });
    if (!requestId.ok) return failure({ code: 'INVALID_ASSESS_REQUEST_INPUT', field: 'requestId' });
    if (!actorMembershipId.ok)
      return failure({ code: 'INVALID_ASSESS_REQUEST_INPUT', field: 'actorMembershipId' });
    if (
      command.requestText.trim().length === 0 ||
      command.requestText.length > maximumRequestTextLength
    )
      return failure({ code: 'INVALID_ASSESS_REQUEST_INPUT', field: 'requestText' });
    if (
      command.correlationId.trim().length === 0 ||
      command.correlationId.length > maximumCorrelationIdLength
    )
      return failure({ code: 'INVALID_ASSESS_REQUEST_INPUT', field: 'correlationId' });

    const context = await this.#repository.loadRequestContext({
      tenantId: tenantId.value,
      requestId: requestId.value,
    });
    if (!context.ok) return failure(mapRepositoryError(context.error));
    if (context.value === null) return failure({ code: 'REQUEST_NOT_FOUND' });
    if (context.value.request.status !== 'received')
      return failure({ code: 'REQUEST_STATE_CONFLICT' });
    const startedAt = this.#clock();
    const startTransition = context.value.request.transition({
      nextStatus: 'assessing',
      changedAt: startedAt,
      changedByMembershipId: actorMembershipId.value,
    });
    if (!startTransition.ok) return failure({ code: 'REQUEST_STATE_CONFLICT' });
    const initialized = await this.#repository.initializeAssessmentRun({
      tenantId: tenantId.value,
      requestId: requestId.value,
      actorMembershipId: actorMembershipId.value,
      transition: startTransition.value.transition,
      prompt: {
        key: requestAssessmentPromptKey,
        version: requestAssessmentPromptVersion,
        contentSha256: requestAssessmentPromptSha256,
      },
      modelConfiguration: this.#modelConfiguration,
    });
    if (!initialized.ok) return failure(mapRepositoryError(initialized.error));

    const task = createModelTask({ name: 'request.assessment', version: '1' });
    const policy = createModelPolicy({
      allowedProviderIds: [this.#modelConfiguration.provider],
      allowedModelIds: [this.#modelConfiguration.model],
      qualityTier: 'balanced',
      fallbackAllowed: false,
      maximumOutputTokens: 1_000,
    });
    const outputSchema = createOutputSchemaDescriptor({
      name: 'request_assessment_v1',
      version: '1',
      schema: requestAssessmentOutputSchema,
      strict: true,
    });
    const metadata = createModelRequestMetadata({
      applicationRequestId: requestId.value,
      correlationId: command.correlationId,
      tenantId: tenantId.value,
      promptVersion: String(requestAssessmentPromptVersion),
      operationName: 'request.assessment',
    });
    if (!task.ok || !policy.ok || !outputSchema.ok || !metadata.ok)
      return failure({ code: 'UNEXPECTED_ASSESSMENT_FAILURE' });
    const modelRequest = createStructuredModelRequest<RequestAssessmentV1>({
      task: task.value,
      policy: policy.value,
      messages: [
        { role: 'system', content: requestAssessmentSystemPrompt },
        { role: 'user', content: createRequestAssessmentUserMessage(command.requestText) },
      ],
      outputSchema: outputSchema.value,
      timeoutMilliseconds: this.#timeoutMilliseconds,
      ...(command.signal === undefined ? {} : { signal: command.signal }),
      metadata: metadata.value,
    });
    if (!modelRequest.ok) return failure({ code: 'UNEXPECTED_ASSESSMENT_FAILURE' });

    let result: ModelGatewayResult<RequestAssessmentV1>;
    try {
      result = await this.#modelGateway.generateStructured(modelRequest.value);
    } catch {
      result = {
        status: 'error',
        error: { code: 'UNEXPECTED', message: 'gateway failure', retryable: false },
      };
    }
    const completedAt = this.#clock();
    const endTransition = startTransition.value.request.transition({
      nextStatus: 'pending_review',
      changedAt: completedAt,
      changedByMembershipId: actorMembershipId.value,
    });
    if (!endTransition.ok) return failure({ code: 'UNEXPECTED_ASSESSMENT_FAILURE' });
    const completion = safeCompletion(result);
    let outcome: FinalizeAssessmentRun['outcome'];
    let output: AssessRequestOutput;
    if (result.status === 'success') {
      const assessment = parseRequestAssessmentV1(result.output, command.requestText.length);
      if (assessment.ok) {
        const review = determineRequestAssessmentReview(assessment.value);
        outcome = {
          status: 'succeeded',
          assessment: assessment.value,
          effectiveRoute: review.effectiveRoute,
          requiresReview: review.requiresReview,
          completion,
        };
        output = {
          requestId: requestId.value,
          status: 'pending_review',
          aiRunStatus: 'succeeded',
          effectiveRoute: review.effectiveRoute,
          requiresReview: review.requiresReview,
        };
      } else {
        outcome = { status: 'failed', failureCode: 'invalid_assessment', completion };
        output = {
          requestId: requestId.value,
          status: 'pending_review',
          aiRunStatus: 'failed',
          failureCode: 'invalid_assessment',
        };
      }
    } else if (result.status === 'refusal') {
      outcome = { status: 'failed', failureCode: `refusal_${result.refusal.category}`, completion };
      output = {
        requestId: requestId.value,
        status: 'pending_review',
        aiRunStatus: 'failed',
        failureCode: `refusal_${result.refusal.category}`,
      };
    } else {
      const cancelled = result.error.code === 'CANCELLED';
      outcome = {
        status: cancelled ? 'cancelled' : 'failed',
        failureCode: cancelled ? 'cancelled' : `gateway_${result.error.code.toLowerCase()}`,
        completion,
      };
      output = {
        requestId: requestId.value,
        status: 'pending_review',
        aiRunStatus: cancelled ? 'cancelled' : 'failed',
        failureCode: cancelled ? 'cancelled' : `gateway_${result.error.code.toLowerCase()}`,
      };
    }
    const finalized = await this.#repository.finalizeAssessmentRun({
      tenantId: tenantId.value,
      requestId: requestId.value,
      aiRunId: initialized.value.aiRunId,
      actorMembershipId: actorMembershipId.value,
      transition: endTransition.value.transition,
      outcome,
    });
    return finalized.ok
      ? success(Object.freeze(output))
      : failure(mapRepositoryError(finalized.error));
  }
}
