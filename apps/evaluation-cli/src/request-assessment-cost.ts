import type { ModelUsage } from '@opsguard/ai-core';

export type EvaluationPricing = Readonly<{
  label: string;
  inputUsdPerMillionTokens: number;
  outputUsdPerMillionTokens: number;
  cachedInputUsdPerMillionTokens: number;
}>;

export type EvaluationCostEstimate = Readonly<{
  inputUsd: number;
  cachedInputUsd: number;
  outputUsd: number;
  totalUsd: number;
}>;

const pricingVariables = Object.freeze({
  label: 'EVAL_REQUEST_ASSESSMENT_PRICING_LABEL',
  input: 'EVAL_REQUEST_ASSESSMENT_INPUT_USD_PER_MILLION_TOKENS',
  output: 'EVAL_REQUEST_ASSESSMENT_OUTPUT_USD_PER_MILLION_TOKENS',
  cachedInput: 'EVAL_REQUEST_ASSESSMENT_CACHED_INPUT_USD_PER_MILLION_TOKENS',
} as const);

const parseRate = (
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
  fallback?: number,
): number => {
  const raw = environment[name]?.trim();
  if ((raw === undefined || raw.length === 0) && fallback !== undefined) return fallback;
  if (raw === undefined || raw.length === 0) {
    throw new Error(`Evaluation configuration error: ${name} is required.`);
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Evaluation configuration error: ${name} must be a non-negative number.`);
  }
  return value;
};

export const resolveEvaluationPricing = (
  environment: Readonly<Record<string, string | undefined>>,
): EvaluationPricing => {
  const label = environment[pricingVariables.label]?.trim();
  if (label === undefined || label.length === 0 || label.length > 255) {
    throw new Error(
      `Evaluation configuration error: ${pricingVariables.label} is required and must not exceed 255 characters.`,
    );
  }

  const inputUsdPerMillionTokens = parseRate(environment, pricingVariables.input);
  const outputUsdPerMillionTokens = parseRate(environment, pricingVariables.output);
  const cachedInputUsdPerMillionTokens = parseRate(
    environment,
    pricingVariables.cachedInput,
    inputUsdPerMillionTokens,
  );

  return Object.freeze({
    label,
    inputUsdPerMillionTokens,
    outputUsdPerMillionTokens,
    cachedInputUsdPerMillionTokens,
  });
};

const roundUsd = (value: number): number =>
  Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;

export const estimateEvaluationCost = (
  usage: ModelUsage,
  pricing: EvaluationPricing,
): EvaluationCostEstimate => {
  const cachedInputTokens = Math.min(usage.cachedInputTokens ?? 0, usage.inputTokens);
  const uncachedInputTokens = usage.inputTokens - cachedInputTokens;
  const inputUsd = roundUsd((uncachedInputTokens * pricing.inputUsdPerMillionTokens) / 1_000_000);
  const cachedInputUsd = roundUsd(
    (cachedInputTokens * pricing.cachedInputUsdPerMillionTokens) / 1_000_000,
  );
  const outputUsd = roundUsd((usage.outputTokens * pricing.outputUsdPerMillionTokens) / 1_000_000);

  return Object.freeze({
    inputUsd,
    cachedInputUsd,
    outputUsd,
    totalUsd: roundUsd(inputUsd + cachedInputUsd + outputUsd),
  });
};
