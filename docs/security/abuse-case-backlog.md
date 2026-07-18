# OpsGuard AI Abuse-Case and Security-Control Backlog

**Roadmap slice:** Week 1, Day 7 — Threat-Model Baseline  
**Status:** Accepted baseline backlog  
**Date:** 2026-07-18

## Purpose

This backlog turns the authoritative [threat-model baseline](threat-model.md) into reviewable abuse
cases and planned controls. It records current behaviour without claiming that a planned capability
exists. Each future implementation task must refine its relevant cases before opening a new trust
boundary and must add the named deterministic acceptance evidence.

Priorities mean:

- **P0:** release-blocking before the affected surface can be exposed.
- **P1:** required in the implementation slice that first opens the boundary.
- **P2:** defence-in-depth that must have an explicit owner and delivery decision before production.

## Abuse cases

### AB-001 — Tenant identity supplied in the request body

- **Scenario:** A caller includes another tenant ID in otherwise valid request-creation JSON.
- **Actor:** External caller or compromised tenant user.
- **Preconditions:** The caller can reach `POST /v1/requests` and knows or guesses a tenant UUID.
- **Asset:** Tenant identity, request record, history, and creation audit.
- **Current result:** The transport schema removes the body tenant field; the route uses the verified context tenant.
- **Desired deterministic result:** The body value never influences authorization or persistence, and all three rows use the server-resolved tenant.
- **Existing evidence:** Request-route component test and API integration test for body tenant spoofing (EV-01).
- **Missing control:** Repeat this invariant for every future route, non-HTTP caller, and store.
- **Target roadmap phase:** Every owning API, workflow, ingestion, retrieval, tool, and integration task.
- **Priority:** P0.
- **Acceptance test to add later:** A negative cross-tenant test for every new entry point asserts no target-tenant read, write, event, or side effect.

### AB-002 — Membership identity supplied by the caller

- **Scenario:** A caller supplies valid user and tenant UUIDs but attempts to select a different membership or role.
- **Actor:** Authenticated or unauthenticated external caller.
- **Preconditions:** Development identity headers are enabled.
- **Asset:** Membership, role, authorization decision, and tenant context.
- **Current result:** No membership header is accepted; the active membership ID and role are returned by PostgreSQL.
- **Desired deterministic result:** Caller-controlled membership or role data is ignored or rejected and cannot enter the verified context.
- **Existing evidence:** Context component tests and active-membership adapter integration tests (EV-03, EV-04).
- **Missing control:** Production authentication and a source-to-user/tenant mapping that cannot be selected by arbitrary headers.
- **Target roadmap phase:** Production identity and tenant-access task.
- **Priority:** P0.
- **Acceptance test to add later:** Production requests with forged tenant, role, or membership claims fail without running the use case.

### AB-003 — Suspended membership reuse

- **Scenario:** A caller presents identifiers for a membership whose status is `suspended`.
- **Actor:** Former or suspended tenant member.
- **Preconditions:** The user and tenant remain present and the caller knows their UUIDs.
- **Asset:** Tenant-scoped request operations.
- **Current result:** The resolver returns no active membership and the API emits the same forbidden category used for other absent active relationships.
- **Desired deterministic result:** No application command runs, no tenant existence detail is exposed, and no record is written.
- **Existing evidence:** Active-membership adapter and API integration suspended-membership tests (EV-04).
- **Missing control:** Session revocation and point-of-effect revalidation for long-running work.
- **Target roadmap phase:** Production identity and workflow authorization tasks.
- **Priority:** P0.
- **Acceptance test to add later:** Suspend a membership between command creation and effect execution; the effect is denied and auditable.

### AB-004 — Suspended tenant reuse

- **Scenario:** An otherwise active member attempts to operate after the tenant is suspended.
- **Actor:** Tenant member with previously valid access.
- **Preconditions:** The membership remains active while the tenant status is `suspended`.
- **Asset:** All tenant data and processing capacity.
- **Current result:** The joined membership lookup requires an active tenant and returns no verified context.
- **Desired deterministic result:** Every tenant-scoped entry point fails closed before data access, processing, or external effects.
- **Existing evidence:** Active-membership adapter integration test for suspended tenants (EV-04).
- **Missing control:** A shared authorization policy and revalidation contract for future workers and stores.
- **Target roadmap phase:** Identity, workflow, retrieval, tool, and integration tasks.
- **Priority:** P0.
- **Acceptance test to add later:** A suspended tenant cannot invoke API, workflow, retrieval, tool, webhook, or integration paths.

