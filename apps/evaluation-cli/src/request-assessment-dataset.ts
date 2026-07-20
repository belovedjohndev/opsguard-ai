import { readFile } from 'node:fs/promises';

import {
  requestAssessmentIntents,
  requestAssessmentRoutes,
  type RequestAssessmentIntent,
  type RequestAssessmentRoute,
} from '@opsguard/domain';

export const requestAssessmentEvaluationCategories = Object.freeze([
  'clear_lead',
  'support',
  'billing',
  'ambiguous',
  'incomplete',
  'adversarial',
  'unrelated',
  'conflicting',
] as const);

export type RequestAssessmentEvaluationCategory =
  (typeof requestAssessmentEvaluationCategories)[number];

export const requestAssessmentEvaluationFieldPaths = Object.freeze([
  'customer.name',
  'customer.email',
  'customer.phone',
  'customer.accountReference',
  'serviceRequest.requestedService',
  'serviceRequest.requestedTiming',
  'serviceRequest.location',
] as const);

export type RequestAssessmentEvaluationFieldPath =
  (typeof requestAssessmentEvaluationFieldPaths)[number];

export type EvaluationScalar = boolean | null | number | string;

export type RequestAssessmentRequiredField = Readonly<{
  path: RequestAssessmentEvaluationFieldPath;
  value: EvaluationScalar;
}>;

export type RequestAssessmentEvaluationCase = Readonly<{
  id: string;
  category: RequestAssessmentEvaluationCategory;
  requestText: string;
  expected: Readonly<{
    intent: RequestAssessmentIntent;
    requiredFields: readonly RequestAssessmentRequiredField[];
    prohibitedRoutes: readonly RequestAssessmentRoute[];
    requiresManualReview: boolean;
  }>;
  rationale: string;
}>;

export const requestAssessmentDatasetUrl = new URL(
  '../../../evaluations/datasets/request-assessment-v1.jsonl',
  import.meta.url,
);

export class RequestAssessmentDatasetError extends Error {
  readonly code = 'INVALID_REQUEST_ASSESSMENT_DATASET';

  constructor(message: string) {
    super(message);
    this.name = 'RequestAssessmentDatasetError';
  }
}

const caseIdPattern = /^ra-v1-[a-z0-9]+(?:-[a-z0-9]+)*-\d{3}$/u;
const maximumRequestTextLength = 20_000;

const invalid = (lineNumber: number, field: string): RequestAssessmentDatasetError =>
  new RequestAssessmentDatasetError(
    `Request-assessment dataset line ${lineNumber} has invalid ${field}.`,
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requireRecord = (
  value: unknown,
  lineNumber: number,
  field: string,
): Record<string, unknown> => {
  if (!isRecord(value)) throw invalid(lineNumber, field);
  return value;
};

const requireArray = (value: unknown, lineNumber: number, field: string): readonly unknown[] => {
  if (!Array.isArray(value)) throw invalid(lineNumber, field);
  return value;
};

const requireString = (value: unknown, lineNumber: number, field: string): string => {
  if (typeof value !== 'string') throw invalid(lineNumber, field);
  return value;
};

const requireBoolean = (value: unknown, lineNumber: number, field: string): boolean => {
  if (typeof value !== 'boolean') throw invalid(lineNumber, field);
  return value;
};

const requireEnum = <Value extends string>(
  values: readonly Value[],
  value: unknown,
  lineNumber: number,
  field: string,
): Value => {
  if (typeof value !== 'string' || !values.includes(value as Value)) {
    throw invalid(lineNumber, field);
  }
  return value as Value;
};

const requireScalar = (value: unknown, lineNumber: number, field: string): EvaluationScalar => {
  if (
    value !== null &&
    typeof value !== 'boolean' &&
    typeof value !== 'number' &&
    typeof value !== 'string'
  ) {
    throw invalid(lineNumber, field);
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw invalid(lineNumber, field);
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    throw invalid(lineNumber, field);
  }
  return value;
};

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
};

