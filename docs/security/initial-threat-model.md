# OpsGuard AI Initial Threat Model

**Roadmap slice:** Week 1, Day 1 — Product Scope and Architectural Boundaries  
**Status:** Superseded by the Day 7 authoritative baseline
**Date:** 2026-07-17

## Purpose and limitation

This document preserves the initial security analysis produced on Day 1. It is no longer
authoritative. The accepted [Day 7 Threat-Model Baseline](threat-model.md) supersedes its identifiers,
ratings, boundary inventory, control status, evidence, and backlog. When the two differ, the Day 7
baseline governs.

## Security objectives

1. Prevent a user, request, document, model, tool, or administrator from crossing tenant boundaries.
2. Prevent model output or untrusted content from becoming authorization or causing an unapproved side effect.
3. Preserve request, proposal, approval, execution, and audit integrity across retries and failures.
4. Minimize disclosure of customer data, tenant documents, prompts, credentials, and operational metadata.
5. Bound operational and provider cost even under abuse or failure.
6. Keep security-relevant behavior observable without placing sensitive values in logs or traces.

## Assets

- Tenant customer and request data.
- Tenant documents, policies, service catalogs, embeddings, and retrieved evidence.
- User identities, memberships, roles, service accounts, and support-access grants.
- Integration credentials, webhook secrets, API credentials, and model-provider credentials.
- Prompts, model inputs and outputs, proposal versions, and evaluation datasets.
- Approval decisions and reviewer identity.
- External business records and communication outcomes.
- Workflow, idempotency, reconciliation, audit, token-usage, and cost records.

## Threat actors and failure sources

- External unauthenticated attacker.
- Malicious or compromised tenant user.
- Compromised service account or webhook sender.
- Hostile or poisoned document, email, or request content.
- Compromised or misconfigured model, identity, CRM, email, ticketing, storage, or telemetry provider.
- Negligent reviewer, tenant administrator, developer, or operator.
- Abusive or compromised support administrator.
- Duplicate delivery, race condition, worker crash, provider timeout, and other non-malicious failure that creates security impact.

## Trust boundaries

The authoritative trust-boundary definitions are in [System Context](../architecture/system-context.md):

- TB-1: untrusted ingress to authenticated application context;
- TB-2: authenticated actor to authorized tenant operation;
- TB-3: tenant data boundary inside shared infrastructure;
- TB-4: deterministic application to probabilistic model provider;
- TB-5: application to external side-effect systems; and
- TB-6: core processing to telemetry and support access.

## Initial threat register