### AB-005 — Concurrent duplicate intake

- **Scenario:** Two identical tenant/source requests arrive concurrently or are retried after an uncertain response.
- **Actor:** Client retry loop, duplicate webhook sender, or malicious caller.
- **Preconditions:** Both operations use the same tenant, source type, and source reference.
- **Asset:** Request uniqueness, history, audit accuracy, and processing cost.
- **Current result:** The named tenant/source unique constraint allows one transaction and maps the duplicate to HTTP 409.
- **Desired deterministic result:** Exactly one current intake aggregate commits; the loser has no partial history or audit rows.
- **Existing evidence:** Duplicate adapter/API integration tests and exact conflict mapping (EV-06, EV-07).
- **Missing control:** General idempotency receipts for non-identical payloads and future external effects.
- **Target roadmap phase:** Webhook, workflow, tool, and integration tasks.
- **Priority:** P1 for each new source.
- **Acceptance test to add later:** A concurrency test proves one operation identity and one side effect across retries.

### AB-006 — Audit insert failure during request creation

- **Scenario:** The request and initial history insert succeed but audit insertion fails.
- **Actor:** Fault, compromised adapter, constraint change, or database operator.
- **Preconditions:** A transaction is open and the failure occurs before commit.
- **Asset:** Request/history/audit consistency and non-repudiation.
- **Current result:** The shared transaction rolls back all three inserts.
- **Desired deterministic result:** Either all required records commit once or none exist.
- **Existing evidence:** Forced audit-failure rollback integration test (EV-06).
- **Missing control:** Database denial of audit update/delete and periodic integrity verification.
- **Target roadmap phase:** Audit and production-database hardening task.
- **Priority:** P0 before production.
- **Acceptance test to add later:** Application credentials cannot update/delete audit rows, and an integrity check detects out-of-band mutation.

### AB-007 — Identity probing and tenant enumeration

- **Scenario:** A caller varies malformed, nonexistent, mismatched, or suspended identity values and compares responses.
- **Actor:** Unauthenticated external attacker.
- **Preconditions:** The current development headers or a future login/session surface is reachable.
- **Asset:** User, membership, and tenant existence.
- **Current result:** Malformed/missing identity and absent active relationships use stable categories without tenant detail.
- **Desired deterministic result:** Responses and observable processing do not disclose which tenant/user/membership exists.
- **Existing evidence:** Context and API component/integration tests for malformed, absent, mismatched, and suspended identity (EV-03, EV-04).
- **Missing control:** Timing review, production authentication throttling, and security telemetry without raw identifiers.
- **Target roadmap phase:** Production identity and observability tasks.
- **Priority:** P0.
- **Acceptance test to add later:** Enumeration corpus responses have the same public shape and an approved timing envelope.

### AB-008 — Client-supplied correlation identifier

- **Scenario:** A caller supplies a chosen request ID to forge evidence or correlate another tenant's activity.
- **Actor:** External caller.
- **Preconditions:** The client can set the conventional request-ID header.
- **Asset:** Correlation integrity, logs, error evidence, and future traces.
- **Current result:** Fastify ignores the supplied value, creates a UUID, and returns it in `x-request-id`.
- **Desired deterministic result:** Only the server-generated identifier reaches logs, errors, audit correlation, and traces.
- **Existing evidence:** Health and request component tests for client-supplied IDs (EV-02).
- **Missing control:** Distributed tracing field governance and trace-to-tenant privacy tests.
- **Target roadmap phase:** Observability task.
- **Priority:** P1 before tracing.
- **Acceptance test to add later:** A forged header appears nowhere in response metadata, logs, spans, or audit correlation fields.

### AB-009 — Sensitive values captured in logs

- **Scenario:** Identity headers, source references, SQL details, secrets, prompts, or documents are logged during success or failure.
- **Actor:** Developer mistake, dependency, operator, or compromised telemetry collector.
- **Preconditions:** A request fails or future telemetry captures broad payloads.
- **Asset:** Credentials, tenant data, prompts, documents, and operational metadata.
- **Current result:** Application-owned failure logs contain request ID and failure category; creation-audit metadata omits source reference.
- **Desired deterministic result:** Only approved fields are emitted, secrets/content are redacted, and tenant/support access is governed and auditable.
- **Existing evidence:** Logging calls and exact creation-audit metadata (EV-05, EV-11); no complete log-capture test.
- **Missing control:** Central allowlist/redaction, retention/access policy, secret scanning, and log/span snapshot tests.
- **Target roadmap phase:** Observability and security-operations tasks.
- **Priority:** P0 before production telemetry.
- **Acceptance test to add later:** A seeded sensitive corpus is absent from captured API, adapter, CI, trace, metric, and support-audit output.

