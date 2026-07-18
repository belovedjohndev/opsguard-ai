# Database migrations and recovery

## Scope

Week 1, Day 4 adds the first code-first Drizzle schema and checked-in PostgreSQL migration for the
OpsGuard application database. These commands operate only on the `app-postgres` connection defined
by `APP_POSTGRES_PORT`, `APP_POSTGRES_USER`, `APP_POSTGRES_PASSWORD`, and
`APP_POSTGRES_DATABASE`.

The database configuration refuses a target whose database name matches
`TEMPORAL_POSTGRES_ADMIN_DATABASE`. Migration code does not use the Temporal port, user, password,
service name, or database.

## Files

```text
packages/database/
  drizzle.config.ts
  migrations/
    0000_initial_tenant_model.sql
    meta/
      0000_snapshot.json
      _journal.json
  src/schema/
```

The TypeScript schema is the code-first source. SQL, snapshot, and journal files are reviewed and
committed migration artifacts. Drizzle metadata is generator-owned and excluded from automatic
formatting.

## Commands

From the repository root:

```bash
pnpm db:generate
pnpm db:check
pnpm db:migrate
pnpm db:test
```

- `db:generate` compares the Drizzle schema with the latest checked-in snapshot and creates a new
  migration when the model changes. Review generated SQL before staging it. Direct schema push is
  not an accepted workflow.
- `db:check` validates migration snapshot/journal consistency. It does not connect to PostgreSQL or
  prove that SQL applies successfully.
- `db:migrate` applies pending checked-in migrations to `APP_POSTGRES_DATABASE` and records them in
  `drizzle.__drizzle_migrations`. This command is forward-only and must be run against an explicitly
  selected environment.
- `db:test` is the destructive integration lane. It connects through the application PostgreSQL
  settings, creates a random database named `opsguard_test_<32 lowercase hex characters>`, migrates
  it from empty state, verifies fixtures and constraints, and drops it. Cleanup refuses any database
  outside that exact naming pattern. It never resets `APP_POSTGRES_DATABASE`.

`pnpm test` remains database-free. Run `pnpm db:test` separately whenever a schema, migration,
database script, or PostgreSQL-dependent CI change is reviewed.

## Local workflow

1. Start the Day 3 application PostgreSQL service with `pnpm infra:up`.
2. Confirm the intended local values in the ignored `.env` file. Do not print or commit passwords.
3. Change the Drizzle schema.
4. Run `pnpm db:generate` and inspect the SQL plus metadata diff.
5. Run `pnpm db:check` and `pnpm db:test`.
6. Apply to the normal local development database only when needed with `pnpm db:migrate`.

The initial migration does not enable pgvector because no Day 4 table has a vector column. The
pgvector-capable image remains available for a later retrieval migration.

## Production migration policy

Day 4 does not add deployment automation. A future production migration procedure must:

- select credentials through the deployment secret manager rather than a committed `.env` file;
- verify the exact host, database, and migration set before execution;
- take or verify a recoverable backup/point-in-time recovery position;
- assess locks, duration, compatibility, and data transformation before rollout;
- apply migrations once through a controlled release job; and
- monitor the migration log and application health before promotion continues.

The current migration is additive and runs in Drizzle's migration transaction. Later migrations
must not assume all PostgreSQL DDL or external work can share the same transaction.

## Rollback and recovery

There are no automatic down migrations. The repository does not claim reversible destructive DDL.

- Before a production migration, recovery is based on a verified backup or point-in-time restore.
- When existing data can be preserved, prefer a reviewed compensating migration or forward fix.
- A failed transactional migration should leave its migration record unapplied; investigate the
  PostgreSQL error before retrying.
- A migration that partially succeeds outside a transaction requires an incident-specific recovery
  plan; do not edit the migration journal or production schema manually to hide drift.
- Local test databases may be discarded only through the guarded `opsguard_test_*` cleanup path.
- The normal local application database may be reset only through a separately reviewed operational
  procedure. `db:test` and `db:migrate` do not provide that reset.

Data-preserving table replacements, backfills, enum retirement, large indexes, and destructive
column changes require expand/migrate/contract sequencing and a task-specific recovery rehearsal in
later roadmap work.
