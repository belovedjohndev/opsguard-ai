import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const datasetUrl = new URL(
  '../../../evaluations/datasets/request-assessment-v1.jsonl',
  import.meta.url,
);

const categories = Object.freeze([
  'clear_lead',
  'support',
  'billing',
  'ambiguous',
  'incomplete',
  'adversarial',
  'unrelated',
  'conflicting',
] as const);

const intents = Object.freeze([
  'new_service_request',
  'support_request',
  'billing_request',
  'complaint',
  'cancellation_request',
  'general_inquiry',
  'unrelated',
  'unknown',
] as const);

const routes = Object.freeze([
  'sales',
  'support',
  'billing',
  'operations',
  'manual_review',
  'reject_unrelated',
] as const);

const requiredFieldPaths = Object.freeze([
  'customer.name',
  'customer.email',
  'customer.phone',
  'customer.accountReference',
  'serviceRequest.requestedService',
  'serviceRequest.requestedTiming',
  'serviceRequest.location',
] as const);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
};

const includes = <Value extends string>(values: readonly Value[], value: unknown): value is Value =>
  typeof value === 'string' && values.includes(value as Value);

describe('request-assessment-v1 evaluation dataset', () => {
  it('contains 25 structurally valid, stable, and category-complete cases', () => {
    const lines = readFileSync(datasetUrl, 'utf8')
      .split(/\r?\n/u)
      .filter((line) => line.trim().length > 0);

    expect(lines).toHaveLength(25);

    const seenIds = new Set<string>();
    const seenCategories = new Set<string>();

    for (const [index, line] of lines.entries()) {
      let parsed: unknown;

      expect(
        () => {
          parsed = JSON.parse(line) as unknown;
        },
        `line ${index + 1} must be valid JSON`,
      ).not.toThrow();

      if (!isRecord(parsed)) {
        throw new Error(`Dataset line ${index + 1} must be an object.`);
      }

      expect(
        hasExactKeys(parsed, ['id', 'category', 'requestText', 'expected', 'rationale']),
        `case ${index + 1} must use the exact top-level contract`,
      ).toBe(true);

      const id = parsed['id'];
      expect(typeof id, `case ${index + 1} id`).toBe('string');
      if (typeof id !== 'string') throw new Error(`Case ${index + 1} has an invalid id.`);
      expect(id).toMatch(/^ra-v1-[a-z0-9]+(?:-[a-z0-9]+)*-\d{3}$/u);
      expect(seenIds.has(id), `${id} must be unique`).toBe(false);
      seenIds.add(id);

      const category = parsed['category'];
      expect(includes(categories, category), `${id} category`).toBe(true);
      if (typeof category === 'string') seenCategories.add(category);

      const requestText = parsed['requestText'];
      expect(typeof requestText, `${id} requestText`).toBe('string');
      if (typeof requestText === 'string') expect(requestText.trim().length).toBeGreaterThan(0);

      const rationale = parsed['rationale'];
      expect(typeof rationale, `${id} rationale`).toBe('string');
      if (typeof rationale === 'string') expect(rationale.trim().length).toBeGreaterThan(20);

      const expected = parsed['expected'];
      expect(isRecord(expected), `${id} expected`).toBe(true);
      if (!isRecord(expected)) throw new Error(`${id} has an invalid expected object.`);

      expect(
        hasExactKeys(expected, [
          'intent',
          'requiredFields',
          'prohibitedRoutes',
          'requiresManualReview',
        ]),
        `${id} expected contract`,
      ).toBe(true);

      expect(includes(intents, expected['intent']), `${id} expected intent`).toBe(true);
      expect(typeof expected['requiresManualReview'], `${id} review expectation`).toBe('boolean');

      const requiredFields = expected['requiredFields'];
      expect(Array.isArray(requiredFields), `${id} requiredFields`).toBe(true);
      if (!Array.isArray(requiredFields)) {
        throw new Error(`${id} requiredFields must be an array.`);
      }

      const seenPaths = new Set<string>();
      for (const requiredField of requiredFields) {
        expect(isRecord(requiredField), `${id} required field`).toBe(true);
        if (!isRecord(requiredField)) throw new Error(`${id} has an invalid required field.`);

        expect(hasExactKeys(requiredField, ['path', 'value']), `${id} required field keys`).toBe(
          true,
        );
        const path = requiredField['path'];
        expect(includes(requiredFieldPaths, path), `${id} required field path`).toBe(true);
        if (typeof path === 'string') {
          expect(seenPaths.has(path), `${id} required field paths must be unique`).toBe(false);
          seenPaths.add(path);
        }

        const value = requiredField['value'];
        expect(
          value === null || ['string', 'number', 'boolean'].includes(typeof value),
          `${id} required field value`,
        ).toBe(true);
        if (typeof value === 'string') expect(value.trim().length).toBeGreaterThan(0);
      }

      const prohibitedRoutes = expected['prohibitedRoutes'];
      expect(Array.isArray(prohibitedRoutes), `${id} prohibitedRoutes`).toBe(true);
      if (!Array.isArray(prohibitedRoutes)) {
        throw new Error(`${id} prohibitedRoutes must be an array.`);
      }

      const uniqueRoutes = new Set<string>();
      for (const route of prohibitedRoutes) {
        expect(includes(routes, route), `${id} prohibited route`).toBe(true);
        if (typeof route === 'string') uniqueRoutes.add(route);
      }
      expect(uniqueRoutes.size, `${id} prohibited routes must be unique`).toBe(
        prohibitedRoutes.length,
      );
    }

    expect(seenIds.size).toBe(25);
    expect([...seenCategories].sort()).toEqual([...categories].sort());
  });
});
