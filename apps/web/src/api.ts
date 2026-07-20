export type DemoErrorKind = 'validation' | 'authorization' | 'unavailable' | 'model' | 'unexpected';

export class DemoApiError extends Error {
  readonly kind: DemoErrorKind;

  constructor(kind: DemoErrorKind, message: string) {
    super(message);
    this.name = 'DemoApiError';
    this.kind = kind;
  }
}

export type DemoConfiguration = Readonly<{
  apiBaseUrl: string;
  tenantId: string;
  userId: string;
}>;

export type EvidenceReference = Readonly<{
  field: string;
  start: number;
  end: number;
}>;

export type AssessmentResponse = Readonly<{
  requestId: string;
  correlationId: string;
  status: 'pending_review';
  aiRunStatus: 'succeeded';
  assessment: Readonly<{
    schemaVersion: string;
    intent: string;
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
    urgencyIndicators: readonly string[];
    missingInformation: readonly string[];
    proposedRoute: string;
    evidenceReferences: readonly EvidenceReference[];
  }>;
  decision: Readonly<{
    effectiveRoute: string;
    requiresReview: boolean;
    modelRouteOverridden: boolean;
  }>;
  provenance: Readonly<{
    promptKey: string;
    promptVersion: number;
    promptSha256: string;
    provider: string;
    model: string;
  }>;
}>;

type FetchImplementation = typeof fetch;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNullableString = (value: unknown): value is string | null =>
  typeof value === 'string' || value === null;

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string');

const isEvidenceReferences = (value: unknown): value is readonly EvidenceReference[] =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      isRecord(entry) &&
      typeof entry['field'] === 'string' &&
      Number.isSafeInteger(entry['start']) &&
      Number.isSafeInteger(entry['end']),
  );

const parseAssessmentResponse = (value: unknown): AssessmentResponse => {
  if (!isRecord(value)) throw new DemoApiError('unexpected', 'The API returned an invalid result.');
  if (value['aiRunStatus'] !== 'succeeded') {
    throw new DemoApiError(
      'model',
      'The model did not return a validated assessment. The request remains safe for review.',
    );
  }

  const assessment = value['assessment'];
  const customer = isRecord(assessment) ? assessment['customer'] : undefined;
  const serviceRequest = isRecord(assessment) ? assessment['serviceRequest'] : undefined;
  const decision = value['decision'];
  const provenance = value['provenance'];

  if (
    typeof value['requestId'] !== 'string' ||
    typeof value['correlationId'] !== 'string' ||
    value['status'] !== 'pending_review' ||
    !isRecord(assessment) ||
    typeof assessment['schemaVersion'] !== 'string' ||
    typeof assessment['intent'] !== 'string' ||
    typeof assessment['confidence'] !== 'number' ||
    !Number.isFinite(assessment['confidence']) ||
    !isRecord(customer) ||
    !isNullableString(customer['name']) ||
    !isNullableString(customer['email']) ||
    !isNullableString(customer['phone']) ||
    !isNullableString(customer['accountReference']) ||
    !isRecord(serviceRequest) ||
    typeof serviceRequest['summary'] !== 'string' ||
    !isNullableString(serviceRequest['requestedService']) ||
    !isNullableString(serviceRequest['requestedTiming']) ||
    !isNullableString(serviceRequest['location']) ||
    !isStringArray(assessment['urgencyIndicators']) ||
    !isStringArray(assessment['missingInformation']) ||
    typeof assessment['proposedRoute'] !== 'string' ||
    !isEvidenceReferences(assessment['evidenceReferences']) ||
    !isRecord(decision) ||
    typeof decision['effectiveRoute'] !== 'string' ||
    typeof decision['requiresReview'] !== 'boolean' ||
    typeof decision['modelRouteOverridden'] !== 'boolean' ||
    !isRecord(provenance) ||
    typeof provenance['promptKey'] !== 'string' ||
    typeof provenance['promptVersion'] !== 'number' ||
    typeof provenance['promptSha256'] !== 'string' ||
    typeof provenance['provider'] !== 'string' ||
    typeof provenance['model'] !== 'string'
  ) {
    throw new DemoApiError('unexpected', 'The API returned an invalid result.');
  }

  return value as AssessmentResponse;
};

const requestJson = async (
  fetchImplementation: FetchImplementation,
  url: string,
  configuration: DemoConfiguration,
  body: Readonly<Record<string, string>>,
): Promise<unknown> => {
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        'content-type': 'application/json',
        'x-opsguard-tenant-id': configuration.tenantId,
        'x-opsguard-user-id': configuration.userId,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new DemoApiError('unavailable', 'The OpsGuard API is unavailable.');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DemoApiError('unexpected', 'The API returned an invalid response.');
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new DemoApiError('authorization', 'Demo tenant authorization failed.');
    }
    if (response.status === 400) {
      throw new DemoApiError('validation', 'The API rejected the request as invalid.');
    }
    if (response.status >= 500) {
      throw new DemoApiError('unavailable', 'The OpsGuard API is temporarily unavailable.');
    }
    throw new DemoApiError('unexpected', 'The request could not be completed safely.');
  }

  return payload;
};

export const readDemoConfiguration = (): DemoConfiguration => {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '');
  const tenantId = import.meta.env.VITE_DEMO_TENANT_ID?.trim();
  const userId = import.meta.env.VITE_DEMO_USER_ID?.trim();

  if (!apiBaseUrl || !tenantId || !userId) {
    throw new DemoApiError('validation', 'The demo environment is not configured.');
  }

  return Object.freeze({ apiBaseUrl, tenantId, userId });
};

export const createAndAssessRequest = async (
  requestText: string,
  configuration: DemoConfiguration,
  fetchImplementation: FetchImplementation = fetch,
): Promise<AssessmentResponse> => {
  const created = await requestJson(
    fetchImplementation,
    `${configuration.apiBaseUrl}/v1/requests`,
    configuration,
    {
      sourceType: 'form',
      sourceReference: `demo-${crypto.randomUUID()}`,
    },
  );

  if (!isRecord(created) || typeof created['requestId'] !== 'string') {
    throw new DemoApiError('unexpected', 'The API returned an invalid request identifier.');
  }

  const assessed = await requestJson(
    fetchImplementation,
    `${configuration.apiBaseUrl}/v1/requests/${encodeURIComponent(created['requestId'])}/assessment`,
    configuration,
    { requestText },
  );

  return parseAssessmentResponse(assessed);
};
