import { createHash } from 'node:crypto';

import {
  createModelPolicy,
  createModelRequestMetadata,
  createModelTask,
  createOutputSchemaDescriptor,
  createStructuredModelRequest,
  type ModelContractResult,
  type ModelGateway,
  type ModelGatewayResult,
  type ModelUsage,
} from '@opsguard/ai-core';
import {
  createRequestAssessmentUserMessage,
  requestAssessmentOutputSchema,
} from '@opsguard/application';
import {
  determineRequestAssessmentReview,
  parseRequestAssessmentV1,
  type RequestAssessmentV1,
} from '@opsguard/domain';

import {
  estimateEvaluationCost,
  type EvaluationCostEstimate,
  type EvaluationPricing,
} from './request-assessment-cost.js';
import type {
  RequestAssessmentEvaluationCase,
  RequestAssessmentEvaluationCategory,
} from './request-assessment-dataset.js';
import {
  gradeRequestAssessment,
  type RequestAssessmentGrades,
} from './request-assessment-graders.js';

export const requestAssessmentEvaluationReportSchemaVersion =
  'request-assessment-evaluation-report-v1' as const;

export type EvaluationPromptIdentity = Readonly<{
  key: string;
  version: number;
  sha256: string;
  systemPrompt: string;
}>;

export type EvaluationCaseFailure = Readonly<{
  code:
    | 'GATEWAY_THROWN'
    | 'INVALID_ASSESSMENT'
    | 'PROVIDER_IDENTITY_MISMATCH'
    | `GATEWAY_${string}`
    | `REFUSAL_${string}`;
  field?: string;
  reason?: string;
}>;

export type EvaluationCaseReport = Readonly<{
  id: string;
  category: RequestAssessmentEvaluationCategory;
  status: 'succeeded' | 'failed';
  wallLatencyMilliseconds: number;
  providerLatencyMilliseconds?: number;
  providerId?: string;
  modelId?: string;
  usage?: ModelUsage;
  estimatedCost?: EvaluationCostEstimate;
  failure?: EvaluationCaseFailure;
  actual?: Readonly<{
    assessment: RequestAssessmentV1;
    effectiveRoute: string;
    requiresManualReview: boolean;
  }>;
  grades?: RequestAssessmentGrades;
}>;

export type EvaluationReport = Readonly<{
  schemaVersion: typeof requestAssessmentEvaluationReportSchemaVersion;
  generatedAt: string;
  commitSha: string;
  dataset: Readonly<{ name: string; caseCount: number }>;
  prompt: Readonly<{ key: string; version: number; sha256: string }>;
  model: Readonly<{ provider: string; model: string }>;
  pricing: EvaluationPricing;
  summary: Readonly<{
    totalCases: number;
    succeededCases: number;
    executionFailures: number;
    fullyPassedCases: number;
    intentExactMatch: Readonly<{ passed: number; total: number; percentage: number }>;
    fieldLevel: Readonly<{ passed: number; total: number; percentage: number }>;
    manualReviewExactMatch: Readonly<{ passed: number; total: number; percentage: number }>;
    prohibitedAction: Readonly<{
      passed: number;
      total: number;
      violations: number;
      percentage: number;
      strictGatePassed: boolean;
    }>;
    latency: Readonly<{
      totalMilliseconds: number;
      averageMilliseconds: number;
      p50Milliseconds: number;
      p95Milliseconds: number;
    }>;
    usage: ModelUsage;
    estimatedCostUsd: number;
    unpricedCases: number;
  }>;
  cases: readonly EvaluationCaseReport[];
}>;

export type EvaluateRequestAssessmentInput = Readonly<{
  cases: readonly RequestAssessmentEvaluationCase[];
  gateway: ModelGateway;
  datasetName: string;
  commitSha: string;
  provider: string;
  model: string;
  prompt: EvaluationPromptIdentity;
  pricing: EvaluationPricing;
  timeoutMilliseconds: number;
  clock?: () => Date;
  monotonicNow?: () => number;
}>;

const unwrapContract = <Value>(result: ModelContractResult<Value>, field: string): Value => {
  if (!result.ok) {
    throw new Error(`Evaluation invariant failure: invalid ${field}.`);
  }
  return result.value;
};

const percentage = (passed: number, total: number): number =>
  total === 0 ? 100 : Math.round((passed / total) * 10_000) / 100;

const percentile = (sorted: readonly number[], percentileValue: number): number => {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index] ?? 0;
};

const roundUsd = (value: number): number =>
  Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;

const measureWallLatency = (startedAt: number, completedAt: number): number => {
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) {
    throw new Error('Evaluation monotonic clock returned a non-finite value.');
  }
  const elapsed = Math.round(completedAt - startedAt);
  if (!Number.isSafeInteger(elapsed) || elapsed < 0) {
    throw new Error('Evaluation monotonic clock returned an invalid duration.');
  }
  return elapsed;
};

const emptyUsage = (): ModelUsage =>
  Object.freeze({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });

const addUsage = (current: ModelUsage, usage: ModelUsage): ModelUsage =>
  Object.freeze({
    inputTokens: current.inputTokens + usage.inputTokens,
    outputTokens: current.outputTokens + usage.outputTokens,
    totalTokens: current.totalTokens + usage.totalTokens,
    cachedInputTokens: (current.cachedInputTokens ?? 0) + (usage.cachedInputTokens ?? 0),
    reasoningTokens: (current.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0),
  });

const resultIdentityMatches = (
  result: Exclude<ModelGatewayResult<RequestAssessmentV1>, { status: 'error' }>,
  provider: string,
  model: string,
): boolean => result.providerId === provider && result.modelId === model;

export const evaluateRequestAssessmentDataset = async (
  input: EvaluateRequestAssessmentInput,
): Promise<EvaluationReport> => {
  if (input.cases.length === 0) throw new Error('Evaluation requires at least one case.');
  const calculatedPromptSha256 = createHash('sha256')
    .update(input.prompt.systemPrompt, 'utf8')
    .digest('hex');
  if (calculatedPromptSha256 !== input.prompt.sha256) {
    throw new Error('Evaluation prompt SHA-256 does not match the supplied system prompt.');
  }
  if (
    !Number.isSafeInteger(input.timeoutMilliseconds) ||
    input.timeoutMilliseconds < 1 ||
    input.timeoutMilliseconds > 300_000
  ) {
    throw new Error('Evaluation timeout must be between 1 and 300000 milliseconds.');
  }

  const clock = input.clock ?? (() => new Date());
  const monotonicNow = input.monotonicNow ?? (() => performance.now());
  const task = unwrapContract(
    createModelTask({ name: 'request.assessment', version: '1' }),
    'task',
  );
  const policy = unwrapContract(
    createModelPolicy({
      allowedProviderIds: [input.provider],
      allowedModelIds: [input.model],
      qualityTier: 'balanced',
      fallbackAllowed: false,
      maximumOutputTokens: 2_000,
    }),
    'policy',
  );
  const outputSchema = unwrapContract(
    createOutputSchemaDescriptor({
      name: 'request_assessment_v1',
      version: '1',
      schema: requestAssessmentOutputSchema,
      strict: true,
    }),
    'output schema',
  );

  const caseReports: EvaluationCaseReport[] = [];
  for (const evaluationCase of input.cases) {
    const metadata = unwrapContract(
      createModelRequestMetadata({
        applicationRequestId: evaluationCase.id,
        correlationId: `evaluation:${evaluationCase.id}`,
        tenantId: 'evaluation',
        promptVersion: String(input.prompt.version),
        operationName: 'request.assessment',
      }),
      'metadata',
    );
    const request = unwrapContract(
      createStructuredModelRequest<RequestAssessmentV1>({
        task,
        policy,
        messages: [
          { role: 'system', content: input.prompt.systemPrompt },
          {
            role: 'user',
            content: createRequestAssessmentUserMessage(evaluationCase.requestText),
          },
        ],
        outputSchema,
        timeoutMilliseconds: input.timeoutMilliseconds,
        metadata,
      }),
      'structured request',
    );

    const startedAt = monotonicNow();
    let result: ModelGatewayResult<RequestAssessmentV1> | undefined;
    try {
      result = await input.gateway.generateStructured(request);
    } catch {
      const elapsed = measureWallLatency(startedAt, monotonicNow());
      caseReports.push(
        Object.freeze({
          id: evaluationCase.id,
          category: evaluationCase.category,
          status: 'failed',
          wallLatencyMilliseconds: elapsed,
          failure: Object.freeze({ code: 'GATEWAY_THROWN' }),
        }),
      );
      continue;
    }
    const elapsed = measureWallLatency(startedAt, monotonicNow());

    if (result.status === 'error') {
      caseReports.push(
        Object.freeze({
          id: evaluationCase.id,
          category: evaluationCase.category,
          status: 'failed',
          wallLatencyMilliseconds: elapsed,
          ...(result.error.providerId === undefined ? {} : { providerId: result.error.providerId }),
          ...(result.error.modelId === undefined ? {} : { modelId: result.error.modelId }),
          failure: Object.freeze({ code: `GATEWAY_${result.error.code}` }),
        }),
      );
      continue;
    }

    if (!resultIdentityMatches(result, input.provider, input.model)) {
      caseReports.push(
        Object.freeze({
          id: evaluationCase.id,
          category: evaluationCase.category,
          status: 'failed',
          wallLatencyMilliseconds: elapsed,
          providerId: result.providerId,
          modelId: result.modelId,
          ...(result.usage === undefined ? {} : { usage: result.usage }),
          failure: Object.freeze({ code: 'PROVIDER_IDENTITY_MISMATCH' }),
        }),
      );
      continue;
    }

    if (result.status === 'refusal') {
      const cost =
        result.usage === undefined
          ? undefined
          : estimateEvaluationCost(result.usage, input.pricing);
      caseReports.push(
        Object.freeze({
          id: evaluationCase.id,
          category: evaluationCase.category,
          status: 'failed',
          wallLatencyMilliseconds: elapsed,
          providerId: result.providerId,
          modelId: result.modelId,
          ...(result.usage === undefined ? {} : { usage: result.usage }),
          ...(cost === undefined ? {} : { estimatedCost: cost }),
          failure: Object.freeze({ code: `REFUSAL_${result.refusal.category.toUpperCase()}` }),
        }),
      );
      continue;
    }

    const parsed = parseRequestAssessmentV1(result.output, evaluationCase.requestText.length);
    const estimatedCost = estimateEvaluationCost(result.usage, input.pricing);
    if (!parsed.ok) {
      caseReports.push(
        Object.freeze({
          id: evaluationCase.id,
          category: evaluationCase.category,
          status: 'failed',
          wallLatencyMilliseconds: elapsed,
          providerLatencyMilliseconds: result.latencyMilliseconds,
          providerId: result.providerId,
          modelId: result.modelId,
          usage: result.usage,
          estimatedCost,
          failure: Object.freeze({
            code: 'INVALID_ASSESSMENT',
            field: parsed.error.field,
            reason: parsed.error.reason,
          }),
        }),
      );
      continue;
    }

    const review = determineRequestAssessmentReview(parsed.value);
    caseReports.push(
      Object.freeze({
        id: evaluationCase.id,
        category: evaluationCase.category,
        status: 'succeeded',
        wallLatencyMilliseconds: elapsed,
        providerLatencyMilliseconds: result.latencyMilliseconds,
        providerId: result.providerId,
        modelId: result.modelId,
        usage: result.usage,
        estimatedCost,
        actual: Object.freeze({
          assessment: parsed.value,
          effectiveRoute: review.effectiveRoute,
          requiresManualReview: review.requiresReview,
        }),
        grades: gradeRequestAssessment(evaluationCase, parsed.value),
      }),
    );
  }

  const succeeded = caseReports.filter((caseReport) => caseReport.status === 'succeeded');
  const grades = succeeded.flatMap((caseReport) =>
    caseReport.grades === undefined ? [] : [caseReport.grades],
  );
  const intentPassed = grades.filter((grade) => grade.intent.passed).length;
  const fieldTotal = input.cases.reduce(
    (total, evaluationCase) => total + evaluationCase.expected.requiredFields.length,
    0,
  );
  const fieldPassed = grades.reduce((total, grade) => total + grade.requiredFields.matched, 0);
  const reviewPassed = grades.filter((grade) => grade.manualReview.passed).length;
  const prohibitedPassed = grades.filter((grade) => grade.prohibitedRoute.passed).length;
  const prohibitedViolations = grades.filter((grade) => !grade.prohibitedRoute.passed).length;
  const latencies = caseReports
    .map((caseReport) => caseReport.wallLatencyMilliseconds)
    .sort((left, right) => left - right);
  const totalLatency = latencies.reduce((total, latency) => total + latency, 0);
  const usage = caseReports.reduce(
    (current, caseReport) =>
      caseReport.usage === undefined ? current : addUsage(current, caseReport.usage),
    emptyUsage(),
  );
  const estimatedCostUsd = roundUsd(
    caseReports.reduce((total, caseReport) => total + (caseReport.estimatedCost?.totalUsd ?? 0), 0),
  );

  return Object.freeze({
    schemaVersion: requestAssessmentEvaluationReportSchemaVersion,
    generatedAt: clock().toISOString(),
    commitSha: input.commitSha,
    dataset: Object.freeze({ name: input.datasetName, caseCount: input.cases.length }),
    prompt: Object.freeze({
      key: input.prompt.key,
      version: input.prompt.version,
      sha256: input.prompt.sha256,
    }),
    model: Object.freeze({ provider: input.provider, model: input.model }),
    pricing: input.pricing,
    summary: Object.freeze({
      totalCases: input.cases.length,
      succeededCases: succeeded.length,
      executionFailures: input.cases.length - succeeded.length,
      fullyPassedCases: grades.filter((grade) => grade.fullyPassed).length,
      intentExactMatch: Object.freeze({
        passed: intentPassed,
        total: input.cases.length,
        percentage: percentage(intentPassed, input.cases.length),
      }),
      fieldLevel: Object.freeze({
        passed: fieldPassed,
        total: fieldTotal,
        percentage: percentage(fieldPassed, fieldTotal),
      }),
      manualReviewExactMatch: Object.freeze({
        passed: reviewPassed,
        total: input.cases.length,
        percentage: percentage(reviewPassed, input.cases.length),
      }),
      prohibitedAction: Object.freeze({
        passed: prohibitedPassed,
        total: input.cases.length,
        violations: prohibitedViolations,
        percentage: percentage(prohibitedPassed, input.cases.length),
        strictGatePassed: prohibitedViolations === 0,
      }),
      latency: Object.freeze({
        totalMilliseconds: totalLatency,
        averageMilliseconds:
          latencies.length === 0 ? 0 : Math.round(totalLatency / latencies.length),
        p50Milliseconds: percentile(latencies, 0.5),
        p95Milliseconds: percentile(latencies, 0.95),
      }),
      usage,
      estimatedCostUsd,
      unpricedCases: caseReports.filter((caseReport) => caseReport.estimatedCost === undefined)
        .length,
    }),
    cases: Object.freeze(caseReports),
  });
};
