import type { JsonValue } from '@opsguard/ai-core';
import { describe, expect, it } from 'vitest';

import { requestAssessmentOutputSchema } from './request-assessment-prompt.js';

const unsupportedStrictSchemaKeywords = Object.freeze([
  'minLength',
  'maxLength',
  'uniqueItems',
] as const);

const findUnsupportedKeywords = (value: JsonValue, path = '$'): readonly string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => findUnsupportedKeywords(entry, `${path}[${index}]`));
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  return Object.entries(value).flatMap(([key, entry]) => [
    ...(unsupportedStrictSchemaKeywords.includes(
      key as (typeof unsupportedStrictSchemaKeywords)[number],
    )
      ? [`${path}.${key}`]
      : []),
    ...findUnsupportedKeywords(entry, `${path}.${key}`),
  ]);
};

describe('request-assessment output schema', () => {
  it('uses only strict structured-output keywords supported by the provider boundary', () => {
    expect(findUnsupportedKeywords(requestAssessmentOutputSchema)).toEqual([]);
  });

  it('keeps all object properties closed and required', () => {
    const root = requestAssessmentOutputSchema as Readonly<Record<string, JsonValue>>;

    expect(root['type']).toBe('object');
    expect(root['additionalProperties']).toBe(false);
    expect(root['required']).toEqual([
      'schemaVersion',
      'intent',
      'confidence',
      'customer',
      'serviceRequest',
      'urgencyIndicators',
      'missingInformation',
      'proposedRoute',
      'evidenceReferences',
    ]);
  });
});
