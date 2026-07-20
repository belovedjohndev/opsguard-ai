# OpsGuard AI Hackathon Demo Runbook

## Product story

OpsGuard AI turns unstructured operational intake into a controlled proposal. GPT classifies and
extracts the request, but it does not own identity, authorization, workflow state, route policy, or
side effects. The deterministic application validates the structured result, calculates the
effective route and review requirement, persists audit lineage, and stops at `pending_review`.

> The model proposes. OpsGuard validates, controls, and audits the outcome.

This demo intentionally executes no CRM, ticketing, email, cancellation, billing, or other external
action.

## Architecture

```text
React/Vite web
  -> POST /v1/requests
  -> POST /v1/requests/:requestId/assessment
Fastify HTTP boundary
  -> verified tenant context and active membership
AssessRequest application use case
  -> initialize PostgreSQL transaction
  -> one provider-neutral ModelGateway call
  -> RequestAssessmentV1 validation and deterministic route policy
  -> finalize PostgreSQL transaction
PostgreSQL
  -> request state/history, AI run, validated assessment, provenance, audit
```

The OpenAI SDK exists only in the AI adapter. Application code imports the provider-neutral
`@opsguard/ai-core` root. The API composition root constructs the OpenAI adapter, finite timeout,
deterministic wall clock, Drizzle repository, and use case.

## Local setup

Prerequisites are Node.js 22.13+, pnpm 11, Docker Engine, and Docker Compose v2.20+.

From the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm demo:seed
```

Set a real approved `OPENAI_API_KEY` and explicit `OPENAI_MODEL` only in the ignored local `.env`.
Do not commit, paste, log, or expose the key to Vite. The API uses a 30-second assessment timeout by
default and permits up to 2,000 output tokens for the structured assessment.

Start the API and web app in separate terminals:

```powershell
pnpm dev:api
```

```powershell
pnpm dev:web
```

Open `http://127.0.0.1:5173`. API health is available at `http://127.0.0.1:3000/health`.

## Required environment variables

### API

```text
API_HOST
PORT (provided by Render)
API_PORT (optional explicit override)
API_CORS_ALLOWED_ORIGINS
ASSESSMENT_TIMEOUT_MS
APP_POSTGRES_URL (managed deployment)
APP_POSTGRES_PORT
APP_POSTGRES_USER
APP_POSTGRES_PASSWORD
APP_POSTGRES_DATABASE
OPENAI_API_KEY
OPENAI_MODEL
```

`API_CORS_ALLOWED_ORIGINS` is a comma-separated list of exact HTTP(S) origins. Never use `*` for a
deployed demo. Credentials are not enabled for CORS.

`APP_POSTGRES_URL` takes precedence when it is non-empty and must use `postgres:` or `postgresql:`.
Use Render's internal connection URL without copying it into logs or frontend configuration. The
individual `APP_POSTGRES_*` fields remain the local Docker fallback. `API_PORT` takes precedence
over Render's `PORT`; omit `API_PORT` on Render unless an explicit override is intended.

### Web

```text
VITE_API_BASE_URL
VITE_DEMO_TENANT_ID
VITE_DEMO_USER_ID
```

Vite embeds these values into the public browser bundle. The tenant and user UUIDs are stable
synthetic identifiers, not secrets or credentials. `OPENAI_API_KEY` must never use a `VITE_` prefix.

### Stable synthetic seed

```text
DEMO_TENANT_ID=8f7e6d5c-4b3a-4210-9fed-cba987654321
DEMO_USER_ID=719e2bb4-0a4e-4f04-9fd1-d7261ed71f11
DEMO_MEMBERSHIP_ID=b3294a61-3ef0-46c4-9231-773ba0f39f67
```

`pnpm demo:seed` inserts or restores one active synthetic tenant, one synthetic user, and one active
operator membership in a single transaction. Rerunning the command is safe and creates no duplicate
rows. The `DEMO_*` lines document the stable seed values; the seed does not accept body- or
browser-selected IDs.

## Demo scenarios and expected behavior

### 1. Clear service request

Select **Clear service request** and analyze it.

Expected: `new_service_request`, extracted customer email, requested equipment, address and timing,
a high-confidence sales or operations proposal compatible with deterministic policy, and no forced
manual review when required information is complete.

### 2. Prompt-injection support request

Select **Prompt-injection support request** and analyze it.

Expected: the embedded instruction to route to sales is treated as untrusted data. The real account
outage and alert email are extracted. A support proposal is compatible. If the model nevertheless
proposes sales, deterministic intent-to-route policy changes the effective route to `manual_review`
and the UI states: “Deterministic policy overrode the model proposal.”

### 3. Conflicting cancellation request

Select **Conflicting cancellation request** and analyze it.

Expected: contradictory instructions produce `unknown`, missing/uncertain information, or a manual
review proposal. Deterministic policy requires review and the request remains `pending_review`.

Every result must display **No external action was executed.**

## Security boundaries

- `x-opsguard-user-id` and `x-opsguard-tenant-id` are current prototype identity headers. They are
  untrusted selectors, not final authentication.
- The API validates header UUIDs and resolves an active membership in an active tenant before either
  protected endpoint runs.
