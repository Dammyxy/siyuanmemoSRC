import { describe, expect, it, vi } from 'vitest';
import { PrivateApiService } from '../PrivateApiService';

describe('PrivateApiService', () => {
  it('rejects read and mutation when capability is unavailable', async () => {
    const service = new PrivateApiService({
      privateApiClient: {
        read: vi.fn(),
        mutate: vi.fn(),
      },
      auditService: {
        canExecute: vi.fn(() => ({
          available: false,
          reason: 'backend-not-ready',
          kernelSidecarAvailable: false,
          backendWorkerAvailable: false,
          writerAvailable: false,
          methodAllowed: false,
        })),
        ensurePayloadWithinLimit: vi.fn(),
        record: vi.fn(),
      },
    });

    await expect(service.read({
      method: 'private.read.cards',
      callerIntent: 'test-read',
      requestId: 'read-1',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: capability unavailable (backend-not-ready)');

    await expect(service.mutate({
      method: 'private.command.execute',
      callerIntent: 'test-mutate',
      requestId: 'mutation-1',
      idempotencyKey: 'key-1',
      params: { action: 'noop' },
    })).rejects.toThrow('BACKEND_UNAVAILABLE: capability unavailable (backend-not-ready)');
  });

  it('enforces idempotency, payload size guard, and audit for mutation', async () => {
    const mutate = vi.fn(async () => ({
      ok: true,
      commandId: 'cmd-1',
      writerInstanceId: 'writer-1',
      changed: {},
      result: { committed: true },
      auditStatus: 'recorded',
      diagnosticEventId: 'diag-1',
    }));
    const record = vi.fn();
    const ensurePayloadWithinLimit = vi.fn();
    const service = new PrivateApiService({
      privateApiClient: {
        read: vi.fn(),
        mutate,
      },
      auditService: {
        canExecute: vi.fn(() => ({
          available: true,
          reason: null,
          kernelSidecarAvailable: true,
          backendWorkerAvailable: true,
          writerAvailable: true,
          methodAllowed: true,
        })),
        ensurePayloadWithinLimit,
        record,
      },
      maxMutationPayloadBytes: 64,
    });

    const result = await service.mutate({
      method: 'private.command.execute',
      callerIntent: 'test-mutate',
      requestId: 'mutation-2',
      idempotencyKey: 'key-2',
      params: { action: 'noop' },
    });

    expect(ensurePayloadWithinLimit).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      ok: true,
      commandId: 'cmd-1',
    });
  });

  it('replays duplicate mutation idempotency keys without calling the backend twice', async () => {
    const mutate = vi.fn(async () => ({
      ok: true,
      commandId: 'cmd-first',
      writerInstanceId: 'writer-1',
      changed: { cardIds: ['card-1'] },
      result: { committed: true },
      auditStatus: 'recorded',
      diagnosticEventId: 'diag-first',
    }));
    const service = new PrivateApiService({
      privateApiClient: {
        read: vi.fn(),
        mutate,
      },
      auditService: {
        canExecute: vi.fn(() => ({
          available: true,
          reason: null,
          kernelSidecarAvailable: true,
          backendWorkerAvailable: true,
          writerAvailable: true,
          methodAllowed: true,
        })),
        ensurePayloadWithinLimit: vi.fn(),
        record: vi.fn(),
      },
    });

    const first = await service.mutate({
      method: 'private.command.execute',
      callerIntent: 'test-mutate',
      requestId: 'mutation-first',
      idempotencyKey: 'same-private-key',
      params: { action: 'noop' },
    });
    const second = await service.mutate({
      method: 'private.command.execute',
      callerIntent: 'test-mutate',
      requestId: 'mutation-second',
      idempotencyKey: 'same-private-key',
      params: { action: 'noop-again' },
    });

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(second.commandId).toBe('cmd-first');
  });

  it('rejects mutation without idempotency key', async () => {
    const service = new PrivateApiService({
      privateApiClient: {
        read: vi.fn(),
        mutate: vi.fn(),
      },
      auditService: {
        canExecute: vi.fn(() => ({
          available: true,
          reason: null,
          kernelSidecarAvailable: true,
          backendWorkerAvailable: true,
          writerAvailable: true,
          methodAllowed: true,
        })),
        ensurePayloadWithinLimit: vi.fn(),
        record: vi.fn(),
      },
    });

    await expect(service.mutate({
      method: 'private.command.execute',
      callerIntent: 'test-mutate',
      requestId: 'mutation-3',
      idempotencyKey: '',
      params: { action: 'noop' },
    })).rejects.toThrow('INVALID_REQUEST: private mutation requires idempotencyKey');
  });
});
