import { createHash } from 'node:crypto';

import {
  createModelGatewayError,
  createModelGatewayFailure,
  createModelRefusal,
  createModelSuccess,
  FakeModelGateway,
} from '@opsguard/ai-core';
import {
  parseRequestId,
  parseTenantId,
  parseTenantMembershipId,
  Request,
  success,
  type Result,
} from '@opsguard/domain';
import { describe, expect, it } from 'vitest';

import {
  requestAssessmentPromptSha256,
  requestAssessmentPromptVersion,
  requestAssessmentSystemPrompt,
} from '../request-assessment-prompt.js';
import type {
  AssessmentRequestContext,
  FinalizeAssessmentRun,
  InitializeAssessmentRun,
  RequestAssessmentRepository,
} from '../ports/request-assessment-repository.js';
import { AssessRequest } from './assess-request.js';

const tenantId = '018f47d2-68df-7a8b-9c01-23456789abcd';
const requestId = '018f47d2-68df-7a8b-9c01-23456789abcf';
const membershipId = '018f47d2-68df-7a8b-9c01-23456789abce';
const now = new Date('2026-07-20T09:00:00.000Z');

const parsedTenantId = parseTenantId(tenantId);
const parsedRequestId = parseRequestId(requestId);
const parsedMembershipId = parseTenantMembershipId(membershipId);
if (!parsedTenantId.ok || !parsedRequestId.ok || !parsedMembershipId.ok) {
  throw new Error('Assessment test identifiers must be valid.');
}

const requestResult = Request.create({
  id: parsedRequestId.value,
  tenantId: parsedTenantId.value,
  sourceType: 'form',
  sourceReference: 'assessment-test',
  createdByMembershipId: parsedMembershipId.value,
  createdAt: now,
});
const assessmentRequest = (() => {
  if (!requestResult.ok) throw new Error('Assessment test request must be valid.');
  return requestResult.value.request;
})();

class InMemoryAssessmentRepository implements RequestAssessmentRepository {
  readonly initializeCalls: InitializeAssessmentRun[] = [];
  readonly finalizeCalls: FinalizeAssessmentRun[] = [];

  async loadRequestContext(): Promise<Result<AssessmentRequestContext | null, never>> {
    return success({ request: assessmentRequest });
  }

  async initializeAssessmentRun(input: InitializeAssessmentRun) {
    this.initializeCalls.push(input);
    return success({ aiRunId: '018f47d2-68df-7a8b-9c01-23456789abd0' });
  }

  async finalizeAssessmentRun(input: FinalizeAssessmentRun) {
    this.finalizeCalls.push(input);
    return success(undefined);
  }
}

const assessmentOutput = {
  schemaVersion: 'request-assessment-v1',
  intent: 'new_service_request',
  confidence: 0.9,
  customer: { name: null, email: null, phone: null, accountReference: null },
  serviceRequest: {
    summary: 'Repair a leaking pipe.',
    requestedService: 'Plumbing repair',
    requestedTiming: null,
    location: null,
  },
  urgencyIndicators: [],
  missingInformation: [],
  proposedRoute: 'operations',
  evidenceReferences: [{ field: 'serviceRequest.summary', start: 0, end: 6 }],
};

const createUseCase = (
  gateway: FakeModelGateway,
  repository = new InMemoryAssessmentRepository(),
) =>
  Object.freeze({
    repository,
    useCase: new AssessRequest({
      requestAssessmentRepository: repository,
      modelGateway: gateway,
      modelConfiguration: {
        configurationKey: 'assessment.default',
        provider: 'synthetic-provider',
        model: 'synthetic-model',
      },
      clock: () => now,
      timeoutMilliseconds: 10_000,
    }),
  });

const command = {
  tenantId,
  requestId,
  actorMembershipId: membershipId,
  correlationId: 'assessment-test-correlation',
  requestText: 'Please repair a leaking pipe.',
};

