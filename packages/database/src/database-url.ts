const POSTGRESQL_PROTOCOLS = new Set(['postgres:', 'postgresql:']);
const INVALID_MANAGED_DATABASE_URL_ERROR =
  'Database configuration error: APP_POSTGRES_URL must be a valid PostgreSQL URL.';
const UNSUPPORTED_MANAGED_DATABASE_PROTOCOL_ERROR =
  'Database configuration error: APP_POSTGRES_URL must use postgres: or postgresql:.';

export type DatabaseEnvironment = Readonly<Record<string, string | undefined>>;

function requireValue(environment: DatabaseEnvironment, name: string): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new Error(`Database configuration error: ${name} is required.`);
  }

  return value;
}

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error('Database configuration error: APP_POSTGRES_PORT must be an integer.');
  }

  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('Database configuration error: APP_POSTGRES_PORT must be between 1 and 65535.');
  }

  return port;
}

function resolveManagedDatabaseUrl(value: string, temporalDatabase: string | undefined): string {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error(INVALID_MANAGED_DATABASE_URL_ERROR);
  }

  if (!POSTGRESQL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(UNSUPPORTED_MANAGED_DATABASE_PROTOCOL_ERROR);
  }

  let database: string;
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
  } catch {
    throw new Error(INVALID_MANAGED_DATABASE_URL_ERROR);
  }

  if (temporalDatabase && database === temporalDatabase) {
    throw new Error(
      'Database configuration error: application migrations cannot target Temporal persistence.',
    );
  }

  return value;
}

export function resolveApplicationDatabaseUrl(environment: DatabaseEnvironment): string {
  const managedDatabaseUrl = environment['APP_POSTGRES_URL']?.trim();
  const temporalDatabase = environment['TEMPORAL_POSTGRES_ADMIN_DATABASE']?.trim();

  if (managedDatabaseUrl) {
    return resolveManagedDatabaseUrl(managedDatabaseUrl, temporalDatabase);
  }

  const port = parsePort(requireValue(environment, 'APP_POSTGRES_PORT'));
  const username = requireValue(environment, 'APP_POSTGRES_USER');
  const password = requireValue(environment, 'APP_POSTGRES_PASSWORD');
  const database = requireValue(environment, 'APP_POSTGRES_DATABASE');

  if (temporalDatabase && database === temporalDatabase) {
    throw new Error(
      'Database configuration error: application migrations cannot target Temporal persistence.',
    );
  }

  const url = new URL('postgresql://127.0.0.1');
  url.username = username;
  url.password = password;
  url.port = String(port);
  url.pathname = `/${database}`;

  if (!POSTGRESQL_PROTOCOLS.has(url.protocol)) {
    throw new Error('Database configuration error: expected a PostgreSQL connection URL.');
  }

  return url.toString();
}
