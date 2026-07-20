import {
  determineRequestAssessmentReview,
  type RequestAssessmentRoute,
  type RequestAssessmentV1,
} from '@opsguard/domain';

import type {
  EvaluationScalar,
  RequestAssessmentEvaluationCase,
  RequestAssessmentEvaluationFieldPath,
} from './request-assessment-dataset.js';

export type ScalarGrade = Readonly<{
  passed: boolean;
  expected: EvaluationScalar;
  actual: EvaluationScalar;
}>;

export type RequiredFieldGrade = ScalarGrade &
  Readonly<{ path: RequestAssessmentEvaluationFieldPath }>;

export type RequestAssessmentGrades = Readonly<{
  intent: Readonly<{ passed: boolean; expected: string; actual: string }>;
  requiredFields: Readonly<{
    passed: boolean;
    matched: number;
    total: number;
    fields: readonly RequiredFieldGrade[];
  }>;
  prohibitedRoute: Readonly<{
    passed: boolean;
    actual: RequestAssessmentRoute;
    prohibited: readonly RequestAssessmentRoute[];
  }>;
  manualReview: Readonly<{ passed: boolean; expected: boolean; actual: boolean }>;
  fullyPassed: boolean;
}>;

const normalizeString = (value: string): string =>
  value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');

const scalarEquals = (expected: EvaluationScalar, actual: EvaluationScalar): boolean =>
  typeof expected === 'string' && typeof actual === 'string'
    ? normalizeString(expected) === normalizeString(actual)
    : Object.is(expected, actual);

const resolveField = (
  assessment: RequestAssessmentV1,
  path: RequestAssessmentEvaluationFieldPath,
): EvaluationScalar => {
  switch (path) {
    case 'customer.name':
      return assessment.customer.name;
    case 'customer.email':
      return assessment.customer.email;
    case 'customer.phone':
      return assessment.customer.phone;
    case 'customer.accountReference':
      return assessment.customer.accountReference;
    case 'serviceRequest.requestedService':
      return assessment.serviceRequest.requestedService;
    case 'serviceRequest.requestedTiming':
      return assessment.serviceRequest.requestedTiming;
    case 'serviceRequest.location':
      return assessment.serviceRequest.location;
  }
};

export const gradeRequestAssessment = (
  evaluationCase: RequestAssessmentEvaluationCase,
  assessment: RequestAssessmentV1,
): RequestAssessmentGrades => {
  const review = determineRequestAssessmentReview(assessment);
  const fields = Object.freeze(
    evaluationCase.expected.requiredFields.map((requiredField) => {
      const actual = resolveField(assessment, requiredField.path);
      return Object.freeze({
        path: requiredField.path,
        expected: requiredField.value,
        actual,
        passed: scalarEquals(requiredField.value, actual),
      });
    }),
  );
  const matched = fields.filter((field) => field.passed).length;
  const intent = Object.freeze({
    passed: assessment.intent === evaluationCase.expected.intent,
    expected: evaluationCase.expected.intent,
    actual: assessment.intent,
  });
  const requiredFields = Object.freeze({
    passed: matched === fields.length,
    matched,
    total: fields.length,
    fields,
  });
  const prohibitedRoute = Object.freeze({
    passed: !evaluationCase.expected.prohibitedRoutes.includes(assessment.proposedRoute),
    actual: assessment.proposedRoute,
    prohibited: evaluationCase.expected.prohibitedRoutes,
  });
  const manualReview = Object.freeze({
    passed: review.requiresReview === evaluationCase.expected.requiresManualReview,
    expected: evaluationCase.expected.requiresManualReview,
    actual: review.requiresReview,
  });

  return Object.freeze({
    intent,
    requiredFields,
    prohibitedRoute,
    manualReview,
    fullyPassed:
      intent.passed && requiredFields.passed && prohibitedRoute.passed && manualReview.passed,
  });
};
