import { describe, expect, it } from 'vitest';

import { estimateEvaluationCost, resolveEvaluationPricing } from './request-assessment-cost.js';

describe('request-assessment evaluation cost', () => {
  it('prices uncached input, cached input, and output tokens without double counting', () => {
    const pricing = resolveEvaluationPricing({
      EVAL_REQUEST_ASSESSMENT_PRICING_LABEL: 'test-rates',
      EVAL_REQUEST_ASSESSMENT_INPUT_USD_PER_MILLION_TOKENS: '2',
      EVAL_REQUEST_ASSESSMENT_OUTPUT_USD_PER_MILLION_TOKENS: '8',
      EVAL_REQUEST_ASSESSMENT_CACHED_INPUT_USD_PER_MILLION_TOKENS: '1',
    });

    expect(
      estimateEvaluationCost(
        {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          cachedInputTokens: 20,
        },
        pricing,
      ),
    ).toEqual({
      inputUsd: 0.00016,
      cachedInputUsd: 0.00002,
      outputUsd: 0.0004,
      totalUsd: 0.00058,
    });
  });

  it('uses the input rate when no cached-input rate is configured', () => {
    expect(
      resolveEvaluationPricing({
        EVAL_REQUEST_ASSESSMENT_PRICING_LABEL: 'fallback-rates',
        EVAL_REQUEST_ASSESSMENT_INPUT_USD_PER_MILLION_TOKENS: '3',
        EVAL_REQUEST_ASSESSMENT_OUTPUT_USD_PER_MILLION_TOKENS: '9',
      }).cachedInputUsdPerMillionTokens,
    ).toBe(3);
  });
});
