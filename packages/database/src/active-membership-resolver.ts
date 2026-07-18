import type { ActiveMembershipResolver } from '@opsguard/auth';
import { failure, parseTenantMembershipId, success } from '@opsguard/domain';
import { and, eq } from 'drizzle-orm';

import type { OpsGuardDatabase } from './client.js';
import { mapActiveMembershipResolverError } from './postgres-errors.js';
import { tenantMemberships, tenants } from './schema/index.js';

export class DrizzleActiveMembershipResolver implements ActiveMembershipResolver {
  readonly #database: OpsGuardDatabase;

  constructor(database: OpsGuardDatabase) {
    this.#database = database;
  }

  async resolveActiveMembership(
    input: Parameters<ActiveMembershipResolver['resolveActiveMembership']>[0],
  ): ReturnType<ActiveMembershipResolver['resolveActiveMembership']> {
    try {
      const rows = await this.#database
        .select({
          membershipId: tenantMemberships.id,
          role: tenantMemberships.role,
        })
        .from(tenantMemberships)
        .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
        .where(
          and(
            eq(tenantMemberships.userId, input.userId),
            eq(tenantMemberships.tenantId, input.tenantId),
            eq(tenantMemberships.status, 'active'),
            eq(tenants.status, 'active'),
          ),
        )
        .limit(1);

      const row = rows[0];
      if (!row) {
        return success(null);
      }

      const membershipId = parseTenantMembershipId(row.membershipId);
      if (!membershipId.ok) {
        return failure({ code: 'UNEXPECTED' });
      }

      return success(Object.freeze({ membershipId: membershipId.value, role: row.role }));
    } catch (error) {
      return failure(mapActiveMembershipResolverError(error));
    }
  }
}
