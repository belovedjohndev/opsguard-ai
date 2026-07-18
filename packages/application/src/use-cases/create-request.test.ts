import { failure, success, type Result } from '@opsguard/domain';
import { describe, expect, it, vi } from 'vitest';

import type {
  CreateRequestPersistence,
  RequestRepository,
  RequestRepositoryError,
} from '../ports/request-repository.js';
import { CreateRequest, type CreateRequestCommand } from './create-request.js';

const tenantId = '018f47d2-68df-7a8b-9c01-23456789abcd';
const actorMembershipId = '018f47d2-68df-7a8b-9c01-23456789abce';
const requestId = '018f47d2-68df-7a8b-9c01-23456789abcf';
const now = new Date('2026-07-18T09:00:00.000Z');

const validCommand: CreateRequestCommand = {
  tenantId,
  actorMembershipId,
  sourceType: 'form',
  sourceReference: 'form-submission-42',
};

class InMemoryRequestRepository implements RequestRepository {
  readonly calls: CreateRequestPersistence[] = [];

  constructor(private readonly result: Result<void, RequestRepositoryError> = success(undefined)) {}

  createRequest(input: CreateRequestPersistence): Promise<Result<void, RequestRepositoryError>> {
    this.calls.push(input);
    return Promise.resolve(this.result);
  }
}

const createUseCase = (
  requestRepository: RequestRepository,
  overrides: Partial<{
    generateRequestId: () => string;
    clock: () => Date;
  }> = {},
): CreateRequest =>
  new CreateRequest({
    requestRepository,
    generateRequestId: overrides.generateRequestId ?? (() => requestId),
    clock: overrides.clock ?? (() => now),
  });

describe('CreateRequest', () => {
  it('persists the request and initial history through one atomic repository call', async () => {
    const repository = new InMemoryRequestRepository();
    const useCase = createUseCase(repository);

    const result = await useCase.execute(validCommand);

    expect(result.ok).toBe(true);
    expect(repository.calls).toHaveLength(1);
    expect(repository.calls[0]?.request.toSnapshot()).toEqual({
      id: requestId,
      tenantId,
      sourceType: 'form',
      sourceReference: 'form-submission-42',
      createdByMembershipId: actorMembershipId,
      status: 'received',
      createdAt: now,
      updatedAt: now,
    });
    expect(repository.calls[0]?.initialStatus).toEqual({
      kind: 'initial',
      tenantId,
      requestId,
      previousStatus: null,
      nextStatus: 'received',
      changedAt: now,
      changedByMembershipId: actorMembershipId,
    });
  });

  it('uses deterministic request-ID and clock dependencies', async () => {
    const repository = new InMemoryRequestRepository();
    const generateRequestId = vi.fn(() => requestId);
    const clock = vi.fn(() => now);
    const useCase = createUseCase(repository, { generateRequestId, clock });

    const result = await useCase.execute(validCommand);

    expect(result).toEqual({
      ok: true,
      value: {
        requestId,
        tenantId,
        status: 'received',
        createdAt: now,
      },
    });
    expect(generateRequestId).toHaveBeenCalledOnce();
    expect(clock).toHaveBeenCalledOnce();
  });

  it.each([
    ['tenantId', { tenantId: 'invalid' }],
    ['actorMembershipId', { actorMembershipId: '' }],
    ['sourceType', { sourceType: 'chat' }],
    ['sourceReference', { sourceReference: '   ' }],
  ] as const)('does not persist invalid %s input', async (_field, override) => {
    const repository = new InMemoryRequestRepository();
    const useCase = createUseCase(repository);

    const result = await useCase.execute({ ...validCommand, ...override });

    expect(result.ok).toBe(false);
    expect(repository.calls).toHaveLength(0);
  });

  it('maps a repository conflict to RequestAlreadyExists', async () => {
    const repository = new InMemoryRequestRepository(failure({ code: 'CONFLICT' }));
    const useCase = createUseCase(repository);

    const result = await useCase.execute(validCommand);

    expect(result).toEqual({ ok: false, error: { code: 'REQUEST_ALREADY_EXISTS' } });
    expect(repository.calls).toHaveLength(1);
  });

  it('maps repository unavailability without persistence details', async () => {
    const repository = new InMemoryRequestRepository(failure({ code: 'UNAVAILABLE' }));
    const useCase = createUseCase(repository);

    const result = await useCase.execute(validCommand);

    expect(result).toEqual({
      ok: false,
      error: { code: 'REQUEST_PERSISTENCE_UNAVAILABLE' },
    });
  });

  it('maps an unexpected repository failure without leaking adapter errors', async () => {
    const repository = new InMemoryRequestRepository(failure({ code: 'UNEXPECTED' }));
    const useCase = createUseCase(repository);

    const result = await useCase.execute(validCommand);

    expect(result).toEqual({
      ok: false,
      error: { code: 'UNEXPECTED_REQUEST_REPOSITORY_FAILURE' },
    });
  });

  it('returns only the intended application response and has no model dependency', async () => {
    const repository = new InMemoryRequestRepository();
    const useCase = createUseCase(repository);

    const result = await useCase.execute(validCommand);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.keys(result.value).sort()).toEqual([
      'createdAt',
      'requestId',
      'status',
      'tenantId',
    ]);
  });
});