### AB-010 — Database detail leaked through an API error

- **Scenario:** A constraint, SQLSTATE, connection URL, statement, or stack reaches an HTTP response.
- **Actor:** External caller inducing database failures.
- **Preconditions:** The repository throws a duplicate, integrity, connection, or unexpected database error.
- **Asset:** Schema, infrastructure topology, credentials, and implementation details.
- **Current result:** Exact known errors normalize to stable application categories; unexpected errors become generic internal errors.
- **Desired deterministic result:** Public responses contain only the stable code/message/request ID while restricted logs retain minimal diagnosable categories.
- **Existing evidence:** Database error mapper and HTTP redaction component tests (EV-07, EV-08).
- **Missing control:** Production log redaction verification across driver/framework failures.
- **Target roadmap phase:** Production observability and database hardening.
- **Priority:** P0.
- **Acceptance test to add later:** Fault injection asserts SQL, constraints, URLs, credentials, statements, and stacks never enter the response or unrestricted telemetry.

### AB-011 — Development authentication deployed to production

- **Scenario:** An exposed production process trusts arbitrary `x-user-id` and `x-tenant-id` UUID headers.
- **Actor:** Any external caller.
- **Preconditions:** The current development context builder is wired into a production deployment.
- **Asset:** Every tenant identity and operation.
- **Current result:** Documentation warns that the headers are not production authentication, but runtime startup does not refuse the configuration.
- **Desired deterministic result:** Production startup fails closed unless a verified production identity adapter is configured; the development adapter cannot be selected.
- **Existing evidence:** Documentation and development-header tests only.
- **Missing control:** Environment-typed identity selection and a hard production refusal guard.
- **Target roadmap phase:** Production identity task, before any deployment.
- **Priority:** P0 release blocker.
- **Acceptance test to add later:** A production-mode process configured with development headers exits before binding a port.

### AB-012 — Indirect prompt injection in an uploaded document

- **Scenario:** A future document contains instructions to ignore policy, retrieve other tenants' data, or invoke a tool.
- **Actor:** Malicious uploader, compromised content source, or poisoned external document.
- **Preconditions:** Document ingestion/retrieval and a model call are implemented.
- **Asset:** Model context, tenant evidence, structured proposal, and tool boundary.
- **Current result:** Out of scope at runtime because ingestion, retrieval, and model boundaries do not exist.
- **Desired deterministic result:** Content is treated as untrusted evidence, bounded and tenant-filtered; it cannot change policy, authorization, or tool selection.
- **Existing evidence:** ADR-0001 and threat-model constraints only.
- **Missing control:** Scanning/quarantine, isolated parsing, provenance, eligible retrieval filters, instruction/data separation, and adversarial evaluation.
- **Target roadmap phase:** Document-ingestion, retrieval, gateway, and evaluation tasks.
- **Priority:** P0 before document-assisted generation.
- **Acceptance test to add later:** A malicious corpus cannot cross tenant filters, alter deterministic policy, expose hidden context, or authorize a tool.

### AB-013 — Model proposes an unauthorized write tool

- **Scenario:** A future model selects a write-capable tool, substitutes another tenant/record ID, or repeats a previously approved action.
- **Actor:** Malicious caller, prompt injection, compromised provider, or faulty model output.
- **Preconditions:** Model gateway, tool registry, and write-capable integration exist.
- **Asset:** Tenant records, external systems, approval evidence, and credentials.
- **Current result:** No tool runtime exists; ADR-0001 denies model authority.
- **Desired deterministic result:** The application owns tenant/record identity, validates typed arguments, applies current authorization and risk policy, requires immutable approval where needed, and executes idempotently.
- **Existing evidence:** Architectural policy only.
- **Missing control:** Typed registry, deterministic authorization, read/write split, approval lifecycle, bounds, idempotency, and audit.
- **Target roadmap phase:** Tool and approval tasks.
- **Priority:** P0 before any write tool.
- **Acceptance test to add later:** Tenant substitution, unregistered tools, stale/self approval, replay, excess output, and step-limit cases all fail before effect.

### AB-014 — Replayed or spoofed webhook

