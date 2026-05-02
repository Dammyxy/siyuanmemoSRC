import { describe, expect, it } from 'vitest';
import { BackendKernel } from '../bootstrap/BackendKernel';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';

describe('BackendKernel AI session/job runtime', () => {
  it('supports ai session lifecycle and stream/job lifecycle', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(bridge);
    const kernel = new BackendKernel({ database });

    const created = await kernel.handle({
      id: 'ai-session-create',
      jsonrpc: '2.0',
      method: 'ai.session.create',
      params: [{
        sessionId: 'session-1',
        surfaceId: 'standalone-dialog',
      }],
    });
    expect('result' in created).toBe(true);
    if ('result' in created) {
      expect(created.result.session).toMatchObject({
        sessionId: 'session-1',
        state: 'active',
      });
    }

    const updated = await kernel.handle({
      id: 'ai-session-update',
      jsonrpc: '2.0',
      method: 'ai.session.update',
      params: [{
        sessionId: 'session-1',
        state: 'streaming',
      }],
    });
    expect('result' in updated).toBe(true);
    if ('result' in updated) {
      expect(updated.result.session.state).toBe('streaming');
    }

    const started = await kernel.handle({
      id: 'ai-stream-start',
      jsonrpc: '2.0',
      method: 'ai.stream.start',
      params: [{
        streamId: 'stream-1',
        sessionId: 'session-1',
        jobId: 'job-1',
      }],
    });
    expect(started).toEqual({
      id: 'ai-stream-start',
      jsonrpc: '2.0',
      result: {
        ok: true,
        streamId: 'stream-1',
        sessionId: 'session-1',
        jobId: 'job-1',
        state: 'started',
        diagnosticEventId: expect.any(String),
      },
    });

    const job = await kernel.handle({
      id: 'job-get',
      jsonrpc: '2.0',
      method: 'job.get',
      params: [{ jobId: 'job-1' }],
    });
    expect('result' in job).toBe(true);
    if ('result' in job) {
      expect(job.result.job).toMatchObject({
        jobId: 'job-1',
        kind: 'ai-stream',
        state: 'running',
      });
    }

    const canceled = await kernel.handle({
      id: 'job-cancel',
      jsonrpc: '2.0',
      method: 'job.cancel',
      params: [{ jobId: 'job-1', reason: 'user-cancel' }],
    });
    expect('result' in canceled).toBe(true);
    if ('result' in canceled) {
      expect(canceled.result.job).toMatchObject({
        jobId: 'job-1',
        state: 'canceled',
      });
    }

    const sessionCanceled = await kernel.handle({
      id: 'ai-session-cancel',
      jsonrpc: '2.0',
      method: 'ai.session.cancel',
      params: [{ sessionId: 'session-1', reason: 'done' }],
    });
    expect('result' in sessionCanceled).toBe(true);
    if ('result' in sessionCanceled) {
      expect(sessionCanceled.result.session.state).toBe('canceled');
    }

    const diagnostics = await kernel.handle({
      id: 'diagnostics',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });
    expect('result' in diagnostics).toBe(true);
    if ('result' in diagnostics) {
      expect(diagnostics.result.ai).toMatchObject({
        sessionCreateTotal: 1,
        sessionUpdateTotal: 1,
        sessionCancelTotal: 1,
        streamStartTotal: 1,
        jobCreatedTotal: 1,
        jobCanceledTotal: 1,
      });
    }
  });

  it('returns explicit timeout state for immediate timeout stream request', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(bridge);
    const kernel = new BackendKernel({ database });
    await kernel.handle({
      id: 'ai-session-create-timeout',
      jsonrpc: '2.0',
      method: 'ai.session.create',
      params: [{
        sessionId: 'session-timeout',
        surfaceId: 'standalone-dialog',
      }],
    });

    const response = await kernel.handle({
      id: 'ai-stream-timeout',
      jsonrpc: '2.0',
      method: 'ai.stream.start',
      params: [{
        streamId: 'stream-timeout',
        sessionId: 'session-timeout',
        jobId: 'job-timeout',
        timeoutMs: 1,
      }],
    });
    expect(response).toEqual({
      id: 'ai-stream-timeout',
      jsonrpc: '2.0',
      result: {
        ok: true,
        streamId: 'stream-timeout',
        sessionId: 'session-timeout',
        jobId: 'job-timeout',
        state: 'timeout',
        diagnosticEventId: expect.any(String),
      },
    });
  });

  it('returns backend unavailable when stream or job targets are missing', async () => {
    const bridge = createInMemorySqlitePersistenceBridge();
    const database = new WorkerSqliteDatabaseService(bridge);
    const kernel = new BackendKernel({ database });

    const missingStream = await kernel.handle({
      id: 'ai-stream-start-missing-session',
      jsonrpc: '2.0',
      method: 'ai.stream.start',
      params: [{
        streamId: 'stream-missing',
        sessionId: 'missing-session',
        jobId: 'job-missing',
      }],
    });
    expect(missingStream).toEqual({
      id: 'ai-stream-start-missing-session',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: expect.stringContaining('ai.stream.start unavailable'),
      },
    });

    const missingJob = await kernel.handle({
      id: 'job-get-missing',
      jsonrpc: '2.0',
      method: 'job.get',
      params: [{ jobId: 'job-not-exist' }],
    });
    expect(missingJob).toEqual({
      id: 'job-get-missing',
      jsonrpc: '2.0',
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: expect.stringContaining('job unavailable'),
      },
    });
  });
});
