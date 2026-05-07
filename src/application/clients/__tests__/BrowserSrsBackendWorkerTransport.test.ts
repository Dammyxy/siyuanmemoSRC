import { describe, expect, it, vi } from 'vitest';
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
});
