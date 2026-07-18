import type { RequestRepositoryError } from '@opsguard/application';
import type { ActiveMembershipResolverError } from '@opsguard/auth';

type PostgreSqlError = Readonly<{
  code: string;
  constraint?: string;
}>;

const unavailableCodes = new Set(['53300', '53400', '57P01', '57P02', '57P03']);

const isPostgreSqlError = (error: unknown): error is PostgreSqlError => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return typeof (error as Record<string, unknown>)['code'] === 'string';
};

const isUnavailable = (error: PostgreSqlError): boolean =>
  error.code.startsWith('08') || unavailableCodes.has(error.code);

export const mapRequestRepositoryError = (error: unknown): RequestRepositoryError => {
  if (!isPostgreSqlError(error)) {
    return { code: 'UNEXPECTED' };
  }

  if (error.code === '23505' && error.constraint === 'requests_tenant_id_source_key') {
    return { code: 'CONFLICT' };
  }

  return isUnavailable(error) ? { code: 'UNAVAILABLE' } : { code: 'UNEXPECTED' };
};

export const mapActiveMembershipResolverError = (error: unknown): ActiveMembershipResolverError => {
  if (!isPostgreSqlError(error)) {
    return { code: 'UNEXPECTED' };
  }

  return isUnavailable(error) ? { code: 'UNAVAILABLE' } : { code: 'UNEXPECTED' };
};
