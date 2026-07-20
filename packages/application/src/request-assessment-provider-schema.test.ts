import type { JsonObject, JsonValue } from '@opsguard/ai-core';
import { describe, expect, it } from 'vitest';

import { requestAssessmentOutputSchema } from './request-assessment-prompt.js';

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asObject = (value: JsonValue | undefined, field: string): JsonObject => {
  if (!isJsonObject(value)) {
    throw new Error(`${field} must be a JSON schema object.`);
  }
  return value;
};

describe('request-assessment provider schema types', () => {
  it('declares explicit string types for fixed and enum-constrained fields', () => {
    const root = asObject(requestAssessmentOutputSchema, 'root');
    const properties = asObject(root['properties'], 'properties');
    const urgency = asObject(properties['urgencyIndicators'], 'urgencyIndicators');
    const urgencyItems = asObject(urgency['items'], 'urgencyIndicators.items');

    expect(properties['schemaVersion']).toEqual({
      type: 'string',
      enum: ['request-assessment-v1'],
    });
    expect(asObject(properties['intent'], 'intent')['type']).toBe('string');
    expect(asObject(properties['proposedRoute'], 'proposedRoute')['type']).toBe('string');
    expect(urgencyItems['type']).toBe('string');
  });
});
