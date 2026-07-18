# Request lifecycle and application boundary

**Roadmap slice:** Week 1, Day 5 — Domain and Application Ports  
**Status:** Accepted implementation specification  
**Date:** 2026-07-18

## Purpose

This document defines the first deterministic request domain model and the application boundary
that creates requests. It uses the request vocabulary established by the Day 4 PostgreSQL schema
without making the domain depend on PostgreSQL, Drizzle, HTTP, authentication, workflow, or model
providers.

The application owns state transitions. Repository adapters persist only aggregates and transition
facts already validated by the domain. A model may propose information for later decisions, but no
model may authorize or perform a request transition.

## Request aggregate boundary

The request aggregate owns:

- its stable request and tenant identifiers;
- the accepted intake source type and tenant-scoped source reference;
- its optional creator tenant-membership identifier;
- its current status;
- creation and last-update timestamps;
- construction of the initial `received` state; and
- validation of every later status transition.

The aggregate does not own authentication, authorization, source verification, deduplication
storage, persistence transactions, model assessment, approval records, audit persistence, external
side effects, or workflow orchestration.

The aggregate is immutable. Creation and transition operations return new values. Callers cannot
assign status directly, and a failed transition leaves the original aggregate unchanged.

## Tenant ownership invariant

Every request requires one `TenantId`. A human creator or transition actor is represented by an
optional `TenantMembershipId`, matching the nullable membership references in the Day 4 schema.
Application code must obtain these identifiers from trusted execution context. They are never
accepted as authority from an HTTP body, request content, model output, or persistence record from
another tenant.

Day 5 domain values preserve explicit tenant scope. Future repository adapters must use the Day 4
composite foreign keys and tenant predicates to enforce relational tenant consistency.

## Branded identifiers

`TenantId`, `TenantMembershipId`, and `RequestId` are distinct compile-time branded strings. Their
public constructors accept only canonical, non-zero UUID strings and return explicit `Result`
values. No public unsafe cast is provided as the normal construction path.

`UserId` is deliberately absent because neither the request aggregate nor the first use case needs
one. Membership identity is the actor identity relevant to Day 5.

## Request source

The aggregate accepts exactly the Day 4 request source values:

- `form`;
- `email`;
- `webhook`; and
- `service_account`.

The source reference must contain non-whitespace content and must not exceed the database column
limit of 255 characters. The domain preserves the accepted value because later source-specific
normalization and signature verification belong at ingress boundaries.

## Request statuses

The canonical domain values exactly match the Day 4 `request_status` enum:

- `received`;
- `assessing`;
- `needs_information`;
- `pending_review`;
- `rejected`;
- `completed`; and
- `failed`.

`received` is the only initial status and can be assigned only by aggregate creation.

`rejected`, `completed`, and `failed` are terminal on Day 5. They have no outgoing transitions.
Recovery or reopening semantics would require an explicit later roadmap decision rather than an
implicit transition.

Self-transitions are prohibited for every status. Re-recording the same state is not a state
change and must not create status history.

## Allowed transition matrix

`yes` means the transition is allowed. Every unlisted or `—` pair is prohibited.

| Current status | received | assessing | needs_information | pending_review | rejected | completed | failed |
|---|---:|---:|---:|---:|---:|---:|---:|
| `received` | — | yes | — | — | — | — | yes |
| `assessing` | — | — | yes | yes | yes | yes | yes |
| `needs_information` | — | yes | — | — | — | — | yes |
| `pending_review` | — | yes | yes | — | yes | yes | yes |
| `rejected` | — | — | — | — | — | — | — |
| `completed` | — | — | — | — | — | — | — |
| `failed` | — | — | — | — | — | — | — |

The matrix reflects the accepted workflow:

- a received request must enter assessment before any business outcome;
- assessment may identify missing information, require review, determine rejection, complete a
  permitted request, or fail;
- new information returns a waiting request to assessment;
- review may return the request for reassessment or information, or reach a final outcome; and
- an explicit operational failure may terminate any nonterminal work state.

Direct jumps to `received` are never allowed. A direct `received` to `rejected` or `completed` jump
is prohibited because validation and deterministic assessment must occur first.

## Transition metadata

A successful non-initial transition contains only the facts required by future status-history
persistence:

