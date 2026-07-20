# Request Assessment V1 Evaluation Runner

**Roadmap slice:** Roadmap Day 12 — Evaluation Runner
**Status:** Implemented

## Objective

Execute the versioned Day 11 dataset through the provider-neutral
`ModelGateway`, validate structured outputs with the Day 10 domain parser, grade
deterministic expectations, and write one machine-readable JSON report.

The runner measures model behavior. It does not authorize production actions,
mutate application state, persist database records, or establish a CI release
threshold.

## Command

```bash
pnpm eval:request-assessment
```

The command builds the required workspaces, runs all 25 cases sequentially, prints
a compact summary, and writes an ignored report under:

```text
evaluations/reports/request-assessment-v1-<timestamp>.json
```

`EVAL_REQUEST_ASSESSMENT_REPORT_PATH` may override the output path.

## Configuration

The runner requires the existing OpenAI adapter configuration:

```text
OPENAI_API_KEY
OPENAI_MODEL
```

It also requires an explicit pricing basis:

```text
EVAL_REQUEST_ASSESSMENT_PRICING_LABEL
EVAL_REQUEST_ASSESSMENT_INPUT_USD_PER_MILLION_TOKENS
EVAL_REQUEST_ASSESSMENT_OUTPUT_USD_PER_MILLION_TOKENS
EVAL_REQUEST_ASSESSMENT_CACHED_INPUT_USD_PER_MILLION_TOKENS
EVAL_REQUEST_ASSESSMENT_TIMEOUT_MS
```

Rates are USD per one million tokens. Cached-input pricing falls back to the
normal input rate when omitted. Prices are configuration-owned because provider
pricing changes independently of source code. The report records the exact
label and rates used for each run.

The API key must remain in an ignored local environment file or approved secret
manager and must never be pasted into reports, logs, source, or shell history.

## Execution boundary

For each case, the runner:

1. builds the same task, policy, messages, strict output schema, and prompt
   identity used by request assessment;
2. sends the synthetic case through `ModelGateway`;
3. verifies that the reported SHA-256 matches the exact system prompt;
4. rejects provider/model identity mismatches;
5. applies `parseRequestAssessmentV1`;
6. derives the deterministic manual-review decision;
7. executes all graders;
8. records sanitized diagnostics, latency, usage, and estimated cost.

Cases run sequentially to preserve deterministic ordering and avoid an
unbounded provider burst.

The evaluation policy allows up to 2,000 output tokens. This bound includes
provider reasoning tokens as well as the structured JSON and leaves sufficient
headroom for the bounded assessment schema without adding retries or fallback.

Valid `missingInformation` identifiers are canonicalized before grading because
their order is not semantic. Intent-to-route compatibility remains deterministic:
an incompatible proposed route forces effective `manual_review`, while the strict
prohibited-route grader still records the model proposal as a safety violation.
Evidence remains optional. Structurally valid evidence items that exceed the known
raw request boundary are omitted rather than clamped or allowed to invalidate an
otherwise valid assessment. Malformed shapes, non-integer offsets, negative starts,
and empty or reversed ranges remain deterministic validation failures.

## Graders

### Exact-match grader

Strictly compares:

- expected intent against validated assessment intent;
- expected manual-review decision against deterministic review policy.

### Field-level grader

Checks only the dataset's required field paths. String comparisons apply Unicode
NFKC normalization, trim outer whitespace, collapse internal whitespace, and
compare case-insensitively. Non-string scalar values use exact equality.

Free-form summaries are deliberately excluded from initial scoring.

### Prohibited-action grader

Fails when the model's proposed route appears in the case's
`prohibitedRoutes`. This is a strict pass/fail safety gate. Invalid output,
refusal, provider failure, or thrown gateway calls are execution failures rather
than route violations.

## Metrics

The JSON report contains:

- commit SHA;
- dataset name and case count;
- prompt key, version, and SHA-256;
- configured and observed provider/model identity;
- exact intent and review accuracy;
- required-field match rate;
- prohibited-route pass rate and violation count;
- per-case wall latency and provider latency;
- aggregate p50 and p95 wall latency;
- token usage;
- configured pricing basis and estimated USD cost;
- sanitized per-case failures.

Raw provider responses, API keys, complete prompts, and unvalidated model output
are not stored.

## Exit codes

- `0`: execution completed and no prohibited-route violation occurred.
- `1`: one or more execution failures or prohibited-route violations occurred.
- `2`: configuration, dataset, Git metadata, or report I/O failed.

Intent, review, and field mismatches are measured but are not yet release gates.
Release thresholds remain deferred.

## Verification

Automated tests must prove:

- the 25-case JSONL dataset loads through the runtime parser;
- exact and field graders report expected matches;
- prohibited routes fail strictly;
- latency, usage, pricing, and provenance appear in the report;
- a deliberately bad prompt fixture causes a measurable regression;
- provider failures do not expose raw output or secrets.

```bash
pnpm install
pnpm --filter @opsguard/evaluation-cli lint
pnpm --filter @opsguard/evaluation-cli typecheck
pnpm --filter @opsguard/evaluation-cli test
pnpm --filter @opsguard/evaluation-cli build
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

## Scope boundary

Roadmap Day 12 does not add:

- database tables or evaluation-run persistence;
- API routes or React UI;
- CI release thresholds;
- OpenTelemetry instrumentation;
- Temporal workflows;
- retries, fallback, parallel execution, or production side effects;
- Roadmap Day 13 observability work.
