import { describe, expect, it, vi } from 'vitest';
import { BackendKernel } from '../bootstrap/BackendKernel';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';

describe('BackendKernel foreign-epoch recovery dispatch', () => {
  it('dispatches preview, apply, and status without normal storage preflight', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const mergeExternalDatabaseIfChanged = vi.spyOn(database, 'mergeExternalDatabaseIfChanged');
    const foreignEpochRecoveryRuntime = {
      preview: vi.fn(async () => ({ operation: 'preview' })),
      apply: vi.fn(async () => ({ operation: 'apply' })),
      status: vi.fn(async () => ({ operation: 'status' })),
    };
    const kernel = new BackendKernel({
      database,
      foreignEpochRecoveryRuntime: foreignEpochRecoveryRuntime as never,
    });

    await expect(kernel.handle({
      id: 'recovery-preview',
      jsonrpc: '2.0',
      method: 'recovery.foreignEpoch.preview',
      params: [{ expectedStage: 'authority-publication' }],
    })).resolves.toMatchObject({ result: { operation: 'preview' } });
    await expect(kernel.handle({
      id: 'recovery-apply',
      jsonrpc: '2.0',
      method: 'recovery.foreignEpoch.apply',
      params: [{ operationId: 'operation-a' }],
    })).resolves.toMatchObject({ result: { operation: 'apply' } });
    await expect(kernel.handle({
      id: 'recovery-status',
      jsonrpc: '2.0',
      method: 'recovery.foreignEpoch.status',
      params: [{ operationId: 'operation-a' }],
    })).resolves.toMatchObject({ result: { operation: 'status' } });

    expect(foreignEpochRecoveryRuntime.preview).toHaveBeenCalledWith({
      expectedStage: 'authority-publication',
    });
    expect(foreignEpochRecoveryRuntime.apply).toHaveBeenCalledWith({ operationId: 'operation-a' });
    expect(foreignEpochRecoveryRuntime.status).toHaveBeenCalledWith({ operationId: 'operation-a' });
    expect(mergeExternalDatabaseIfChanged).not.toHaveBeenCalled();
  });

  it('feeds ordinary db.load readiness back into restart verification', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const foreignEpochRecoveryRuntime = {
      preview: vi.fn(),
      apply: vi.fn(),
      status: vi.fn(),
      verifyRestart: vi.fn(async () => true),
    };
    const kernel = new BackendKernel({
      database,
      foreignEpochRecoveryRuntime: foreignEpochRecoveryRuntime as never,
    });

    await expect(kernel.handle({
      id: 'db-load-after-recovery',
      jsonrpc: '2.0',
      method: 'db.load',
      params: [{
        startupIdentityDisposition: {
          version: 1,
          status: 'verified',
          writable: true,
          retryable: false,
          deviceId: 'device-a',
          identityEpoch: 'epoch-current',
          source: 'installation-authority',
          reason: null,
        },
      }],
    })).resolves.toMatchObject({
      result: {
        readiness: { status: 'ready', writable: true },
      },
    });
    expect(foreignEpochRecoveryRuntime.verifyRestart).toHaveBeenCalledWith(expect.objectContaining({
      status: 'ready',
      writable: true,
    }));
  });

  it('never invokes recovery apply from ordinary startup classification', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const foreignEpochRecoveryRuntime = {
      preview: vi.fn(),
      apply: vi.fn(),
      status: vi.fn(),
      verifyRestart: vi.fn(async () => false),
    };
    const kernel = new BackendKernel({
      database,
      foreignEpochRecoveryRuntime: foreignEpochRecoveryRuntime as never,
    });

    await expect(kernel.handle({
      id: 'db-load-read-only-recovery',
      jsonrpc: '2.0',
      method: 'db.load',
      params: [{
        startupIdentityDisposition: {
          version: 1,
          status: 'read-only-recovery-required',
          writable: false,
          retryable: false,
          deviceId: null,
          identityEpoch: null,
          source: 'identity-recovery-required',
          reason: 'recovery evidence requires explicit apply',
        },
      }],
    })).resolves.toMatchObject({
      result: { readiness: { status: 'read-only-recovery-required', writable: false } },
    });
    expect(foreignEpochRecoveryRuntime.apply).not.toHaveBeenCalled();
    expect(foreignEpochRecoveryRuntime.preview).not.toHaveBeenCalled();
  });
});
