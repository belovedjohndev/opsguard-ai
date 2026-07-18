import type { RequestRepositoryError } from '@opsguard/application';
import type { ActiveMembershipResolverError } from '@opsguard/auth';

type PostgreSqlError = Readonly<{
  code: string;
  constraint?: string;
}>;

const unavailableCodes = new Set(['53300', '53400', '57P01', '57P02', '57P03']);

const asPostgreSqlError = (error: unknown): PostgreSqlError | null => {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const record = error as Record<string, unknown>;
  if (typeof record['code'] === 'string') {
    return {
      code: record['code'],
      ...(typeof record['constraint'] === 'string' ? { constraint: record['constraint'] } : {}),
    };
  }

  return null;
};

const findPostgreSqlError = (error: unknown): PostgreSqlError | null => {
  let candidate = error;

  for (let depth = 0; depth < 4; depth += 1) {
    const postgreSqlError = asPostgreSqlError(candidate);
    if (postgreSqlError !== null) {
      return postgreSqlError;
    }

    if (typeof candidate !== 'object' || candidate === null || !('cause' in candidate)) {
      return null;
    }

    candidate = candidate.cause;
  }

  return null;
};

const isUnavailable = (error: PostgreSqlError): boolean =>
  error.code.startsWith('08') || unavailableCodes.has(error.code);

export const mapRequestRepositoryError = (error: unknown): RequestRepositoryError => {
  const postgreSqlError = findPostgreSqlError(error);
  if (postgreSqlError === null) {
    return { code: 'UNEXPECTED' };
  }

  if (
    postgreSqlError.code === '23505' &&
    postgreSqlError.constraint === 'requests_tenant_id_source_key'
  ) {
    return { code: 'CONFLICT' };
  }

  return isUnavailable(postgreSqlError) ? { code: 'UNAVAILABLE' } : { code: 'UNEXPECTED' };
};

export const mapActiveMembershipResolverError = (error: unknown): ActiveMembershipResolverError => {
  const postgreSqlError = findPostgreSqlError(error);
  if (postgreSqlError === null) {
    return { code: 'UNEXPECTED' };
  }

  return isUnavailable(postgreSqlError) ? { code: 'UNAVAILABLE' } : { code: 'UNEXPECTED' };
};
