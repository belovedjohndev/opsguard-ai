export type ApiRuntimeConfig = Readonly<{
  host: string;
  port: number;
}>;

const DEFAULT_API_HOST = '127.0.0.1';
const DEFAULT_API_PORT = 3000;

const parsePort = (value: string | undefined): number => {
  if (value === undefined || value.trim().length === 0) {
    return DEFAULT_API_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port)) {
    throw new Error('API configuration error: API_PORT must be an integer.');
  }

  if (port < 1 || port > 65_535) {
    throw new Error('API configuration error: API_PORT must be between 1 and 65535.');
  }

  return port;
};

export const resolveApiRuntimeConfig = (
  environment: Readonly<Record<string, string | undefined>>,
): ApiRuntimeConfig => {
  const configuredHost = environment['API_HOST']?.trim();

  return Object.freeze({
    host:
      configuredHost === undefined || configuredHost.length === 0
        ? DEFAULT_API_HOST
        : configuredHost,
    port: parsePort(environment['API_PORT']),
  });
};
