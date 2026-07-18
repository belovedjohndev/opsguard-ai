import {
  Request,
  failure,
  parseRequestId,
  parseTenantId,
  parseTenantMembershipId,
  success,
  type InvalidIdentifierError,
  type InvalidRequestDataError,
  type Result,
} from '@opsguard/domain';

import type { RequestRepository, RequestRepositoryError } from '../ports/request-repository.js';

export type CreateRequestCommand = Readonly<{
  tenantId: string;
  actorMembershipId: string;
  sourceType: string;
  sourceReference: string;
}>;

export type CreateRequestOutput = Readonly<{
  requestId: string;
  tenantId: string;
  status: 'received';
  createdAt: Date;
}>;

export type CreateRequestInputField =
  'actorMembershipId' | 'createdAt' | 'requestId' | 'sourceReference' | 'sourceType' | 'tenantId';

export type InvalidCreateRequestInputError = Readonly<{
  code: 'INVALID_CREATE_REQUEST_INPUT';
  field: CreateRequestInputField;
  reason: InvalidIdentifierError['reason'] | InvalidRequestDataError['reason'];
}>;

export type CreateRequestError =
  | InvalidCreateRequestInputError
  | Readonly<{ code: 'REQUEST_ALREADY_EXISTS' }>
  | Readonly<{ code: 'REQUEST_PERSISTENCE_UNAVAILABLE' }>
  | Readonly<{ code: 'UNEXPECTED_REQUEST_REPOSITORY_FAILURE' }>;

export type CreateRequestDependencies = Readonly<{
  requestRepository: RequestRepository;
  generateRequestId: () => string;
  clock: () => Date;
}>;

const invalidIdentifier = (
  field: 'actorMembershipId' | 'requestId' | 'tenantId',
  error: InvalidIdentifierError,
): InvalidCreateRequestInputError => ({
  code: 'INVALID_CREATE_REQUEST_INPUT',
  field,
  reason: error.reason,
});

const invalidRequestData = (error: InvalidRequestDataError): InvalidCreateRequestInputError => ({
  code: 'INVALID_CREATE_REQUEST_INPUT',
  field: error.field === 'changedAt' ? 'createdAt' : error.field,
  reason: error.reason,
});

const mapRepositoryError = (error: RequestRepositoryError): CreateRequestError => {
  switch (error.code) {
    case 'CONFLICT':
      return { code: 'REQUEST_ALREADY_EXISTS' };
    case 'UNAVAILABLE':
      return { code: 'REQUEST_PERSISTENCE_UNAVAILABLE' };
    case 'UNEXPECTED':
      return { code: 'UNEXPECTED_REQUEST_REPOSITORY_FAILURE' };
  }
};

export class CreateRequest {
  readonly #requestRepository: RequestRepository;
  readonly #generateRequestId: () => string;
  readonly #clock: () => Date;

  constructor(dependencies: CreateRequestDependencies) {
    this.#requestRepository = dependencies.requestRepository;
    this.#generateRequestId = dependencies.generateRequestId;
    this.#clock = dependencies.clock;
    Object.freeze(this);
  }

  async execute(
    command: CreateRequestCommand,
  ): Promise<Result<CreateRequestOutput, CreateRequestError>> {
    const tenantIdResult = parseTenantId(command.tenantId);

    if (!tenantIdResult.ok) {
      return failure(invalidIdentifier('tenantId', tenantIdResult.error));
    }

    const actorMembershipIdResult = parseTenantMembershipId(command.actorMembershipId);

    if (!actorMembershipIdResult.ok) {
      return failure(invalidIdentifier('actorMembershipId', actorMembershipIdResult.error));
    }

    const requestIdResult = parseRequestId(this.#generateRequestId());

    if (!requestIdResult.ok) {
      return failure(invalidIdentifier('requestId', requestIdResult.error));
    }

    const requestCreationResult = Request.create({
      id: requestIdResult.value,
      tenantId: tenantIdResult.value,
      sourceType: command.sourceType,
      sourceReference: command.sourceReference,
      createdByMembershipId: actorMembershipIdResult.value,
      createdAt: this.#clock(),
    });

    if (!requestCreationResult.ok) {
      return failure(invalidRequestData(requestCreationResult.error));
    }

    const snapshot = requestCreationResult.value.request.toSnapshot();

    const persistenceResult = await this.#requestRepository.createRequest({
      request: requestCreationResult.value.request,
      initialStatus: requestCreationResult.value.initialStatus,
      auditEvent: Object.freeze({
        tenantId: snapshot.tenantId,
        actorMembershipId: actorMembershipIdResult.value,
        eventType: 'request.created',
        entityType: 'request',
        entityId: snapshot.id,
        occurredAt: new Date(snapshot.createdAt.getTime()),
        metadata: Object.freeze({
          status: 'received',
          sourceType: snapshot.sourceType,
        }),
      }),
    });

    if (!persistenceResult.ok) {
      return failure(mapRepositoryError(persistenceResult.error));
    }

    return success(
      Object.freeze({
        requestId: snapshot.id,
        tenantId: snapshot.tenantId,
        status: 'received',
        createdAt: new Date(snapshot.createdAt.getTime()),
      }),
    );
  }
}