- **Scenario:** A future webhook is unsigned, stale, duplicated, associated with the wrong tenant, or contains an attacker-controlled URL.
- **Actor:** External attacker or malfunctioning/compromised sender.
- **Preconditions:** A webhook endpoint is exposed.
- **Asset:** Intake integrity, tenant mapping, database/network capacity, and integration credentials.
- **Current result:** No webhook endpoint exists; `webhook` is only source-type vocabulary.
- **Desired deterministic result:** Signature, timestamp, source mapping, schema, and URL policy are verified before a unique receipt is accepted.
- **Existing evidence:** No runtime evidence.
- **Missing control:** Secret rotation, constant-time signature check, freshness window, receipt uniqueness, SSRF allowlist, and rate limit.
- **Target roadmap phase:** Webhook task.
- **Priority:** P0 before endpoint exposure.
- **Acceptance test to add later:** Invalid signature, stale timestamp, altered body, wrong tenant, duplicate ID, redirect, private address, and flood cases cause no command or outbound request.

### AB-015 — External success followed by local timeout

- **Scenario:** A future CRM/ticket/email provider completes a write, the local call times out, and a retry creates another external effect.
- **Actor:** Network fault, provider degradation, workflow replay, or retry policy.
- **Preconditions:** A write-capable external integration exists.
- **Asset:** External records, local operation state, audit, and customer trust.
- **Current result:** No external effect exists; the current PostgreSQL transaction cannot provide external exactly-once delivery.
- **Desired deterministic result:** A stable operation/idempotency key is persisted before execution; ambiguous outcomes reconcile by correlation before retry.
- **Existing evidence:** No runtime evidence; current atomic transaction covers local rows only.
- **Missing control:** Operation state machine, provider idempotency/correlation, bounded retries, reconciliation, and idempotent workflow activities.
- **Target roadmap phase:** Workflow and integration tasks.
- **Priority:** P0 before write integrations.
- **Acceptance test to add later:** Inject success-plus-timeout and workflow replay; exactly one external record is observed and local state reconciles.

### AB-016 — Tenant exhausts model budget or shared capacity

- **Scenario:** A tenant submits repeated calls, oversized documents/context, tool loops, retry storms, or high-cardinality telemetry.
- **Actor:** Malicious tenant, compromised account, accidental automation, or provider failure.
- **Preconditions:** An expensive model, document, workflow, tool, or telemetry endpoint exists.
- **Asset:** Tenant budget, shared availability, provider quota, and database/worker capacity.
- **Current result:** Source length, duplicate keys, and database-pool size are bounded; no model/cost surface exists.
- **Desired deterministic result:** Authentication, per-tenant and global budgets, size/time/token/tool/retry caps, backpressure, monitoring, and kill switches bound maximum loss.
- **Existing evidence:** Current schema validation, uniqueness, and pool configuration only.
- **Missing control:** Cost attribution, budget reservation/enforcement, queue/concurrency policy, provider limits, and denial-of-wallet tests.
- **Target roadmap phase:** Gateway contract begins the bounded interface; operations/cost controls precede expensive endpoint exposure.
- **Priority:** P0 before provider enablement.
- **Acceptance test to add later:** Budget, token, document, concurrency, retry, and provider-failure load cases stop at deterministic caps without starving other tenants.

## Prioritized planned-control backlog

The status vocabulary is the same as the authoritative threat model. “Planned” means no runtime
control is claimed. The named owner is a roadmap task, not a person.

