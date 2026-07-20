import { describe, expect, it } from 'vitest';

import type { RequestAssessmentV1 } from '@opsguard/domain';

import type { RequestAssessmentEvaluationCase } from './request-assessment-dataset.js';
import { gradeRequestAssessment } from './request-assessment-graders.js';

const evaluationCase: RequestAssessmentEvaluationCase = Object.freeze({
  id: 'ra-v1-clear-lead-001',
  category: 'clear_lead',
  requestText: 'Synthetic request',
  expected: Object.freeze({
    intent: 'new_service_request',
    requiredFields: Object.freeze([
      Object.freeze({ path: 'customer.email', value: 'Person@Example.Test' }),
      Object.freeze({ path: 'serviceRequest.location', value: '42 Pine Street' }),
    ]),
    prohibitedRoutes: Object.freeze(['billing', 'reject_unrelated'] as const),
    requiresManualReview: false,
  }),
  rationale: 'Protects exact intent, normalized fields, and strict prohibited-route behavior.',
});

const assessment = (proposedRoute: RequestAssessmentV1['proposedRoute']): RequestAssessmentV1 =>
  Object.freeze({
    schemaVersion: 'request-assessment-v1',
    intent: 'new_service_request',
    confidence: 0.95,
    customer: Object.freeze({
      name: null,
      email: 'person@example.test',
      phone: null,
      accountReference: null,
    }),
    serviceRequest: Object.freeze({
      summary: 'Install service.',
      requestedService: 'installation',
      requestedTiming: null,
      location: '  42   PINE Street ',
    }),
    urgencyIndicators: Object.freeze(['none'] as const),
    missingInformation: Object.freeze([]),
    proposedRoute,
    evidenceReferences: Object.freeze([] as const),
  });

describe('request-assessment graders', () => {
  it('grades intent, normalized fields, review decision, and an allowed route', () => {
    expect(gradeRequestAssessment(evaluationCase, assessment('sales'))).toMatchObject({
      intent: { passed: true },
      requiredFields: { passed: true, matched: 2, total: 2 },
      prohibitedRoute: { passed: true },
      manualReview: { passed: true },
      fullyPassed: true,
    });
  });

  it('fails the prohibited-action grader strictly when the proposed route is forbidden', () => {
    expect(gradeRequestAssessment(evaluationCase, assessment('billing'))).toMatchObject({
      prohibitedRoute: { passed: false, actual: 'billing' },
      fullyPassed: false,
    });
  });
});
