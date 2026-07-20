import { execFileSync } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { createOpenAIModelGateway } from '@opsguard/ai-core/openai';
import {
  requestAssessmentPromptKey,
  requestAssessmentPromptSha256,
  requestAssessmentPromptVersion,
  requestAssessmentSystemPrompt,
} from '@opsguard/application';
import { resolveOpenAIRuntimeConfig } from '@opsguard/config';

import { resolveEvaluationPricing } from './request-assessment-cost.js';
import {
  loadRequestAssessmentDataset,
  requestAssessmentDatasetUrl,
} from './request-assessment-dataset.js';
import {
  evaluateRequestAssessmentDataset,
  type EvaluationReport,
} from './request-assessment-evaluator.js';

const commitShaPattern = /^[0-9a-f]{7,64}$/iu;

const runGit = (arguments_: readonly string[]): string =>
  execFileSync('git', arguments_, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();

const resolveRepositoryMetadata = (
  environment: Readonly<Record<string, string | undefined>>,
): Readonly<{ root: string; commitSha: string }> => {
  const root = runGit(['rev-parse', '--show-toplevel']);
  const configuredCommit = environment['EVAL_REQUEST_ASSESSMENT_COMMIT_SHA']?.trim();
  const commitSha = configuredCommit ?? runGit(['rev-parse', 'HEAD']);
  if (!commitShaPattern.test(commitSha)) {
    throw new Error('Evaluation configuration error: commit SHA is invalid.');
  }
  return Object.freeze({ root, commitSha });
};

const resolveTimeout = (environment: Readonly<Record<string, string | undefined>>): number => {
  const raw = environment['EVAL_REQUEST_ASSESSMENT_TIMEOUT_MS']?.trim() ?? '30000';
  const timeout = Number(raw);
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 300_000) {
    throw new Error(
      'Evaluation configuration error: EVAL_REQUEST_ASSESSMENT_TIMEOUT_MS must be an integer from 1 to 300000.',
    );
  }
  return timeout;
};

const reportFileName = (generatedAt: string): string =>
  `request-assessment-v1-${generatedAt.replace(/[:.]/gu, '-')}.json`;

const resolveReportPath = (
  repositoryRoot: string,
  generatedAt: string,
  environment: Readonly<Record<string, string | undefined>>,
): string => {
  const configured = environment['EVAL_REQUEST_ASSESSMENT_REPORT_PATH']?.trim();
  if (configured === undefined || configured.length === 0) {
    return join(repositoryRoot, 'evaluations', 'reports', reportFileName(generatedAt));
  }
  return isAbsolute(configured) ? configured : resolve(repositoryRoot, configured);
};

const writeReportAtomically = async (
  reportPath: string,
  report: EvaluationReport,
): Promise<void> => {
  await mkdir(dirname(reportPath), { recursive: true });
  const temporaryPath = `${reportPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  await rename(temporaryPath, reportPath);
};

const printSummary = (report: EvaluationReport, reportPath: string): void => {
  const { summary } = report;
  console.log(`Evaluation report: ${reportPath}`);
  console.log(`Cases: ${summary.succeededCases}/${summary.totalCases} executed successfully`);
  console.log(
    `Intent exact match: ${summary.intentExactMatch.passed}/${summary.intentExactMatch.total} (${summary.intentExactMatch.percentage}%)`,
  );
  console.log(
    `Required fields: ${summary.fieldLevel.passed}/${summary.fieldLevel.total} (${summary.fieldLevel.percentage}%)`,
  );
  console.log(
    `Manual review: ${summary.manualReviewExactMatch.passed}/${summary.manualReviewExactMatch.total} (${summary.manualReviewExactMatch.percentage}%)`,
  );
  console.log(`Prohibited route violations: ${summary.prohibitedAction.violations}`);
  console.log(`Estimated cost: USD ${summary.estimatedCostUsd}`);
};

const main = async (): Promise<void> => {
  const environment = process.env;
  const repository = resolveRepositoryMetadata(environment);
  const openAI = resolveOpenAIRuntimeConfig(environment);
  const pricing = resolveEvaluationPricing(environment);
  const cases = await loadRequestAssessmentDataset(requestAssessmentDatasetUrl);
  const gateway = createOpenAIModelGateway({
    apiKey: openAI.apiKey,
    modelId: openAI.modelId,
  });

  const report = await evaluateRequestAssessmentDataset({
    cases,
    gateway,
    datasetName: 'request-assessment-v1',
    commitSha: repository.commitSha,
    provider: 'openai',
    model: openAI.modelId,
    prompt: {
      key: requestAssessmentPromptKey,
      version: requestAssessmentPromptVersion,
      sha256: requestAssessmentPromptSha256,
      systemPrompt: requestAssessmentSystemPrompt,
    },
    pricing,
    timeoutMilliseconds: resolveTimeout(environment),
  });
  const reportPath = resolveReportPath(repository.root, report.generatedAt, environment);
  await writeReportAtomically(reportPath, report);
  printSummary(report, reportPath);

  if (report.summary.executionFailures > 0 || !report.summary.prohibitedAction.strictGatePassed) {
    process.exitCode = 1;
  }
};

void main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Request-assessment evaluation failed unexpectedly.';
  console.error(message);
  process.exitCode = 2;
});
