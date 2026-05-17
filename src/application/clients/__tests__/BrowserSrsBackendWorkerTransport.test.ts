import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendRpcRequest, BackendRpcResponse } from '../../../../packages/contracts/src/backend-rpc';
import { BACKEND_RPC_VERSION } from '../../../../packages/contracts/src/backend-rpc';
import { BrowserSrsBackendWorkerTransport } from '../BrowserSrsBackendWorkerTransport';

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly posted: unknown[] = [];
  readonly terminated = vi.fn();

  postMessage(message: unknown): void {
    this.posted.push(structuredClone(message));
  }

  terminate(): void {
    this.terminated();
  }

  emit(message: unknown): void {
    this.onmessage?.({ data: message } as MessageEvent);
  }

  emitError(message = 'boom'): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function createRequest(id = 1): BackendRpcRequest {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    method: 'system.health',
    params: [],
  };
}

describe('BrowserSrsBackendWorkerTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends backend RPC requests to the worker and resolves matching responses', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });
    const request = createRequest(11);
    const pending = transport.request(request);

    worker.emit({ kind: 'ready' });
    await Promise.resolve();

    expect(worker.posted).toEqual([
      expect.objectContaining({
        kind: 'request',
        request,
      }),
    ]);

    const requestMessage = worker.posted[0] as { requestId: string };
    const response: BackendRpcResponse = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 11,
      result: { ok: true },
    };
    worker.emit({
      kind: 'response',
      requestId: requestMessage.requestId,
      response,
    });

    await expect(pending).resolves.toEqual(response);
    transport.dispose();
  });

  it('serves sqlite host effects through the typed bridge', async () => {
    const worker = new FakeWorker();
    const readBinary = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { readBinary },
    });

    worker.emit({ kind: 'ready' });
    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-1',
      effect: {
        kind: 'sqlite.readBinary',
        path: 'siyuanmemo.db',
      },
    });

    expect(readBinary).toHaveBeenCalledWith('siyuanmemo.db');
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0]).toEqual(expect.objectContaining({
      kind: 'host-effect-result',
      effectId: 'effect-1',
      ok: true,
    }));
    expect(Array.from((worker.posted[0] as { result: Uint8Array }).result)).toEqual([1, 2, 3]);
    transport.dispose();
  });

  it('posts explicit unavailable host-effect failures', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });

    worker.emit({ kind: 'ready' });
    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-2',
      effect: {
        kind: 'sqlite.writeBinary',
        path: 'siyuanmemo.db',
        bytes: new Uint8Array([9]),
      },
    });

    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(worker.posted[0]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-2',
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'BACKEND_UNAVAILABLE: sqlite.writeBinary host effect unavailable',
      },
    });
    transport.dispose();
  });

  it('serves neural graph query host effects through the typed bridge', async () => {
    const worker = new FakeWorker();
    const resolveNeuralGraphQuery = vi.fn(async () => ({
      status: 'known-missing' as const,
      blockId: 'block-neural-1',
      data: null,
      error: null,
    }));
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { resolveNeuralGraphQuery },
    });

    const request = {
      operation: 'fetchBlockData',
      blockId: 'block-neural-1',
      options: { includeContent: true },
    } as const;

    worker.emit({ kind: 'ready' });
    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-neural-1',
      effect: {
        kind: 'siyuan.neuralGraph.query',
        request,
      },
    });

    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(resolveNeuralGraphQuery).toHaveBeenCalledWith(request);
    expect(worker.posted[0]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-neural-1',
      ok: true,
      result: {
        status: 'known-missing',
        blockId: 'block-neural-1',
        data: null,
        error: null,
      },
    });
    transport.dispose();
  });

  it('posts explicit unavailable when neural graph query host effect is absent', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });

    worker.emit({ kind: 'ready' });
    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-neural-missing',
      effect: {
        kind: 'siyuan.neuralGraph.query',
        request: {
          operation: 'fetchBlockData',
          blockId: 'block-neural-1',
        },
      },
    });

    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(worker.posted[0]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-neural-missing',
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'BACKEND_UNAVAILABLE: neural graph query host effect unavailable',
      },
    });
    transport.dispose();
  });

  it('passes AI prompt host-effect stream context to the renderer network bridge', async () => {
    const worker = new FakeWorker();
    const executeAiPrompt = vi.fn(async () => ({
      status: 200,
      headers: {},
      body: 'ok',
    }));
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { executeAiPrompt },
    });
    const context = {
      sessionId: 'session-1',
      streamId: 'stream-1',
      jobId: 'job-1',
      request: {
        url: 'https://provider.test/events',
        method: 'GET',
        stream: true,
      },
    };

    worker.emit({ kind: 'ready' });
    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-ai-1',
      effect: {
        kind: 'ai.prompt.execute',
        request: context.request,
        context,
      },
    });

    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(executeAiPrompt).toHaveBeenCalledWith(context.request, context);
    expect(worker.posted[0]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-ai-1',
      ok: true,
      result: {
        status: 200,
        headers: {},
        body: 'ok',
      },
    });
    transport.dispose();
  });

  it('rejects pending requests when disposed', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });
    const pending = transport.request(createRequest(22));

    worker.emit({ kind: 'ready' });
    await Promise.resolve();
    transport.dispose();

    await expect(pending).rejects.toThrow('BACKEND_UNAVAILABLE: backend worker transport closed');
    expect(worker.terminated).toHaveBeenCalledTimes(1);
  });

  it('rejects requests when the worker errors before ready', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });
    const pending = transport.request(createRequest(33));

    worker.emitError('startup failed');

    await expect(pending).rejects.toThrow('BACKEND_UNAVAILABLE: backend worker error: startup failed');
  });

  it('rejects in-flight requests when the worker terminates with an error', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });
    const pending = transport.request(createRequest(44));

    worker.emit({ kind: 'ready' });
    await Promise.resolve();
    worker.emitError('worker crashed');

    await expect(pending).rejects.toThrow('BACKEND_UNAVAILABLE: backend worker error: worker crashed');
  });

  it('rejects startup waiters when the worker does not become ready before deadline', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
      startupTimeoutMs: 25,
      maxRestartAttempts: 0,
    });
    const pending = transport.request(createRequest(55));
    const assertion = expect(pending).rejects.toThrow('BACKEND_UNAVAILABLE: backend worker startup timed out after 25ms');

    await vi.advanceTimersByTimeAsync(25);

    await assertion;
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'unavailable',
      generation: 1,
      startupTimeouts: 1,
      pendingRequests: 0,
    }));
    expect(worker.terminated).toHaveBeenCalledTimes(1);
  });

  it('rejects in-flight requests and clears pending entries when request deadline expires', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
      requestTimeoutMs: 20,
      maxRestartAttempts: 0,
    });
    worker.emit({ kind: 'ready' });

    const pending = transport.request(createRequest(66));
    await Promise.resolve();
    expect(transport.getDiagnostics().pendingRequests).toBe(1);
    const assertion = expect(pending).rejects.toThrow('BACKEND_UNAVAILABLE: backend worker request timed out after 20ms');

    await vi.advanceTimersByTimeAsync(20);

    await assertion;
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'unavailable',
      requestTimeouts: 1,
      pendingRequests: 0,
    }));
    expect(worker.terminated).toHaveBeenCalledTimes(1);
  });

  it('keeps diagnostics for worker error and dispose pending cleanup', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
      maxRestartAttempts: 0,
    });
    worker.emit({ kind: 'ready' });

    const pending = transport.request(createRequest(77));
    await Promise.resolve();
    worker.emitError('worker crashed');

    await expect(pending).rejects.toThrow('BACKEND_UNAVAILABLE: backend worker error: worker crashed');
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'unavailable',
      pendingRequests: 0,
      lastTerminalError: 'BACKEND_UNAVAILABLE: backend worker error: worker crashed',
    }));
    transport.dispose();
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'closed',
      pendingRequests: 0,
    }));
  });

  it('probes worker liveness and records last successful probe time', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
      probeTimeoutMs: 20,
    });
    worker.emit({ kind: 'ready' });

    const probe = transport.probe();
    await Promise.resolve();
    expect(worker.posted[0]).toEqual(expect.objectContaining({
      kind: 'probe',
      probeId: expect.any(String),
    }));

    worker.emit({
      kind: 'probe-result',
      probeId: (worker.posted[0] as { probeId: string }).probeId,
    });

    await expect(probe).resolves.toBeUndefined();
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'healthy',
      probeTimeouts: 0,
      lastSuccessfulProbeAt: expect.any(Number),
    }));
  });

  it('marks worker unhealthy when liveness probe misses its deadline', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
      probeTimeoutMs: 20,
      maxRestartAttempts: 0,
    });
    worker.emit({ kind: 'ready' });

    const probe = transport.probe();
    await Promise.resolve();
    const assertion = expect(probe).rejects.toThrow('BACKEND_UNAVAILABLE: backend worker probe timed out after 20ms');
    await vi.advanceTimersByTimeAsync(20);

    await assertion;
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'unavailable',
      probeTimeouts: 1,
      pendingRequests: 0,
    }));
    expect(worker.terminated).toHaveBeenCalledTimes(1);
  });

  it('restarts with a new worker generation without replaying timed-out pending requests', async () => {
    const workers = [new FakeWorker(), new FakeWorker()];
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => workers.shift() as unknown as Worker,
      hostEffects: {},
      requestTimeoutMs: 20,
      restartBackoffMs: 0,
      maxRestartAttempts: 1,
    });
    const worker1 = (transport as unknown as { worker: FakeWorker }).worker;
    worker1.emit({ kind: 'ready' });

    const pending = transport.request(createRequest(88));
    await Promise.resolve();
    const assertion = expect(pending).rejects.toThrow('BACKEND_UNAVAILABLE: backend worker request timed out after 20ms');
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    await vi.advanceTimersByTimeAsync(1);

    const worker2 = (transport as unknown as { worker: FakeWorker }).worker;
    expect(worker2).not.toBe(worker1);
    expect(worker2.posted).toEqual([]);
    worker2.emit({ kind: 'ready' });
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'healthy',
      generation: 2,
      restartCount: 1,
    }));

    const next = transport.request(createRequest(89));
    await Promise.resolve();
    expect(worker2.posted).toEqual([
      expect.objectContaining({
        kind: 'request',
        request: createRequest(89),
      }),
    ]);
    worker2.emit({
      kind: 'response',
      requestId: (worker2.posted[0] as { requestId: string }).requestId,
      response: {
        jsonrpc: BACKEND_RPC_VERSION,
        id: 89,
        result: { ok: true },
      },
    });
    await expect(next).resolves.toEqual(expect.objectContaining({ id: 89 }));
    transport.dispose();
  });

  it('stays unavailable after restart budget is exhausted', async () => {
    const created: FakeWorker[] = [];
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => {
        const worker = new FakeWorker();
        created.push(worker);
        return worker as unknown as Worker;
      },
      hostEffects: {},
      startupTimeoutMs: 20,
      restartBackoffMs: 0,
      maxRestartAttempts: 1,
    });
    const firstRequest = transport.request(createRequest(90));
    const firstAssertion = expect(firstRequest).rejects.toThrow('BACKEND_UNAVAILABLE: backend worker startup timed out after 20ms');

    await vi.advanceTimersByTimeAsync(20);
    await firstAssertion;
    await vi.advanceTimersByTimeAsync(1);
    expect(created).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(20);

    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'unavailable',
      generation: 2,
      restartCount: 1,
      startupTimeouts: 2,
    }));
  });
});
