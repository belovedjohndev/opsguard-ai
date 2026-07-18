import type { Result, TenantId, TenantMembershipId, UserId } from '@opsguard/domain';

export const membershipRoles = [
  'owner',
  'operations_manager',
  'reviewer',
  'operator',
  'auditor',
] as const;

export type MembershipRole = (typeof membershipRoles)[number];

export type ActiveTenantMembership = Readonly<{
  membershipId: TenantMembershipId;
  role: MembershipRole;
}>;

export type ActiveMembershipResolverError =
  Readonly<{ code: 'UNAVAILABLE' }> | Readonly<{ code: 'UNEXPECTED' }>;

export type ResolveActiveMembershipInput = Readonly<{
  userId: UserId;
  tenantId: TenantId;
}>;

export interface ActiveMembershipResolver {
  resolveActiveMembership(
    input: ResolveActiveMembershipInput,
  ): Promise<Result<ActiveTenantMembership | null, ActiveMembershipResolverError>>;
}

export type VerifiedTenantContext = Readonly<{
  userId: UserId;
  tenantId: TenantId;
  membershipId: TenantMembershipId;
  role: MembershipRole;
  requestId: string;
}>;

export const createVerifiedTenantContext = (
  context: VerifiedTenantContext,
): VerifiedTenantContext => Object.freeze({ ...context });

const requestCreationRoles: ReadonlySet<MembershipRole> = new Set(membershipRoles);

export const canCreateRequest = (context: VerifiedTenantContext): boolean =>
  requestCreationRoles.has(context.role);
