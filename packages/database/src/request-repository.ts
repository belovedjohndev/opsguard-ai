import type { CreateRequestPersistence, RequestRepository } from '@opsguard/application';
import { failure, success } from '@opsguard/domain';

import type { OpsGuardDatabase } from './client.js';
import { mapRequestRepositoryError } from './postgres-errors.js';
import { auditEvents, requests, requestStatusHistory } from './schema/index.js';

export class DrizzleRequestRepository implements RequestRepository {
  readonly #database: OpsGuardDatabase;

  constructor(database: OpsGuardDatabase) {
    this.#database = database;
  }

  async createRequest(
    input: CreateRequestPersistence,
  ): ReturnType<RequestRepository['createRequest']> {
    const snapshot = input.request.toSnapshot();

    try {
      await this.#database.transaction(async (transaction) => {
        await transaction.insert(requests).values({
          id: snapshot.id,
          tenantId: snapshot.tenantId,
          sourceType: snapshot.sourceType,
          sourceReference: snapshot.sourceReference,
          createdByMembershipId: snapshot.createdByMembershipId,
          status: snapshot.status,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
        });

        await transaction.insert(requestStatusHistory).values({
          tenantId: input.initialStatus.tenantId,
          requestId: input.initialStatus.requestId,
          isInitial: true,
          previousStatus: input.initialStatus.previousStatus,
          nextStatus: input.initialStatus.nextStatus,
          changedByMembershipId: input.initialStatus.changedByMembershipId,
          changedAt: input.initialStatus.changedAt,
        });

        await transaction.insert(auditEvents).values({
          tenantId: input.auditEvent.tenantId,
          actorMembershipId: input.auditEvent.actorMembershipId,
          eventType: input.auditEvent.eventType,
          entityType: input.auditEvent.entityType,
          entityId: input.auditEvent.entityId,
          occurredAt: input.auditEvent.occurredAt,
          metadata: input.auditEvent.metadata,
        });
      });

      return success(undefined);
    } catch (error) {
      return failure(mapRequestRepositoryError(error));
    }
  }
}
