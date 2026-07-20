import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { FakeModelGateway, createModelSuccess, type ModelGatewayResult } from '@opsguard/ai-core';
import type { RequestAssessmentV1 as DomainRequestAssessmentV1 } from '@opsguard/domain';

import type { EvaluationPricing } from './request-assessment-cost.js';
import type { RequestAssessmentEvaluationCase } from './request-assessment-dataset.js';
import { evaluateRequestAssessmentDataset } from './request-assessment-evaluator.js';

const evaluationCase: RequestAssessmentEvaluationCase = Object.freeze({
  id: 'ra-v1-clear-lead-001',
  category: 'clear_lead',
  requestText:
    'Maria Santos at maria.santos@example.test needs installation at 42 Pine Street next Tuesday.',
  expected: Object.freeze({
    intent: 'new_service_request',
    requiredFields: Object.freeze([
      Object.freeze({ path: 'customer.name', value: 'Maria Santos' }),
      Object.freeze({ path: 'customer.email', value: 'maria.santos@example.test' }),
      Object.freeze({ path: 'serviceRequest.requestedTiming', value: 'next Tuesday' }),
      Object.freeze({ path: 'serviceRequest.location', value: '42 Pine Street' }),
    ]),
    prohibitedRoutes: Object.freeze(['billing', 'reject_unrelated', 'support'] as const),
    requiresManualReview: false,
  }),
  rationale: 'A compact clear-lead fixture used to verify deterministic evaluation scoring.',
});

const goodAssessment: DomainRequestAssessmentV1 = Object.freeze({
  schemaVersion: 'request-assessment-v1',
  intent: 'new_service_request',
  confidence: 0.95,
  customer: Object.freeze({
    name: 'Maria Santos',
    email: 'maria.santos@example.test',
    phone: null,
    accountReference: null,
  }),
  serviceRequest: Object.freeze({
    summary: 'Install service at 42 Pine Street.',
    requestedService: 'installation',
    requestedTiming: 'next Tuesday',
    location: '42 Pine Street',
  }),
  urgencyIndicators: Object.freeze(['none'] as const),
  missingInformation: Object.freeze([] as const),
  proposedRoute: 'sales',
  evidenceReferences: Object.freeze([] as const),
});

const badAssessment: DomainRequestAssessmentV1 = Object.freeze({
  ...goodAssessment,
  intent: 'billing_request',
  customer: Object.freeze({
    name: null,
    email: null,
    phone: null,
    accountReference: null,
  }),
  serviceRequest: Object.freeze({
    summary: 'Billing request.',
    requestedService: null,
    requestedTiming: null,
    location: null,
  }),
  proposedRoute: 'billing',
});

const pricing: EvaluationPricing = Object.freeze({
  label: 'test-rates',
  inputUsdPerMillionTokens: 2,
  outputUsdPerMillionTokens: 8,
  cachedInputUsdPerMillionTokens: 1,
});

const success = (
  output: DomainRequestAssessmentV1,
): ModelGatewayResult<DomainRequestAssessmentV1> => {
  const result = createModelSuccess({
    output,
    providerId: 'openai',
    modelId: 'test-model',
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      cachedInputTokens: 20,
    },
    completionState: 'completed',
    latencyMilliseconds: 40,
  });
  if (!result.ok) throw new Error('Invalid test model success.');
  return result.value;
};

const monotonicSequence = (...values: number[]): (() => number) => {
  const queue = [...values];
  return () => {
    const value = queue.shift();
    if (value === undefined) throw new Error('Test monotonic clock exhausted.');
    return value;
  };
};

const promptSha256 = (systemPrompt: string): string =>
  createHash('sha256').update(systemPrompt, 'utf8').digest('hex');

const run = async (systemPrompt: string) => {
  const output = systemPrompt === 'DELIBERATELY_BAD_PROMPT' ? badAssessment : goodAssessment;
  const gateway = new FakeModelGateway([success(output)]);
  const report = await evaluateRequestAssessmentDataset({
    cases: [evaluationCase],
    gateway,
    datasetName: 'test-dataset',
    commitSha: '0123456789abcdef0123456789abcdef01234567',
    provider: 'openai',
    model: 'test-model',
    prompt: {
      key: 'request.assessment',
      version: 1,
      sha256: promptSha256(systemPrompt),
      systemPrompt,
    },
    pricing,
    timeoutMilliseconds: 30_000,
    clock: () => new Date('2026-07-20T00:00:00.000Z'),
    monotonicNow: monotonicSequence(100, 150),
  });
  return { gateway, report };
};

describe('request-assessment evaluator', () => {
  it('produces exact, field, safety, latency, usage, cost, and provenance metrics', async () => {
    const { gateway, report } = await run('Good evaluation prompt.');

    expect(report).toMatchObject({
      commitSha: '0123456789abcdef0123456789abcdef01234567',
      prompt: { key: 'request.assessment', version: 1 },
      model: { provider: 'openai', model: 'test-model' },
      summary: {
        totalCases: 1,
        succeededCases: 1,
        executionFailures: 0,
        fullyPassedCases: 1,
        intentExactMatch: { passed: 1, total: 1, percentage: 100 },
        fieldLevel: { passed: 4, total: 4, percentage: 100 },
        manualReviewExactMatch: { passed: 1, total: 1, percentage: 100 },
        prohibitedAction: {
          passed: 1,
          total: 1,
          violations: 0,
          percentage: 100,
          strictGatePassed: true,
        },
        latency: {
          totalMilliseconds: 50,
          averageMilliseconds: 50,
          p50Milliseconds: 50,
          p95Milliseconds: 50,
        },
        estimatedCostUsd: 0.00058,
      },
    });
    expect(gateway.requests[0]?.messages[0]?.content).toBe('Good evaluation prompt.');
    expect(gateway.requests[0]?.policy.maximumOutputTokens).toBe(2_000);
  });

  it('makes a deliberately bad prompt fixture produce a measurable regression', async () => {
    const good = await run('Good evaluation prompt.');
    const bad = await run('DELIBERATELY_BAD_PROMPT');

    expect(good.report.summary.intentExactMatch.percentage).toBe(100);
    expect(bad.report.summary.intentExactMatch.percentage).toBe(0);
    expect(bad.report.summary.fieldLevel.percentage).toBeLessThan(
      good.report.summary.fieldLevel.percentage,
    );
    expect(bad.report.summary.prohibitedAction).toMatchObject({
      violations: 1,
      strictGatePassed: false,
    });
    expect(bad.gateway.requests[0]?.messages[0]?.content).toBe('DELIBERATELY_BAD_PROMPT');
  });
});
