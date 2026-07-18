# OpsGuard AI V1 Scope

**Roadmap slice:** Week 1, Day 1 — Product Scope and Architectural Boundaries  
**Status:** Accepted baseline  
**Date:** 2026-07-17

## Scope definition

V1 is the target capstone release described by the 24-week roadmap. It is not the implementation scope for Day 1. Day 1 produces only the product and architecture decisions needed to guide later roadmap slices.

V1 proves one controlled, tenant-aware service-request workflow end to end. It uses AI for interpretation and proposal generation while deterministic application code retains authority over access, workflow state, approvals, external effects, and recovery.

## Primary users

- **Tenant owner:** Manages organization configuration, members, integrations, spend controls, and reporting.
- **Operations manager:** Manages workflow policy, routing, escalation, approval, and quality review.
- **Reviewer:** Corrects extracted facts and approves, rejects, revises, or requests information for a proposal.
- **Operator:** Works assigned requests, exceptions, and operational notes.
- **Auditor:** Reads decisions, evidence, approvals, and audit history without mutation rights.
- **Service account:** Submits requests through a narrowly scoped integration identity.
- **Support administrator:** Receives temporary, reasoned, expiring, and audited access when support access is implemented.

## In scope

### 1. Tenant and access control

- Multi-tenant organizations, memberships, roles, and service accounts.
- Application-derived tenant context for every operation.
- Role-based permissions plus contextual checks for tenant ownership, assignment, risk, workflow state, expiry, and separation of duties.
- Explicit, audited support access.

### 2. Service-request intake

- Intake through form/API, configured email intake, and signed webhooks.
- Source validation, payload validation, durable request identity, and tenant-scoped deduplication.
- Request status and history visible to authorized users.
- Fast acknowledgement before asynchronous processing, with a target under 500 ms when the request is accepted for background work.

### 3. AI-assisted assessment

- Intent classification.
- Structured fact extraction and normalization.
- Missing-information identification.
- Evidence ranking and service matching.
- Proposed route, action, and response draft.
- Explicit confidence, uncertainty, model version, prompt version, token usage, latency, and cost metadata.

All model outputs are untrusted until structurally and semantically validated by deterministic application logic.

### 4. Tenant knowledge and evidence

- Versioned tenant document and policy ingestion.
- Validation, extraction, chunking with provenance, indexing, activation, and supersession.
- Tenant-filtered hybrid retrieval with bounded evidence and citations.
- Exclusion of unauthorized, expired, deleted, quarantined, or superseded content.

### 5. Deterministic decision controls

- Schema and domain validation.
- Tenant policy, service eligibility, missing-field, risk, and approval rules.
- Deterministic routing to continue, request information, manual review, or rejection.
- Abstention when evidence or validated model output is insufficient.

### 6. Human approval and exception handling

- Immutable, versioned proposals with evidence and risk context.
- Reviewer correction, approval, rejection, revision, or request-for-information decisions.
- Mandatory human approval for high-risk actions.
- Revalidation of tenant, authorization, proposal version, policy, and workflow state immediately before execution.

### 7. Controlled integrations and recovery

- A constrained initial CRM integration and an email or ticketing integration.
- Typed tool contracts and least-privilege credentials.
- Idempotent external operations, bounded retries, and external correlation IDs.
- Reconciliation of timeouts and unknown results before retrying.
- No direct model access to integration credentials or side-effect execution.

### 8. Audit, evaluation, observability, and cost

- Append-only audit events for material state, policy, approval, and execution decisions.
- Correlated, redacted telemetry without sensitive prompt logging.
- Evaluation datasets and release gates for classification, extraction, retrieval, tool selection, security, and end-to-end behavior.
- Tenant-level token and cost accounting, budgets, anomaly signals, and provider kill switches.

## Responsibility boundary

| AI may propose | Deterministic application must decide or enforce |
|---|---|
| Intent classification | Tenant identity and authorization |
| Extracted and normalized facts | Schema and domain validity |
| Relevant evidence ranking | Document eligibility and tenant filtering |
| Missing information | Required-field and policy rules |
| Suggested service or workflow route | Risk level, approval requirement, and state transition |
| Draft response or proposed tool action | Tool permission, arguments, execution, and side effects |
| Confidence and uncertainty explanation | Retry, idempotency, reconciliation, budgets, and audit |

The binding decision is recorded in [ADR-0001: Model Responsibility Boundary](../adr/0001-model-responsibility-boundary.md).

## Explicitly out of scope for V1

- Open-ended or self-modifying autonomous agents.
- Model-selected tenant identity, permissions, approval, or workflow state.
- Direct model writes to databases, queues, storage, or third-party systems.
- Autonomous high-risk, financial, contractual, destructive, refund, or deletion actions.
- Replacement of a tenant's CRM, ERP, ticketing, or document-management system.
- A general consumer chatbot or broad conversational assistant.
- Native mobile applications, voice intake, and real-time call assistance.
- Custom foundation-model training or fine-tuning.
- Unbounded web browsing or execution of arbitrary user-supplied code.
- A marketplace of arbitrary third-party tools or integrations.
- Kubernetes, multi-region active-active deployment, or formal high-availability SLA commitments.
- Claims of compliance certification for regulated data or industries.
- Self-service billing and subscription management for the OpsGuard product.

## V1 acceptance outcomes

V1 is acceptable only when a demonstrated tenant request can move from intake to a recorded outcome and the evidence shows that:

- unauthorized and cross-tenant access is denied independently of model behavior;
- malformed model output cannot alter workflow state or cause a side effect;
- high-risk actions cannot execute without a valid human approval;
- duplicate intake and replay cannot create duplicate external effects;
- model, retrieval, worker, and integration failures lead to an explicit recoverable or review state;
- the final outcome is traceable to input, evidence, rules, model and prompt versions, reviewer decision, and external correlation ID; and
- quality, latency, and cost per completed request are measurable.

## Scope-change rule

Any proposal that gives a model new authority, adds a new class of side effect, weakens tenant isolation, changes approval requirements, or introduces regulated-data obligations requires a separate ADR and threat-model update before implementation.