| ID | Threat | Boundary/assets | Initial required control direction | Priority |
|---|---|---|---|---|
| T-01 | Payload, prompt, or model output supplies another tenant ID and causes cross-tenant access | TB-1, TB-3; all tenant data | Derive tenant from verified context; tenant-scoped repositories, composite tenant relationships, filtered retrieval/storage/cache/workflow references; fail closed | Critical |
| T-02 | Direct or indirect prompt injection persuades the model to disclose data, ignore policy, or propose a forbidden tool | TB-4; documents, prompts, tools | Treat content and output as untrusted; bounded evidence; output schemas; independent authorization; allowlisted typed tools; adversarial evaluations | Critical |
| T-03 | A model proposal is treated as authorization or directly executes a side effect | TB-4, TB-5; approvals, external records | Enforce ADR-0001; separate proposal from execution; revalidate policy, permission, risk, approval, version, and state before execution | Critical |
| T-04 | Forged or replayed webhook creates unauthorized or duplicate processing | TB-1; requests, external records, cost | Verify signature, timestamp, source-to-tenant mapping, schema, nonce or receipt identity, and tenant-scoped idempotency key | High |
| T-05 | Retry, race, crash, or ambiguous timeout creates duplicate CRM records or communications | TB-5; external records | Stable idempotency/correlation identity, unique operation constraint, bounded retry, serialized state transition, reconciliation before repeat | Critical |
| T-06 | Reviewer or attacker bypasses approval, approves a stale proposal, or violates separation of duties | TB-2; proposal, approval, external records | Immutable proposal versions; one terminal decision per version; expiry; required permission; reviewer identity; freshness and policy recheck | Critical |
| T-07 | Unauthorized, expired, superseded, deleted, or poisoned content influences retrieval and decisions | TB-3, TB-4; documents, evidence | Tenant and eligibility filters before search; version activation; quarantine; provenance; citation validation; deletion/supersession exclusion tests | High |
| T-08 | Secrets, raw prompts, customer data, or tenant identifiers leak through logs, traces, errors, or support tools | TB-4, TB-6; credentials and customer data | Data minimization, structured redaction, no sensitive prompt logs, tenant pseudonyms, access controls, retention rules, audit of support access | High |
| T-09 | Stolen or over-privileged integration/service credential expands blast radius | TB-1, TB-5; credentials, external systems | Least-privilege scopes, separate tenant credentials, secret manager, rotation/revocation, no model credential access, usage audit | High |
| T-10 | Repeated or oversized input, model loops, retries, or document ingestion causes cost exhaustion or denial of service | TB-1, TB-4; availability and cost | Rate and size limits, tenant quotas, workflow token/step budgets, bounded retries, timeouts, spend cutoff, provider kill switch | High |
| T-11 | Support administrator gains standing or unobserved access to tenant data | TB-2, TB-6; all tenant assets | No standing access; explicit tenant/incident scope; reason, expiry, least privilege, approval where required, append-only audit | High |
| T-12 | Provider response, evaluation data, or configuration change silently weakens behavior | TB-4; model outputs, quality gates | Version prompts/models/configuration; immutable run references; evaluation gates; controlled promotion and rollback; normalized errors | Medium |
| T-13 | Audit records are modified or omit the actor, policy, evidence, approval, or external outcome | Internal; audit and non-repudiation | Append-only audit events, transactional recording with material changes, stable correlation IDs, restricted access, integrity verification plan | High |
| T-14 | Unsafe file type or rendered HTML causes malware, script execution, parser exploitation, or data exfiltration | TB-1; documents, operator devices | File allowlist, size/type validation, malware scanning, isolated parsing, safe rendering, no active content, quarantine on failure | High |

## Security invariants established on Day 1

- Tenant identity is never trusted from a body, document, prompt, model output, or tool argument.
- Authentication alone never authorizes a tenant operation.
- Model output has no direct path to persistence or external execution.
- High-risk actions require valid human approval.
- External writes require idempotency and reconciliation behavior.
- Evidence retrieval must filter tenant and eligibility before content reaches the model.
- Logs and traces must not contain secrets or sensitive raw prompts.
- Security controls fail closed when context, evidence, authorization, or state is missing.

## Assumptions to validate

- Each external request source can be mapped to exactly one tenant using verified configuration.
- Initial integrations support a usable idempotency key, external correlation lookup, or deterministic reconciliation strategy.
- Tenant data sensitivity is business-confidential but V1 does not claim certification for regulated-data handling.
- Human reviewers can be assigned stable identities and explicit permissions.
- Model providers used in production offer acceptable data-processing and retention controls.
- Support access can be implemented without direct unrestricted database access.

## Deferred to Day 7 or later security slices

- Complete data-flow diagram with data stores, processes, protocols, and trust-boundary crossings.
- STRIDE-style enumeration for every flow and store.
- Concrete abuse stories and adversarial fixtures.
- Control owner, implementation location, verification method, and residual-risk rating for every threat.
- Data classification, retention, deletion, residency, and key-management policy.
- Provider-specific privacy, retention, and training-use assessment.
- Webhook signing algorithm, replay window, credential rotation, and incident response procedure.
- File-scanning and parser-isolation technology selection.
- Support-access approval and break-glass procedure.
- Formal security acceptance criteria and release-blocking tests.

## Immediate design implications

- Preserve the model responsibility boundary in [ADR-0001](../adr/0001-model-responsibility-boundary.md).
- Keep tenant context explicit in every later data, repository, workflow, retrieval, tool, telemetry, and evaluation design.
- Require a reconciliation design before adding any write-capable integration.
- Do not log raw prompts or document content by default.
- Treat every new input channel, model capability, tool, and side effect as a threat-model change.