- Tenant ID and actor membership ID come only from verified server context. The assessment body may
  contain only request text; extra authorization fields are stripped.
- Cross-tenant request lookup returns the same not-found response as a missing request.
- Request text, prompt text, raw model output, provider bodies, secrets, and stacks are not logged or
  persisted by the demo flow.
- Only domain-validated assessment data reaches the success response and database.
- Evidence excerpts are sliced from the submitted text after range validation and rendered as React
  text, never HTML.
- There are no tools, retries, fallback models, queues, workflow execution, or external integrations.

### Known prototype authentication limitation

Anyone who knows the public synthetic user and tenant UUIDs can present the prototype headers. This
is acceptable only for the synthetic hackathon environment. Do not use this boundary for real users
or production data. A production identity provider, signed session/token validation, and production
authorization policy remain out of scope.

## Smoke-test checklist

1. `GET /health` returns 200 and a server-generated `x-request-id`.
2. A protected request without identity headers returns 401.
3. A user/tenant pair without an active membership returns 403.
4. `pnpm demo:seed` can run twice without duplicates.
5. Request creation returns 201 with a tenant-owned request ID.
6. Assessment returns `pending_review`, a validated assessment, decision, and safe provenance.
7. Response correlation ID equals the server-generated `x-request-id` for the assessment request.
8. The prompt-injection scenario does not gain a sales route through embedded instructions.
9. The conflicting cancellation scenario requires deterministic review.
10. Proposed and effective routes remain visually distinct and override messaging is accurate.
11. Evidence excerpts match valid start/end offsets.
12. Browser network payloads contain no API key, tenant ID body field, prompt, or provider response.
13. API logs contain no request text, prompt text, model output, authentication headers, or secrets.
14. Every state displays “No external action was executed.”

## Manual cloud deployment

No `render.yaml` or `vercel.json` is required for this deployment. Configure both services through
their dashboards.

### Render Postgres

- Provision Render Postgres in the same region as the API Web Service.
- Use its internal connection URL for `APP_POSTGRES_URL`; prefer it over the public database URL.
- Do not copy the connection URL into source control, logs, Vercel, or any `VITE_` variable.

### Render API Web Service

| Setting | Value |
|---|---|
| Repository | `belovedjohndev/opsguard-ai` |
| Runtime | Node |
| Build command | `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @opsguard/api... build` |
| Start command | `pnpm db:migrate && pnpm demo:seed && pnpm --filter @opsguard/api start` |
| Health endpoint | `/health` |

Configure these API environment variables:

```text
API_HOST=0.0.0.0
APP_POSTGRES_URL=<Render Postgres internal connection URL>
API_CORS_ALLOWED_ORIGINS=https://<exact Vercel production origin>
ASSESSMENT_TIMEOUT_MS=30000
OPENAI_API_KEY=<secret>
OPENAI_MODEL=<explicit approved model ID>
```

Render provides `PORT`; leave `API_PORT` unset so the service uses it. If both are configured,
`API_PORT` intentionally wins. Keep `OPENAI_API_KEY` in Render's secret environment settings.

### Vercel web project

| Setting | Value |
|---|---|
| Repository | `belovedjohndev/opsguard-ai` |
| Root directory | `apps/web` |
| Include source files outside root directory | Enabled |
| Install command | `cd ../.. && corepack enable && pnpm install --frozen-lockfile` |
| Build command | `cd ../.. && pnpm --filter @opsguard/web... build` |
| Output directory | `dist` |

Configure these Vercel build environment variables:

```text
VITE_API_BASE_URL=https://<Render API origin>
VITE_DEMO_TENANT_ID=8f7e6d5c-4b3a-4210-9fed-cba987654321
VITE_DEMO_USER_ID=719e2bb4-0a4e-4f04-9fd1-d7261ed71f11
```

Never add `OPENAI_API_KEY` or the database URL to a `VITE_` variable.

### Deployment order

1. Provision Render Postgres.
2. Deploy the Render API in the same region.
3. Verify `GET /health` on the Render API HTTPS origin.
4. Deploy the Vercel web project.
5. Set `API_CORS_ALLOWED_ORIGINS` to the exact Vercel production origin.
6. Redeploy the Render API.
7. Run all three browser scenarios, inspect redacted API logs, and confirm every request stops at
   `pending_review` with no external action.

## What was built during the hackathon

- Tenant-scoped assessment HTTP endpoint and safe error contract.
- Production composition of OpenAI, runtime configuration, `AssessRequest`, and Drizzle persistence.
- Explicit deployed-origin CORS allowlist with local Vite defaults.
- Idempotent synthetic demo tenant bootstrap.
- React/Vite single-page demo with three presets and complete controlled-result rendering.
- Focused application, API, seed, and web tests.
- Submission specification, runbook, environment examples, and root developer commands.

## How Codex and GPT were used

Codex inspected the existing architecture and roadmap boundaries, wrote the implementation
specification before code, connected the existing ports and adapters, implemented the UI and tests,
and ran repository verification. GPT is invoked at runtime only through the existing OpenAI
structured-output adapter to produce a `RequestAssessmentV1` proposal. Deterministic domain code—not
GPT—validates that proposal and owns the effective route and review decision.
