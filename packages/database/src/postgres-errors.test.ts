import { describe, expect, it } from 'vitest';

import { mapActiveMembershipResolverError, mapRequestRepositoryError } from './postgres-errors.js';

describe('PostgreSQL adapter error mapping', () => {
  it('unwraps a driver conflict from a query error cause', () => {
    const wrappedError = new Error('query failed', {
      cause: Object.assign(new Error('duplicate'), {
        code: '23505',
        constraint: 'requests_tenant_id_source_key',
      }),
    });

    expect(mapRequestRepositoryError(wrappedError)).toEqual({ code: 'CONFLICT' });
  });

  it('does not treat another unique constraint as a request conflict', () => {
    expect(
      mapRequestRepositoryError({
        code: '23505',
        constraint: 'requests_pkey',
      }),
    ).toEqual({ code: 'UNEXPECTED' });
  });

  it.each(['08006', '53300', '57P01'])('maps wrapped PostgreSQL %s to unavailable', (code) => {
    const wrappedError = { cause: { cause: { code } } };

    expect(mapRequestRepositoryError(wrappedError)).toEqual({ code: 'UNAVAILABLE' });
    expect(mapActiveMembershipResolverError(wrappedError)).toEqual({ code: 'UNAVAILABLE' });
  });

  it('fails closed for unknown and excessively nested errors', () => {
    expect(mapRequestRepositoryError(new Error('unknown'))).toEqual({ code: 'UNEXPECTED' });
    expect(
      mapRequestRepositoryError({ cause: { cause: { cause: { cause: { code: '08006' } } } } }),
    ).toEqual({ code: 'UNEXPECTED' });
  });
});
