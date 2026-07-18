# ADR-0001: Model Responsibility Boundary

- **Status:** Accepted
- **Date:** 2026-07-17
- **Decision owners:** OpsGuard AI engineering
- **Roadmap slice:** Week 1, Day 1 — Product Scope and Architectural Boundaries

## Context

OpsGuard AI processes unstructured operational requests and tenant knowledge. Model capabilities are valuable for classification, extraction, ranking, and drafting, but model output is probabilistic, provider-dependent, and vulnerable to malformed input, prompt injection, hallucination, and non-deterministic change.

The platform is also responsible for multi-tenant isolation, authorization, workflow state, approvals, external writes, retries, recovery, audit, and spend controls. These responsibilities require deterministic and independently testable behavior. A model cannot safely be the authority for them.

We need one boundary that applies consistently across HTTP requests, background jobs, retrieval, human approval, tools, integrations, evaluations, and future provider adapters.

## Decision

Model output is an **untrusted, versioned proposal**. The deterministic application is the sole authority for identity, access, state, policy, approval, side effects, and recovery.

### Permitted model responsibilities

A model may:

- classify request intent;
- extract and normalize candidate facts;
- identify missing or conflicting information;
- rank authorized evidence and suggest service matches;
- draft a proposed response;
- propose a workflow route or typed tool call;
- explain uncertainty; and
- return confidence or other task-specific scores.

These results may inform an application decision but cannot constitute that decision by themselves.

### Deterministic application responsibilities

Application and domain code must:

- authenticate actors and resolve tenant context;
- authorize every use case and tool execution;
- validate input and model-output schemas;
- enforce database constraints and tenant ownership;
- evaluate document eligibility, required fields, policy, risk, and approval rules;
- own workflow states, transitions, timers, transactions, and cancellation;
- create immutable proposal versions and bind approvals to one version;
- revalidate authority and freshness immediately before execution;
- select permitted tools and constrain their arguments;
- execute all database and external side effects;
- enforce idempotency, retry classification, budgets, and provider kill switches;
- reconcile unknown external outcomes; and
- record audit, model/prompt version, evidence, usage, cost, approval, and outcome.

### Prohibited model authority

A model must never:

- choose or override tenant identity;
- grant permissions or bypass authorization;
- decide whether security policy applies;
- change workflow state directly;
- approve its own high-risk proposal;
- write directly to a database, queue, cache, storage system, or third-party API;
- access raw integration credentials;
- send communications autonomously;
- issue refunds, delete records, or make financial or contractual commitments; or
- decide to ignore budgets, expiry, idempotency, or reconciliation requirements.

## Enforcement rules

1. Provider SDK types do not cross into the domain layer.
2. Model access occurs through provider-neutral ports with bounded time, tokens, context, and capabilities.
3. Model output is parsed into a versioned schema and rejected if structurally invalid.
4. Structural validity does not imply business validity; domain validation and policy evaluation are separate steps.
5. Tenant and actor context comes from an immutable application execution context, never prompt content or model output.
6. Retrieval is tenant-filtered and eligibility-filtered before evidence reaches a model.
7. Tool proposals are data. Only the application can authorize and execute the corresponding operation.
8. High-risk actions require a valid human approval; low-risk automation, if enabled later, still requires deterministic policy authorization.
9. Missing evidence, low confidence, conflicting facts, invalid output, or exhausted budget causes abstention, pause, or manual review—not guessed continuation.
10. A model or prompt version change must pass the applicable evaluation and security gates before promotion.

## Consequences

### Positive

- Security and tenant isolation do not depend on model compliance.
- Domain rules remain deterministic, testable, replayable, and provider-independent.
- Model providers can be changed without redefining business authority.
- Human approvals and external effects remain attributable and auditable.
- Invalid or adversarial model output fails into a controlled state.

### Costs and trade-offs

- Every model-assisted task requires schemas, domain validation, and explicit failure handling.
- Tool execution needs a separate authorization and policy layer.
- Workflow state and proposal versioning add implementation complexity.
- Some requests will be routed to manual review even when the model appears confident.
- Provider-specific features may be intentionally hidden if they cannot fit a stable application capability.

## Alternatives considered

### Allow the model to orchestrate and execute tools directly

Rejected because model behavior cannot be the authorization, tenant-isolation, replay, or approval boundary. It also makes side effects and recovery difficult to prove.

### Use model confidence as the final policy decision

Rejected because confidence is not calibrated authorization and cannot replace required fields, tenant policy, risk thresholds, or separation of duties.

### Avoid models and use deterministic parsing only

Rejected for the product as a whole because variable, unstructured service requests and documents are the source of the manual work. Deterministic parsing remains appropriate for stable input formats and hard rules.

### Put provider-specific model logic in domain modules

Rejected because it couples business rules to vendor schemas, error semantics, and SDK lifecycle.

## Reconsideration triggers

This ADR must be revisited before:

- any model is permitted to cause a new category of side effect;
- any high-risk action is proposed for automatic approval;
- tenant resolution or authorization context is exposed to model choice;
- a provider-specific capability requires domain-level coupling; or
- regulated decision-making introduces a stricter human-accountability requirement.

