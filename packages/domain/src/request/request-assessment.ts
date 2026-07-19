import { failure, success, type Result } from '../shared/result.js';

export const requestAssessmentSchemaVersion = 'request-assessment-v1' as const;
export const requestAssessmentReviewThreshold = 0.75;

export const requestAssessmentIntents = Object.freeze([
  'new_service_request',
  'support_request',
  'billing_request',
  'complaint',
  'cancellation_request',
  'general_inquiry',
  'unrelated',
  'unknown',
] as const);
export type RequestAssessmentIntent = (typeof requestAssessmentIntents)[number];

export const requestAssessmentRoutes = Object.freeze([
  'sales',
  'support',
  'billing',
  'operations',
  'manual_review',
  'reject_unrelated',
] as const);
export type RequestAssessmentRoute = (typeof requestAssessmentRoutes)[number];

export const requestAssessmentUrgencyIndicators = Object.freeze([
  'safety_risk',
  'service_outage',
  'financial_deadline',
  'legal_deadline',
  'customer_escalation',
  'time_sensitive',
  'none',
] as const);
export type RequestAssessmentUrgencyIndicator = (typeof requestAssessmentUrgencyIndicators)[number];

export type RequestAssessmentEvidenceReference = Readonly<{
  field: string;
  start: number;
  end: number;
}>;

export type RequestAssessmentV1 = Readonly<{
  schemaVersion: typeof requestAssessmentSchemaVersion;
  intent: RequestAssessmentIntent;
  confidence: number;
  customer: Readonly<{
    name: string | null;
    email: string | null;
    phone: string | null;
    accountReference: string | null;
  }>;
  serviceRequest: Readonly<{
    summary: string;
    requestedService: string | null;
    requestedTiming: string | null;
    location: string | null;
  }>;
  urgencyIndicators: readonly RequestAssessmentUrgencyIndicator[];
  missingInformation: readonly string[];
  proposedRoute: RequestAssessmentRoute;
  evidenceReferences: readonly RequestAssessmentEvidenceReference[];
}>;

export type RequestAssessmentValidationReason =
  | 'additional_property'
  | 'duplicate'
  | 'empty'
  | 'invalid_range'
  | 'invalid_type'
  | 'not_finite'
  | 'not_normalized'
  | 'not_ordered'
  | 'out_of_range'
  | 'unsupported';

export type RequestAssessmentValidationError = Readonly<{
  code: 'INVALID_REQUEST_ASSESSMENT';
  field: string;
  reason: RequestAssessmentValidationReason;
}>;

export type RequestAssessmentReview = Readonly<{
  effectiveRoute: RequestAssessmentRoute;
  requiresReview: boolean;
}>;

const maximumCustomerValueLength = 320;
const maximumServiceValueLength = 2_000;
const maximumMissingInformation = 20;
const maximumMissingInformationLength = 100;
const maximumEvidenceReferences = 50;
const maximumEvidenceFieldLength = 100;

const validationFailure = (
  field: string,
  reason: RequestAssessmentValidationReason,
): Result<never, RequestAssessmentValidationError> =>
  failure({ code: 'INVALID_REQUEST_ASSESSMENT', field, reason });

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  field: string,
): Result<void, RequestAssessmentValidationError> => {
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    return validationFailure(field, 'additional_property');
  }
  return success(undefined);
};

const parseNullableString = (
  value: unknown,
  field: string,
  maximumLength: number,
): Result<string | null, RequestAssessmentValidationError> => {
  if (value === null) return success(null);
  if (typeof value !== 'string') return validationFailure(field, 'invalid_type');
  if (value.trim().length === 0) return validationFailure(field, 'empty');
  if (value.length > maximumLength) return validationFailure(field, 'out_of_range');
  return success(value);
};

const parseRequiredString = (
  value: unknown,
  field: string,
  maximumLength: number,
): Result<string, RequestAssessmentValidationError> => {
  const result = parseNullableString(value, field, maximumLength);
  if (!result.ok) return result;
  return result.value === null ? validationFailure(field, 'invalid_type') : success(result.value);
};

const includes = <Value extends string>(values: readonly Value[], value: unknown): value is Value =>
  typeof value === 'string' && values.includes(value as Value);

