# OpsGuard AI threat-model baseline

**Roadmap slice:** Week 1, Day 7 — Threat-Model Baseline
**Status:** Working implementation specification
**Date:** 2026-07-18

## Purpose and authority

This document defines the implementation-grounded security analysis method and inventory for the
OpsGuard AI system through Week 1, Day 6. It separates controls verified in source or automated
tests from future V1 controls described only by the roadmap.

The accepted Day 1 analysis in [Initial Threat Model](initial-threat-model.md) remains the prior
baseline while this Day 7 document is completed. On Day 7 acceptance, this document becomes the
authoritative baseline and the Day 1 file is retained only as a superseded historical record.

This is an engineering prioritization aid. It is not a claim that the system is production-secure,
a compliance assessment, a penetration test, or a quantitative loss forecast.

## Day 7 objective

Day 7 produces documentation and analysis only:

- one current/future system context;
- one Level 1 data-flow model for request creation;
- stable inventories for assets, actors, entry points, and trust boundaries;
- a lightweight STRIDE threat catalogue;
- a prioritized abuse-case backlog;
- current-control evidence and planned-control ownership; and
- a repeatable verification and review procedure.

No runtime behavior, dependency, schema, migration, route, middleware, test, infrastructure, or CI
change belongs to this slice.

## Scope states

### Implemented through Day 6

The current system consists of:

- an API client calling Fastify `GET /health` or `POST /v1/requests`;
- server-generated correlation IDs and stable public error envelopes;
- untrusted development/test user and tenant headers;
- UUID parsing, active-membership lookup, active-tenant lookup, and a frozen verified context;
- the `CreateRequest` application use case and immutable request aggregate;
- a Drizzle repository and PostgreSQL transaction that insert request, initial history, and
  `request.created` audit records;
- the application PostgreSQL database and its tenant-aware constraints;
- repository configuration, ignored local environment values, GitHub Actions CI, and guarded
  isolated PostgreSQL integration tests; and
- local Docker services. Redis, MinIO, Temporal, OpenTelemetry Collector, and Jaeger are running
  infrastructure foundations but are not used by application code.

### Planned future surfaces

The following are modelled only as future trust boundaries:

- model providers, prompts, structured output, and model-cost accounting;
- document ingestion, object storage, retrieval, embeddings, and vector search;
- Temporal workflow workers and durable activity state;
- typed tools, human approval, and external side effects;
- webhooks and CRM, email, or ticket integrations;
- application telemetry and model-cost backends; and
- a human approval and support-access UI.

No current control may rely on one of these future components.

## Method

The baseline uses lightweight STRIDE plus concrete abuse cases:

| STRIDE category | Question used in this model |
|---|---|
| Spoofing | Can an actor, tenant, source, correlation identity, or future provider be impersonated? |
| Tampering | Can request, context, state, audit, evidence, workflow, or integration data be changed improperly? |
| Repudiation | Can a material action occur without reliable actor, state, or outcome evidence? |
| Information disclosure | Can tenant data, credentials, internal errors, prompts, or telemetry cross an unauthorized boundary? |
| Denial of service | Can traffic, retries, storage, connections, telemetry, or model usage exhaust availability or cost? |
| Elevation of privilege | Can authentication, model output, tools, support access, or dependencies gain ungranted authority? |

Each threat record uses a stable `T-nnn` identifier and names its trust boundary, actor, assets,
scenario, rating, current controls, gaps, planned controls, roadmap owner, evidence, and residual
disposition. Abuse cases use `AB-nnn`; trust boundaries use `TB-nn`; assets use `A-nn`; actors use
`AC-nn`; and entry points use `EP-nn`.

## Control-status vocabulary

Only these terms describe control state:

| Status | Meaning |
|---|---|
| Implemented | Source or configuration exists through Day 6 and direct evidence verifies the claimed behavior. |
| Partially implemented | A narrower control exists, but a material part of the stated security outcome is absent. |
| Planned | The roadmap owns the control, but no current implementation is claimed. |
| Accepted for current phase | A known residual risk is tolerated only for the present non-production phase. |
| Out of scope | The control or surface is outside V1 or outside the stated system boundary. |

Documentation intent alone is not implementation evidence.

## Risk rating

Likelihood and impact are ordinal engineering judgments:

