# Local development environment

## Purpose and prerequisites

Week 1, Day 3 provides a reproducible, local-only infrastructure environment. It requires:

- Node.js 22.13 or newer and pnpm 11;
- Docker Engine 24 or newer, or a current Docker Desktop release;
- Docker Compose v2.20 or newer, including support for `up --wait` and service health dependencies;
- approximately 6 GB of free memory and 10 GB of free disk space for images and persistent local data.

The defaults are intentionally safe for one developer workstation. They are not production credentials, secret-management guidance, or deployment configuration.

## Environment setup

From the repository root, create the ignored local environment file:

```bash
cp .env.example .env
pnpm infra:config
pnpm infra:up
```

On PowerShell, use `Copy-Item .env.example .env`. Change host ports in `.env` when defaults conflict. All published ports are hard-bound to `127.0.0.1`; changing a port variable does not make a service publicly accessible.

The usernames, passwords, database names, and published ports come from `.env`. Compose provides the same safe local defaults when `.env` is absent, but copying the example makes configuration explicit. Credentials must change in shared, staging, and production environments. Fixed internal service names and container ports are deliberately not duplicated as environment variables.

## Services and endpoints

| Service             | Purpose                                                              | Host endpoint                                | Internal endpoint                          | Health check              |
| ------------------- | -------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------ | ------------------------- |
| `app-postgres`      | Future OpsGuard application persistence; pgvector binaries available | `127.0.0.1:5432`                             | `app-postgres:5432`                        | `pg_isready`              |
| `temporal-postgres` | Isolated Temporal persistence                                        | `127.0.0.1:5433`                             | `temporal-postgres:5432`                   | `pg_isready`              |
| `redis`             | Future local cache/coordination substrate; no keys or queues created | `127.0.0.1:6379`                             | `redis:6379`                               | Authenticated `PING`      |
| `minio`             | S3-compatible local object storage                                   | `http://127.0.0.1:9000`                      | `http://minio:9000`                        | `/minio/health/live`      |
| `minio` console     | Browser administration for local object storage                      | `http://127.0.0.1:9001`                      | `http://minio:9001`                        | Console root              |
| `temporal`          | Temporal frontend and local development server                       | `127.0.0.1:7233`                             | `temporal:7233`                            | `tctl cluster health`     |
| `temporal-ui`       | Temporal browser UI                                                  | `http://127.0.0.1:8233`                      | `http://temporal-ui:8080`                  | UI root                   |
| `otel-collector`    | Receives local OTLP traces and exports only to Jaeger                | gRPC `127.0.0.1:4317`; HTTP `127.0.0.1:4318` | `otel-collector:4317/4318`                 | `http://127.0.0.1:13133/` |
| `jaeger`            | Ephemeral local trace query UI and OTLP ingestion                    | `http://127.0.0.1:16686`                     | UI `jaeger:16686`; OTLP gRPC `jaeger:4317` | UI root/API               |

If a port is overridden in `.env`, substitute that value in host commands. Container-to-container endpoints do not change.

## Local credentials

| Resource               | Username/default database                                | Password                       |
| ---------------------- | -------------------------------------------------------- | ------------------------------ |
| Application PostgreSQL | `opsguard_app` / `opsguard_app_dev`                      | `opsguard_app_local_2026`      |
| Temporal PostgreSQL    | `opsguard_temporal` / admin DB `opsguard_temporal_admin` | `opsguard_temporal_local_2026` |
| Redis                  | No username                                              | `opsguard_redis_local_2026`    |
| MinIO                  | `opsguard_minio`                                         | `opsguard_minio_local_2026`    |

These values are local-development-only. Do not reuse them or commit a populated `.env`. Redis has no native environment-variable password setting, so its local entrypoint expands `REDIS_PASSWORD` into the server option; the value stays out of the Compose file but may be visible through local Docker process inspection.

## Internal communication and state

All containers join the explicit `opsguard-ai-local` bridge network and resolve each other by service name. Only the ports in the table are published, and every publication binds to loopback. Temporal connects only to `temporal-postgres`; it never uses the future OpsGuard application database.

Persistent named volumes are:

- `opsguard-ai-app-postgres-data`;
- `opsguard-ai-temporal-postgres-data`;
- `opsguard-ai-redis-data`;
- `opsguard-ai-minio-data`.

Jaeger intentionally uses in-memory trace storage: traces are diagnostic local data and may disappear when its container restarts. No MinIO bucket is bootstrapped because Day 3 has no application object-storage contract.

