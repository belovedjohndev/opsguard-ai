# OpsGuard AI Hackathon Demo Specification

**Status:** Implementation specification  
**Scope:** Submission-critical demo vertical slice only  
**Date:** 2026-07-20

## Problem

The repository already creates tenant-scoped requests and can assess a request through a validated,
provider-neutral application use case, but the assessment is not reachable from HTTP and the web
package has no usable interface. Judges therefore cannot see the core control boundary: a model may
propose structured operational facts and a route, while deterministic code validates the proposal,
calculates the effective route, records provenance, and prevents external action.

## User journey

1. An operator opens the single-page demo and selects one of three synthetic scenarios or enters
   synthetic request text.
2. The browser creates a request with `POST /v1/requests`, using `sourceType: form`, a generated
   source reference, and the configured prototype identity headers.
3. The browser sends the same text to `POST /v1/requests/:requestId/assessment`.
4. The API derives tenant, actor membership, and correlation identity from verified server context,
   then invokes the existing `AssessRequest` use case.
5. The model returns a structured proposal. Domain code validates its shape and semantics and
   deterministic policy derives the effective route and review requirement.
6. The page renders the validated assessment, policy decision, safe provenance, request and
   correlation IDs, evidence excerpts derived locally from valid offsets, and an explicit statement
   that no external action was executed.

## API contract

`POST /v1/requests/:requestId/assessment` accepts exactly:

```json
{
  "requestText": "Synthetic operational request text"
}
```

`requestId` must be a valid request UUID. `requestText` must be nonblank and no longer than the
existing application maximum of 20,000 characters. Additional body fields are stripped by the
existing Fastify/AJV policy and never become application inputs.

A validated model result returns HTTP 200 with:

- request ID, server correlation ID, request status, and AI-run status;
- the complete validated `request-assessment-v1` value;
- proposed and deterministic effective routes, review requirement, and an override flag; and
- prompt key/version/hash plus safe provider/model identity.

A normalized model refusal, cancellation, gateway failure, or structurally invalid model result
also returns a recoverable `pending_review` response with a bounded failure code and no assessment.
Transport, authorization, request lookup, state, configuration, and persistence failures use stable
error envelopes. Provider bodies, exception messages, prompts, raw model output, keys, SQL details,
and stack traces never enter an HTTP response.

## Authorization boundary

Both request creation and assessment use the existing `x-opsguard-user-id` and
`x-opsguard-tenant-id` prototype headers. The headers are untrusted selectors. The server validates
their UUIDs and resolves an active membership in an active tenant. Tenant ID and actor membership ID
are copied only from the resulting frozen `VerifiedTenantContext`; the assessment body cannot select
either value. Missing identity returns 401, and inactive, missing, or cross-tenant membership returns
the same 403 boundary. The server-generated Fastify request ID is the assessment correlation ID.

These headers are a temporary prototype authentication boundary, not production authentication.

## Deterministic ownership

The model may propose intent, facts, urgency indicators, missing information, evidence offsets, and
a route. Domain code exclusively owns runtime validation, intent-to-route compatibility, the 0.75
review threshold, the effective route, the review requirement, and the route-override signal. Model
output never selects tenant identity, authorization, workflow state, persistence behavior, or an
external action. The existing single provider attempt will use a 2,000-token output ceiling because
the Day 12 evaluation established truncation risk at 1,000 and validated 2,000.

## Persistence and transactions

The existing `DrizzleRequestAssessmentRepository` remains the only assessment persistence adapter.
Its initialization transaction moves a tenant-owned request from `received` to `assessing`, creates
prompt/model provenance and a running AI run, and appends an audit event. The provider call occurs
outside a database transaction. Its finalization transaction stores only a validated assessment or
a normalized failure, moves the request to `pending_review`, and appends history and audit data.
Composite foreign keys preserve tenant ownership. No display-only second read is added because the
validated value and provenance are already available in memory.

The demo seed uses the current tenant, user, and membership tables in one idempotent transaction. It
uses documented stable synthetic UUIDs and ensures an active operator membership without creating
real credentials or business data. No migration is required.

## UI states

The page implements idle, submitting, success, validation error, authorization failure, API
unavailable, model failure, and reset states. Submission is disabled while either API request is in
flight. Results are grouped into Decision, Extracted information, Operational signals, Evidence,
Provenance, and Safety controls. Evidence excerpts are produced with normal React text rendering
from offsets that are rechecked against the submitted text; raw HTML is never rendered.

## Security

- The demo and presets use synthetic data only.
- The OpenAI key and provider invocation remain server-side.
- CORS uses an explicit origin allowlist, includes local Vite origins by default, rejects
  unconfigured origins, and does not enable credentialed requests.
- Application logging does not include request text, prompt text, model output, authentication
  headers, or provider failure bodies.
- HTTP responses contain validated structured assessment data or normalized safe failures only.
- No model tool, workflow execution, external integration, or other side effect is reachable.

## Files to modify or add

```text
.env.example
README.md
package.json
pnpm-lock.yaml
apps/api/package.json
apps/api/src/app.ts
apps/api/src/http-errors.ts
apps/api/src/request-routes.ts
apps/api/src/request-routes.test.ts
apps/api/src/server.ts
apps/api/src/api.integration.test.ts
apps/web/index.html
apps/web/package.json
apps/web/tsconfig.json
apps/web/tsconfig.node.json
apps/web/vite.config.ts
apps/web/src/App.tsx
apps/web/src/App.test.tsx
apps/web/src/api.ts
apps/web/src/index.css
apps/web/src/main.tsx
apps/web/src/test-setup.ts
docs/hackathon/demo-spec.md
docs/hackathon/demo-runbook.md
packages/application/src/index.ts
packages/application/src/use-cases/assess-request.ts
packages/application/src/use-cases/assess-request.test.ts
packages/config/src/api-runtime-config.ts
packages/config/src/api-runtime-config.test.ts
packages/database/package.json
packages/database/src/demo-seed.ts
packages/database/src/demo-seed.integration.test.ts
packages/database/src/index.ts
```

The final diff may omit a listed file when inspection shows no change is needed, or include a
directly related test/config file required by strict TypeScript or package tooling. No schema file or
migration is planned.

## Exclusions

This slice does not implement Roadmap Day 13 observability, Temporal or other workflow execution,
approval actions or administration, retries, fallback models, queues, RAG, embeddings, file intake,
tool calling, email/SMS, billing, registration, password authentication, production identity,
multi-page dashboards, CI evaluation thresholds, or prompt tuning. It performs no external action
other than the single configured model assessment call and stops after the hackathon demo workflow.