- tenant ID;
- request ID;
- previous status;
- next status;
- caller-supplied changed-at timestamp; and
- optional caller-supplied actor membership ID.

The changed-at timestamp must be valid and must not precede the aggregate's current update time.
The domain does not generate a history-row identifier because the Day 4 database supplies that
identifier and it is not needed for domain behavior.

Aggregate creation produces an initial status-history value with `previousStatus: null`,
`nextStatus: received`, the creation timestamp, and the optional creator membership ID.

## Domain error policy

Expected validation and transition failures are safe, stable, discriminated values rather than
exceptions. Day 5 defines errors for:

- malformed or zero identifiers;
- invalid request fields or timestamps;
- prohibited self-transitions or unlisted transitions; and
- attempts to leave a terminal status.

Errors may identify a safe field, identifier kind, current status, attempted status, and reason.
They must not contain request bodies, customer messages, credentials, SQL details, provider
payloads, stack traces, or HTTP status codes. Unexpected programming defects may still throw.

## Result policy

Expected failures use a small explicit `Result<Value, Error>` union:

- success is discriminated by `ok: true` and carries `value`;
- failure is discriminated by `ok: false` and carries `error`; and
- consumers narrow exhaustively through the `ok` discriminator.

The abstraction deliberately does not grow into a general functional-programming library and has
no dependency on transport, persistence, or provider errors.

## Application ports

### Request repository

The application-owned request repository port exposes only the operation required by
`CreateRequest`. Its atomic create contract receives the validated request aggregate and initial
status-history value, then persists both in one transaction: commit both or neither.

The port carries tenant scope through domain values and returns repository-neutral errors for a
conflict, temporary unavailability, or an unexpected persistence failure. It does not expose
generic CRUD, Drizzle records, PostgreSQL error codes, SQLSTATE, or transaction primitives.

Day 5 defines the port but no PostgreSQL/Drizzle adapter or transaction implementation.

### Model gateway

No model-gateway interface is created on Day 5. The first use case does not use a model, and the
provider-independent request, response, refusal, usage, timeout, and structured-output semantics
are intentionally designed on Day 8. An empty interface or unconstrained generic method would not
express a useful application capability and would pre-implement no enforceable boundary.

## CreateRequest application behavior

The use case receives trusted application input containing raw tenant and actor UUID strings,
source type, and source reference. Authenticated derivation of that context is deferred to Day 6.

The use case:

1. parses the tenant and actor identifiers;
2. obtains a request UUID and timestamp through injected functions;
3. creates the aggregate and its initial status history;
4. calls the repository exactly once through the atomic create contract;
5. maps repository failures to stable application errors; and
6. returns a minimal serializable application result.

Invalid input returns before persistence. The use case performs no model call, audit write,
external side effect, or HTTP operation.

## Atomic persistence requirement

Request creation and its initial `request_status_history` record are one consistency boundary. A
future repository adapter must insert both in one PostgreSQL transaction. A request without its
initial history, or an initial history row without its request, is invalid. The Day 4 constraints
protect relational tenant consistency; the adapter supplies transaction atomicity.

## Assumptions and deferred behavior

- Source verification, authenticated tenant context, and authorization arrive on Day 6.
- A non-human intake path may omit creator membership, although the first interactive use case
  requires a trusted actor membership.
- Reopening terminal requests, timeout policy, cancellation, assignment, and concurrency control
  require later explicit designs.
- Database compare-and-swap or locking behavior belongs to repository adapters and is not simulated
  by the aggregate.
- Request payloads and raw customer messages remain outside this initial aggregate because Day 4
  stores only source identity and lifecycle metadata.
- Audit events are not emitted on Day 5; future use cases must persist material audit evidence in
  the same consistency boundary where required.

## Explicit exclusions

Day 5 does not implement or modify:

- Fastify application setup, routes, request middleware, authentication, authorization, or HTTP
  tenant context;
- PostgreSQL/Drizzle repository adapters, migrations, RLS, database roles, or transaction code;
- audit persistence;
- provider adapters, model calls, prompts, structured model output, or AI assessment;
- Temporal workflows, queues, retries, or external integrations;
- React UI, document ingestion, retrieval, or evaluation datasets.