const parseEvidenceReferences = (
  value: unknown,
  requestTextLength: number,
): Result<readonly RequestAssessmentEvidenceReference[], RequestAssessmentValidationError> => {
  if (!Array.isArray(value)) return validationFailure('evidenceReferences', 'invalid_type');
  if (value.length > maximumEvidenceReferences) {
    return validationFailure('evidenceReferences', 'out_of_range');
  }

  const references: RequestAssessmentEvidenceReference[] = [];
  for (const [index, candidate] of value.entries()) {
    const field = `evidenceReferences[${index}]`;
    if (!isPlainObject(candidate)) return validationFailure(field, 'invalid_type');
    const keysResult = hasExactKeys(candidate, ['field', 'start', 'end'], field);
    if (!keysResult.ok) return keysResult;
    const evidenceField = parseRequiredString(
      candidate['field'],
      `${field}.field`,
      maximumEvidenceFieldLength,
    );
    if (!evidenceField.ok) return evidenceField;
    const start = candidate['start'];
    const end = candidate['end'];
    if (
      typeof start !== 'number' ||
      typeof end !== 'number' ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end)
    ) {
      return validationFailure(field, 'invalid_type');
    }
    if (start < 0 || end <= start || end > requestTextLength) {
      return validationFailure(field, 'invalid_range');
    }
    references.push(Object.freeze({ field: evidenceField.value, start, end }));
  }
  return success(Object.freeze(references));
};

const parseUrgencyIndicators = (
  value: unknown,
): Result<readonly RequestAssessmentUrgencyIndicator[], RequestAssessmentValidationError> => {
  if (!Array.isArray(value)) return validationFailure('urgencyIndicators', 'invalid_type');
  if (value.length > requestAssessmentUrgencyIndicators.length) {
    return validationFailure('urgencyIndicators', 'out_of_range');
  }
  const parsed: RequestAssessmentUrgencyIndicator[] = [];
  for (const entry of value) {
    if (!includes(requestAssessmentUrgencyIndicators, entry)) {
      return validationFailure('urgencyIndicators', 'unsupported');
    }
    if (parsed.includes(entry)) return validationFailure('urgencyIndicators', 'duplicate');
    parsed.push(entry);
  }
  if (parsed.includes('none') && parsed.length > 1) {
    return validationFailure('urgencyIndicators', 'unsupported');
  }
  return success(Object.freeze(parsed));
};

const normalizedIdentifier = /^[a-z][a-z0-9_]{0,99}$/;

const parseMissingInformation = (
  value: unknown,
): Result<readonly string[], RequestAssessmentValidationError> => {
  if (!Array.isArray(value)) return validationFailure('missingInformation', 'invalid_type');
  if (value.length > maximumMissingInformation) {
    return validationFailure('missingInformation', 'out_of_range');
  }
  const parsed: string[] = [];
  for (const [index, entry] of value.entries()) {
    const field = `missingInformation[${index}]`;
    if (typeof entry !== 'string') return validationFailure(field, 'invalid_type');
    if (entry.length > maximumMissingInformationLength)
      return validationFailure(field, 'out_of_range');
    if (!normalizedIdentifier.test(entry)) return validationFailure(field, 'not_normalized');
    if (parsed.includes(entry)) return validationFailure(field, 'duplicate');
    if (parsed.length > 0 && (parsed[parsed.length - 1] ?? '') >= entry) {
      return validationFailure(field, 'not_ordered');
    }
    parsed.push(entry);
  }
  return success(Object.freeze(parsed));
};

