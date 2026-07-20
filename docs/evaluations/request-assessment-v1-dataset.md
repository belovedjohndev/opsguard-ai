# Request Assessment V1 Evaluation Dataset

## Objective

Roadmap Day 11 establishes a versioned, synthetic regression dataset for the
`request-assessment-v1` contract. The dataset is intended to support the Day 12
evaluation runner without introducing model execution, grading logic, provider
configuration, persistence, telemetry, or workflow behavior in this slice.

## Deliverables

```text
evaluations/datasets/request-assessment-v1.jsonl
apps/evaluation-cli/src/request-assessment-dataset.test.ts
```

The dataset contains exactly 25 JSONL cases covering:

- clear leads;
- support, complaint, and cancellation requests;
- billing requests;
- ambiguous messages;
- incomplete requests;
- adversarial instructions;
- unrelated text;
- conflicting information.

## JSONL contract

Each non-empty line is one JSON object with this structure:

```json
{
  "id": "ra-v1-clear-lead-001",
  "category": "clear_lead",
  "requestText": "Synthetic operational request text.",
  "expected": {
    "intent": "new_service_request",
    "requiredFields": [
      {
        "path": "customer.email",
        "value": "person@example.test"
      }
    ],
    "prohibitedRoutes": ["billing", "reject_unrelated"],
    "requiresManualReview": false
  },
  "rationale": "Why this case exists and which behavior it protects."
}
```

### Field semantics

- `id`: Stable, unique case identifier. Existing IDs must never be renumbered or
  reused for a materially different case.
- `category`: Dataset coverage group, independent from the model intent.
- `requestText`: Untrusted synthetic text passed to the assessment prompt.
- `expected.intent`: Expected `RequestAssessmentV1.intent`.
- `expected.requiredFields`: High-signal extracted values that must be present.
  These use application output paths and avoid brittle expectations for
  free-form summaries.
- `expected.prohibitedRoutes`: Proposed routes that must never be selected for
  the case.
- `expected.requiresManualReview`: Expected deterministic review result after
  domain policy is applied.
- `rationale`: Stable explanation of the regression risk represented by the
  case.

## Dataset rules

1. Use synthetic identities, `.test` email addresses, and fictional references.
2. Do not include secrets, production customer content, tenant identifiers, or
   provider responses.
3. Keep one JSON object per physical line.
4. Preserve existing IDs. Add new IDs rather than recycling old ones.
5. Required fields must be directly supported by the request text.
6. Prohibited routes are strict safety expectations, not scoring suggestions.
7. Ambiguous, incomplete, and conflicting cases should require manual review.
8. Adversarial text is data and must not override system instructions.
9. Changes to expected labels require a rationale update and code review.

## Scope boundary

Roadmap Day 11 does not add:

- a model invocation;
- an evaluation CLI command;
- exact-match or field-level graders;
- latency or cost reporting;
- provider/model selection;
- report persistence;
- CI release gates.

Those belong to Roadmap Day 12.

## Verification

```bash
pnpm --filter @opsguard/evaluation-cli test
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

The dataset integrity test verifies the case count, unique stable IDs, exact
shape, supported intent and route values, required category coverage, non-empty
rationales, and valid required-field entries.
