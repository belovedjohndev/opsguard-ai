import { and, eq, type InferSelectModel } from 'drizzle-orm';

import type {
  AssessmentRepositoryError,
  FinalizeAssessmentRun,
  InitializeAssessmentRun,
  RequestAssessmentRepository,
} from '@opsguard/application';
import { failure, Request, success } from '@opsguard/domain';

import type { OpsGuardDatabase } from './client.js';
import { mapRequestRepositoryError } from './postgres-errors.js';
import {
  aiRuns,
  auditEvents,
  modelConfigurations,
  promptVersions,
  requestAssessments,
  requests,
  requestStatusHistory,
} from './schema/index.js';

class AssessmentConfigurationConflictError extends Error {}

const mapError = (error: unknown): AssessmentRepositoryError => {
  if (error instanceof AssessmentConfigurationConflictError) return { code: 'CONFLICT' };
  const mapped = mapRequestRepositoryError(error);
  return mapped.code === 'UNAVAILABLE' ? mapped : { code: 'UNEXPECTED' };
};

const requestAssessmentAuditMetadata = (input: FinalizeAssessmentRun): Record<string, unknown> => {
  if (input.outcome.status !== 'succeeded') {
    return { failureCode: input.outcome.failureCode };
  }
  return {
    schemaVersion: input.outcome.assessment.schemaVersion,
    intent: input.outcome.assessment.intent,
    proposedRoute: input.outcome.assessment.proposedRoute,
    effectiveRoute: input.outcome.effectiveRoute,
    requiresReview: input.outcome.requiresReview,
  };
};

type StoredRequest = InferSelectModel<typeof requests>;

const toReceivedRequest = (row: StoredRequest) =>
  Request.create({
    id: row.id as import('@opsguard/domain').RequestId,
    tenantId: row.tenantId as import('@opsguard/domain').TenantId,
    sourceType: row.sourceType,
    sourceReference: row.sourceReference,
    createdByMembershipId: row.createdByMembershipId as
      import('@opsguard/domain').TenantMembershipId | null,
    createdAt: row.updatedAt,
  });

export class DrizzleRequestAssessmentRepository implements RequestAssessmentRepository {
  readonly #database: OpsGuardDatabase;

  constructor(database: OpsGuardDatabase) {
    this.#database = database;
  }

