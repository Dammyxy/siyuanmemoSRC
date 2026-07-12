import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import type {
  BackendBrowserAggregateIdentity,
  BackendBrowserAggregatePageRequest,
  BackendRpcRequest,
  BackendRpcResponse,
} from '../../../../packages/contracts/src/backend-rpc';
import { BACKEND_RPC_VERSION } from '../../../../packages/contracts/src/backend-rpc';
import { BrowserSrsBackendWorkerTransport } from '../BrowserSrsBackendWorkerTransport';
import {
  getRuntimePerformanceDiagnosticsReport,
  setRuntimePerformanceDiagnosticsEnabled,
} from '@/utils/runtimePerformanceDiagnostics';

const transportLoggerMocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => transportLoggerMocks,
}));

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

function createReviewFeedbackRequest(id = 1): BackendRpcRequest {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    method: 'review.feedback',
    params: [{
      cardId: 'card-1',
      rating: 3,
      queueType: 'incremental-learning',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
    }],
  };
}

function createReviewSessionFeedbackRequest(id = 1): BackendRpcRequest {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    method: 'review.session.feedback',
    params: [{
      sessionId: 'session-a',
      cardId: 'card-1',
      rating: 3,
      reviewedAt: 1_700_000_000_000,
      idempotencyKey: 'session-feedback-key',
    }],
  };
}

function createReviewTruthFlushRequest(id = 1): BackendRpcRequest {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    method: 'review.truth.flush',
    params: [{
      deviceId: 'device-A',
      generationId: 'review-events-v1',
      schemaVersion: 1,
      batchLimit: 8,
    }],
  };
}

function createReviewFeedbackRequestForAction(
  id: number,
  action: 'rating' | 'skip' | 'custom-feedback',
): BackendRpcRequest {
  const feedbackParams = {
    rating: { rating: 3 },
    skip: { action: 'skip' },
    'custom-feedback': { action: 'custom-feedback', customActionId: 'again-later' },
  }[action];
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    method: 'review.feedback',
    params: [{
      cardId: `card-${action}`,
      queueType: 'incremental-learning',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      idempotencyKey: `review-${action}-key`,
      ...feedbackParams,
    }],
  };
}

function createStorageProjectionRebuildRequest(id = 1): BackendRpcRequest {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    method: 'storage.projection.rebuild',
    params: [{
      rebuildId: `projection-rebuild-${id}`,
      cause: 'manual',
      families: ['cards'],
      deviceId: 'device-test',
      generationId: 'generation-test',
    }],
  };
}

function createDbLoadRequest(id = 1): BackendRpcRequest {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    method: 'db.load',
    params: [{
      truthDeviceId: 'device-test',
      identityEpoch: 'epoch-test',
      reviewTruthGenerationId: 'review-events-v1',
    }],
  };
}

function createDbReloadRequest(id = 1): BackendRpcRequest {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    method: 'db.reload',
    params: [{
      truthDeviceId: 'device-test',
      identityEpoch: 'epoch-test',
      reviewTruthGenerationId: 'review-events-v1',
    }],
  };
}

function createStorageMaintenanceStatusRequest(id = 1): BackendRpcRequest {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    method: 'storage.maintenance.status',
    params: [{
      operationId: `status-${id}`,
      kind: 'startup-storage-maintenance',
      receiptVersion: 'startup-storage-maintenance-receipt-v2',
      scope: {
        pluginInstallationId: 'plugin-test',
        identityEpoch: 'epoch-test',
        maintenanceInputVersion: 'startup-maintenance-input-v1',
      },
    }],
  };
}

function createStorageMaintenanceApplyBatchRequest(id = 1): BackendRpcRequest {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    method: 'storage.maintenance.applyBatch',
    params: [{
      operationId: `apply-${id}`,
      kind: 'startup-storage-maintenance',
      batchId: `batch-${id}`,
      scope: {
        pluginInstallationId: 'plugin-test',
        identityEpoch: 'epoch-test',
        maintenanceInputVersion: 'startup-maintenance-input-v1',
      },
      operations: [],
    }],
  };
}

function createBrowserDeckPageRequest(id = 1): BackendRpcRequest {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    method: 'browser.deck.page',
    params: [{
      query: { preset: 'all' },
      page: { startRow: 0, endRow: 50 },
    }],
  };
}

async function expectOperationRequestTimeout(
  request: BackendRpcRequest,
  timeoutMs: number,
  classification: string,
): Promise<void> {
  const worker = new FakeWorker();
  const transport = new BrowserSrsBackendWorkerTransport({
    workerFactory: () => worker as unknown as Worker,
    hostEffects: {},
    requestTimeoutMs: 300_000,
    maxRestartAttempts: 0,
  });
  worker.emit({ kind: 'ready' });

  const pending = transport.request(request);
  await Promise.resolve();
  const assertion = expect(pending).rejects.toThrow(
    `BACKEND_UNAVAILABLE: backend worker request timed out after ${timeoutMs}ms`
    + ` operation=${request.method}`
    + ' phase=worker-response'
    + ` elapsedMs=${timeoutMs}`
    + ` timeoutMs=${timeoutMs}`
    + ` classification=${classification}`,
  );

  await vi.advanceTimersByTimeAsync(timeoutMs - 1);
  await Promise.resolve();
  expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
    health: 'healthy',
    requestTimeouts: 0,
    pendingRequests: 1,
  }));

  await vi.advanceTimersByTimeAsync(1);
  await assertion;
  expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
    health: 'unavailable',
    requestTimeouts: 1,
    pendingRequests: 0,
  }));
  expect(worker.terminated).toHaveBeenCalledTimes(1);
  transport.dispose();
}

describe('BrowserSrsBackendWorkerTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setRuntimePerformanceDiagnosticsEnabled(false, { reset: true });
    transportLoggerMocks.info.mockClear();
    transportLoggerMocks.warn.mockClear();
    transportLoggerMocks.error.mockClear();
    transportLoggerMocks.debug.mockClear();
    transportLoggerMocks.trace.mockClear();
  });

  afterEach(() => {
    setRuntimePerformanceDiagnosticsEnabled(false, { reset: true });
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

  it('bridges browser Worker globals before constructing the bundled inline worker in CJS runtime', async () => {
    const originalWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
    const originalWorker = (globalThis as typeof globalThis & { Worker?: unknown }).Worker;
    const originalBlob = (globalThis as typeof globalThis & { Blob?: unknown }).Blob;
    const originalUrl = globalThis.URL;
    const worker = new FakeWorker();
    class WindowWorker extends FakeWorker {
      constructor(_url: string | URL, _options?: WorkerOptions) {
        super();
        return worker;
      }
    }

    try {
      delete (globalThis as typeof globalThis & { Worker?: unknown }).Worker;
      delete (globalThis as typeof globalThis & { Blob?: unknown }).Blob;
      const invalidUrl = {} as typeof URL;
      (globalThis as typeof globalThis & { URL?: unknown }).URL = invalidUrl;
      (globalThis as typeof globalThis & { window?: unknown }).window = {
        Worker: WindowWorker,
        Blob: originalBlob,
        URL: originalUrl,
      };

      const transport = new BrowserSrsBackendWorkerTransport({
        hostEffects: {},
      });
      const request = createRequest(12);
      const pending = transport.request(request);

      worker.emit({ kind: 'ready' });
      await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
      expect(worker.posted[0]).toEqual(expect.objectContaining({
        kind: 'request',
        request,
      }));

      worker.emit({
        kind: 'response',
        requestId: (worker.posted[0] as { requestId: string }).requestId,
        response: {
          jsonrpc: BACKEND_RPC_VERSION,
          id: 12,
          result: { ok: true },
        },
      });

      await expect(pending).resolves.toMatchObject({
        result: { ok: true },
      });
      expect((globalThis as typeof globalThis & { Worker?: unknown }).Worker).toBeUndefined();
      expect((globalThis as typeof globalThis & { Blob?: unknown }).Blob).toBeUndefined();
      expect(globalThis.URL).toBe(invalidUrl);
      transport.dispose();
    } finally {
      (globalThis as typeof globalThis & { window?: unknown }).window = originalWindow;
      if (typeof originalWorker === 'undefined') {
        delete (globalThis as typeof globalThis & { Worker?: unknown }).Worker;
      } else {
        (globalThis as typeof globalThis & { Worker?: unknown }).Worker = originalWorker;
      }
      if (typeof originalBlob === 'undefined') {
        delete (globalThis as typeof globalThis & { Blob?: unknown }).Blob;
      } else {
        (globalThis as typeof globalThis & { Blob?: unknown }).Blob = originalBlob;
      }
      globalThis.URL = originalUrl;
    }
  });

  it('reports explicit backend Worker compatibility errors when construction fails', async () => {
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => {
        throw new TypeError('Worker constructor unavailable');
      },
      hostEffects: {},
    });

    await expect(transport.request(createRequest(13))).rejects.toThrow(
      'BACKEND_UNAVAILABLE: backend Worker compatibility error: Worker constructor unavailable',
    );
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'unavailable',
      generation: 1,
      restartCount: 0,
      pendingRequests: 0,
      lastTerminalError: 'BACKEND_UNAVAILABLE: backend Worker compatibility error: Worker constructor unavailable',
    }));
  });

  it('preserves explicit CJS bootstrap descriptor failures without renderer database fallback', async () => {
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => {
        throw new Error('BACKEND_UNAVAILABLE: backend Worker CJS bootstrap cannot define globalThis.Blob');
      },
      hostEffects: {},
      maxRestartAttempts: 1,
    });

    await expect(transport.request(createRequest(14))).rejects.toThrow(
      'BACKEND_UNAVAILABLE: backend Worker CJS bootstrap cannot define globalThis.Blob',
    );
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'unavailable',
      generation: 1,
      restartCount: 0,
      pendingRequests: 0,
      lastTerminalError: 'BACKEND_UNAVAILABLE: backend Worker CJS bootstrap cannot define globalThis.Blob',
    }));
  });

  it('sends review feedback request timing to the worker', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });
    const request = createReviewFeedbackRequest(12);
    const pending = transport.request(request);

    worker.emit({ kind: 'ready' });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    expect(worker.posted[0]).toEqual(expect.objectContaining({
      kind: 'request',
      request,
      sentAt: expect.any(Number),
    }));

    const response: BackendRpcResponse = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 12,
      result: { ok: true },
    };
    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response,
    });

    await expect(pending).resolves.toEqual(response);
    transport.dispose();
  });

  it('logs worker-returned review feedback timing so roundtrip can be split', async () => {
    vi.setSystemTime(1_000);
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });
    const request = createReviewFeedbackRequest(13);
    const pending = transport.request(request);
    worker.emit({ kind: 'ready' });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    vi.setSystemTime(1_500);
    const response: BackendRpcResponse = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 13,
      result: { ok: true },
    };
    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response,
      timing: {
        sentAt: 1_000,
        receivedAt: 1_150,
        receivedDelayMs: 150,
        handleStartedAt: 1_151,
        handledAt: 1_430,
        handleDurationMs: 279,
        hostEffectCount: 2,
        hostEffectTotalMs: 180,
        hostEffectAttribution: 'complete',
        slowestHostEffect: {
          kind: 'sqlite.writeBinary',
          durationMs: 140,
          path: 'sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack',
          byteLength: 42_000,
          storageClass: 'sqlite-delta-log',
          purpose: 'sqlite-delta.append-preflight',
          substep: 'persist-committed-transaction-read-snapshot',
        },
        hostEffectBreakdown: [
          {
            kind: 'sqlite.writeBinary',
            totalMs: 140,
            maxMs: 140,
            count: 1,
            path: 'sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack',
            byteLength: 42_000,
            storageClass: 'sqlite-delta-log',
            purpose: 'sqlite-delta.append-preflight',
            substep: 'persist-committed-transaction-read-snapshot',
          },
          {
            kind: 'sqlite.writeJSON',
            totalMs: 40,
            maxMs: 40,
            count: 1,
            path: 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json',
            byteLength: null,
            storageClass: 'sqlite-delta-log',
          },
        ],
        innerSteps: [{
          layer: 'database',
          step: 'reviewFeedback.runtime',
          durationMs: 220,
          cardId: 'card-1',
          queueType: 'incremental-learning',
          extra: {
            committed: true,
          },
        }],
        innerStepAttribution: 'complete',
        innerStepsTruncated: false,
      },
    });

    await expect(pending).resolves.toEqual(response);
    expect(transportLoggerMocks.trace).toHaveBeenCalledWith(
      '[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.feedback transport step',
      expect.objectContaining({
        step: 'worker-received-delay',
        cardId: 'card-1',
        durationMs: 150,
      }),
    );
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'host=sqlite.writeBinary 140ms path=sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack storage=sqlite-delta-log',
      ),
      expect.objectContaining({
        step: 'worker-handle-summary',
        cardId: 'card-1',
        durationMs: 279,
        hostEffectCount: 2,
        hostEffectTotalMs: 180,
        hostEffectAttribution: 'complete',
        hostEffectBreakdownSummary: expect.stringContaining(
          'sqlite.writeBinary 140ms count=1 path=sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack storage=sqlite-delta-log purpose=sqlite-delta.append-preflight substep=persist-committed-transaction-read-snapshot max=140ms bytes=42000',
        ),
        innerStepAttribution: 'complete',
        innerStepsTruncated: false,
        innerStepCount: 1,
        innerStepTotalMs: 220,
        slowestInnerStep: expect.objectContaining({
          layer: 'database',
          step: 'reviewFeedback.runtime',
          durationMs: 220,
          committed: true,
        }),
        topInnerSteps: [
          expect.objectContaining({
            layer: 'database',
            step: 'reviewFeedback.runtime',
            durationMs: 220,
            committed: true,
          }),
        ],
        topInnerStepSummary: [
          'database:reviewFeedback.runtime 220ms',
        ],
        dominantInnerStepSummary: 'database:reviewFeedback.runtime 220ms',
        preRequestMergeSummary: null,
        mainDbReadSummary: null,
        unattributedMs: 0,
        slowestHostEffect: {
          kind: 'sqlite.writeBinary',
          durationMs: 140,
          path: 'sqlite-delta/v2/sqlite-delta-log.v2.open.msgpack',
          byteLength: 42_000,
          storageClass: 'sqlite-delta-log',
          purpose: 'sqlite-delta.append-preflight',
          substep: 'persist-committed-transaction-read-snapshot',
        },
      }),
    );
    expect(transportLoggerMocks.trace).not.toHaveBeenCalledWith(
      '[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.feedback transport step',
      expect.objectContaining({
        step: 'worker-handle',
      }),
    );
    expect(transportLoggerMocks.trace).not.toHaveBeenCalledWith(
      '[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.feedback transport step',
      expect.objectContaining({
        step: 'worker-inner-step',
      }),
    );
    transport.dispose();
  });

  it('logs flat review feedback pre-request merge and main DB read summaries', async () => {
    vi.setSystemTime(1_600);
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });
    const request = createReviewFeedbackRequest(15);
    const pending = transport.request(request);
    worker.emit({ kind: 'ready' });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    vi.setSystemTime(2_100);
    const response: BackendRpcResponse = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 15,
      result: { ok: true },
    };
    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response,
      timing: {
        sentAt: 1_600,
        receivedAt: 1_620,
        receivedDelayMs: 20,
        handleStartedAt: 1_630,
        handledAt: 2_060,
        handleDurationMs: 430,
        hostEffectCount: 3,
        hostEffectTotalMs: 260,
        hostEffectAttribution: 'complete',
        slowestHostEffect: {
          kind: 'sqlite.readBinary',
          durationMs: 210,
        },
        innerSteps: [
          {
            layer: 'kernel',
            step: 'pre-request-merge',
            durationMs: 320,
            cardId: 'card-1',
            extra: {
              changed: false,
              sourceCount: 0,
              sanityStatus: 'divergent',
              mainDbReadSkipped: false,
              mainDbReadSkipReason: 'fast-skip-not-eligible:never-marked-clean',
              conflictSourceCount: 0,
              nonEmptyConflictSourceCount: 0,
            },
          },
          {
            layer: 'database',
            step: 'merge.read-main-db',
            durationMs: 210,
            cardId: 'card-1',
          },
          {
            layer: 'database',
            step: 'reviewFeedback.runtime',
            durationMs: 80,
            cardId: 'card-1',
            queueType: 'incremental-learning',
          },
        ],
        innerStepAttribution: 'complete',
        innerStepsTruncated: false,
      },
    });

    await expect(pending).resolves.toEqual(response);
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'host=sqlite.readBinary 210ms path=unknown storage=unknown',
      ),
      expect.objectContaining({
        step: 'worker-handle-summary',
        cardId: 'card-1',
        durationMs: 430,
        copySummary: expect.stringContaining('preMerge=kernel:pre-request-merge 320ms'),
        dominantInnerStepSummary: expect.stringContaining('kernel:pre-request-merge 320ms'),
        preRequestMergeSummary: expect.stringContaining('reason=fast-skip-not-eligible:never-marked-clean'),
        mainDbReadSummary: 'database:merge.read-main-db 210ms',
        topInnerStepSummary: expect.arrayContaining([
          expect.stringContaining('kernel:pre-request-merge 320ms'),
          'database:merge.read-main-db 210ms',
        ]),
      }),
    );
    expect(transportLoggerMocks.info.mock.calls.some(([message]) => (
      typeof message === 'string'
      && message.includes('reason=fast-skip-not-eligible:never-marked-clean')
      && message.includes('mainDb=database:merge.read-main-db 210ms')
    ))).toBe(true);
    transport.dispose();
  });

  it('records worker timing spans for Browser and Queue diagnostic RPCs', async () => {
    setRuntimePerformanceDiagnosticsEnabled(true, { reset: true });
    vi.setSystemTime(3_000);
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });
    const request = createBrowserDeckPageRequest(16);
    const pending = transport.request(request);
    worker.emit({ kind: 'ready' });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    vi.setSystemTime(3_900);
    const response: BackendRpcResponse = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 16,
      result: { total: 1, cards: [] },
    };
    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response,
      timing: {
        sentAt: 3_000,
        receivedAt: 3_020,
        receivedDelayMs: 20,
        handleStartedAt: 3_030,
        handledAt: 3_880,
        handleDurationMs: 850,
        hostEffectCount: 2,
        hostEffectTotalMs: 260,
        hostEffectAttribution: 'complete',
        slowestHostEffect: {
          kind: 'sqlite.readBinary',
          durationMs: 240,
          path: 'siyuanmemo.db',
          byteLength: 106_233_856,
          storageClass: 'sql-projection-db',
        },
        innerSteps: [
          {
            layer: 'kernel',
            step: 'pre-request-merge',
            durationMs: 320,
            extra: {
              mainDbReadSkipped: false,
              sanityStatus: 'clean',
            },
          },
          {
            layer: 'database',
            step: 'queryDeckPage.total',
            durationMs: 470,
            extra: {
              rowCount: 50,
              total: 1000,
            },
          },
        ],
        innerStepAttribution: 'complete',
        innerStepsTruncated: false,
      },
    });

    await expect(pending).resolves.toEqual(response);
    const report = getRuntimePerformanceDiagnosticsReport();
    expect(report.stats['worker.browser.deck.page.handle']?.count).toBe(1);
    expect(report.stats['worker.browser.deck.page.host-effects']?.max).toBe(260);
    expect(report.stats['worker-inner.browser.deck.page.kernel.pre-request-merge']?.max).toBe(320);
    expect(report.stats['worker-inner.browser.deck.page.database.queryDeckPage.total']?.max).toBe(470);
    expect(report.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'worker',
        operation: 'browser.deck.page.handle',
        durationMs: 850,
        metadata: expect.objectContaining({
          hostEffectCount: 2,
          hostEffectAttribution: 'complete',
          slowestHostEffectPath: 'siyuanmemo.db',
          slowestHostEffectByteLength: 106_233_856,
          slowestHostEffectStorageClass: 'sql-projection-db',
          innerStepCount: 2,
          innerStepAttribution: 'complete',
        }),
      }),
      expect.objectContaining({
        path: 'worker-inner',
        operation: 'browser.deck.page.database.queryDeckPage.total',
        durationMs: 470,
        metadata: expect.objectContaining({
          rowCount: 50,
          total: 1000,
        }),
      }),
    ]));
    transport.dispose();
  });

  it('force logs top inner steps when review feedback worker handle is slow but each inner step is below threshold', async () => {
    vi.setSystemTime(2_000);
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });
    const request = createReviewFeedbackRequest(14);
    const pending = transport.request(request);
    worker.emit({ kind: 'ready' });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    vi.setSystemTime(2_400);
    const response: BackendRpcResponse = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 14,
      result: { ok: true },
    };
    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response,
      timing: {
        sentAt: 2_000,
        receivedAt: 2_010,
        receivedDelayMs: 10,
        handleStartedAt: 2_020,
        handledAt: 2_360,
        handleDurationMs: 340,
        hostEffectCount: 1,
        hostEffectTotalMs: 4,
        hostEffectAttribution: 'complete',
        slowestHostEffect: {
          kind: 'sqlite.readSyncConflictDatabaseSources',
          durationMs: 4,
        },
        innerSteps: [
          {
            layer: 'database',
            step: 'merge.total',
            durationMs: 90,
          },
          {
            layer: 'transaction',
            step: 'transaction',
            durationMs: 80,
            cardId: 'card-1',
            queueType: 'incremental-learning',
          },
          {
            layer: 'database',
            step: 'reviewFeedback.runtime',
            durationMs: 70,
            cardId: 'card-1',
            queueType: 'incremental-learning',
          },
        ],
        innerStepAttribution: 'complete',
        innerStepsTruncated: false,
      },
    });

    await expect(pending).resolves.toEqual(response);
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'host=sqlite.readSyncConflictDatabaseSources 4ms path=unknown storage=unknown',
      ),
      expect.objectContaining({
        step: 'worker-handle-summary',
        cardId: 'card-1',
        durationMs: 340,
        innerStepCount: 3,
        innerStepTotalMs: 240,
        slowestInnerStep: expect.objectContaining({
          layer: 'database',
          step: 'merge.total',
          durationMs: 90,
        }),
        topInnerSteps: [
          expect.objectContaining({ step: 'merge.total', durationMs: 90 }),
          expect.objectContaining({ step: 'transaction', durationMs: 80 }),
          expect.objectContaining({ step: 'reviewFeedback.runtime', durationMs: 70 }),
        ],
        unattributedMs: 96,
      }),
    );
    expect(transportLoggerMocks.trace).not.toHaveBeenCalledWith(
      '[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.feedback transport step',
      expect.objectContaining({ step: 'worker-inner-step' }),
    );
    transport.dispose();
  });

  it('keeps backend RPC messages structured-clone safe when request params contain Vue proxies', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });
    const identity = reactive({
      snapshotId: 'snapshot-1',
      generation: 12,
      datasourceId: 'deck',
      policyHash: 'policy-a',
      queryFingerprint: 'query-a',
    }) as BackendBrowserAggregateIdentity;
    const pageRequest = reactive({
      requestId: 'aggregate-page-1',
      identity,
      offset: 0,
      limit: 50,
    }) as BackendBrowserAggregatePageRequest;
    const request: BackendRpcRequest = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 101,
      method: 'browser.aggregate.page',
      params: [pageRequest],
    };

    const pending = transport.request(request);
    worker.emit({ kind: 'ready' });

    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(worker.posted[0]).toEqual(expect.objectContaining({
      kind: 'request',
      request: {
        jsonrpc: BACKEND_RPC_VERSION,
        id: 101,
        method: 'browser.aggregate.page',
        params: [{
          requestId: 'aggregate-page-1',
          identity: {
            snapshotId: 'snapshot-1',
            generation: 12,
            datasourceId: 'deck',
            policyHash: 'policy-a',
            queryFingerprint: 'query-a',
          },
          offset: 0,
          limit: 50,
        }],
      },
    }));

    const response: BackendRpcResponse = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 101,
      result: {
        status: 'ready',
        identity: {
          snapshotId: 'snapshot-1',
          generation: 12,
          datasourceId: 'deck',
          policyHash: 'policy-a',
          queryFingerprint: 'query-a',
        },
        rows: [],
        nextCursor: null,
        totalCount: 0,
      },
    };
    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
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

  it('serves sqlite sync conflict database source host effects through the typed bridge', async () => {
    const worker = new FakeWorker();
    const readSyncConflictDatabaseSources = vi.fn(async () => [{
      sourceId: 'conflict-db',
      bytes: new Uint8Array([4, 5, 6]),
    }]);
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { readSyncConflictDatabaseSources },
    });

    worker.emit({ kind: 'ready' });
    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-conflict-sources',
      effect: {
        kind: 'sqlite.readSyncConflictDatabaseSources',
      },
    });

    expect(readSyncConflictDatabaseSources).toHaveBeenCalled();
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(worker.posted[0]).toEqual(expect.objectContaining({
      kind: 'host-effect-result',
      effectId: 'effect-conflict-sources',
      ok: true,
    }));
    const result = (worker.posted[0] as {
      result: Array<{ sourceId: string; bytes: Uint8Array }>;
    }).result;
    expect(result[0].sourceId).toBe('conflict-db');
    expect(Array.from(result[0].bytes)).toEqual([4, 5, 6]);
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

  it('logs worker-returned review session feedback timing so grading latency can be split', async () => {
    vi.setSystemTime(4_000);
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });
    const request = createReviewSessionFeedbackRequest(18);
    const pending = transport.request(request);
    worker.emit({ kind: 'ready' });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    vi.setSystemTime(4_900);
    const response: BackendRpcResponse = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 18,
      result: { ok: true },
    };
    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response,
      timing: {
        sentAt: 4_000,
        receivedAt: 4_210,
        receivedDelayMs: 210,
        handleStartedAt: 4_220,
        handledAt: 4_820,
        handleDurationMs: 600,
        hostEffectCount: 1,
        hostEffectTotalMs: 180,
        hostEffectAttribution: 'complete',
        slowestHostEffect: {
          kind: 'sqlite.readJSON',
          durationMs: 180,
          path: 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json',
          storageClass: 'sqlite-delta-log',
          purpose: 'sqlite-delta.append-preflight',
          substep: 'persist-committed-transaction-read-snapshot',
        },
        hostEffectBreakdown: [
          {
            kind: 'sqlite.readJSON',
            totalMs: 180,
            maxMs: 180,
            count: 1,
            path: 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json',
            byteLength: null,
            storageClass: 'sqlite-delta-log',
            purpose: 'sqlite-delta.append-preflight',
            substep: 'persist-committed-transaction-read-snapshot',
          },
        ],
        innerSteps: [
          {
            layer: 'kernel',
            step: 'pre-request-merge',
            durationMs: 240,
            cardId: 'card-1',
            extra: {
              backendMethod: 'review.session.feedback',
              changed: false,
              sourceCount: 0,
              sanityStatus: 'clean',
              mainDbReadSkipped: true,
              mainDbReadSkipReason: 'read-only-preflight',
              conflictSourceCount: 0,
              nonEmptyConflictSourceCount: 0,
            },
          },
          {
            layer: 'session',
            step: 'session-feedback-commit',
            durationMs: 220,
            cardId: 'card-1',
            queueType: 'retrieval-practice',
            extra: {
              backendMethod: 'review.session.feedback',
              sessionId: 'session-a',
            },
          },
          {
            layer: 'transaction',
            step: 'scheduler.compute',
            durationMs: 160,
            cardId: 'card-1',
            queueType: 'retrieval-practice',
            extra: {
              backendMethod: 'review.session.feedback',
            },
          },
          {
            layer: 'database',
            step: 'sqlite.delta-append-preflight',
            durationMs: 42,
            cardId: 'card-1',
            queueType: 'retrieval-practice',
            extra: {
              backendMethod: 'review.session.feedback',
              pendingCount: 3,
            },
          },
          {
            layer: 'database',
            step: 'sqlite.delta-write-manifest',
            durationMs: 12,
            cardId: 'card-1',
            queueType: 'retrieval-practice',
            extra: {
              backendMethod: 'review.session.feedback',
              sealedSegmentCount: 2,
            },
          },
        ],
        innerStepAttribution: 'complete',
        innerStepsTruncated: false,
      },
    });

    await expect(pending).resolves.toEqual(response);
    expect(transportLoggerMocks.trace).toHaveBeenCalledWith(
      '[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.session.feedback transport step',
      expect.objectContaining({
        step: 'worker-received-delay',
        cardId: 'card-1',
        durationMs: 210,
      }),
    );
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'slow review.session.feedback worker-handle summary card=card-1 duration=600ms',
      ),
      expect.objectContaining({
        step: 'worker-handle-summary',
        cardId: 'card-1',
        durationMs: 600,
        dominantInnerStepSummary: expect.stringContaining('kernel:pre-request-merge 240ms'),
        topInnerStepSummary: expect.arrayContaining([
          expect.stringContaining('kernel:pre-request-merge 240ms'),
          'session:session-feedback-commit 220ms',
          'transaction:scheduler.compute 160ms',
        ]),
        slowestHostEffect: expect.objectContaining({
          path: 'sqlite-delta/v2/sqlite-delta-log.v2.manifest.json',
          storageClass: 'sqlite-delta-log',
          purpose: 'sqlite-delta.append-preflight',
          substep: 'persist-committed-transaction-read-snapshot',
        }),
      }),
    );
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining(
        'hostBreakdown=sqlite.readJSON 180ms count=1 path=sqlite-delta/v2/sqlite-delta-log.v2.manifest.json storage=sqlite-delta-log purpose=sqlite-delta.append-preflight substep=persist-committed-transaction-read-snapshot max=180ms bytes=unknown',
      ),
      expect.anything(),
    );
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining('transactionBreakdown=transaction:scheduler.compute 160ms'),
      expect.anything(),
    );
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining('sqliteBreakdown=database:sqlite.delta-append-preflight 42ms | database:sqlite.delta-write-manifest 12ms'),
      expect.anything(),
    );
    transport.dispose();
  });

  it('logs review session pre-request merge skip evidence in copyable summaries', async () => {
    vi.setSystemTime(5_000);
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
    });
    const request = createReviewSessionFeedbackRequest(19);
    const pending = transport.request(request);
    worker.emit({ kind: 'ready' });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    vi.setSystemTime(5_360);
    const response: BackendRpcResponse = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 19,
      result: { ok: true },
    };
    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response,
      timing: {
        sentAt: 5_000,
        receivedAt: 5_010,
        receivedDelayMs: 10,
        handleStartedAt: 5_020,
        handledAt: 5_300,
        handleDurationMs: 280,
        hostEffectCount: 0,
        hostEffectTotalMs: 0,
        hostEffectAttribution: 'complete',
        slowestHostEffect: null,
        innerSteps: [
          {
            layer: 'kernel',
            step: 'sync-divergent-diagnostic',
            durationMs: 0,
            cardId: 'card-1',
            extra: {
              diagnostic: 'sync-divergent',
              backendMethod: 'review.session.feedback',
              context: 'review-feedback-preflight',
              fullMergeSkipped: true,
              repairOwner: 'domainSync.repair.apply',
            },
          },
          {
            layer: 'session',
            step: 'session-feedback-commit',
            durationMs: 180,
            cardId: 'card-1',
            queueType: 'retrieval-practice',
            extra: {
              backendMethod: 'review.session.feedback',
              sessionId: 'session-a',
            },
          },
        ],
        innerStepAttribution: 'complete',
        innerStepsTruncated: false,
      },
    });

    await expect(pending).resolves.toEqual(response);
    const expectedSkipSummary = 'kernel:sync-divergent-diagnostic 0ms skipped=true'
      + ' reason=review-rating-repair-gate'
      + ' repairOwner=domainSync.repair.apply'
      + ' method=review.session.feedback'
      + ' context=review-feedback-preflight';
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining(`preMerge=${expectedSkipSummary}`),
      expect.objectContaining({
        step: 'worker-handle-summary',
        cardId: 'card-1',
        durationMs: 280,
        preRequestMergeSummary: expectedSkipSummary,
        mainDbReadSummary: null,
        topInnerStepSummary: expect.arrayContaining([
          'session:session-feedback-commit 180ms',
          expectedSkipSummary,
        ]),
        sessionStepSummary: [
          'session:session-feedback-commit 180ms',
        ],
      }),
    );
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining('sessionBreakdown=session:session-feedback-commit 180ms'),
      expect.anything(),
    );
    expect(transportLoggerMocks.info.mock.calls.some(([message]) => (
      typeof message === 'string'
      && message.includes('slow review.session.feedback worker-handle summary card=card-1 duration=280ms')
      && message.includes('preMerge=none')
    ))).toBe(false);
    transport.dispose();
  });

  it('posts host-effect timeout failures before backend request deadlines expire', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {
        readSyncConflictDatabaseSources: () => new Promise(() => undefined),
      },
      hostEffectTimeoutMs: 20,
      requestTimeoutMs: 100,
      maxRestartAttempts: 0,
    });

    worker.emit({ kind: 'ready' });
    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-hangs',
      effect: {
        kind: 'sqlite.readSyncConflictDatabaseSources',
      },
    });

    await vi.advanceTimersByTimeAsync(20);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(worker.posted[0]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-hangs',
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'BACKEND_UNAVAILABLE: backend worker host effect sqlite.readSyncConflictDatabaseSources timed out after 20ms operation=unknown phase=host-effect:sqlite.readSyncConflictDatabaseSources elapsedMs=20 timeoutMs=20 classification=generic-host-effect',
      },
    });
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'healthy',
      requestTimeouts: 0,
    }));
    transport.dispose();
  });

  it('routes truth segment host effects through explicit truth handlers', async () => {
    const worker = new FakeWorker();
    const readTruthJSON = vi.fn(async () => ({ version: 1 }));
    const writeTruthBinary = vi.fn(async () => undefined);
    const listTruthFiles = vi.fn(async () => [
      'truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack',
    ]);
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { readTruthJSON, writeTruthBinary, listTruthFiles },
    });

    worker.emit({ kind: 'ready' });
    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-truth-json',
      effect: {
        kind: 'truth.readJSON',
        path: 'truth/review-events/review-events-v1/device-device-A/manifest.v1.json',
      },
    });
    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-truth-binary',
      effect: {
        kind: 'truth.writeBinary',
        path: 'truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack',
        bytes: new Uint8Array([1, 2, 3]),
      },
    });
    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-truth-list',
      effect: {
        kind: 'truth.listFiles',
        prefix: 'truth/review-events/review-events-v1/device-device-A',
      },
    });

    await vi.waitFor(() => expect(worker.posted).toHaveLength(3));
    expect(readTruthJSON).toHaveBeenCalledWith('truth/review-events/review-events-v1/device-device-A/manifest.v1.json');
    expect(writeTruthBinary).toHaveBeenCalledWith(
      'truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack',
      new Uint8Array([1, 2, 3]),
    );
    expect(listTruthFiles).toHaveBeenCalledWith('truth/review-events/review-events-v1/device-device-A');
    expect(worker.posted).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'host-effect-result',
        effectId: 'effect-truth-json',
        ok: true,
        result: { version: 1 },
      }),
      expect.objectContaining({
        kind: 'host-effect-result',
        effectId: 'effect-truth-binary',
        ok: true,
      }),
      expect.objectContaining({
        kind: 'host-effect-result',
        effectId: 'effect-truth-list',
        ok: true,
        result: ['truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack'],
      }),
    ]));
    expect(worker.posted).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        ok: false,
      }),
    ]));
    transport.dispose();
  });

  it('allows review.truth.flush to write Review truth segment and manifest through the truth bridge', async () => {
    const worker = new FakeWorker();
    const writeTruthJSON = vi.fn(async () => undefined);
    const writeTruthBinary = vi.fn(async () => undefined);
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { writeTruthJSON, writeTruthBinary },
    });
    const request = createReviewTruthFlushRequest(81);
    const pending = transport.request(request);

    worker.emit({ kind: 'ready' });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(worker.posted[0]).toEqual(expect.objectContaining({
      kind: 'request',
      request,
    }));

    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-review-truth-segment',
      effect: {
        kind: 'truth.writeBinary',
        path: 'truth/review-events/review-events-v1/device-device-A/seg-000001-startup.msgpack',
        bytes: new Uint8Array([1, 2, 3]),
      },
    });
    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-review-truth-manifest',
      effect: {
        kind: 'truth.writeJSON',
        path: 'truth/review-events/review-events-v1/device-device-A/manifest.v1.json',
        value: { version: 1, segments: [] },
      },
    });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(3));
    expect(writeTruthBinary).toHaveBeenCalledWith(
      'truth/review-events/review-events-v1/device-device-A/seg-000001-startup.msgpack',
      new Uint8Array([1, 2, 3]),
    );
    expect(writeTruthJSON).toHaveBeenCalledWith(
      'truth/review-events/review-events-v1/device-device-A/manifest.v1.json',
      { version: 1, segments: [] },
    );

    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response: {
        jsonrpc: BACKEND_RPC_VERSION,
        id: 81,
        result: {
          ok: true,
          segmentPaths: ['truth/review-events/review-events-v1/device-device-A/seg-000001-startup.msgpack'],
        },
      },
    });
    await expect(pending).resolves.toEqual(expect.objectContaining({ id: 81 }));
    transport.dispose();
  });

  it('allows explicit review.truth.flush truth writes during the post-review drain window', async () => {
    vi.setSystemTime(20_000);
    const worker = new FakeWorker();
    const writeTruthBinary = vi.fn(async () => undefined);
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { writeTruthBinary },
    });
    const pending = transport.request(createReviewFeedbackRequest(80));
    worker.emit({ kind: 'ready' });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response: {
        jsonrpc: BACKEND_RPC_VERSION,
        id: 80,
        result: { ok: true },
      },
    });
    await expect(pending).resolves.toEqual(expect.objectContaining({ id: 80 }));

    const flush = transport.request(createReviewTruthFlushRequest(81));
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    expect(worker.posted[1]).toEqual(expect.objectContaining({
      kind: 'request',
      request: expect.objectContaining({ method: 'review.truth.flush' }),
    }));

    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-truth-review-flush',
      effect: {
        kind: 'truth.writeBinary',
        path: 'truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack',
        bytes: new Uint8Array([7]),
      },
    });

    await vi.waitFor(() => expect(worker.posted).toHaveLength(3));
    expect(writeTruthBinary).toHaveBeenCalledWith(
      'truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack',
      new Uint8Array([7]),
    );
    expect(worker.posted[2]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-truth-review-flush',
      ok: true,
      result: null,
    });

    worker.emit({
      kind: 'response',
      requestId: (worker.posted[1] as { requestId: string }).requestId,
      response: {
        jsonrpc: BACKEND_RPC_VERSION,
        id: 81,
        result: { ok: true },
      },
    });
    await expect(flush).resolves.toEqual(expect.objectContaining({ id: 81 }));
    transport.dispose();
  });

  it('allows required SQLite durability host effects for rating, skip, and custom review feedback', async () => {
    const requiredSqliteEffects = [
      {
        kind: 'sqlite.writeJSON' as const,
        effectId: 'effect-sqlite-json',
        path: 'kernel-transaction-ingest.snapshot.json',
        value: { queue: [] },
      },
      {
        kind: 'sqlite.writeBinary' as const,
        effectId: 'effect-sqlite-binary',
        path: 'siyuanmemo.db',
        bytes: new Uint8Array([1, 2, 3]),
      },
    ];
    const deferredTruthEffects = [
      {
        kind: 'truth.writeJSON' as const,
        effectId: 'effect-truth-json',
        path: 'truth/review-events/review-events-v1/device-device-A/manifest.v1.json',
        value: { version: 1 },
        expectedMessage: 'BACKEND_UNAVAILABLE: review.feedback suppressed SiYuan persistence host effect truth.writeJSON',
      },
      {
        kind: 'truth.writeBinary' as const,
        effectId: 'effect-truth-binary',
        path: 'truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack',
        bytes: new Uint8Array([4, 5, 6]),
        expectedMessage: 'BACKEND_UNAVAILABLE: review.feedback suppressed SiYuan persistence host effect truth.writeBinary',
      },
    ];

    for (const [actionIndex, action] of (['rating', 'skip', 'custom-feedback'] as const).entries()) {
      const worker = new FakeWorker();
      const hostEffects = {
        writeJSON: vi.fn(async () => undefined),
        writeBinary: vi.fn(async () => undefined),
        writeTruthJSON: vi.fn(async () => undefined),
        writeTruthBinary: vi.fn(async () => undefined),
      };
      const transport = new BrowserSrsBackendWorkerTransport({
        workerFactory: () => worker as unknown as Worker,
        hostEffects,
      });
      const pending = transport.request(createReviewFeedbackRequestForAction(100 + actionIndex, action));
      worker.emit({ kind: 'ready' });
      await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

      for (const [effectIndex, required] of requiredSqliteEffects.entries()) {
        worker.emit({
          kind: 'host-effect',
          effectId: `${action}-${required.effectId}`,
          effect: 'bytes' in required
            ? {
                kind: required.kind,
                path: required.path,
                bytes: required.bytes,
              }
            : {
                kind: required.kind,
                path: required.path,
                value: required.value,
              },
        });
        await vi.waitFor(() => expect(worker.posted).toHaveLength(2 + effectIndex));
        expect(worker.posted[1 + effectIndex]).toEqual({
          kind: 'host-effect-result',
          effectId: `${action}-${required.effectId}`,
          ok: true,
          result: null,
        });
      }

      for (const [effectIndex, forbidden] of deferredTruthEffects.entries()) {
        worker.emit({
          kind: 'host-effect',
          effectId: `${action}-${forbidden.effectId}`,
          effect: 'bytes' in forbidden
            ? {
                kind: forbidden.kind,
                path: forbidden.path,
                bytes: forbidden.bytes,
              }
            : {
                kind: forbidden.kind,
                path: forbidden.path,
                value: forbidden.value,
              },
        });
        await vi.waitFor(() => expect(worker.posted).toHaveLength(4 + effectIndex));
        expect(worker.posted[3 + effectIndex]).toEqual({
          kind: 'host-effect-result',
          effectId: `${action}-${forbidden.effectId}`,
          ok: false,
          error: {
            code: 'BACKEND_UNAVAILABLE',
            message: forbidden.expectedMessage,
          },
        });
      }

      expect(hostEffects.writeJSON).toHaveBeenCalledWith('kernel-transaction-ingest.snapshot.json', { queue: [] });
      expect(hostEffects.writeBinary).toHaveBeenCalledWith('siyuanmemo.db', new Uint8Array([1, 2, 3]));
      expect(hostEffects.writeTruthJSON).not.toHaveBeenCalled();
      expect(hostEffects.writeTruthBinary).not.toHaveBeenCalled();

      worker.emit({
        kind: 'response',
        requestId: (worker.posted[0] as { requestId: string }).requestId,
        response: {
          jsonrpc: BACKEND_RPC_VERSION,
          id: 100 + actionIndex,
          result: { ok: true },
        },
      });
      await expect(pending).resolves.toEqual(expect.objectContaining({ id: 100 + actionIndex }));
      transport.dispose();
    }
  });

  it('allows sqlite persistence host effects while review feedback is in flight', async () => {
    const worker = new FakeWorker();
    const writeJSON = vi.fn(async () => undefined);
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { writeJSON },
    });
    const pending = transport.request(createReviewFeedbackRequest(78));
    worker.emit({ kind: 'ready' });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-review-json',
      effect: {
        kind: 'sqlite.writeJSON',
        path: 'kernel-transaction-ingest.snapshot.json',
        value: { queue: [] },
      },
    });

    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    expect(writeJSON).toHaveBeenCalledWith('kernel-transaction-ingest.snapshot.json', { queue: [] });
    expect(worker.posted[1]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-review-json',
      ok: true,
      result: null,
    });

    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response: {
        jsonrpc: BACKEND_RPC_VERSION,
        id: 78,
        result: { ok: true },
      },
    });
    await expect(pending).resolves.toEqual(expect.objectContaining({ id: 78 }));
    transport.dispose();
  });

  it('propagates sqlite durability host effect failures while review feedback is in flight', async () => {
    const worker = new FakeWorker();
    const writeJSON = vi.fn(async () => {
      throw new Error('BACKEND_UNAVAILABLE: mock sqlite delta durability failed');
    });
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { writeJSON },
    });
    const pending = transport.request(createReviewFeedbackRequest(79));
    worker.emit({ kind: 'ready' });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-review-json-fail',
      effect: {
        kind: 'sqlite.writeJSON',
        path: 'sqlite-delta/v2/open.msgpack',
        value: { queue: [] },
      },
    });

    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    expect(writeJSON).toHaveBeenCalledWith('sqlite-delta/v2/open.msgpack', { queue: [] });
    expect(worker.posted[1]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-review-json-fail',
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'BACKEND_UNAVAILABLE: mock sqlite delta durability failed',
      },
    });

    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response: {
        jsonrpc: BACKEND_RPC_VERSION,
        id: 79,
        result: { ok: true },
      },
    });
    await expect(pending).resolves.toEqual(expect.objectContaining({ id: 79 }));
    transport.dispose();
  });

  it('allows sqlite persistence host effects during the immediate post-review drain window', async () => {
    vi.setSystemTime(10_000);
    const worker = new FakeWorker();
    const writeBinary = vi.fn(async () => undefined);
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { writeBinary },
    });
    const pending = transport.request(createReviewFeedbackRequest(79));
    worker.emit({ kind: 'ready' });
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response: {
        jsonrpc: BACKEND_RPC_VERSION,
        id: 79,
        result: { ok: true },
      },
    });
    await expect(pending).resolves.toEqual(expect.objectContaining({ id: 79 }));

    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-review-deferred-db',
      effect: {
        kind: 'sqlite.writeBinary',
        path: 'siyuanmemo.db',
        bytes: new Uint8Array([1, 2, 3]),
      },
    });

    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    expect(writeBinary).toHaveBeenCalledWith('siyuanmemo.db', new Uint8Array([1, 2, 3]));
    expect(worker.posted[1]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-review-deferred-db',
      ok: true,
      result: null,
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
    const assertion = expect(pending).rejects.toThrow('BACKEND_UNAVAILABLE: backend worker request timed out after 20ms operation=system.health phase=worker-response elapsedMs=20 timeoutMs=20 classification=generic-request');

    await vi.advanceTimersByTimeAsync(20);

    await assertion;
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'unavailable',
      requestTimeouts: 1,
      pendingRequests: 0,
    }));
    expect(worker.terminated).toHaveBeenCalledTimes(1);
  });

  it('uses operation-specific request timeout policies instead of a shared five-minute override', async () => {
    await expectOperationRequestTimeout(
      createStorageMaintenanceStatusRequest(101),
      5_000,
      'status-read',
    );
    await expectOperationRequestTimeout(
      createDbLoadRequest(102),
      60_000,
      'startup-readiness',
    );
    await expectOperationRequestTimeout(
      createDbReloadRequest(103),
      60_000,
      'startup-readiness',
    );
    await expectOperationRequestTimeout(
      createStorageMaintenanceApplyBatchRequest(104),
      45_000,
      'maintenance-mutation',
    );
    await expectOperationRequestTimeout(
      createStorageProjectionRebuildRequest(105),
      120_000,
      'projection-rebuild',
    );
  });

  it('uses the extended backend request timeout for projection rebuild commands', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
      requestTimeoutMs: 20,
      maxRestartAttempts: 0,
    });
    worker.emit({ kind: 'ready' });

    const request = createStorageProjectionRebuildRequest(67);
    const pending = transport.request(request);
    let settled = false;
    void pending.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    await Promise.resolve();
    expect(worker.posted).toEqual([
      expect.objectContaining({
        kind: 'request',
        request,
      }),
    ]);

    await vi.advanceTimersByTimeAsync(20);
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'healthy',
      requestTimeouts: 0,
      pendingRequests: 1,
      pendingProbes: 0,
      pendingProbeSummaries: [],
      pendingRequestSummaries: [
        expect.objectContaining({
          method: 'storage.projection.rebuild',
          generation: 1,
          posted: true,
          queuedForMs: expect.any(Number),
          postedForMs: expect.any(Number),
        }),
      ],
    }));

    const response: BackendRpcResponse = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 67,
      result: { ok: true },
    };
    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response,
    });
    await expect(pending).resolves.toEqual(response);
    transport.dispose();
  });

  it('uses the extended backend request timeout for startup database load commands', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
      requestTimeoutMs: 20,
      maxRestartAttempts: 0,
    });
    worker.emit({ kind: 'ready' });

    const request = createDbLoadRequest(70);
    const pending = transport.request(request);
    let settled = false;
    void pending.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    await Promise.resolve();
    expect(worker.posted).toEqual([
      expect.objectContaining({
        kind: 'request',
        request,
      }),
    ]);

    await vi.advanceTimersByTimeAsync(20);
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'healthy',
      requestTimeouts: 0,
      pendingRequests: 1,
      pendingRequestSummaries: [
        expect.objectContaining({
          method: 'db.load',
          generation: 1,
          posted: true,
        }),
      ],
    }));

    const response: BackendRpcResponse = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 70,
      result: { ok: true },
    };
    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response,
    });
    await expect(pending).resolves.toEqual(response);
    transport.dispose();
  });

  it('logs capped pending backend work diagnostics during dispose', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
      maxRestartAttempts: 0,
    });
    worker.emit({ kind: 'ready' });

    const request = createBrowserDeckPageRequest(69);
    const pending = transport.request(request);
    const assertion = expect(pending).rejects.toThrow('BACKEND_UNAVAILABLE: backend worker transport closed');
    await Promise.resolve();

    transport.dispose();

    await assertion;
    expect(transportLoggerMocks.warn).toHaveBeenCalledWith(
      '[SiYuanMemo][BrowserSrsBackendWorkerTransport] disposing with pending backend work',
      expect.objectContaining({
        health: 'healthy',
        pendingRequests: 1,
        pendingProbes: 0,
        pendingRequestSummaries: [
          expect.objectContaining({
            method: 'browser.deck.page',
            generation: 1,
            posted: true,
            queuedForMs: expect.any(Number),
            postedForMs: expect.any(Number),
          }),
        ],
      }),
    );
    expect(worker.terminated).toHaveBeenCalledTimes(1);
  });

  it('keeps SQLite host effects alive while a projection rebuild command is pending', async () => {
    const worker = new FakeWorker();
    const writeBinary = vi.fn(() => new Promise<void>((resolve) => {
      setTimeout(resolve, 25);
    }));
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { writeBinary },
      hostEffectTimeoutMs: 20,
      requestTimeoutMs: 50,
      maxRestartAttempts: 0,
    });
    worker.emit({ kind: 'ready' });

    const request = createStorageProjectionRebuildRequest(68);
    const pending = transport.request(request);
    await Promise.resolve();
    expect(worker.posted).toEqual([
      expect.objectContaining({
        kind: 'request',
        request,
      }),
    ]);

    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-sync-db-write',
      effect: {
        kind: 'sqlite.writeBinary',
        path: 'siyuanmemo.db',
        bytes: new Uint8Array([1, 2, 3]),
        requestMethod: 'storage.projection.rebuild',
      },
    });

    await vi.advanceTimersByTimeAsync(20);
    await Promise.resolve();

    expect(worker.posted).toHaveLength(1);
    expect(writeBinary).toHaveBeenCalledWith('siyuanmemo.db', new Uint8Array([1, 2, 3]));

    await vi.advanceTimersByTimeAsync(5);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    expect(worker.posted[1]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-sync-db-write',
      ok: true,
      result: null,
    });

    const response: BackendRpcResponse = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 68,
      result: { ok: true },
    };
    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response,
    });
    await expect(pending).resolves.toEqual(response);
    transport.dispose();
  });

  it('keeps SQLite host effects alive while startup database load is pending', async () => {
    const worker = new FakeWorker();
    const readBinary = vi.fn(() => new Promise<Uint8Array | null>((resolve) => {
      setTimeout(() => resolve(null), 25);
    }));
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { readBinary },
      hostEffectTimeoutMs: 20,
      requestTimeoutMs: 50,
      maxRestartAttempts: 0,
    });
    worker.emit({ kind: 'ready' });

    const request = createDbLoadRequest(71);
    const pending = transport.request(request);
    await Promise.resolve();
    expect(worker.posted).toEqual([
      expect.objectContaining({
        kind: 'request',
        request,
      }),
    ]);

    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-db-load-read',
      effect: {
        kind: 'sqlite.readBinary',
        path: 'siyuanmemo.db',
        requestMethod: 'db.load',
      },
    });

    await vi.advanceTimersByTimeAsync(20);
    await Promise.resolve();

    expect(worker.posted).toHaveLength(1);
    expect(readBinary).toHaveBeenCalledWith('siyuanmemo.db');

    await vi.advanceTimersByTimeAsync(5);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    expect(worker.posted[1]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-db-load-read',
      ok: true,
      result: null,
    });

    const response: BackendRpcResponse = {
      jsonrpc: BACKEND_RPC_VERSION,
      id: 71,
      result: { ok: true },
    };
    worker.emit({
      kind: 'response',
      requestId: (worker.posted[0] as { requestId: string }).requestId,
      response,
    });
    await expect(pending).resolves.toEqual(response);
    transport.dispose();
  });

  it('uses operation-specific host-effect timeouts with safe phase classifications', async () => {
    const worker = new FakeWorker();
    const readJSON = vi.fn(() => new Promise<unknown>(() => undefined));
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { readJSON },
      hostEffectTimeoutMs: 300_000,
      maxRestartAttempts: 0,
    });
    worker.emit({ kind: 'ready' });

    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-status-receipt',
      effect: {
        kind: 'sqlite.readJSON',
        path: 'storage-maintenance-receipt.json',
        requestMethod: 'storage.maintenance.status',
        substep: 'receipt-status',
      },
    });

    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(worker.posted[0]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-status-receipt',
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'BACKEND_UNAVAILABLE: backend worker host effect sqlite.readJSON timed out after 5000ms operation=storage.maintenance.status phase=host-effect:sqlite.readJSON:receipt-status elapsedMs=5000 timeoutMs=5000 classification=status-read',
      },
    });
    transport.dispose();
  });

  it('keeps db.load host effects on readiness budget and names the blocking phase', async () => {
    const worker = new FakeWorker();
    const readBinary = vi.fn(() => new Promise<Uint8Array | null>(() => undefined));
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { readBinary },
      hostEffectTimeoutMs: 20,
      maxRestartAttempts: 0,
    });
    worker.emit({ kind: 'ready' });

    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-db-load-phase',
      effect: {
        kind: 'sqlite.readBinary',
        path: 'sqlite-delta/v2/sqlite-delta-log.v2.sealed-398.msgpack',
        requestMethod: 'db.load',
        substep: 'truth-delta-validation',
      },
    });

    await vi.advanceTimersByTimeAsync(20);
    await Promise.resolve();
    expect(worker.posted).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(59_980);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(worker.posted[0]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-db-load-phase',
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'BACKEND_UNAVAILABLE: backend worker host effect sqlite.readBinary timed out after 60000ms operation=db.load phase=host-effect:sqlite.readBinary:truth-delta-validation elapsedMs=60000 timeoutMs=60000 classification=startup-readiness',
      },
    });
    transport.dispose();
  });

  it('times out maintenance apply host effects on mutation budget with explicit classification', async () => {
    const worker = new FakeWorker();
    const writeBinary = vi.fn(() => new Promise<void>(() => undefined));
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { writeBinary },
      hostEffectTimeoutMs: 300_000,
      maxRestartAttempts: 0,
    });
    worker.emit({ kind: 'ready' });

    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-apply-batch',
      effect: {
        kind: 'sqlite.writeBinary',
        path: 'siyuanmemo.db',
        bytes: new Uint8Array([4, 5, 6]),
        requestMethod: 'storage.maintenance.applyBatch',
        substep: 'maintenance-commit',
      },
    });

    await vi.advanceTimersByTimeAsync(45_000);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(worker.posted[0]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-apply-batch',
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'BACKEND_UNAVAILABLE: backend worker host effect sqlite.writeBinary timed out after 45000ms operation=storage.maintenance.applyBatch phase=host-effect:sqlite.writeBinary:maintenance-commit elapsedMs=45000 timeoutMs=45000 classification=maintenance-mutation',
      },
    });
    transport.dispose();
  });

  it('does not publish a terminal applyBatch response after the mutation request timeout fires', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
      requestTimeoutMs: 300_000,
      maxRestartAttempts: 0,
    });
    worker.emit({ kind: 'ready' });

    const request = createStorageMaintenanceApplyBatchRequest(106);
    const pending = transport.request(request);
    await Promise.resolve();
    const requestId = (worker.posted[0] as { requestId: string }).requestId;
    const assertion = expect(pending).rejects.toThrow(
      'BACKEND_UNAVAILABLE: backend worker request timed out after 45000ms'
      + ' operation=storage.maintenance.applyBatch'
      + ' phase=worker-response'
      + ' elapsedMs=45000'
      + ' timeoutMs=45000'
      + ' classification=maintenance-mutation',
    );

    await vi.advanceTimersByTimeAsync(45_000);
    await assertion;
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      health: 'unavailable',
      requestTimeouts: 1,
      pendingRequests: 0,
    }));

    worker.emit({
      kind: 'response',
      requestId,
      response: {
        jsonrpc: BACKEND_RPC_VERSION,
        id: 106,
        result: { status: 'completed' },
      },
    });
    await Promise.resolve();
    expect(transport.getDiagnostics()).toEqual(expect.objectContaining({
      pendingRequests: 0,
      lastTerminalError: expect.stringContaining('classification=maintenance-mutation'),
    }));
    transport.dispose();
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
    const assertion = expect(pending).rejects.toThrow('BACKEND_UNAVAILABLE: backend worker request timed out after 20ms operation=system.health phase=worker-response elapsedMs=20 timeoutMs=20 classification=generic-request');
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