| Value | Likelihood | Impact |
|---:|---|---|
| 1 | Unlikely in the scoped state | Low: localized, readily recoverable effect |
| 2 | Possible | Moderate: tenant, integrity, operational, or availability effect requiring intervention |
| 3 | Likely without further control | High: cross-tenant, credential, material external-effect, or sustained availability/cost effect |

`Risk score = likelihood × impact`:

- 1–2: Low;
- 3–4: Medium; and
- 6–9: High.

Ratings prioritize engineering work; they are not probabilities or financial guarantees. Initial
risk assumes listed current controls can fail or be bypassed. Residual disposition states what is
accepted now or what must be addressed before the owning future surface is enabled.

## Asset inventory

Classification means: **Public** may be disclosed intentionally; **Internal** is operational but
not normally public; **Confidential** is tenant, identity, security, or business data whose
unauthorized disclosure matters; **Secret** grants access or signing authority.

| ID | State | Asset | Classification | Rationale |
|---|---|---|---|---|
| A-01 | Current | Tenant UUID and tenant selection | Internal | The identifier is not a credential, but its authoritative association controls data scope. |
| A-02 | Current | User UUID, email, membership, role, and status | Confidential | Identity and authorization metadata can expose people and access structure. |
| A-03 | Current | Development/test identity headers | Confidential | They carry untrusted identity selections; they are not production credentials. |
| A-04 | Current | Request record and source reference | Confidential | Source references can identify tenant business activity or an external record. |
| A-05 | Current | Request status history | Confidential | It reveals request lifecycle and actor association. |
| A-06 | Current | Audit records | Confidential | Events link tenant, actor, entity, time, and operational facts. |
| A-07 | Current | Correlation ID | Internal | It supports diagnostics but grants no authority and is separate from the request ID. |
| A-08 | Current | Application PostgreSQL data | Confidential | It contains all current tenant, identity, request, and audit records. |
| A-09 | Current | PostgreSQL credentials | Secret | They grant database access within their privilege scope. |
| A-10 | Current | Environment and repository configuration | Internal | Configuration reveals topology; populated secret values remain Secret. |
| A-11 | Current | Application logs | Internal | Current messages are minimized, but operational identifiers remain non-public. |
| A-12 | Current | CI credentials, job data, caches, and artifacts | Secret / Internal | Tokens grant CI authority; logs and artifacts may expose operational data. |
| A-13 | Current | Source code, lockfile, and dependencies | Internal / Public | Source is project-internal; public dependency metadata remains supply-chain sensitive. |
| A-14 | Future | Prompts, model inputs, outputs, and evaluation cases | Confidential | They may contain tenant content, policies, derived facts, or adversarial material. |
| A-15 | Future | Provider credentials and webhook secrets | Secret | They authorize provider calls or authenticate external senders. |
| A-16 | Future | Retrieved documents, embeddings, and object-storage objects | Confidential | They contain or derive from tenant knowledge and customer content. |
| A-17 | Future | Workflow state, proposals, approvals, and tool operations | Confidential | They encode decisions, authority, and side-effect state. |
| A-18 | Future | Tool credentials and external integration identifiers | Secret / Confidential | Credentials grant effects; identifiers support reconciliation and may expose business records. |
| A-19 | Future | Token, cost, telemetry, and budget records | Internal / Confidential | Usage can reveal tenant activity and commercially sensitive patterns. |

## Actor inventory

| ID | State | Actor | Trust position |
|---|---|---|---|
| AC-01 | Current | Unauthenticated external client | Fully untrusted; may call health or attempt protected request creation. |
| AC-02 | Current | Legitimate active tenant member | Authenticated only by the stub; authorized for Day 6 creation after membership lookup. |
| AC-03 | Current | Malicious tenant member | Has a real active membership but may tamper with tenant, source, or request data. |
| AC-04 | Current | Cross-tenant user | Presents a valid user with a tenant where that user lacks active membership. |
| AC-05 | Current | Suspended member or member of suspended tenant | Must receive the same access denial as other absent active memberships. |
| AC-06 | Current | Developer | Controls local code, `.env`, Docker, migrations, and test commands. |
| AC-07 | Current | CI runner or malicious pull request | Executes repository-defined jobs with read-only repository permissions and CI environment values. |
| AC-08 | Current | Database administrator | Has direct data authority outside application authorization and audit guarantees. |
| AC-09 | Current | Compromised application dependency | Executes inside the Node.js process or build and may bypass intended boundaries. |
| AC-10 | Current | Compromised developer workstation | Can steal local credentials or alter code, containers, and evidence. |
| AC-11 | Future | External webhook sender | Untrusted until signature, freshness, source mapping, and replay checks pass. |
| AC-12 | Future | Model provider or malicious model output | External probabilistic system with no authorization or side-effect authority. |
| AC-13 | Future | Malicious uploaded-document author | Supplies indirect instructions or content intended to corrupt retrieval and proposals. |
| AC-14 | Future | CRM, email, or ticket provider | External outcome authority that may be delayed, duplicated, or ambiguous. |
| AC-15 | Future | Support operator or workflow worker | Requires explicit bounded authority; neither surface currently exists. |