export const parseRequestAssessmentV1 = (
  value: unknown,
  requestTextLength: number,
): Result<RequestAssessmentV1, RequestAssessmentValidationError> => {
  if (!Number.isSafeInteger(requestTextLength) || requestTextLength < 0) {
    return validationFailure('requestTextLength', 'out_of_range');
  }
  if (!isPlainObject(value)) return validationFailure('assessment', 'invalid_type');
  const keysResult = hasExactKeys(
    value,
    [
      'schemaVersion',
      'intent',
      'confidence',
      'customer',
      'serviceRequest',
      'urgencyIndicators',
      'missingInformation',
      'proposedRoute',
      'evidenceReferences',
    ],
    'assessment',
  );
  if (!keysResult.ok) return keysResult;
  if (value['schemaVersion'] !== requestAssessmentSchemaVersion) {
    return validationFailure('schemaVersion', 'unsupported');
  }
  if (!includes(requestAssessmentIntents, value['intent']))
    return validationFailure('intent', 'unsupported');
  if (typeof value['confidence'] !== 'number')
    return validationFailure('confidence', 'invalid_type');
  if (!Number.isFinite(value['confidence'])) return validationFailure('confidence', 'not_finite');
  if (value['confidence'] < 0 || value['confidence'] > 1)
    return validationFailure('confidence', 'out_of_range');
  if (!isPlainObject(value['customer'])) return validationFailure('customer', 'invalid_type');
  const customerKeys = hasExactKeys(
    value['customer'],
    ['name', 'email', 'phone', 'accountReference'],
    'customer',
  );
  if (!customerKeys.ok) return customerKeys;
  const name = parseNullableString(
    value['customer']['name'],
    'customer.name',
    maximumCustomerValueLength,
  );
  const email = parseNullableString(
    value['customer']['email'],
    'customer.email',
    maximumCustomerValueLength,
  );
  const phone = parseNullableString(
    value['customer']['phone'],
    'customer.phone',
    maximumCustomerValueLength,
  );
  const accountReference = parseNullableString(
    value['customer']['accountReference'],
    'customer.accountReference',
    maximumCustomerValueLength,
  );
  if (!name.ok) return name;
  if (!email.ok) return email;
  if (!phone.ok) return phone;
  if (!accountReference.ok) return accountReference;
  if (!isPlainObject(value['serviceRequest']))
    return validationFailure('serviceRequest', 'invalid_type');
  const serviceKeys = hasExactKeys(
    value['serviceRequest'],
    ['summary', 'requestedService', 'requestedTiming', 'location'],
    'serviceRequest',
  );
  if (!serviceKeys.ok) return serviceKeys;
  const summary = parseRequiredString(
    value['serviceRequest']['summary'],
    'serviceRequest.summary',
    maximumServiceValueLength,
  );
  const requestedService = parseNullableString(
    value['serviceRequest']['requestedService'],
    'serviceRequest.requestedService',
    maximumServiceValueLength,
  );
  const requestedTiming = parseNullableString(
    value['serviceRequest']['requestedTiming'],
    'serviceRequest.requestedTiming',
    maximumServiceValueLength,
  );
  const location = parseNullableString(
    value['serviceRequest']['location'],
    'serviceRequest.location',
    maximumServiceValueLength,
  );
  if (!summary.ok) return summary;
  if (!requestedService.ok) return requestedService;
  if (!requestedTiming.ok) return requestedTiming;
  if (!location.ok) return location;
  const urgency = parseUrgencyIndicators(value['urgencyIndicators']);
  const missing = parseMissingInformation(value['missingInformation']);
  const evidence = parseEvidenceReferences(value['evidenceReferences'], requestTextLength);
  if (!urgency.ok) return urgency;
  if (!missing.ok) return missing;
  if (!evidence.ok) return evidence;
  if (!includes(requestAssessmentRoutes, value['proposedRoute']))
    return validationFailure('proposedRoute', 'unsupported');
  if (
    value['intent'] === 'unrelated' &&
    !['reject_unrelated', 'manual_review'].includes(value['proposedRoute'])
  ) {
    return validationFailure('proposedRoute', 'unsupported');
  }
  if (value['intent'] !== 'unrelated' && value['proposedRoute'] === 'reject_unrelated') {
    return validationFailure('proposedRoute', 'unsupported');
  }
  return success(
    Object.freeze({
      schemaVersion: requestAssessmentSchemaVersion,
      intent: value['intent'],
      confidence: value['confidence'],
      customer: Object.freeze({
        name: name.value,
        email: email.value,
        phone: phone.value,
        accountReference: accountReference.value,
      }),
      serviceRequest: Object.freeze({
        summary: summary.value,
        requestedService: requestedService.value,
        requestedTiming: requestedTiming.value,
        location: location.value,
      }),
      urgencyIndicators: urgency.value,
      missingInformation: missing.value,
      proposedRoute: value['proposedRoute'],
      evidenceReferences: evidence.value,
    }),
  );
};

export const determineRequestAssessmentReview = (
  assessment: RequestAssessmentV1,
): RequestAssessmentReview => {
  const requiresReview =
    assessment.confidence < requestAssessmentReviewThreshold ||
    assessment.intent === 'unknown' ||
    assessment.missingInformation.length > 0 ||
    assessment.proposedRoute === 'manual_review';
  return Object.freeze({
    requiresReview,
    effectiveRoute: requiresReview ? 'manual_review' : assessment.proposedRoute,
  });
};