## Health and inspection

Check aggregate state with:

```bash
docker compose ps
pnpm infra:ps
```

Inspect each service as follows:

```bash
# PostgreSQL readiness and pgvector availability (availability does not install it)
docker compose exec app-postgres pg_isready -U opsguard_app -d opsguard_app_dev
docker compose exec app-postgres psql -U opsguard_app -d opsguard_app_dev -c "SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name = 'vector';"

# Temporal's isolated PostgreSQL
docker compose exec temporal-postgres pg_isready -U opsguard_temporal -d opsguard_temporal_admin

# Authenticated Redis ping
docker compose exec redis sh -lc 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli --no-auth-warning ping'

# HTTP services and the collector health extension
curl --fail http://127.0.0.1:9000/minio/health/live
curl --fail http://127.0.0.1:9001/
docker compose exec temporal tctl --address temporal:7233 cluster health
curl --fail http://127.0.0.1:8233/
curl --fail http://127.0.0.1:13133/
curl --fail http://127.0.0.1:16686/
```

Open the MinIO console at `http://127.0.0.1:9001`, Temporal UI at `http://127.0.0.1:8233`, and Jaeger at `http://127.0.0.1:16686`. PostgreSQL clients can use the credentials above. Redis clients must supply the password. Collector configuration and startup failures are visible with `pnpm infra:logs otel-collector`.

To send a synthetic trace without adding application instrumentation, run the pinned OpenTelemetry generator on the project network:

```bash
docker run --rm --network opsguard-ai-local ghcr.io/open-telemetry/opentelemetry-collector-contrib/telemetrygen:v0.153.0 traces --otlp-endpoint otel-collector:4317 --otlp-insecure --traces 1 --service opsguard-infra-check
curl --fail http://127.0.0.1:16686/api/services
```

The Jaeger response and UI should list `opsguard-infra-check`. The collector has no external exporter and no logging exporter that prints trace payloads.

## Stop, restart, and reset

Stop containers without deleting data, then restart from the same volumes:

```bash
pnpm infra:down
pnpm infra:up
```

Follow logs with `pnpm infra:logs`, or append a service name such as `pnpm infra:logs temporal`. Reset is deliberately destructive and requires an explicit flag:

```bash
pnpm infra:reset --confirm
```

Reset runs Compose down with volumes for the fixed `opsguard-ai` project. It removes this project's containers, network, and the four named volumes; it does not prune images, networks, volumes, or containers belonging to other projects.

## Troubleshooting

### Docker or Compose is unavailable

Start Docker Desktop or the Docker daemon and verify `docker info` and `docker compose version`. The pnpm infrastructure commands provide a focused error if the CLI, Compose plugin, or daemon is unavailable.

### A service does not become healthy

Run `docker compose ps` and `pnpm infra:logs <service>`. First startup can take longer while images download and Temporal initializes its databases. Confirm at least 6 GB of memory is available to Docker. A previous incompatible data volume may require the guarded reset, but inspect logs before deleting state.

### A host port is already allocated

Identify the conflicting process, or change only the relevant `*_PORT` value in `.env`, then run `pnpm infra:config` and `pnpm infra:up`. Common conflicts are local PostgreSQL on 5432, Redis on 6379, and MinIO on 9000. Internal ports and service-to-service addresses remain unchanged.

### Credentials do not match existing state

PostgreSQL and MinIO initialize credentials only when their data volumes are first created. Changing `.env` later does not rewrite stored identities. Restore the original values or, if local data is disposable, use the confirmed reset and recreate the environment.

### Windows notes

Use Docker Desktop with the WSL 2 backend and run commands consistently from PowerShell or a WSL shell. Use `Copy-Item` instead of `cp` in PowerShell. If a loopback port appears unavailable, check Windows services, WSL port forwarding, VPN software, and endpoint-security rules. The bind-mounted collector YAML must remain inside a Docker Desktop shared filesystem.

## Intentionally deferred after Day 3

This environment creates no application tables, migrations, pgvector extension or indexes, Redis keys or queues, MinIO buckets, Temporal workflows or workers, API routes, UI, authentication, AI provider integration, document ingestion, production secrets, Terraform, Kubernetes, or deployment configuration. Those belong to later roadmap slices. The deterministic application boundary and the rule that AI output is an untrusted proposal remain unchanged.