describe('AssessRequest', () => {
  it('uses the exact versioned prompt hash', () => {
    expect(requestAssessmentPromptVersion).toBe(2);
    expect(createHash('sha256').update(requestAssessmentSystemPrompt, 'utf8').digest('hex')).toBe(
      requestAssessmentPromptSha256,
    );
  });

  it('initializes before one provider-neutral call, then persists a review-safe success', async () => {
    const modelSuccess = createModelSuccess({
      output: assessmentOutput,
      providerId: 'synthetic-provider',
      modelId: 'synthetic-model',
      usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
      completionState: 'completed',
      latencyMilliseconds: 15,
    });
    if (!modelSuccess.ok) throw new Error('Model success fixture must be valid.');
    const gateway = new FakeModelGateway([modelSuccess.value]);
    const { repository, useCase } = createUseCase(gateway);

    const result = await useCase.execute(command);

    expect(result).toEqual({
      ok: true,
      value: {
        requestId,
        status: 'pending_review',
        aiRunStatus: 'succeeded',
        effectiveRoute: 'operations',
        requiresReview: false,
      },
    });
    expect(repository.initializeCalls).toHaveLength(1);
    expect(repository.finalizeCalls).toHaveLength(1);
    expect(gateway.requests).toHaveLength(1);
    expect(gateway.requests[0]?.task).toEqual({ name: 'request.assessment', version: '1' });
    expect(gateway.requests[0]?.outputSchema).toMatchObject({
      name: 'request_assessment_v1',
      version: '1',
      strict: true,
    });
    expect(gateway.requests[0]?.messages[1]?.content).toContain('BEGIN_UNTRUSTED_REQUEST_TEXT');
    expect(gateway.requests[0]?.messages[1]?.content).toContain('END_UNTRUSTED_REQUEST_TEXT');
    expect(repository.finalizeCalls[0]?.outcome).toMatchObject({
      status: 'succeeded',
      effectiveRoute: 'operations',
      requiresReview: false,
    });
  });

  it('fails invalid model structure into pending review without persisting raw output', async () => {
    const modelSuccess = createModelSuccess({
      output: { ...assessmentOutput, proposedRoute: 'invented' },
      providerId: 'synthetic-provider',
      modelId: 'synthetic-model',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      completionState: 'completed',
      latencyMilliseconds: 1,
    });
    if (!modelSuccess.ok) throw new Error('Model success fixture must be valid.');
    const { repository, useCase } = createUseCase(new FakeModelGateway([modelSuccess.value]));

    expect(await useCase.execute(command)).toEqual({
      ok: true,
      value: {
        requestId,
        status: 'pending_review',
        aiRunStatus: 'failed',
        failureCode: 'invalid_assessment',
      },
    });
    expect(repository.finalizeCalls[0]?.outcome).toEqual(
      expect.objectContaining({ status: 'failed', failureCode: 'invalid_assessment' }),
    );
  });

  it('records a cancellation as a cancelled AI run with a recoverable request state', async () => {
    const gatewayError = createModelGatewayError({
      code: 'CANCELLED',
      message: 'cancelled by caller',
    });
    if (!gatewayError.ok) throw new Error('Gateway error fixture must be valid.');
    const { repository, useCase } = createUseCase(
      new FakeModelGateway([createModelGatewayFailure(gatewayError.value)]),
    );

    expect(await useCase.execute(command)).toEqual({
      ok: true,
      value: {
        requestId,
        status: 'pending_review',
        aiRunStatus: 'cancelled',
        failureCode: 'cancelled',
      },
    });
    expect(repository.finalizeCalls[0]?.outcome).toEqual(
      expect.objectContaining({ status: 'cancelled', failureCode: 'cancelled' }),
    );
  });

  it('does not call the gateway when request text is invalid', async () => {
    const refusal = createModelRefusal({
      category: 'other',
      providerId: 'synthetic-provider',
      modelId: 'synthetic-model',
      completionState: 'completed',
    });
    if (!refusal.ok) throw new Error('Refusal fixture must be valid.');
    const gateway = new FakeModelGateway([refusal.value]);
    const { repository, useCase } = createUseCase(gateway);

    expect(await useCase.execute({ ...command, requestText: ' ' })).toEqual({
      ok: false,
      error: { code: 'INVALID_ASSESS_REQUEST_INPUT', field: 'requestText' },
    });
    expect(repository.initializeCalls).toHaveLength(0);
    expect(gateway.requests).toHaveLength(0);
  });
});
