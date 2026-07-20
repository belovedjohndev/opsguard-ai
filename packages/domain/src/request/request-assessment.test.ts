import { describe, expect, it } from 'vitest';

import {
  determineRequestAssessmentReview,
  parseRequestAssessmentV1,
  requestAssessmentReviewThreshold,
} from './request-assessment.js';

const requestText = 'Please schedule a repair for a leaking pipe tomorrow.';

const validAssessment = {
  schemaVersion: 'request-assessment-v1',
  intent: 'new_service_request',
  confidence: 0.9,
  customer: { name: null, email: null, phone: null, accountReference: null },
  serviceRequest: {
    summary: 'Repair a leaking pipe.',
    requestedService: 'Plumbing repair',
    requestedTiming: 'tomorrow',
    location: null,
  },
  urgencyIndicators: ['time_sensitive'],
  missingInformation: [],
  proposedRoute: 'operations',
  evidenceReferences: [{ field: 'serviceRequest.summary', start: 16, end: 37 }],
};

describe('RequestAssessmentV1', () => {
  it('creates an immutable defensive copy of a valid assessment', () => {
    const result = parseRequestAssessmentV1(validAssessment, requestText.length);

    expect(result).toEqual({ ok: true, value: validAssessment });
    if (!result.ok) return;
    validAssessment.serviceRequest.summary = 'mutated';
    expect(result.value.serviceRequest.summary).toBe('Repair a leaking pipe.');
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.customer)).toBe(true);
  });

  it.each([
    ['additional root property', { unexpected: true }, 'assessment', 'additional_property'],
    ['unsupported intent', { intent: 'invented' }, 'intent', 'unsupported'],
    ['non-finite confidence', { confidence: Number.NaN }, 'confidence', 'not_finite'],
    ['out-of-range confidence', { confidence: 1.01 }, 'confidence', 'out_of_range'],
    [
      'empty semantic summary',
      { serviceRequest: { ...validAssessment.serviceRequest, summary: ' ' } },
      'serviceRequest.summary',
      'empty',
    ],
    [
      'combined none urgency',
      { urgencyIndicators: ['none', 'time_sensitive'] },
      'urgencyIndicators',
      'unsupported',
    ],
    [
      'invalid evidence range',
      { evidenceReferences: [{ field: 'x', start: 5, end: 5 }] },
      'evidenceReferences[0]',
      'invalid_range',
    ],
    [
      'unrelated non-rejection route',
      { intent: 'unrelated', proposedRoute: 'sales' },
      'proposedRoute',
      'unsupported',
    ],
    [
      'non-unrelated rejection route',
      { proposedRoute: 'reject_unrelated' },
      'proposedRoute',
      'unsupported',
    ],
  ])('rejects %s', (_name, override, field, reason) => {
    const result = parseRequestAssessmentV1(
      { ...validAssessment, ...override },
      requestText.length,
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_REQUEST_ASSESSMENT', field, reason },
    });
  });

  it('canonicalizes valid missing-information identifiers lexicographically', () => {
    const result = parseRequestAssessmentV1(
      { ...validAssessment, missingInformation: ['phone', 'email'] },
      requestText.length,
    );

    expect(result).toEqual({
      ok: true,
      value: { ...validAssessment, missingInformation: ['email', 'phone'] },
    });
  });

  it('omits only structurally valid evidence that exceeds the raw request boundary', () => {
    const result = parseRequestAssessmentV1(
      {
        ...validAssessment,
        evidenceReferences: [
          { field: 'serviceRequest.summary', start: 16, end: 37 },
          { field: 'serviceRequest.requestedTiming', start: 48, end: 60 },
        ],
      },
      requestText.length,
    );

    expect(result).toEqual({
      ok: true,
      value: {
        ...validAssessment,
        evidenceReferences: [{ field: 'serviceRequest.summary', start: 16, end: 37 }],
      },
    });
  });

  it('does not repair malformed evidence into a valid range', () => {
    const result = parseRequestAssessmentV1(
      {
        ...validAssessment,
        evidenceReferences: [{ field: 'serviceRequest.summary', start: -1, end: 5 }],
      },
      requestText.length,
    );

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'INVALID_REQUEST_ASSESSMENT',
        field: 'evidenceReferences[0]',
        reason: 'invalid_range',
      },
    });
  });

  it('forces an intent-incompatible route to manual review', () => {
    const assessment = parseRequestAssessmentV1(validAssessment, requestText.length);
    if (!assessment.ok) throw new Error('Invalid fixture');

    expect(
      determineRequestAssessmentReview({
        ...assessment.value,
        intent: 'cancellation_request',
        proposedRoute: 'billing',
      }),
    ).toEqual({
      effectiveRoute: 'manual_review',
      requiresReview: true,
    });
  });

  it('routes low confidence, unknown intent, missing information, and proposed review deterministically', () => {
    const assessment = parseRequestAssessmentV1(validAssessment, requestText.length);
    if (!assessment.ok) throw new Error('Invalid fixture');
    expect(requestAssessmentReviewThreshold).toBe(0.75);
    expect(determineRequestAssessmentReview(assessment.value)).toEqual({
      effectiveRoute: 'operations',
      requiresReview: false,
    });
    expect(determineRequestAssessmentReview({ ...assessment.value, confidence: 0.74 })).toEqual({
      effectiveRoute: 'manual_review',
      requiresReview: true,
    });
    expect(determineRequestAssessmentReview({ ...assessment.value, intent: 'unknown' })).toEqual({
      effectiveRoute: 'manual_review',
      requiresReview: true,
    });
    expect(
      determineRequestAssessmentReview({ ...assessment.value, missingInformation: ['email'] }),
    ).toEqual({ effectiveRoute: 'manual_review', requiresReview: true });
    expect(
      determineRequestAssessmentReview({ ...assessment.value, proposedRoute: 'manual_review' }),
    ).toEqual({ effectiveRoute: 'manual_review', requiresReview: true });
  });
});