| ID | Priority | Status | Planned control | Threats / abuse cases | Owning roadmap task | Required acceptance evidence |
|---|---|---|---|---|---|---|
| PC-001 | P0 | Planned | Replace development headers with verified production identity and refuse the stub in production. | T-001, T-002, T-004; AB-002–AB-004, AB-011 | Production identity and tenant access | Startup refusal plus forged/suspended/revoked identity integration suite. |
| PC-002 | P0 | Planned | Make tenant scope explicit and deny-by-default in every repository, object key, retrieval filter, workflow ID, tool argument, audit, and telemetry dimension. | T-003, T-019; AB-001, AB-004 | Each owning data/capability task | Cross-tenant negative test per entry point and adapter; evaluate RLS before production. |
| PC-003 | P0 | Planned | Establish managed secrets, environment/target allowlists, least-privilege database and service roles, and credential rotation. | T-007, T-012 | Deployment and database hardening | Configuration-refusal, privilege, rotation, and secret-scanning checks. |
| PC-004 | P0 | Planned | Enforce append-only audit access, correction events, integrity checks, retention, and audited support access. | T-009, T-020, T-022; AB-006, AB-009 | Audit and support-access hardening | Mutation-denial, integrity-detection, retention, and support-access tests. |
| PC-005 | P0 | Planned | Define HTTP byte/rate/concurrency limits, tenant quotas, backpressure, and safe rendered-output handling. | T-005, T-021; AB-016 | Ingress and operations | Adversarial payload, output-encoding, rate, concurrency, and tenant-fairness tests. |
| PC-006 | P0 | Planned | Create provider-neutral model input/output schemas with minimized data, bounded time/tokens, normalized errors, and no provider authority. | T-013, T-015, T-021; AB-016 | Week 1 Day 8 — Model gateway contract | Contract tests for schema, bounds, abort/timeout, malformed output, errors, and provider-neutrality. |
| PC-007 | P0 | Planned | Quarantine and scan uploads; isolate parsing; enforce tenant object keys, eligible retrieval filters, bounded evidence, provenance, and deletion/supersession. | T-014, T-019; AB-012 | Document-ingestion and retrieval | Malware/active-content, cross-tenant, poisoning, provenance, deletion, and injection suites. |
| PC-008 | P0 | Planned | Separate instructions from data and run direct/indirect prompt-injection and data-leakage evaluations. | T-013–T-015; AB-012 | Gateway, retrieval, and evaluation | Versioned adversarial corpus with deterministic policy and leakage assertions. |
| PC-009 | P0 | Planned | Add a typed application-owned tool registry, current tenant authorization, read/write split, immutable approval, bounded agency, idempotency, and audit. | T-016, T-022; AB-013 | Tool and approval | Unauthorized argument/tool, stale/self approval, replay, bounds, and audit tests. |
| PC-010 | P0 | Planned | Verify webhook signature/freshness/source mapping before parsing a unique receipt; enforce schema, SSRF policy, and rate limits. | T-017; AB-014 | Webhook | Signature, replay, tenant mapping, schema, SSRF/redirect, rotation, and flood tests. |
| PC-011 | P0 | Planned | Persist stable external operation identity, bound retries, reconcile ambiguity, and make workflow activities idempotent. | T-008, T-018; AB-005, AB-015 | Workflow and integrations | Concurrency, timeout-after-success, retry, replay, and reconciliation integration tests. |
| PC-012 | P0 | Planned | Attribute cost to pseudonymous tenant dimensions and enforce tenant/global budgets, context/tool/retry caps, and provider kill switches. | T-021; AB-016 | Cost and operations | Budget reservation, cap, fairness, retry-storm, cardinality, and kill-switch tests. |
| PC-013 | P1 | Planned | Centralize log/span/metric field allowlists, redaction, retention/access, and prompt/document opt-out defaults. | T-006, T-020; AB-008–AB-010 | Observability and security operations | Seeded-sensitive-value snapshots plus tenant/support access tests. |
| PC-014 | P1 | Planned | Add dependency provenance/review, scanning, protected-branch evidence, isolated untrusted-PR policy, and an incident process. | T-012 | Supply chain and operations | CI permission/provenance policy checks and secret-isolation exercise. |
| PC-015 | P2 | Planned | Define user/session lifecycle, authorization expiry, permission matrix, and point-of-effect revalidation. | T-002, T-010, T-016, T-022; AB-003, AB-013 | Identity, authorization, workflow, and approval | Revocation race, role matrix, stale approval, and long-running-effect tests. |

## Accepted and unresolved risk

- Development UUID headers are accepted only for the current non-production phase; production use is a P0 release blocker.
- Current tenant/source uniqueness is accepted as intake deduplication, not as a general idempotency or exactly-once guarantee.
- Current relational constraints protect the implemented write path, not future reads, stores, caches, workers, tools, or telemetry.
- Application-owned logging and audit minimization reduce current exposure, but append-only enforcement, retention/access governance, and complete capture tests remain unresolved.
- Model, document, retrieval, workflow, tool, webhook, integration, telemetry, and cost boundaries remain closed; their planned controls are not implemented evidence.

No unresolved high-risk item is silently accepted for production. The owning roadmap task must either
implement and verify its control, document a narrower explicit risk acceptance, or keep the affected
boundary disabled.

## Maintenance rule

Update this backlog in the same review as any new actor, asset, trust boundary, entry point, external
provider, persistent store, model capability, tool, approval path, or side effect. Closed abuse cases
retain their identifiers and link to immutable test evidence; they are not deleted merely because a
control was added.