## Entry-point inventory

| ID | State | Entry point | Data and authority |
|---|---|---|---|
| EP-01 | Current | `GET /health` | Unauthenticated liveness only; no dependency readiness or sensitive details. |
| EP-02 | Current | `POST /v1/requests` JSON body | Untrusted source type/reference and removable extra properties; no tenant authority. |
| EP-03 | Current | `x-opsguard-user-id` and `x-opsguard-tenant-id` | Untrusted development identity selection validated and resolved server-side. |
| EP-04 | Current | API process environment | Listener and database settings; populated credentials are secret-bearing input. |
| EP-05 | Current | PostgreSQL connection | Parameterized Drizzle operations and administrative migration/test access. |
| EP-06 | Current | Pull request, lockfile, and GitHub Actions workflow | Code and dependency changes executed by CI with `contents: read`. |
| EP-07 | Current | Developer CLI, `.env`, Docker ports, and service consoles | Local administrative surface bound to loopback by Compose defaults. |
| EP-08 | Future | Model and embedding provider APIs | Prompts/evidence leave the system; outputs return untrusted. |
| EP-09 | Future | Document upload, object storage, and retrieval | Untrusted files/content and tenant-filtered data access. |
| EP-10 | Future | Temporal task/activity boundary | Replayable workflow commands and durable state. |
| EP-11 | Future | Tool and external integration APIs | Potentially consequential, idempotent side effects. |
| EP-12 | Future | Webhook receiver | Signed external payload, freshness, source mapping, and replay identity. |
| EP-13 | Future | Telemetry/model-cost export | Redacted operational and usage data crossing to a backend. |
| EP-14 | Future | Human approval and support UI | Authenticated decisions and temporary support authority. |

## Security assumptions

- The development/test authentication stub is not production identity and must be replaced before
  production exposure.
- TLS termination is outside the current local repository scope.
- Compose credentials are local-development-only; production secret management is not implemented.
- PostgreSQL row-level security and least-privilege production database roles are not implemented.
- Rate limiting, tenant quotas, request-byte limits beyond field schemas, and model budgets are not
  implemented.
- Model providers, webhooks, tools, document ingestion, retrieval, workflows, external integrations,
  and application telemetry are not integrated.
- Production deployment, backup automation, incident response, and support-access procedures are
  not implemented.
- Composite PostgreSQL constraints and repository tests are defense in depth, not a complete
  authorization system.
- Current roles all permit request creation; a narrower role policy requires an accepted change and
  tests.

## Exclusions

Day 7 does not add a model gateway, provider SDK, prompt, model ledger, migration, RLS policy,
production authentication, rate limiter, webhook route, signature verifier, tool registry, approval
system, Temporal workflow, document pipeline, MinIO/Redis application use, retrieval, embedding,
React UI, application telemetry, secrets manager, deployment automation, scanner, or attack test.

## Verification and review procedure

For every baseline revision:

1. Confirm the branch and clean baseline, then inspect the named source, schema, migration, test,
   environment, infrastructure, and CI evidence.
2. Reject an `Implemented` status without a source/configuration path and direct test or deterministic
   inspection evidence.
3. Re-score threats when an entry point, authority, tenant-owned store, provider, tool, side effect,
   sensitive data class, or deployment boundary changes.
4. Require every trust boundary to appear in at least one threat and every High threat to have a
   planned control, verification strategy, and roadmap owner.
5. Run documentation coverage checks, Mermaid inspection, `git diff --check`, all repository quality
   gates, migration checks, and both guarded PostgreSQL integration lanes.
6. Confirm the final diff contains documentation only, no Day 8 model gateway exists, dependencies
   and migrations are unchanged, and the branch remains unpushed.

The security baseline must be reviewed before enabling any future boundary shown in this model and
after any incident or evidence that invalidates an assumption.
