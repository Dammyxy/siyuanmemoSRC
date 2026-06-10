import { describe, expect, it } from 'vitest';
import { BackendKernel } from '../bootstrap/BackendKernel';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';

describe('BackendKernel', () => {
  it('wires the registry dispatcher with shared worker dependencies', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });

    const health = await kernel.handle({
      id: 'kernel-smoke-health',
      jsonrpc: '2.0',
      method: 'system.health',
      params: [],
    });
    const diagnostics = await kernel.handle({
      id: 'kernel-smoke-diagnostics',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    const missing = await kernel.handle({
      id: 'kernel-smoke-missing',
      jsonrpc: '2.0',
      method: 'method.missing' as never,
      params: [],
    });

    expect(health).toEqual({
      id: 'kernel-smoke-health',
      jsonrpc: '2.0',
      result: {
        ok: true,
        runtime: 'srs-backend-worker',
        initialized: false,
      },
    });
    expect('result' in diagnostics).toBe(true);
    if ('result' in diagnostics) {
      expect(diagnostics.result.runtime).toBe('srs-backend-worker');
      expect(diagnostics.result.review).toMatchObject({
        truthFlush: {
          family: 'review-events',
          storage: 'unavailable',
          last: null,
        },
      });
    }
    expect(missing).toEqual({
      id: 'kernel-smoke-missing',
      jsonrpc: '2.0',
      error: {
        code: 'METHOD_NOT_FOUND',
        message: 'Unknown method: method.missing',
      },
    });
  });
});
