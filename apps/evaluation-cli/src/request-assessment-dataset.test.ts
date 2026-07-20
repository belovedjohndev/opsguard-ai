import { describe, expect, it } from 'vitest';

import {
  loadRequestAssessmentDataset,
  requestAssessmentEvaluationCategories,
} from './request-assessment-dataset.js';

describe('request-assessment-v1 evaluation dataset', () => {
  it('contains 25 valid, stable, and category-complete cases', async () => {
    const cases = await loadRequestAssessmentDataset();

    expect(cases).toHaveLength(25);
    expect(new Set(cases.map((evaluationCase) => evaluationCase.id)).size).toBe(25);
    expect([...new Set(cases.map((evaluationCase) => evaluationCase.category))].sort()).toEqual(
      [...requestAssessmentEvaluationCategories].sort(),
    );
    expect(cases.every((evaluationCase) => evaluationCase.rationale.length > 20)).toBe(true);
  });
});
