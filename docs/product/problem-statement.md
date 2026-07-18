# OpsGuard AI Problem Statement

**Roadmap slice:** Week 1, Day 1 — Product Scope and Architectural Boundaries  
**Status:** Accepted baseline  
**Date:** 2026-07-17

## Product statement

OpsGuard AI is a multi-tenant, AI-assisted operational workflow platform for service businesses and operational agencies. It reduces manual request triage while keeping every consequential decision authorized, evidence-backed, reviewable, auditable, and recoverable.

## Target customer

The initial customer is an operational team that receives service requests through forms, email, documents, or system integrations and must turn those requests into consistent internal or external actions. The primary segments are:

- service-business agencies;
- HVAC, construction, maintenance, and field-service operators;
- automation agencies managing workflows for multiple client organizations; and
- organizations whose request volume has outgrown manual inbox, spreadsheet, and CRM triage.

The economic buyer is usually a tenant owner or operations manager. Daily users include reviewers, operators, auditors, and narrowly scoped service accounts.

## Problem

Operational teams repeatedly perform the same intake work by hand:

1. identify the customer and request type;
2. extract names, locations, dates, services, and other required facts;
3. check service catalogs, tenant policies, and missing information;
4. decide how the request should be routed;
5. prepare a response or business record;
6. obtain approval for risky actions; and
7. record what was decided and whether an external action succeeded.

This work is slow and inconsistent. Important requests can be delayed, facts can be copied incorrectly, duplicate records can be created, and policy decisions can be difficult to explain later. Conventional automation helps only when inputs are already structured. Unconstrained AI can interpret messy inputs but introduces unacceptable uncertainty around tenant access, authorization, policy, side effects, cost, and recovery.

## Why the problem is difficult

The workflow crosses two fundamentally different kinds of responsibility:

- **Probabilistic interpretation:** classifying intent, extracting facts, ranking evidence, identifying missing information, and drafting a proposed response.
- **Deterministic control:** resolving tenant and actor identity, enforcing authorization, validating schemas and business rules, managing workflow state, requiring approval, executing side effects exactly once, reconciling unknown outcomes, and preserving audit evidence.

Treating model output as a final decision would allow an unreliable component to control security and business effects. Treating the entire workflow as deterministic would fail on the unstructured and variable inputs that create the manual workload. OpsGuard AI must combine both without confusing their authority.

## First business workflow

V1 centers on service-request intake:

1. receive a request from an allowed channel;
2. authenticate or verify the source and derive the tenant context;
3. reject malformed input and deduplicate retries;
4. ask a model to classify intent, extract facts, identify missing information, and propose a route;
5. validate the structured result and apply deterministic policy, risk, and authorization rules;
6. route uncertain or high-risk proposals to a human reviewer;
7. execute only an authorized and current proposal through an approved integration;
8. reconcile timeouts or unknown external outcomes without duplicating effects; and
9. record the decision, evidence, versions, actor, cost, and final outcome.

## Desired business result

The product should give operational teams:

- less manual intake and copying;
- faster and more consistent request routing;
- fewer duplicate or missing records;
- clearer exception and approval queues;
- visible evidence for decisions;
- measurable quality, latency, and cost; and
- reliable recovery when a provider, worker, or external integration fails.

The capstone targets are a 60–80% reduction in initial triage time, at least 90% required-field extraction accuracy on the evaluation set, 100% manual approval for high-risk actions, zero cross-tenant retrievals in tests, zero duplicated external writes during replay tests, and measured cost per completed request. These are engineering targets for the capstone, not client promises.

## Product principles

- AI outputs are proposals, never authority.
- Tenant identity comes from authenticated application context, never request content or model output.
- The application owns state transitions, transactions, approvals, retries, side effects, and recovery.
- When evidence is unavailable or confidence is insufficient, the system abstains and requests review.
- Every consequential action must be attributable to an actor, policy, proposal version, and external correlation or idempotency record.
- Multi-tenant isolation is an invariant, not a feature flag.

## Problem boundaries

OpsGuard AI is not intended to be a general-purpose autonomous agent, a replacement for a CRM or ticketing system, or a system that permits a model to make financial, contractual, destructive, or security decisions. Detailed inclusions and exclusions are defined in [V1 Scope](scope-v1.md).