  async loadRequestContext(
    input: Parameters<RequestAssessmentRepository['loadRequestContext']>[0],
  ): ReturnType<RequestAssessmentRepository['loadRequestContext']> {
    try {
      const row = await this.#database.query.requests.findFirst({
        where: and(eq(requests.tenantId, input.tenantId), eq(requests.id, input.requestId)),
      });
      if (row === undefined) return success(null);
      if (row.status !== 'received') return failure({ code: 'STALE_STATE' });
      const request = toReceivedRequest(row);
      return request.ok
        ? success({ request: request.value.request })
        : failure({ code: 'UNEXPECTED' });
    } catch (error) {
      return failure(mapError(error));
    }
  }

  async initializeAssessmentRun(
    input: InitializeAssessmentRun,
  ): ReturnType<RequestAssessmentRepository['initializeAssessmentRun']> {
    try {
      const result = await this.#database.transaction(async (transaction) => {
        const transitioned = await transaction
          .update(requests)
          .set({ status: 'assessing', updatedAt: input.transition.changedAt })
          .where(
            and(
              eq(requests.tenantId, input.tenantId),
              eq(requests.id, input.requestId),
              eq(requests.status, 'received'),
            ),
          )
          .returning({ id: requests.id });
        if (transitioned.length !== 1) throw new AssessmentConfigurationConflictError();
        await transaction.insert(requestStatusHistory).values({
          tenantId: input.transition.tenantId,
          requestId: input.transition.requestId,
          isInitial: false,
          previousStatus: input.transition.previousStatus,
          nextStatus: input.transition.nextStatus,
          changedByMembershipId: input.transition.changedByMembershipId,
          changedAt: input.transition.changedAt,
        });
        await transaction
          .insert(promptVersions)
          .values({
            tenantId: input.tenantId,
            promptKey: input.prompt.key,
            version: input.prompt.version,
            contentSha256: input.prompt.contentSha256,
          })
          .onConflictDoNothing();
        const prompt = await transaction.query.promptVersions.findFirst({
          where: and(
            eq(promptVersions.tenantId, input.tenantId),
            eq(promptVersions.promptKey, input.prompt.key),
            eq(promptVersions.version, input.prompt.version),
          ),
        });
        if (prompt === undefined || prompt.contentSha256 !== input.prompt.contentSha256) {
          throw new AssessmentConfigurationConflictError();
        }
        await transaction
          .insert(modelConfigurations)
          .values({
            tenantId: input.tenantId,
            configurationKey: input.modelConfiguration.configurationKey,
            provider: input.modelConfiguration.provider,
            model: input.modelConfiguration.model,
          })
          .onConflictDoNothing();
        const modelConfiguration = await transaction.query.modelConfigurations.findFirst({
          where: and(
            eq(modelConfigurations.tenantId, input.tenantId),
            eq(modelConfigurations.configurationKey, input.modelConfiguration.configurationKey),
          ),
        });
        if (
          modelConfiguration === undefined ||
          modelConfiguration.provider !== input.modelConfiguration.provider ||
          modelConfiguration.model !== input.modelConfiguration.model
        ) {
          throw new AssessmentConfigurationConflictError();
        }
        const aiRun = await transaction
          .insert(aiRuns)
          .values({
            tenantId: input.tenantId,
            requestId: input.requestId,
            promptVersionId: prompt.id,
            modelConfigurationId: modelConfiguration.id,
            status: 'running',
            createdAt: input.transition.changedAt,
            startedAt: input.transition.changedAt,
          })
          .returning({ id: aiRuns.id });
        const aiRunId = aiRun[0]?.id;
        if (aiRunId === undefined) throw new AssessmentConfigurationConflictError();
        await transaction.insert(auditEvents).values({
          tenantId: input.tenantId,
          actorMembershipId: input.actorMembershipId,
          eventType: 'request.assessment_started',
          entityType: 'request',
          entityId: input.requestId,
          occurredAt: input.transition.changedAt,
          metadata: {
            schemaVersion: 'request-assessment-v1',
            promptVersion: input.prompt.version,
            modelConfigurationId: modelConfiguration.id,
          },
        });
        return { aiRunId };
      });
      return success(Object.freeze(result));
    } catch (error) {
      return failure(mapError(error));
    }
  }

  async finalizeAssessmentRun(
    input: FinalizeAssessmentRun,
  ): ReturnType<RequestAssessmentRepository['finalizeAssessmentRun']> {
    try {
      await this.#database.transaction(async (transaction) => {
        const runUpdate =
          input.outcome.status === 'succeeded'
            ? {
                status: 'succeeded' as const,
                completedAt: input.transition.changedAt,
                providerRequestId: input.outcome.completion.providerRequestId ?? null,
                inputTokens: input.outcome.completion.usage?.inputTokens ?? null,
                outputTokens: input.outcome.completion.usage?.outputTokens ?? null,
                latencyMs: input.outcome.completion.latencyMilliseconds ?? null,
                errorClassification: null,
              }
            : {
                status: input.outcome.status,
                completedAt: input.transition.changedAt,
                providerRequestId: input.outcome.completion.providerRequestId ?? null,
                inputTokens: input.outcome.completion.usage?.inputTokens ?? null,
                outputTokens: input.outcome.completion.usage?.outputTokens ?? null,
                latencyMs: input.outcome.completion.latencyMilliseconds ?? null,
                errorClassification: input.outcome.failureCode,
              };
        const updatedRun = await transaction
          .update(aiRuns)
          .set(runUpdate)
          .where(
            and(
              eq(aiRuns.tenantId, input.tenantId),
              eq(aiRuns.id, input.aiRunId),
              eq(aiRuns.status, 'running'),
            ),
          )
          .returning({ id: aiRuns.id });
        if (updatedRun.length !== 1) throw new AssessmentConfigurationConflictError();
        if (input.outcome.status === 'succeeded') {
          const assessment = input.outcome.assessment;
          await transaction.insert(requestAssessments).values({
            tenantId: input.tenantId,
            requestId: input.requestId,
            aiRunId: input.aiRunId,
            schemaVersion: assessment.schemaVersion,
            intent: assessment.intent,
            confidenceBasisPoints: Math.round(assessment.confidence * 10_000),
            proposedRoute: assessment.proposedRoute,
            effectiveRoute: input.outcome.effectiveRoute,
            requiresReview: input.outcome.requiresReview,
            customer: assessment.customer,
            serviceRequest: assessment.serviceRequest,
            urgencyIndicators: assessment.urgencyIndicators,
            missingInformation: assessment.missingInformation,
            evidenceReferences: assessment.evidenceReferences,
            createdAt: input.transition.changedAt,
          });
        }
        const transitioned = await transaction
          .update(requests)
          .set({
            status: 'pending_review',
            updatedAt: input.transition.changedAt,
          })
          .where(
            and(
              eq(requests.tenantId, input.tenantId),
              eq(requests.id, input.requestId),
              eq(requests.status, 'assessing'),
            ),
          )
          .returning({ id: requests.id });
        if (transitioned.length !== 1) throw new AssessmentConfigurationConflictError();
        await transaction.insert(requestStatusHistory).values({
          tenantId: input.transition.tenantId,
          requestId: input.transition.requestId,
          isInitial: false,
          previousStatus: input.transition.previousStatus,
          nextStatus: input.transition.nextStatus,
          changedByMembershipId: input.transition.changedByMembershipId,
          changedAt: input.transition.changedAt,
        });
        const eventType =
          input.outcome.status === 'succeeded'
            ? input.outcome.requiresReview
              ? 'request.assessment_review_required'
              : 'request.assessment_completed'
            : input.outcome.status === 'cancelled'
              ? 'request.assessment_cancelled'
              : 'request.assessment_failed';
        await transaction.insert(auditEvents).values({
          tenantId: input.tenantId,
          actorMembershipId: input.actorMembershipId,
          eventType,
          entityType: 'request',
          entityId: input.requestId,
          occurredAt: input.transition.changedAt,
          metadata: requestAssessmentAuditMetadata(input),
        });
      });
      return success(undefined);
    } catch (error) {
      return failure(mapError(error));
    }
  }
}
