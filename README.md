# OpsGuard AI

OpsGuard AI is a multi-tenant, AI-assisted operational workflow platform for controlled request intake, assessment, approval, integration execution, reconciliation, and audit.

This repository contains the Week 1 foundations through **Day 6: Fastify API and Tenant Context**.
It includes deterministic request creation and tenant-aware PostgreSQL persistence, but no model
provider, workflow, webhook, tool, document, retrieval, or production-authentication integration.

## Architectural guardrails

- AI output is an untrusted proposal, never authority.
- The deterministic application owns tenant context, authorization, validation, workflow state, approvals, side effects, retries, reconciliation, budgets, and audit.
- Dependencies point inward through application-owned contracts and ports.
- Later roadmap capabilities must not be implemented before their owning slice.

The accepted baselines are documented in:

- [Product problem statement](docs/product/problem-statement.md)
- [V1 scope](docs/product/scope-v1.md)
- [System context](docs/architecture/system-context.md)
- [Domain boundaries](docs/architecture/domain-boundaries.md)
- [ADR-0001: Model responsibility boundary](docs/adr/0001-model-responsibility-boundary.md)
- [Authoritative threat-model baseline](docs/security/threat-model.md)
- [Initial tenant-aware data model](docs/database/initial-data-model.md)
- [Database migrations and recovery](docs/database/migrations.md)

## Workspace structure

```text
apps/
  api/
  web/
  workflow-worker/
  evaluation-cli/
packages/
  domain/
  application/
  database/
  auth/
  contracts/
  ai-core/
  config/
  observability/
  testing/
```

Each workspace is private, uses ECMAScript modules, extends the shared strict TypeScript configuration, and participates in the shared lint, typecheck, test, and build task graph.

## Prerequisites

- Node.js 22.13 or newer
- pnpm 11
- Docker Engine with Docker Compose v2.20 or newer (for local infrastructure)

The exact pnpm version is pinned through the root `packageManager` field.

## Quality commands

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm format` to apply the shared Prettier configuration to supported foundation files. Day 1 documentation and uploaded source material are intentionally excluded from automated formatting.

## Local infrastructure

The local-only Compose environment provides PostgreSQL with pgvector available, isolated Temporal persistence, Redis, MinIO, Temporal and its UI, an OpenTelemetry Collector, and Jaeger.

```bash
cp .env.example .env
pnpm infra:config
pnpm infra:up
pnpm infra:ps
pnpm infra:down
```

See the [local environment guide](docs/development/local-environment.md) for endpoints, credentials, health checks, troubleshooting, and the explicitly guarded state-reset command.

## Database foundation

The application PostgreSQL schema contains the Day 4 tenant, user, membership, request,
request-history, AI-run metadata, prompt-version metadata, model-configuration metadata, and audit
tables. Composite foreign keys enforce same-tenant relationships at the database boundary. Day 6
adds active-membership resolution and atomic request, initial-history, and creation-audit persistence.
Row-level security, production authentication, broader request operations, and AI behavior remain
deferred.

```bash
pnpm db:generate
pnpm db:check
pnpm db:migrate
pnpm db:test
```

`pnpm db:test` creates and removes a guarded, randomly named isolated test database; it never resets
the normal application database. See the [migration and recovery guide](docs/database/migrations.md)
before changing or applying migrations.
