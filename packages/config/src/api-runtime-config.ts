import { URL } from 'node:url';

export type ApiRuntimeConfig = Readonly<{
  assessmentTimeoutMilliseconds: number;
  corsAllowedOrigins: readonly string[];
  host: string;
  port: number;
}>;

const DEFAULT_API_HOST = '127.0.0.1';
const DEFAULT_API_PORT = 3000;
const DEFAULT_ASSESSMENT_TIMEOUT_MILLISECONDS = 30_000;
const DEFAULT_LOCAL_CORS_ORIGINS = Object.freeze([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
] as const);

type ApiPortEnvironmentVariable = 'API_PORT' | 'PORT';

const parsePort = (value: string, variable: ApiPortEnvironmentVariable): number => {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`API configuration error: ${variable} must be an integer.`);
  }

  const port = Number(normalized);

  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`API configuration error: ${variable} must be between 1 and 65535.`);
  }

  return port;
};

const resolvePort = (environment: Readonly<Record<string, string | undefined>>): number => {
  const apiPort = environment['API_PORT'];
  if (apiPort !== undefined && apiPort.trim().length > 0) {
    return parsePort(apiPort, 'API_PORT');
  }

  const platformPort = environment['PORT'];
  if (platformPort !== undefined && platformPort.trim().length > 0) {
    return parsePort(platformPort, 'PORT');
  }

  return DEFAULT_API_PORT;
};

const parseAssessmentTimeout = (value: string | undefined): number => {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_ASSESSMENT_TIMEOUT_MILLISECONDS;
  }

  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
    throw new Error(
      'API configuration error: ASSESSMENT_TIMEOUT_MS must be an integer between 1000 and 120000.',
    );
  }

  return timeout;
};

const parseCorsAllowedOrigins = (value: string | undefined): readonly string[] => {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_LOCAL_CORS_ORIGINS;
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0 || origins.includes('*')) {
    throw new Error(
      'API configuration error: API_CORS_ALLOWED_ORIGINS must list explicit origins.',
    );
  }

  const normalized = origins.map((origin) => {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(
        'API configuration error: API_CORS_ALLOWED_ORIGINS contains an invalid origin.',
      );
    }

    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      parsed.username.length > 0 ||
      parsed.password.length > 0
    ) {
      throw new Error(
        'API configuration error: API_CORS_ALLOWED_ORIGINS contains an invalid origin.',
      );
    }

    return parsed.origin;
  });

  return Object.freeze([...new Set(normalized)]);
};

export const resolveApiRuntimeConfig = (
  environment: Readonly<Record<string, string | undefined>>,
): ApiRuntimeConfig => {
  const configuredHost = environment['API_HOST']?.trim();

  return Object.freeze({
    assessmentTimeoutMilliseconds: parseAssessmentTimeout(environment['ASSESSMENT_TIMEOUT_MS']),
    corsAllowedOrigins: parseCorsAllowedOrigins(environment['API_CORS_ALLOWED_ORIGINS']),
    host:
      configuredHost === undefined || configuredHost.length === 0
        ? DEFAULT_API_HOST
        : configuredHost,
    port: resolvePort(environment),
  });
};