const parseRequiredFields = (
  value: unknown,
  lineNumber: number,
): readonly RequestAssessmentRequiredField[] => {
  const candidates = requireArray(value, lineNumber, 'expected.requiredFields');
  const paths = new Set<RequestAssessmentEvaluationFieldPath>();

  return Object.freeze(
    candidates.map((candidate, index) => {
      const fieldName = `expected.requiredFields[${index}]`;
      const record = requireRecord(candidate, lineNumber, fieldName);
      if (!hasExactKeys(record, ['path', 'value'])) {
        throw invalid(lineNumber, fieldName);
      }

      const path = requireEnum(
        requestAssessmentEvaluationFieldPaths,
        record['path'],
        lineNumber,
        `${fieldName}.path`,
      );
      if (paths.has(path)) throw invalid(lineNumber, `${fieldName}.path`);
      paths.add(path);

      return Object.freeze({
        path,
        value: requireScalar(record['value'], lineNumber, `${fieldName}.value`),
      });
    }),
  );
};

const parseProhibitedRoutes = (
  value: unknown,
  lineNumber: number,
): readonly RequestAssessmentRoute[] => {
  const candidates = requireArray(value, lineNumber, 'expected.prohibitedRoutes');
  if (candidates.length === 0) {
    throw invalid(lineNumber, 'expected.prohibitedRoutes');
  }

  const routes: RequestAssessmentRoute[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const route = requireEnum(
      requestAssessmentRoutes,
      candidate,
      lineNumber,
      `expected.prohibitedRoutes[${index}]`,
    );
    if (routes.includes(route)) {
      throw invalid(lineNumber, `expected.prohibitedRoutes[${index}]`);
    }
    routes.push(route);
  }
  return Object.freeze(routes);
};

const parseCase = (value: unknown, lineNumber: number): RequestAssessmentEvaluationCase => {
  const record = requireRecord(value, lineNumber, 'case');
  if (!hasExactKeys(record, ['id', 'category', 'requestText', 'expected', 'rationale'])) {
    throw invalid(lineNumber, 'case');
  }

  const id = requireString(record['id'], lineNumber, 'id');
  if (!caseIdPattern.test(id)) throw invalid(lineNumber, 'id');

  const category = requireEnum(
    requestAssessmentEvaluationCategories,
    record['category'],
    lineNumber,
    'category',
  );

  const requestText = requireString(record['requestText'], lineNumber, 'requestText');
  if (requestText.trim().length === 0 || requestText.length > maximumRequestTextLength) {
    throw invalid(lineNumber, 'requestText');
  }

  const rationale = requireString(record['rationale'], lineNumber, 'rationale');
  if (rationale.trim().length <= 20) throw invalid(lineNumber, 'rationale');

  const expected = requireRecord(record['expected'], lineNumber, 'expected');
  if (
    !hasExactKeys(expected, [
      'intent',
      'requiredFields',
      'prohibitedRoutes',
      'requiresManualReview',
    ])
  ) {
    throw invalid(lineNumber, 'expected');
  }

  return Object.freeze({
    id,
    category,
    requestText,
    expected: Object.freeze({
      intent: requireEnum(
        requestAssessmentIntents,
        expected['intent'],
        lineNumber,
        'expected.intent',
      ),
      requiredFields: parseRequiredFields(expected['requiredFields'], lineNumber),
      prohibitedRoutes: parseProhibitedRoutes(expected['prohibitedRoutes'], lineNumber),
      requiresManualReview: requireBoolean(
        expected['requiresManualReview'],
        lineNumber,
        'expected.requiresManualReview',
      ),
    }),
    rationale,
  });
};

export const parseRequestAssessmentDataset = (
  content: string,
): readonly RequestAssessmentEvaluationCase[] => {
  const lines = content.split(/\r?\n/u).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new RequestAssessmentDatasetError('Request-assessment dataset is empty.');
  }

  const seenIds = new Set<string>();
  const cases = lines.map((line, index) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      throw invalid(index + 1, 'JSON');
    }

    const evaluationCase = parseCase(parsed, index + 1);
    if (seenIds.has(evaluationCase.id)) throw invalid(index + 1, 'duplicate id');
    seenIds.add(evaluationCase.id);
    return evaluationCase;
  });

  return Object.freeze(cases);
};

export const loadRequestAssessmentDataset = async (
  datasetUrl: URL = requestAssessmentDatasetUrl,
): Promise<readonly RequestAssessmentEvaluationCase[]> =>
  parseRequestAssessmentDataset(await readFile(datasetUrl, 'utf8'));
