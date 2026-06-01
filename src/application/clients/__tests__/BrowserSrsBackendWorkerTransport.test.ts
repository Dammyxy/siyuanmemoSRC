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

function createXiuyuanSyncRequest(id = 1): BackendRpcRequest {
  return {
    jsonrpc: BACKEND_RPC_VERSION,
    id,
    method: 'xiuyuan.sync.execute',
    params: [{
      requestId: `sync-request-${id}`,
      commandId: `sync-command-${id}`,
      idempotencyKey: `sync-key-${id}`,
      mode: 'full',
      dryRun: false,
      deckId: 'deck-a',
      requestedAt: 1_700_000_000_000,
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

describe('BrowserSrsBackendWorkerTransport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setRuntimePerformanceDiagnosticsEnabled(false, { reset: true });
    transportLoggerMocks.info.mockClear();
    transportLoggerMocks.warn.mockClear();
    transportLoggerMocks.error.mockClear();
    transportLoggerMocks.debug.mockClear();
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
        },
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
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      '[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.feedback transport step',
      expect.objectContaining({
        step: 'worker-received-delay',
        cardId: 'card-1',
        durationMs: 150,
      }),
    );
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      '[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.feedback transport step',
      expect.objectContaining({
        step: 'worker-handle',
        cardId: 'card-1',
        durationMs: 279,
        hostEffectCount: 2,
        hostEffectTotalMs: 180,
        hostEffectAttribution: 'complete',
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
        },
      }),
    );
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      '[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.feedback transport step',
      expect.objectContaining({
        step: 'worker-inner-step',
        cardId: 'card-1',
        durationMs: 220,
        innerLayer: 'database',
        innerStep: 'reviewFeedback.runtime',
        innerCardId: 'card-1',
        innerQueueType: 'incremental-learning',
        innerStepAttribution: 'complete',
        committed: true,
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
      '[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.feedback transport step',
      expect.objectContaining({
        step: 'worker-handle',
        cardId: 'card-1',
        durationMs: 430,
        dominantInnerStepSummary: expect.stringContaining('kernel:pre-request-merge 320ms'),
        preRequestMergeSummary: expect.stringContaining('reason=fast-skip-not-eligible:never-marked-clean'),
        mainDbReadSummary: 'database:merge.read-main-db 210ms',
        topInnerStepSummary: expect.arrayContaining([
          expect.stringContaining('kernel:pre-request-merge 320ms'),
          'database:merge.read-main-db 210ms',
        ]),
      }),
    );
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      expect.stringContaining('[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.feedback worker-handle summary'),
      expect.objectContaining({
        step: 'worker-handle-summary',
        cardId: 'card-1',
        durationMs: 430,
        copySummary: expect.stringContaining('preMerge=kernel:pre-request-merge 320ms'),
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
      '[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.feedback transport step',
      expect.objectContaining({
        step: 'worker-handle',
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
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      '[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.feedback transport step',
      expect.objectContaining({
        step: 'worker-inner-step',
        cardId: 'card-1',
        durationMs: 90,
        innerStep: 'merge.total',
        forceLogReason: 'worker-handle-top-inner-step',
      }),
    );
    expect(transportLoggerMocks.info).toHaveBeenCalledWith(
      '[SiYuanMemo][BrowserSrsBackendWorkerTransport] slow review.feedback transport step',
      expect.objectContaining({
        step: 'worker-inner-step',
        cardId: 'card-1',
        durationMs: 80,
        innerStep: 'transaction',
        forceLogReason: 'worker-handle-top-inner-step',
      }),
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

  it('suppresses explicit truth segment writes during the post-review drain window', async () => {
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

    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-truth-review-flush',
      effect: {
        kind: 'truth.writeBinary',
        path: 'truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack',
        bytes: new Uint8Array([7]),
      },
    });

    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    expect(writeTruthBinary).not.toHaveBeenCalled();
    expect(worker.posted[1]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-truth-review-flush',
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'BACKEND_UNAVAILABLE: review.feedback suppressed SiYuan persistence host effect truth.writeBinary',
      },
    });
    transport.dispose();
  });

  it('suppresses all SiYuan file-write host effects for rating, skip, and custom review feedback', async () => {
    const forbiddenEffects = [
      {
        kind: 'sqlite.writeJSON' as const,
        effectId: 'effect-sqlite-json',
        path: 'kernel-transaction-ingest.snapshot.json',
        value: { queue: [] },
        expectedMessage: 'BACKEND_UNAVAILABLE: review.feedback suppressed SiYuan persistence host effect sqlite.writeJSON',
      },
      {
        kind: 'sqlite.writeBinary' as const,
        effectId: 'effect-sqlite-binary',
        path: 'siyuanmemo.db',
        bytes: new Uint8Array([1, 2, 3]),
        expectedMessage: 'BACKEND_UNAVAILABLE: review.feedback suppressed SiYuan persistence host effect sqlite.writeBinary',
      },
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

      for (const [effectIndex, forbidden] of forbiddenEffects.entries()) {
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
        await vi.waitFor(() => expect(worker.posted).toHaveLength(2 + effectIndex));
        expect(worker.posted[1 + effectIndex]).toEqual({
          kind: 'host-effect-result',
          effectId: `${action}-${forbidden.effectId}`,
          ok: false,
          error: {
            code: 'BACKEND_UNAVAILABLE',
            message: forbidden.expectedMessage,
          },
        });
      }

      expect(hostEffects.writeJSON).not.toHaveBeenCalled();
      expect(hostEffects.writeBinary).not.toHaveBeenCalled();
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

  it('suppresses sqlite persistence host effects while review feedback is in flight', async () => {
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
    expect(writeJSON).not.toHaveBeenCalled();
    expect(worker.posted[1]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-review-json',
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'BACKEND_UNAVAILABLE: review.feedback suppressed SiYuan persistence host effect sqlite.writeJSON',
      },
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

  it('keeps suppressing sqlite persistence host effects during the immediate post-review drain window', async () => {
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
    expect(writeBinary).not.toHaveBeenCalled();
    expect(worker.posted[1]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-review-deferred-db',
      ok: false,
      error: {
        code: 'BACKEND_UNAVAILABLE',
        message: 'BACKEND_UNAVAILABLE: review.feedback suppressed SiYuan persistence host effect sqlite.writeBinary',
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

  it('serves Xiuyuan native Riff read/audit host effects through the typed bridge', async () => {
    const worker = new FakeWorker();
    const readXiuyuanRiffFacts = vi.fn(async () => ({
      status: 'ready' as const,
      requestId: 'riff-read-1',
      mode: 'audit' as const,
      deckId: 'deck-a',
      readAt: 1_700_000_000_100,
      blocks: [
        { id: 'block-a', content: 'Q <> A' },
      ],
      diagnostics: {
        source: 'renderer-host-effect' as const,
        blockCount: 1,
        normalizedBlockCount: 1,
        malformedBlockCount: 0,
        truncated: false,
      },
    }));
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: { readXiuyuanRiffFacts },
    });
    const request = {
      requestId: 'riff-read-1',
      mode: 'audit' as const,
      deckId: 'deck-a',
      scope: {
        blockIds: ['block-a'],
      },
    };

    worker.emit({ kind: 'ready' });
    worker.emit({
      kind: 'host-effect',
      effectId: 'effect-xiuyuan-riff-1',
      effect: {
        kind: 'siyuan.riff.readAudit',
        request,
      },
    });

    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));
    expect(readXiuyuanRiffFacts).toHaveBeenCalledWith(request);
    expect(worker.posted[0]).toEqual({
      kind: 'host-effect-result',
      effectId: 'effect-xiuyuan-riff-1',
      ok: true,
      result: {
        status: 'ready',
        requestId: 'riff-read-1',
        mode: 'audit',
        deckId: 'deck-a',
        readAt: 1_700_000_000_100,
        blocks: [
          { id: 'block-a', content: 'Q <> A' },
        ],
        diagnostics: {
          source: 'renderer-host-effect',
          blockCount: 1,
          normalizedBlockCount: 1,
          malformedBlockCount: 0,
          truncated: false,
        },
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

  it('uses the extended backend request timeout for long Xiuyuan sync commands', async () => {
    const worker = new FakeWorker();
    const transport = new BrowserSrsBackendWorkerTransport({
      workerFactory: () => worker as unknown as Worker,
      hostEffects: {},
      requestTimeoutMs: 20,
      maxRestartAttempts: 0,
    });
    worker.emit({ kind: 'ready' });

    const request = createXiuyuanSyncRequest(67);
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
