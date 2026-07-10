import { describe, expect, it, vi } from 'vitest';
import { SrsBackendClient, type SrsBackendTransport } from '../SrsBackendClient';
import { KernelCompanionBackgroundWorkRegistry } from '../../backgroundWork/KernelCompanionBackgroundWorkRegistry';

function createDurableReviewFeedbackResult(overrides: Record<string, unknown> = {}) {
  return {
    cardId: 'card-review-truth-flush',
    committed: true,
    reviewedAt: 1_700_000_000_000,
    queueType: 'retrieval-practice',
    updatedCard: null,
    queueImpact: {
      hotPatchable: true,
      refreshRequired: false,
      affectedQueues: [],
    },
    storage: {
      localIntent: {
        status: 'recorded',
        durable: true,
        storage: 'non-siyuan',
        entryId: 'review-feedback:truth-flush-key',
        idempotencyKey: 'truth-flush-key',
        journalStatus: 'projection-applied',
        pendingCount: 1,
        pendingBytes: 256,
        error: null,
      },
      truthFlush: {
        status: 'pending',
        family: 'review-events',
        syncVisible: false,
        pendingCount: 1,
        oldestPendingAgeMs: 0,
        lastError: null,
      },
      sqlProjection: {
        status: 'patched',
        hotPatchable: true,
        refreshRequired: false,
        affectedQueueCount: 0,
        projectionGeneration: null,
      },
      sqlCheckpoint: {
        status: 'not-run',
        hotPath: false,
        cause: null,
        initiator: null,
        projectionGeneration: null,
        byteLength: null,
        error: null,
      },
    },
    ...overrides,
  };
}

describe('SrsBackendClient', () => {
  it('routes xiuyuan.sync.execute through the typed backend RPC method', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => ({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          status: 'planned',
          commandId: 'sync-command-1',
          idempotencyKey: 'sync-key-1',
          mode: 'audit',
          dryRun: true,
          progress: {
            state: 'succeeded',
            currentStep: 'planned',
            completedUnits: 3,
            totalUnits: 3,
            updatedAt: 1,
          },
          plan: {
            localXiuyuanCount: 0,
            localCardCount: 0,
            localManagedRiffCount: 0,
            nativeRiffCount: 0,
            normalizedNativeRiffCount: 0,
            malformedNativeRiffCount: 0,
            duplicateNativeRiffCount: 0,
            createCount: 0,
            updateCount: 0,
            deleteCount: 0,
            skippedLocalOwnedCount: 0,
            candidateBlockIds: {
              create: [],
              update: [],
              delete: [],
              skippedLocalOwned: [],
            },
          },
          applyImpact: {
            requested: false,
            applied: false,
            reason: 'dry-run',
            changed: {},
          },
          diagnostics: {
            diagnosticEventId: 'xiuyuan-sync:sync-command-1',
            readSource: 'renderer-host-effect',
            timingMs: 1,
          },
        },
      })),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.executeXiuyuanSync({
      requestId: 'sync-request-1',
      commandId: 'sync-command-1',
      idempotencyKey: 'sync-key-1',
      mode: 'audit',
      dryRun: true,
      deckId: 'deck-a',
      requestedAt: 1,
    })).resolves.toMatchObject({
      status: 'planned',
      commandId: 'sync-command-1',
    });
    expect(transport.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'xiuyuan.sync.execute',
      params: [expect.objectContaining({
        mode: 'audit',
        deckId: 'deck-a',
      })],
    }));
  });

  it('schedules background Review truth flush after committed feedback with pending truth', async () => {
    vi.useFakeTimers();
    try {
      const requests: Array<{ method: string; params: unknown }> = [];
      const transport: SrsBackendTransport = {
        request: vi.fn(async (request) => {
          requests.push({ method: request.method, params: request.params });
          if (request.method === 'review.feedback') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: createDurableReviewFeedbackResult(),
            };
          }
          if (request.method === 'review.truth.flush') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                at: 1_700_000_000_100,
                journalQueued: 1,
                recordsWritten: 1,
                segmentWritten: true,
                manifestUpdated: true,
                projectionRefreshScheduled: true,
                idempotencyDuplicateSkipped: 0,
                flushedEntryIds: ['review-feedback:truth-flush-key'],
                segmentPaths: ['truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack'],
                error: null,
              },
            };
          }
          throw new Error(`Unexpected backend method ${request.method}`);
        }),
      };
      const client = new SrsBackendClient(transport, {
        reviewTruthFlush: {
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          batchLimit: 8,
          delayMs: 50,
        },
      });

      await expect(client.reviewFeedback({
        cardId: 'card-review-truth-flush',
        rating: 3,
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        idempotencyKey: 'truth-flush-key',
      })).resolves.toMatchObject({
        committed: true,
      });
      expect(requests).toEqual([{
        method: 'review.feedback',
        params: [expect.objectContaining({
          cardId: 'card-review-truth-flush',
        })],
      }]);

      await vi.advanceTimersByTimeAsync(49);
      expect(requests).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      await vi.waitFor(() => expect(requests).toHaveLength(2));
      expect(requests[1]).toEqual({
        method: 'review.truth.flush',
        params: [{
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          batchLimit: 8,
        }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes Review truth immediately when worker session feedback reaches the pending threshold', async () => {
    vi.useFakeTimers();
    try {
      const requests: Array<{ method: string; params: unknown }> = [];
      const thresholdFeedback = createDurableReviewFeedbackResult({
        storage: {
          ...(createDurableReviewFeedbackResult().storage as Record<string, unknown>),
          truthFlush: {
            status: 'pending',
            family: 'review-events',
            syncVisible: false,
            pendingCount: 8,
            oldestPendingAgeMs: 0,
            lastError: null,
          },
        },
      });
      const transport: SrsBackendTransport = {
        request: vi.fn(async (request) => {
          requests.push({ method: request.method, params: request.params });
          if (request.method === 'review.session.feedback') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                sessionId: 'session-a',
                queueType: 'retrieval-practice',
                current: null,
                lookaheadCards: [],
                counters: {
                  remaining: 0,
                  due: 0,
                  total: 8,
                  source: 'worker-session',
                },
                projectionState: 'not-used',
                projectionGeneration: null,
                projectionPolicyHash: null,
                answeredCardId: 'card-review-truth-flush',
                feedback: thresholdFeedback,
                undoToken: 'undo-a',
              },
            };
          }
          if (request.method === 'review.truth.flush') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                at: 1_700_000_000_100,
                journalQueued: 8,
                recordsWritten: 8,
                segmentWritten: true,
                manifestUpdated: true,
                projectionRefreshScheduled: true,
                idempotencyDuplicateSkipped: 0,
                flushedEntryIds: ['review-feedback:truth-flush-key'],
                segmentPaths: ['truth/review-events/review-events-v1/device-device-A/seg-000001-test.msgpack'],
                error: null,
              },
            };
          }
          throw new Error(`Unexpected backend method ${request.method}`);
        }),
      };
      const client = new SrsBackendClient(transport, {
        reviewTruthFlush: {
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          batchLimit: 8,
          delayMs: 50,
          flushThreshold: 8,
        },
      });

      await expect(client.reviewSessionFeedback({
        sessionId: 'session-a',
        cardId: 'card-review-truth-flush',
        rating: 3,
        idempotencyKey: 'truth-flush-key',
      })).resolves.toMatchObject({
        answeredCardId: 'card-review-truth-flush',
        feedback: {
          committed: true,
          storage: {
            truthFlush: {
              status: 'pending',
              pendingCount: 8,
            },
          },
        },
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.waitFor(() => expect(requests).toHaveLength(2));
      expect(requests.map((request) => request.method)).toEqual([
        'review.session.feedback',
        'review.truth.flush',
      ]);
      expect(requests[1]).toEqual({
        method: 'review.truth.flush',
        params: [{
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          batchLimit: 8,
        }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts committed feedback when truth flush and projection maintenance are still pending', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => {
        if (request.method === 'review.feedback') {
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: createDurableReviewFeedbackResult({
              queueImpact: {
                hotPatchable: false,
                refreshRequired: true,
                affectedQueues: [{
                  queueId: 'incremental-learning',
                  queueType: 'incremental-learning',
                  outcome: 'deferred',
                }],
              },
              storage: {
                ...(createDurableReviewFeedbackResult().storage as Record<string, unknown>),
                localIntent: {
                  status: 'recorded',
                  durable: true,
                  storage: 'non-siyuan',
                  entryId: 'review-feedback:pending-secondary-key',
                  idempotencyKey: 'pending-secondary-key',
                  journalStatus: 'prepared',
                  pendingCount: 1,
                  pendingBytes: 256,
                  error: null,
                },
                truthFlush: {
                  status: 'pending',
                  family: 'review-events',
                  syncVisible: false,
                  pendingCount: 1,
                  oldestPendingAgeMs: 0,
                  lastError: 'BACKEND_UNAVAILABLE: review.feedback suppressed SiYuan persistence host effect truth.writeBinary',
                },
                sqlProjection: {
                  status: 'deferred',
                  hotPatchable: false,
                  refreshRequired: true,
                  affectedQueueCount: 1,
                  projectionGeneration: null,
                },
              },
            }),
          };
        }
        throw new Error(`Unexpected backend method ${request.method}`);
      }),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.reviewFeedback({
      cardId: 'card-review-pending-secondary',
      rating: 3,
      queueType: 'incremental-learning',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      idempotencyKey: 'pending-secondary-key',
    })).resolves.toMatchObject({
      committed: true,
      storage: {
        localIntent: expect.objectContaining({ journalStatus: 'prepared' }),
        truthFlush: expect.objectContaining({ status: 'pending' }),
        sqlProjection: expect.objectContaining({ status: 'deferred' }),
      },
    });
  });

  it('retries queued Review truth flush when feedback pressure suppresses truth persistence', async () => {
    vi.useFakeTimers();
    try {
      const requests: Array<{ method: string; params: unknown }> = [];
      let truthFlushAttempts = 0;
      const transport: SrsBackendTransport = {
        request: vi.fn(async (request) => {
          requests.push({ method: request.method, params: request.params });
          if (request.method === 'review.feedback') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: createDurableReviewFeedbackResult(),
            };
          }
          if (request.method === 'review.truth.flush') {
            truthFlushAttempts += 1;
            if (truthFlushAttempts === 1) {
              throw new Error('BACKEND_UNAVAILABLE: review.feedback suppressed SiYuan persistence host effect truth.writeBinary');
            }
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                at: 1_700_000_000_200,
                journalQueued: 1,
                recordsWritten: 1,
                segmentWritten: true,
                manifestUpdated: true,
                projectionRefreshScheduled: true,
                idempotencyDuplicateSkipped: 0,
                flushedEntryIds: ['review-feedback:truth-flush-key'],
                segmentPaths: ['truth/review-events/review-events-v1/device-device-A/seg-000002-test.msgpack'],
                error: null,
              },
            };
          }
          throw new Error(`Unexpected backend method ${request.method}`);
        }),
      };
      const client = new SrsBackendClient(transport, {
        reviewTruthFlush: {
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          batchLimit: 8,
          delayMs: 50,
        },
      });

      await client.reviewFeedback({
        cardId: 'card-review-truth-flush-pressure',
        rating: 3,
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        idempotencyKey: 'truth-flush-key',
      });

      await vi.advanceTimersByTimeAsync(50);
      await vi.waitFor(() => expect(truthFlushAttempts).toBe(2));
      expect(requests.map((request) => request.method)).toEqual([
        'review.feedback',
        'review.truth.flush',
        'review.truth.flush',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry queued Review truth flush for non-pressure persistence errors', async () => {
    vi.useFakeTimers();
    try {
      let truthFlushAttempts = 0;
      const transport: SrsBackendTransport = {
        request: vi.fn(async (request) => {
          if (request.method === 'review.feedback') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: createDurableReviewFeedbackResult(),
            };
          }
          if (request.method === 'review.truth.flush') {
            truthFlushAttempts += 1;
            throw new Error('BACKEND_UNAVAILABLE: truth.writeBinary host effect unavailable');
          }
          throw new Error(`Unexpected backend method ${request.method}`);
        }),
      };
      const client = new SrsBackendClient(transport, {
        reviewTruthFlush: {
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          batchLimit: 8,
          delayMs: 50,
        },
      });

      await client.reviewFeedback({
        cardId: 'card-review-truth-flush-real-error',
        rating: 3,
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        idempotencyKey: 'truth-flush-real-error-key',
      });

      await vi.advanceTimersByTimeAsync(50);
      await vi.waitFor(() => expect(truthFlushAttempts).toBe(1));
      await vi.advanceTimersByTimeAsync(500);
      expect(truthFlushAttempts).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes Review truth immediately when pending feedback reaches threshold 8', async () => {
    vi.useFakeTimers();
    try {
      const requests: Array<{ method: string; params: unknown }> = [];
      const transport: SrsBackendTransport = {
        request: vi.fn(async (request) => {
          requests.push({ method: request.method, params: request.params });
          if (request.method === 'review.feedback') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: createDurableReviewFeedbackResult({
                storage: {
                  ...(createDurableReviewFeedbackResult().storage as Record<string, unknown>),
                  truthFlush: {
                    status: 'pending',
                    family: 'review-events',
                    syncVisible: false,
                    pendingCount: 8,
                    oldestPendingAgeMs: 0,
                    lastError: null,
                  },
                },
              }),
            };
          }
          if (request.method === 'review.truth.flush') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                at: 1_700_000_000_100,
                journalQueued: 8,
                recordsWritten: 8,
                segmentWritten: true,
                manifestUpdated: true,
                projectionRefreshScheduled: true,
                idempotencyDuplicateSkipped: 0,
                flushedEntryIds: [],
                segmentPaths: [],
                error: null,
              },
            };
          }
          throw new Error(`Unexpected backend method ${request.method}`);
        }),
      };
      const client = new SrsBackendClient(transport, {
        reviewTruthFlush: {
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          batchLimit: 8,
          delayMs: 10_000,
        },
      });

      await client.reviewFeedback({
        cardId: 'card-review-truth-flush',
        rating: 3,
        queueType: 'retrieval-practice',
        queueMode: 'formal',
        commitPolicy: 'write-schedule',
        idempotencyKey: 'truth-flush-key',
      });

      await vi.waitFor(() => expect(requests.map((request) => request.method)).toEqual([
        'review.feedback',
        'review.truth.flush',
      ]));
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails review.feedback closed when committed result omits durability status', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => ({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          cardId: 'card-review-missing-storage',
          committed: true,
          reviewedAt: 1_700_000_000_000,
          queueType: 'retrieval-practice',
          updatedCard: null,
          queueImpact: {
            hotPatchable: true,
            refreshRequired: false,
            affectedQueues: [],
          },
        },
      })),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.reviewFeedback({
      cardId: 'card-review-missing-storage',
      rating: 3,
      queueType: 'retrieval-practice',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: review.feedback committed result failed durability gate');
  });

  it('accepts committed feedback when derived truth flush and projection are unavailable diagnostics', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => ({
        jsonrpc: '2.0',
        id: request.id,
        result: createDurableReviewFeedbackResult({
          storage: {
            ...(createDurableReviewFeedbackResult().storage as Record<string, unknown>),
            truthFlush: {
              status: 'unavailable',
              family: 'review-events',
              syncVisible: false,
              pendingCount: 1,
              oldestPendingAgeMs: 0,
              lastError: 'truth segment host unavailable',
            },
            sqlProjection: {
              status: 'unavailable',
              hotPatchable: false,
              refreshRequired: true,
              affectedQueueCount: 1,
              projectionGeneration: null,
            },
          },
        }),
      })),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.reviewFeedback({
      cardId: 'card-review-truth-derived-unavailable',
      rating: 3,
      queueType: 'retrieval-practice',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
      idempotencyKey: 'truth-derived-unavailable-key',
    })).resolves.toMatchObject({
      committed: true,
      storage: {
        truthFlush: { status: 'unavailable' },
        sqlProjection: { status: 'unavailable' },
      },
    });
  });

  it('bounds plugin unload Review truth flush wait to 1 second', async () => {
    vi.useFakeTimers();
    try {
      const requests: string[] = [];
      const transport: SrsBackendTransport = {
        request: vi.fn(async (request) => {
          requests.push(request.method);
          if (request.method === 'review.truth.flush') {
            return new Promise(() => undefined);
          }
          throw new Error(`Unexpected backend method ${request.method}`);
        }),
      };
      const client = new SrsBackendClient(transport, {
        reviewTruthFlush: {
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
        },
      });

      const result = client.flushReviewTruthBeforeUnload();
      await vi.advanceTimersByTimeAsync(999);
      expect(requests).toEqual(['review.truth.flush']);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips startup Review truth backfill during before-unload quick flush', async () => {
    vi.useFakeTimers();
    try {
      const requests: Array<{ method: string; params: unknown }> = [];
      const transport: SrsBackendTransport = {
        request: vi.fn(async (request) => {
          requests.push({ method: request.method, params: request.params });
          if (request.method === 'review.truth.maintenanceStatus') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                family: 'review-events',
                journal: {
                  fileName: 'review-feedback-journal.v1',
                  storage: 'non-siyuan',
                  version: 1,
                  pendingCount: 0,
                  pendingBytes: 0,
                  statusCounts: {},
                  appliedInMemoryCount: 0,
                  lastWrite: null,
                  lastReplay: null,
                  lastCheckpoint: null,
                },
                truthBackfill: {
                  family: 'review-events',
                  source: 'review_events',
                  storage: 'truth-segments',
                  pendingSqlRows: 64,
                  pendingSqlRowsCheckedAt: 1_700_000_000_000,
                  syncVisible: false,
                  last: null,
                  lastError: null,
                },
              },
            };
          }
          if (request.method === 'review.truth.flush') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                at: 1_700_000_000_100,
                journalQueued: 0,
                recordsWritten: 0,
                segmentWritten: false,
                manifestUpdated: false,
                projectionRefreshScheduled: false,
                idempotencyDuplicateSkipped: 0,
                flushedEntryIds: [],
                segmentPaths: [],
                error: null,
              },
            };
          }
          if (request.method === 'review.truth.backfill') {
            throw new Error('before-unload quick flush must not run Review truth backfill');
          }
          throw new Error(`Unexpected backend method ${request.method}`);
        }),
      };
      const client = new SrsBackendClient(transport, {
        reviewTruthFlush: {
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          batchLimit: 4,
          delayMs: 25,
        },
      });

      await expect(client.schedulePendingReviewTruthFlush('startup')).resolves.toBe(true);
      await expect(client.flushReviewTruthBeforeUnload()).resolves.toBe(true);

      expect(requests.map((request) => request.method)).toEqual([
        'review.truth.maintenanceStatus',
        'review.truth.flush',
      ]);

      await vi.advanceTimersByTimeAsync(25);
      await Promise.resolve();
      expect(requests.map((request) => request.method)).toEqual([
        'review.truth.maintenanceStatus',
        'review.truth.flush',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('submits startup Review SQL truth backfill to the background work registry', async () => {
    const scheduled: Array<() => void> = [];
    const registry = new KernelCompanionBackgroundWorkRegistry({
      schedule: (run) => scheduled.push(run),
    });
    const requests: Array<{ method: string; params: unknown }> = [];
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => {
        requests.push({ method: request.method, params: request.params });
        if (request.method === 'review.truth.maintenanceStatus') {
          return {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              family: 'review-events',
              journal: {
                fileName: 'review-feedback-journal.v1',
                storage: 'non-siyuan',
                version: 1,
                pendingCount: 0,
                pendingBytes: 0,
                statusCounts: {},
                appliedInMemoryCount: 0,
                lastWrite: null,
                lastReplay: null,
                lastCheckpoint: null,
              },
              truthBackfill: {
                family: 'review-events',
                source: 'review_events',
                storage: 'truth-segments',
                pendingSqlRows: 12,
                pendingSqlRowsCheckedAt: 1_700_000_000_000,
                syncVisible: false,
                last: null,
                lastError: null,
              },
            },
          };
        }
        throw new Error(`Unexpected backend method ${request.method}`);
      }),
    };
    const client = new SrsBackendClient(transport, {
      backgroundWorkRegistry: registry,
      reviewTruthFlush: {
        deviceId: 'device-A',
        generationId: 'review-events-v1',
        schemaVersion: 1,
        batchLimit: 4,
        delayMs: 25,
      },
    });

    await expect(client.schedulePendingReviewTruthFlush('startup')).resolves.toBe(true);

    expect(requests.map((request) => request.method)).toEqual(['review.truth.maintenanceStatus']);
    expect(scheduled).toHaveLength(1);
    expect(registry.status()).toEqual([
      expect.objectContaining({
        kind: 'review-truth-backfill',
        state: 'accepted',
        diagnostics: expect.objectContaining({
          reason: 'startup',
          pendingRows: 12,
          batchLimit: 4,
          plannedBatches: 3,
          maxBatches: 3,
        }),
      }),
    ]);
    const [status] = client.backgroundWorkStatus();
    expect(status).toMatchObject({
      kind: 'review-truth-backfill',
      state: 'accepted',
      reason: 'startup',
      terminalAt: null,
      diagnostics: {
        reason: 'startup',
        pendingRows: 12,
        batchLimit: 4,
        plannedBatches: 3,
        maxBatches: 3,
      },
    });
    expect(client.backgroundWorkStatus({ kind: 'review-truth-backfill' })).toHaveLength(1);
    expect(client.backgroundWorkStatus(status.jobId)).toEqual(status);
  });

  it('dispose clears queued Review truth maintenance and prevents timer re-arm', async () => {
    vi.useFakeTimers();
    try {
      let resolveFlush: ((value: unknown) => void) | null = null;
      const requests: string[] = [];
      const transport: SrsBackendTransport = {
        request: vi.fn(async (request) => {
          requests.push(request.method);
          if (request.method === 'review.truth.flush') {
            return new Promise((resolve) => {
              resolveFlush = resolve;
            });
          }
          throw new Error(`Unexpected backend method ${request.method}`);
        }),
      };
      const client = new SrsBackendClient(transport, {
        reviewTruthFlush: {
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          delayMs: 25,
        },
      });

      expect(client.requestReviewTruthFlush('manual')).toBe(true);
      await Promise.resolve();
      expect(requests).toEqual(['review.truth.flush']);

      client.dispose();
      resolveFlush?.({
        jsonrpc: '2.0',
        id: 'flush-1',
        result: {
          ok: false,
          at: 1_700_000_000_100,
          journalQueued: 1,
          recordsWritten: 0,
          segmentWritten: false,
          manifestUpdated: false,
          projectionRefreshScheduled: false,
          idempotencyDuplicateSkipped: 0,
          flushedEntryIds: [],
          segmentPaths: [],
          error: 'BACKEND_PRESSURE: feedback writer busy',
        },
      });
      await Promise.resolve();
      await Promise.resolve();

      await vi.advanceTimersByTimeAsync(1_000);
      await Promise.resolve();
      expect(requests).toEqual(['review.truth.flush']);
      expect(client.requestReviewTruthFlush('manual')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('schedules pending Review truth flush after startup diagnostics show unapplied truth', async () => {
    vi.useFakeTimers();
    try {
      const requests: Array<{ method: string; params: unknown }> = [];
      const transport: SrsBackendTransport = {
        request: vi.fn(async (request) => {
          requests.push({ method: request.method, params: request.params });
          if (request.method === 'review.truth.maintenanceStatus') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                family: 'review-events',
                journal: {
                  fileName: 'review-feedback-journal.v1',
                  storage: 'non-siyuan',
                  version: 1,
                  pendingCount: 1,
                  pendingBytes: 256,
                  statusCounts: {
                    'projection-applied': 1,
                  },
                  appliedInMemoryCount: 0,
                  lastWrite: null,
                  lastReplay: null,
                  lastCheckpoint: null,
                },
                truthBackfill: {
                  family: 'review-events',
                  source: 'review_events',
                  storage: 'truth-segments',
                  pendingSqlRows: 0,
                  pendingSqlRowsCheckedAt: 1_700_000_000_000,
                  syncVisible: false,
                  last: null,
                  lastError: null,
                },
              },
            };
          }
          if (request.method === 'diagnostics.status') {
            throw new Error('diagnostics.status should not gate startup Review truth maintenance');
          }
          if (request.method === 'review.truth.flush') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                at: 1_700_000_000_100,
                journalQueued: 1,
                recordsWritten: 1,
                segmentWritten: true,
                manifestUpdated: true,
                projectionRefreshScheduled: true,
                idempotencyDuplicateSkipped: 0,
                flushedEntryIds: ['review-feedback:startup-key'],
                segmentPaths: ['truth/review-events/review-events-v1/device-device-A/seg-000001-startup.msgpack'],
                error: null,
              },
            };
          }
          throw new Error(`Unexpected backend method ${request.method}`);
        }),
      };
      const client = new SrsBackendClient(transport, {
        reviewTruthFlush: {
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          batchLimit: 4,
          delayMs: 25,
        },
      });

      await expect(client.schedulePendingReviewTruthFlush('startup')).resolves.toBe(true);
      expect(requests).toEqual([{
        method: 'review.truth.maintenanceStatus',
        params: [],
      }]);

      await vi.advanceTimersByTimeAsync(24);
      expect(requests).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      await vi.waitFor(() => expect(requests).toHaveLength(2));
      expect(requests[1]).toEqual({
        method: 'review.truth.flush',
        params: [{
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          batchLimit: 4,
        }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps startup Review truth scheduling off broad diagnostics', async () => {
    vi.useFakeTimers();
    try {
      const requests: Array<{ method: string; params: unknown }> = [];
      const transport: SrsBackendTransport = {
        request: vi.fn(async (request) => {
          requests.push({ method: request.method, params: request.params });
          if (request.method === 'diagnostics.status') {
            throw new Error('BACKEND_UNAVAILABLE: backend worker host effect sqlite.readBinary timed out after 5000ms');
          }
          if (request.method === 'review.truth.maintenanceStatus') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                family: 'review-events',
                journal: {
                  fileName: 'review-feedback-journal.v1',
                  storage: 'non-siyuan',
                  version: 1,
                  pendingCount: 1,
                  pendingBytes: 256,
                  statusCounts: {
                    'projection-applied': 1,
                  },
                  appliedInMemoryCount: 0,
                  lastWrite: null,
                  lastReplay: null,
                  lastCheckpoint: null,
                },
                truthBackfill: {
                  family: 'review-events',
                  source: 'review_events',
                  storage: 'truth-segments',
                  pendingSqlRows: 0,
                  pendingSqlRowsCheckedAt: 1_700_000_000_000,
                  syncVisible: false,
                  last: null,
                  lastError: null,
                },
              },
            };
          }
          if (request.method === 'review.truth.flush') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                at: 1_700_000_000_100,
                journalQueued: 1,
                recordsWritten: 1,
                segmentWritten: true,
                manifestUpdated: true,
                projectionRefreshScheduled: true,
                idempotencyDuplicateSkipped: 0,
                flushedEntryIds: ['review-feedback:startup-key'],
                segmentPaths: ['truth/review-events/review-events-v1/device-device-A/seg-000001-startup.msgpack'],
                error: null,
              },
            };
          }
          throw new Error(`Unexpected backend method ${request.method}`);
        }),
      };
      const client = new SrsBackendClient(transport, {
        reviewTruthFlush: {
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          batchLimit: 4,
          delayMs: 25,
        },
      });

      await expect(client.schedulePendingReviewTruthFlush('startup')).resolves.toBe(true);
      await vi.advanceTimersByTimeAsync(25);
      await vi.waitFor(() => expect(requests.map((request) => request.method)).toEqual([
        'review.truth.maintenanceStatus',
        'review.truth.flush',
      ]));
    } finally {
      vi.useRealTimers();
    }
  });

  it('adds client-side Review truth device diagnostics to backend status', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => ({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          runtime: 'srs-backend-worker',
          initialized: true,
          dbFile: 'siyuanmemo.db',
          review: {
            feedbackTotal: 0,
            feedbackCommittedTotal: 0,
            feedbackPreviewTotal: 0,
            feedbackUnavailableTotal: 0,
            truthFlush: {
              family: 'review-events',
              storage: 'truth-segments',
              last: null,
            },
          },
        },
      })),
    };
    const client = new SrsBackendClient(transport, {
      reviewTruthDevice: {
        deviceId: 'device-stable',
        source: 'temp-local',
        localStatePath: 'truth-device-id.v1.json',
        persisted: true,
        cacheUpdated: true,
        error: null,
      },
    });

    await expect(client.diagnosticsStatus()).resolves.toMatchObject({
      review: {
        truthDevice: {
          deviceId: 'device-stable',
          source: 'temp-local',
          localStatePath: 'truth-device-id.v1.json',
          persisted: true,
          cacheUpdated: true,
          error: null,
        },
      },
    });
  });

  it('schedules Review SQL truth backfill after startup diagnostics show rows without truth refs', async () => {
    vi.useFakeTimers();
    try {
      const requests: Array<{ method: string; params: unknown }> = [];
      const transport: SrsBackendTransport = {
        request: vi.fn(async (request) => {
          requests.push({ method: request.method, params: request.params });
          if (request.method === 'review.truth.maintenanceStatus') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                family: 'review-events',
                journal: {
                  fileName: 'review-feedback-journal.v1',
                  storage: 'non-siyuan',
                  version: 1,
                  pendingCount: 0,
                  pendingBytes: 0,
                  statusCounts: {},
                  appliedInMemoryCount: 0,
                  lastWrite: null,
                  lastReplay: null,
                  lastCheckpoint: null,
                },
                truthBackfill: {
                  family: 'review-events',
                  source: 'review_events',
                  storage: 'truth-segments',
                  pendingSqlRows: 9,
                  pendingSqlRowsCheckedAt: 1_700_000_000_000,
                  syncVisible: false,
                  last: null,
                  lastError: null,
                },
              },
            };
          }
          if (request.method === 'diagnostics.status') {
            throw new Error('diagnostics.status should not gate startup Review truth maintenance');
          }
          if (request.method === 'review.truth.backfill') {
            const backfillCount = requests.filter((item) => item.method === 'review.truth.backfill').length;
            const rowsInBatch = backfillCount < 3 ? 4 : 1;
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                at: 1_700_000_000_100,
                source: 'review_events',
                sqlRowsRead: rowsInBatch,
                recordsWritten: rowsInBatch,
                segmentWritten: true,
                manifestUpdated: true,
                projectionRefreshScheduled: true,
                idempotencyDuplicateSkipped: 0,
                backfilledEventIds: Array.from({ length: rowsInBatch }, (_, index) => `event-startup-${backfillCount}-${index}`),
                duplicateEventIds: [],
                repairRequiredEventIds: [],
                segmentPaths: [`truth/review-events/review-events-v1/device-device-A/seg-00000${backfillCount}-startup.msgpack`],
                syncVisible: true,
                error: null,
              },
            };
          }
          if (request.method === 'review.truth.flush') {
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                at: 1_700_000_000_110,
                journalQueued: 0,
                recordsWritten: 0,
                segmentWritten: false,
                manifestUpdated: false,
                projectionRefreshScheduled: false,
                idempotencyDuplicateSkipped: 0,
                flushedEntryIds: [],
                segmentPaths: [],
                error: null,
              },
            };
          }
          throw new Error(`Unexpected backend method ${request.method}`);
        }),
      };
      const client = new SrsBackendClient(transport, {
        reviewTruthFlush: {
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          batchLimit: 4,
          delayMs: 25,
        },
      });

      await expect(client.schedulePendingReviewTruthFlush('startup')).resolves.toBe(true);
      await vi.advanceTimersByTimeAsync(25);
      await vi.waitFor(() => expect(requests).toHaveLength(4));
      expect(requests.map((request) => request.method)).toEqual([
        'review.truth.maintenanceStatus',
        'review.truth.backfill',
        'review.truth.backfill',
        'review.truth.backfill',
      ]);
      expect(requests[1]).toEqual({
        method: 'review.truth.backfill',
        params: [{
          deviceId: 'device-A',
          generationId: 'review-events-v1',
          schemaVersion: 1,
          batchLimit: 4,
        }],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('routes backendized hotspot, aggregate, and graph placeholder contracts through typed RPC methods', async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const aggregateIdentity = {
      snapshotId: 'snapshot-a',
      generation: 1,
      datasourceId: 'deck:deck-a',
      policyHash: 'policy-a',
      queryFingerprint: 'query-a',
    };
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => {
        requests.push({ method: request.method, params: request.params });
        switch (request.method) {
          case 'hotspot.command.submit':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                accepted: true,
                family: 'progressive.command',
                commandId: 'progressive-1',
                idempotencyKey: 'progressive-key-1',
                state: 'accepted',
                progress: {
                  state: 'accepted',
                  currentStep: 'queued',
                  completedUnits: 0,
                  totalUnits: 1,
                  updatedAt: 1,
                },
                diagnostics: {
                  diagnosticEventId: 'hotspot:progressive-1',
                  family: 'progressive.command',
                  commandId: 'progressive-1',
                },
              },
            };
          case 'hotspot.job.get':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: false,
                family: 'progressive.command',
                commandId: 'progressive-1',
                idempotencyKey: 'progressive-key-1',
                state: 'stale-generation',
                unavailableClass: 'INVALID_REQUEST',
                reason: 'stale selection facts',
                recoverable: true,
                progress: {
                  state: 'stale-generation',
                  currentStep: 'validate-renderer-facts',
                  completedUnits: 0,
                  totalUnits: 1,
                  updatedAt: 2,
                },
                diagnostics: {
                  diagnosticEventId: 'hotspot:progressive-1',
                  family: 'progressive.command',
                  commandId: 'progressive-1',
                  errorCategory: 'INVALID_REQUEST',
                },
              },
            };
          case 'browser.aggregate.snapshot':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                status: 'ready',
                identity: aggregateIdentity,
                totalCount: 1,
                pageSize: 50,
              },
            };
          case 'browser.aggregate.page':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                status: 'ready',
                identity: aggregateIdentity,
                rows: [{ cardId: 'card-1' }],
                nextCursor: null,
                totalCount: 1,
              },
            };
          case 'browser.aggregate.focus':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                status: 'ready',
                identity: aggregateIdentity,
                focusFound: true,
                rows: [{ cardId: 'card-1' }],
                hierarchy: { parentIds: [] },
                sourceExistence: { 'block-1': true },
              },
            };
          case 'graph.query':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                status: 'unavailable',
                queryId: 'graph-1',
                kind: 'neighbors',
                unavailableClass: 'BACKEND_UNAVAILABLE',
                reason: 'graph read model unavailable',
                recoverable: true,
                diagnostics: {
                  timingMs: 5,
                  sourceAvailability: 'unavailable',
                  errorCategory: 'BACKEND_UNAVAILABLE',
                },
              },
            };
          default:
            return { jsonrpc: '2.0', id: request.id, error: { code: 'METHOD_NOT_FOUND', message: 'not mocked' } };
        }
      }),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.submitHotspotCommand({
      envelope: {
        family: 'progressive.command',
        commandId: 'progressive-1',
        idempotencyKey: 'progressive-key-1',
        caller: {
          instanceId: 'instance-a',
          runtimeRole: 'writer',
          surface: 'review',
        },
        writerExpectation: {
          mode: 'required',
          relayAllowed: true,
        },
        deadlineAt: 10,
        submittedAt: 1,
        payload: {
          sourceBlockId: 'block-1',
        },
      },
    })).resolves.toMatchObject({
      ok: true,
      family: 'progressive.command',
      state: 'accepted',
    });
    await expect(client.getHotspotJob({
      family: 'progressive.command',
      commandId: 'progressive-1',
      idempotencyKey: 'progressive-key-1',
    })).resolves.toMatchObject({
      ok: false,
      state: 'stale-generation',
      unavailableClass: 'INVALID_REQUEST',
    });
    await expect(client.browserAggregateSnapshot({
      requestId: 'snapshot-req-1',
      datasourceId: 'deck:deck-a',
    })).resolves.toMatchObject({
      status: 'ready',
      identity: aggregateIdentity,
    });
    await expect(client.browserAggregatePage({
      requestId: 'page-req-1',
      identity: aggregateIdentity,
      limit: 50,
    })).resolves.toMatchObject({
      rows: [{ cardId: 'card-1' }],
    });
    await expect(client.browserAggregateFocus({
      requestId: 'focus-req-1',
      identity: aggregateIdentity,
      focus: { type: 'card', cardId: 'card-1' },
    })).resolves.toMatchObject({
      focusFound: true,
      rows: [{ cardId: 'card-1' }],
    });
    await expect(client.graphQuery({
      queryId: 'graph-1',
      kind: 'neighbors',
      sourceNodeId: 'block-1',
    })).resolves.toMatchObject({
      status: 'unavailable',
      unavailableClass: 'BACKEND_UNAVAILABLE',
    });

    expect(requests.map((request) => request.method)).toEqual([
      'hotspot.command.submit',
      'hotspot.job.get',
      'browser.aggregate.snapshot',
      'browser.aggregate.page',
      'browser.aggregate.focus',
      'graph.query',
    ]);
  });

  it('routes Review source refresh through the typed RPC method', async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => {
        requests.push({ method: request.method, params: request.params });
        switch (request.method) {
          case 'review.sourceRefresh.execute':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                status: 'refresh-required',
                commandId: 'refresh-1',
                idempotencyKey: 'refresh-key-1',
                matchedBlockIds: ['block-1'],
                impact: {
                  refreshVisibleContent: true,
                  cleanupMissingSource: false,
                },
                diagnostics: {
                  diagnosticEventId: 'diag-refresh-1',
                  family: 'review.source-refresh',
                  commandId: 'refresh-1',
                },
              },
            };
          default:
            return { jsonrpc: '2.0', id: request.id, error: { code: 'METHOD_NOT_FOUND', message: 'not mocked' } };
        }
      }),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.executeReviewSourceRefresh({
      commandId: 'refresh-1',
      idempotencyKey: 'refresh-key-1',
      changedBlockIds: ['block-1'],
      dependencyBlockIds: ['block-1'],
    })).resolves.toMatchObject({ status: 'refresh-required', matchedBlockIds: ['block-1'] });

    expect(requests.map((request) => request.method)).toEqual(['review.sourceRefresh.execute']);
  });

  it('reads domain sync diagnostics through the backend RPC', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => ({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          ok: true,
          ledger: {
            operationCount: 1,
            newestOperationAt: 2,
            operationTypes: { 'review-committed': 1 },
          },
          processedSources: {
            recent: [],
            skipped: [],
            totalProcessed: 0,
            totalSkipped: 0,
          },
          sanity: {
            status: 'clean',
            checkedAt: 3,
            ledgerOperationCount: 1,
            pendingImportCount: 0,
            processedSourceCount: 0,
            skippedSourceCount: 0,
            repairableDivergenceCount: 0,
            divergentCardCount: 0,
            reasonCounts: {},
            affectedCardIds: [],
            truncated: false,
          },
          repair: {
            available: false,
            repairableDivergenceCount: 0,
            latestPlanId: null,
          },
        },
      })),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.domainSyncStatus()).resolves.toMatchObject({
      ok: true,
      sanity: { status: 'clean' },
    });
    expect(transport.request).toHaveBeenCalledWith(expect.objectContaining({
      method: 'domainSync.status',
      params: [{}],
    }));

    await expect(client.domainSyncStatus({
      context: 'review-feedback-preflight',
      cardId: 'card-domain-preflight',
    })).resolves.toMatchObject({
      ok: true,
      sanity: { status: 'clean' },
    });
    expect(transport.request).toHaveBeenLastCalledWith(expect.objectContaining({
      method: 'domainSync.status',
      params: [{
        context: 'review-feedback-preflight',
        cardId: 'card-domain-preflight',
      }],
    }));
  });

  it('sends browser phase-2 rpc envelopes with positional params', async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => {
        requests.push({ method: request.method, params: request.params });
        switch (request.method) {
          case 'browser.deck.page':
            return { jsonrpc: '2.0', id: request.id, result: { total: 0, cards: [] } };
          case 'browser.deck.matchedIds':
            return { jsonrpc: '2.0', id: request.id, result: { ids: ['card-1'] } };
          case 'browser.deck.rowsByIds':
            return { jsonrpc: '2.0', id: request.id, result: { cards: [{ id: 'card-1', blockId: 'block-1' }] } };
          case 'browser.stats':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                totalCards: 1,
                dueCards: 1,
                newCards: 0,
                learningCards: 0,
                reviewCards: 1,
                suspendedCards: 0,
                lostCards: 0,
              },
            };
          case 'browser.count':
            return { jsonrpc: '2.0', id: request.id, result: { count: 1 } };
          case 'browser.sourceExistence.refreshCandidates':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                candidates: [
                  {
                    cardId: 'card-1',
                    blockId: 'block-1',
                    sourceExists: null,
                    sourceCheckedAt: null,
                  },
                ],
              },
            };
          case 'browser.sourceExistence.byBlockIds':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                statusByBlockId: [
                  { blockId: 'block-1', exists: false },
                ],
              },
            };
          case 'browser.sourceExistence.update':
            return { jsonrpc: '2.0', id: request.id, result: { updated: 1 } };
          case 'browser.sourceExistence.summary':
            return { jsonrpc: '2.0', id: request.id, result: { unknown: 0, stale: 0, missing: 1 } };
          case 'browser.sourceExistence.applySweep':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: { checked: 1, updated: 1, changed: true, changedToMissing: false },
            };
          case 'browser.sourceExistence.applySweepHost':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: { checked: 1, updated: 1, changed: true, changedToMissing: false },
            };
          case 'kernel.transaction.ingest':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                accepted: 1,
                queued: 1,
                receivedAt: 1,
                duplicate: false,
                queueLength: 1,
                maxQueueLength: 256,
              },
            };
          case 'kernel.transaction.dequeue':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                actions: [],
                remaining: 0,
              },
            };
          case 'kernel.transaction.requeue':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                requeued: 1,
                queueLength: 1,
                maxQueueLength: 4096,
              },
            };
          case 'autocard.decision.resolve':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                candidateId: 'candidate-1',
                decisionEventId: 'decision-1',
                status: 'selected',
                unavailableClass: null,
                matchedRuleIds: ['BasicDirectionRule'],
                enabledDecisions: [],
                filteredDecisions: [],
                selectedDecision: null,
                conflicted: false,
                strategyUsed: 'semantic-first',
                markOnlyClozeCandidate: false,
                shouldUseTopicDerivation: false,
              },
            };
          case 'autocard.execute':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                executed: true,
                created: 1,
                skipped: 0,
              },
            };
          case 'autocard.executeBatch':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                executed: true,
                created: 2,
                skipped: 0,
              },
            };
          case 'review.feedback':
            return { jsonrpc: '2.0', id: request.id, error: { code: 'BACKEND_UNAVAILABLE', message: 'review not ready' } };
          case 'sync.conflict.merge':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                sources: 1,
                mergedReviewEvents: 1,
                ignoredReviewEvents: 0,
                mergedCards: 1,
                ignoredCards: 0,
                skippedSources: [],
                diagnostics: {
                  reviewCardDivergences: [],
                },
              },
            };
          case 'sync.reviewDivergence.audit':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                scannedCards: 1,
                divergentCards: 1,
                limit: 5,
                truncated: false,
                reasons: {
                  'review-history-newer-than-card-state': 1,
                  'review-event-count-exceeds-card-reps': 0,
                },
                records: [{
                  cardId: 'card-1',
                  blockId: 'block-1',
                  reason: 'review-history-newer-than-card-state',
                  newestReviewEventAt: 2,
                  cardLastReview: 1,
                  reviewEventCount: 1,
                  cardReps: 1,
                  sourceExists: true,
                  sourceCheckedAt: 3,
                  sourceMissingAt: null,
                }],
              },
            };
          case 'sync.conflict.summarize':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                current: null,
                sources: [],
              },
            };
          case 'sync.conflict.reload':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                reloaded: true,
                dbFile: 'siyuanmemo.db',
              },
            };
          case 'queue.projection.snapshot': {
            const [params] = request.params as [{ queueType?: string }?];
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                queueType: params?.queueType,
                policyHash: 'policy-deferred',
                generation: 4,
                status: 'ready',
                rows: [],
                counters: {
                  version: 4,
                  remaining: 0,
                  due: 0,
                  total: 0,
                  buckets: { all: 0, item: 0, descriptor: 0, topic: 0, concept: 0 },
                  source: 'reconciled',
                },
              },
            };
          }
          case 'queue.projection.rowsByIds': {
            const [params] = request.params as [{ queueType?: string }?];
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                queueType: params?.queueType,
                policyHash: 'policy-deferred',
                generation: 4,
                status: 'ready',
                rows: [],
                cards: [],
              },
            };
          }
          case 'storage.projection.rebuild':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                status: 'ready',
                at: 1,
                rebuildId: 'rebuild-a',
                cause: 'manual',
                projectionGeneration: 1,
                rowsRead: 1,
                rowsWritten: 1,
                sourceReadCount: 1,
                missingSourceIds: [],
                families: [{
                  family: 'review-event-indexes',
                  status: 'ready',
                  projectionGeneration: 1,
                  rowsRead: 1,
                  rowsWritten: 1,
                  sourceReadCount: 1,
                  missingSourceIds: [],
                  error: null,
                }],
                error: null,
              },
            };
          case 'neural-roam.advance':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                queueType: 'neural-roam',
                sessionId: 'session-neural-1',
                status: 'advanced',
                nextItem: {
                  id: 'node-2',
                  cardId: 'node-2',
                  blockId: 'node-2',
                  deckId: 'neural-roam',
                  due: null,
                  type: 'topic',
                  meta: {
                    neuralContext: {
                      isFlashcard: false,
                    },
                  },
                  sourceKind: 'virtual',
                  payload: null,
                },
                counters: {
                  remaining: 1,
                  due: 1,
                  total: 1,
                  pendingAssociatedReview: 0,
                  sourceNodes: 1,
                },
                sessionState: {
                  sessionId: 'session-neural-1',
                  engineMode: 'hyperspace',
                  currentNodeId: 'node-2',
                  currentEventId: 'event-2',
                  pathLength: 2,
                  historyCount: 1,
                  exhausted: false,
                  projectionGeneration: 4,
                  policyHash: 'policy-deferred',
                },
                queueState: {
                  version: 8,
                  engineMode: 'hyperspace',
                },
                projectionImpact: null,
                unavailableReason: null,
                message: null,
              },
            };
          case 'hotspot.job.get':
            return {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                ok: true,
                job: {
                  jobId: 'job-1',
                  kind: 'hotspot-command',
                  owner: 'backend',
                  idempotencyKey: 'job-key-1',
                  state: 'running',
                  progress: 40,
                  startedAt: 1,
                  updatedAt: 2,
                  deadlineAt: null,
                  retryPolicy: 'none',
                  result: null,
                  error: null,
                },
              },
            };
          default:
            return { jsonrpc: '2.0', id: request.id, error: { code: 'METHOD_NOT_FOUND', message: 'not mocked' } };
        }
      }),
    };

    const client = new SrsBackendClient(transport);
    await client.browserDeckPage({ preset: 'all' }, { startRow: 0, endRow: 10 });
    await expect(client.browserDeckMatchedIds({ preset: 'all' })).resolves.toEqual(['card-1']);
    await expect(client.browserDeckRowsByIds(['card-1'])).resolves.toEqual([{ id: 'card-1', blockId: 'block-1' }]);
    await expect(client.browserStats()).resolves.toMatchObject({ totalCards: 1, dueCards: 1 });
    await expect(client.browserCountCards({ includeSuspended: false })).resolves.toBe(1);
    await expect(client.browserSourceExistenceRefreshCandidates({ blockIds: ['block-1'] })).resolves.toHaveLength(1);
    await expect(client.browserSourceExistenceByBlockIds(['block-1'])).resolves.toEqual(new Map([['block-1', false]]));
    await expect(client.browserSourceExistenceUpdate([{ blockId: 'block-1', exists: false }], 1)).resolves.toBe(1);
    await expect(client.browserSourceExistenceSummary()).resolves.toEqual({ unknown: 0, stale: 0, missing: 1 });
    await expect(client.browserSourceExistenceApplySweep({ blockIds: ['block-1'] }, ['block-1'], 1)).resolves.toEqual({
      checked: 1,
      updated: 1,
      changed: true,
      changedToMissing: false,
    });
    await expect(client.browserSourceExistenceApplySweepHost({ blockIds: ['block-1'] }, 1)).resolves.toEqual({
      checked: 1,
      updated: 1,
      changed: true,
      changedToMissing: false,
    });
    await expect(client.ingestKernelTransactions({
      source: 'kernel-sidecar',
      transactions: [{ id: 'tx-1' }],
      receivedAt: 1,
      idempotencyKey: 'tx-1',
    })).resolves.toEqual({
      accepted: 1,
      queued: 1,
      receivedAt: 1,
      duplicate: false,
      queueLength: 1,
      maxQueueLength: 256,
    });
    await expect(client.dequeueKernelTransactions({
      maxActions: 8,
    })).resolves.toEqual({
      actions: [],
      remaining: 0,
    });
    await expect(client.requeueKernelTransactions({
      actions: [{
        type: 'native-riff-remove',
        blockIds: ['block-1'],
        source: 'ws-main',
        receivedAt: 1,
        idempotencyKey: 'rq-1',
      }],
    })).resolves.toEqual({
      requeued: 1,
      queueLength: 1,
      maxQueueLength: 4096,
    });
    await expect(client.resolveAutoCardDecision({
      blockId: 'block-1',
      content: 'Q <> A',
      blockType: 'p',
      resolvedCardType: 'item',
      source: 'symbol-listener',
      ruleScope: 'all',
      hasParentTopicCard: false,
      settings: {
        enabledSymbols: {
          basic: true,
        },
      },
    })).resolves.toMatchObject({
      candidateId: 'candidate-1',
      decisionEventId: 'decision-1',
      status: 'selected',
      unavailableClass: null,
      matchedRuleIds: ['BasicDirectionRule'],
      selectedDecision: null,
      strategyUsed: 'semantic-first',
    });
    await expect(client.executeAutoCard({
      envelope: {
        kind: 'planner-decision',
        blockId: 'block-1',
        content: 'Q <> A',
        decision: {
          id: 'BasicDirectionRule',
          family: 'basic',
          templateId: 'builtin-bidirectional-single',
          cardType: 'item',
          mode: 'multi-face',
          executorKind: 'quick-basic',
          priority: 50,
          direction: 'both',
        },
        source: 'symbol-listener',
      },
    })).resolves.toEqual({
      executed: true,
      created: 1,
      skipped: 0,
    });
    await expect(client.executeAutoCardBatch({
      items: [{
        envelope: {
          kind: 'planner-decision',
          blockId: 'block-1',
          content: 'Q >> A',
          decision: {
            id: 'BasicDirectionRule',
            family: 'basic',
            templateId: 'builtin-quick-card',
            cardType: 'item',
            mode: 'single',
            executorKind: 'quick-basic',
            priority: 50,
            direction: 'forward',
          },
          source: 'doc-oneclick-scan',
          docRootId: 'doc-1',
        },
      }],
    })).resolves.toEqual({
      executed: true,
      created: 2,
      skipped: 0,
    });
    await expect(client.reviewFeedback({
      cardId: 'card-1',
      rating: 3,
      queueType: 'incremental-learning',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
    })).rejects.toThrow('BACKEND_UNAVAILABLE: review not ready');
    await expect(client.mergeSyncConflicts({
      mergedAt: 1,
      sources: [{ sourceId: 'conflict-a', bytes: new Uint8Array([1, 2, 3]) }],
    })).resolves.toMatchObject({
      ok: true,
      sources: 1,
      mergedReviewEvents: 1,
      mergedCards: 1,
    });
    await expect(client.auditReviewSyncDivergence({
      cardIds: ['card-1'],
      limit: 5,
    })).resolves.toMatchObject({
      ok: true,
      scannedCards: 1,
      divergentCards: 1,
      records: [expect.objectContaining({ cardId: 'card-1' })],
    });
    await expect(client.summarizeSyncConflicts({
      includeCurrent: true,
      sources: [],
    })).resolves.toEqual({
      ok: true,
      current: null,
      sources: [],
    });
    await expect(client.reloadSyncConflictDatabase()).resolves.toEqual({
      ok: true,
      reloaded: true,
      dbFile: 'siyuanmemo.db',
    });
    await expect(client.queueProjectionSnapshot({
      queueType: 'neural-roam',
      generation: 4,
      policyHash: 'policy-deferred',
    })).resolves.toMatchObject({
      queueType: 'neural-roam',
      status: 'ready',
      generation: 4,
    });
    await expect(client.queueProjectionRowsByIds({
      queueType: 'filter-group',
      ids: ['row-a'],
      generation: 4,
      policyHash: 'policy-deferred',
    })).resolves.toMatchObject({
      queueType: 'filter-group',
      status: 'ready',
      cards: [],
    });
    await expect(client.storageProjectionRebuild({
      rebuildId: 'rebuild-a',
      families: ['review-event-indexes'],
      deviceId: 'device-a',
      generationId: 'generation-a',
    })).resolves.toMatchObject({
      status: 'ready',
      rowsWritten: 1,
    });
    await expect(client.neuralRoamAdvance({
      queueType: 'neural-roam',
      sessionId: 'session-neural-1',
      currentItem: {
        id: 'node-1',
        cardId: 'node-1',
        blockId: 'node-1',
        sourceKind: 'virtual',
      },
      feedback: {
        action: 'rate',
        rating: 3,
      },
      projectionGeneration: 4,
      policyHash: 'policy-deferred',
      idempotencyKey: 'neural-advance-key-1',
    })).resolves.toMatchObject({
      queueType: 'neural-roam',
      sessionId: 'session-neural-1',
      status: 'advanced',
      nextItem: {
        blockId: 'node-2',
        sourceKind: 'virtual',
      },
      counters: {
        remaining: 1,
      },
      sessionState: {
        projectionGeneration: 4,
        policyHash: 'policy-deferred',
      },
    });
    await expect(client.getHotspotJob({
      jobId: 'job-1',
    })).resolves.toMatchObject({
      ok: true,
      job: {
        jobId: 'job-1',
      },
    });

    expect(requests.map((request) => request.method)).toEqual([
      'browser.deck.page',
      'browser.deck.matchedIds',
      'browser.deck.rowsByIds',
      'browser.stats',
      'browser.count',
      'browser.sourceExistence.refreshCandidates',
      'browser.sourceExistence.byBlockIds',
      'browser.sourceExistence.update',
      'browser.sourceExistence.summary',
      'browser.sourceExistence.applySweep',
      'browser.sourceExistence.applySweepHost',
      'kernel.transaction.ingest',
      'kernel.transaction.dequeue',
      'kernel.transaction.requeue',
      'autocard.decision.resolve',
      'autocard.execute',
      'autocard.executeBatch',
      'review.feedback',
      'sync.conflict.merge',
      'sync.reviewDivergence.audit',
      'sync.conflict.summarize',
      'sync.conflict.reload',
      'queue.projection.snapshot',
      'queue.projection.rowsByIds',
      'storage.projection.rebuild',
      'neural-roam.advance',
      'hotspot.job.get',
    ]);
    expect(requests[0].params).toEqual([{ query: { preset: 'all' }, page: { startRow: 0, endRow: 10 } }]);
    expect(requests[1].params).toEqual([{ query: { preset: 'all' } }]);
    expect(requests[15].params).toEqual([{
      envelope: {
        kind: 'planner-decision',
        blockId: 'block-1',
        content: 'Q <> A',
        decision: {
          id: 'BasicDirectionRule',
          family: 'basic',
          templateId: 'builtin-bidirectional-single',
          cardType: 'item',
          mode: 'multi-face',
          executorKind: 'quick-basic',
          priority: 50,
          direction: 'both',
        },
        source: 'symbol-listener',
      },
    }]);
    expect(requests[16].params).toEqual([{
      items: [{
        envelope: {
          kind: 'planner-decision',
          blockId: 'block-1',
          content: 'Q >> A',
          decision: {
            id: 'BasicDirectionRule',
            family: 'basic',
            templateId: 'builtin-quick-card',
            cardType: 'item',
            mode: 'single',
            executorKind: 'quick-basic',
            priority: 50,
            direction: 'forward',
          },
          source: 'doc-oneclick-scan',
          docRootId: 'doc-1',
        },
      }],
    }]);
    expect(requests[17].params).toEqual([{
      cardId: 'card-1',
      rating: 3,
      queueType: 'incremental-learning',
      queueMode: 'formal',
      commitPolicy: 'write-schedule',
    }]);
    expect(requests[18].params).toEqual([{
      mergedAt: 1,
      sources: [{ sourceId: 'conflict-a', bytes: new Uint8Array([1, 2, 3]) }],
    }]);
    expect(requests[19].params).toEqual([{
      cardIds: ['card-1'],
      limit: 5,
    }]);
    expect(requests[24].params).toEqual([{
      rebuildId: 'rebuild-a',
      families: ['review-event-indexes'],
      deviceId: 'device-a',
      generationId: 'generation-a',
    }]);
    expect(requests[25].params).toEqual([{
      queueType: 'neural-roam',
      sessionId: 'session-neural-1',
      currentItem: {
        id: 'node-1',
        cardId: 'node-1',
        blockId: 'node-1',
        sourceKind: 'virtual',
      },
      feedback: {
        action: 'rate',
        rating: 3,
      },
      projectionGeneration: 4,
      policyHash: 'policy-deferred',
      idempotencyKey: 'neural-advance-key-1',
    }]);
    expect(requests[14].params).toEqual([{
      blockId: 'block-1',
      content: 'Q <> A',
      blockType: 'p',
      resolvedCardType: 'item',
      source: 'symbol-listener',
      ruleScope: 'all',
      hasParentTopicCard: false,
      settings: {
        enabledSymbols: {
          basic: true,
        },
      },
    }]);
  });

  it('rejects autocard.decision.resolve payload when status envelope is missing', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => ({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          matchedRuleIds: [],
          enabledDecisions: [],
          filteredDecisions: [],
          selectedDecision: null,
          conflicted: false,
          strategyUsed: 'semantic-first',
          markOnlyClozeCandidate: false,
          shouldUseTopicDerivation: false,
        },
      })),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.resolveAutoCardDecision({
      blockId: 'block-1',
      content: 'Q <> A',
      source: 'symbol-listener',
    })).rejects.toThrow('autocard.decision.resolve returned invalid payload');
  });

  it('rejects neural-roam.advance payload when semantic fields are missing', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => ({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          queueType: 'neural-roam',
          status: 'advanced',
          nextItem: null,
        },
      })),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.neuralRoamAdvance({
      queueType: 'neural-roam',
      sessionId: 'session-1',
    })).rejects.toThrow('neural-roam.advance returned invalid payload');
  });

  it('rejects neural-roam.viewState payload when backend route selector data is missing', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => ({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          queueType: 'neural-roam',
          status: 'ready',
          viewState: {
            version: 1,
            queueType: 'neural-roam',
            route: {
              id: 'route-a',
              name: 'Route A',
              temporary: false,
              previousRouteId: null,
            },
            engineMode: 'orbit',
            currentNodeId: null,
            currentEventId: null,
            navigationState: null,
            counters: {
              routeId: 'route-a',
              remaining: 0,
              due: 0,
              total: 0,
              pendingAssociatedReview: 0,
              sourceNodes: 0,
            },
            sources: [],
            anchors: [],
            engineHistory: [],
            routeHistory: [],
            batchProgress: {
              kind: 'none',
              viewedCount: 0,
              totalCount: 0,
              remainingCount: 0,
              label: '',
            },
            updatedAt: Date.now(),
          },
        },
      })),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.neuralRoamViewState({
      queueType: 'neural-roam',
    })).rejects.toThrow('neural-roam.viewState returned invalid payload');
  });

  it('rejects neural-roam.command payload when backend route selector data is missing', async () => {
    const transport: SrsBackendTransport = {
      request: vi.fn(async (request) => ({
        jsonrpc: '2.0',
        id: request.id,
        result: {
          queueType: 'neural-roam',
          status: 'ok',
          viewState: {
            version: 1,
            queueType: 'neural-roam',
            route: {
              id: 'route-a',
              name: 'Route A',
              temporary: false,
              previousRouteId: null,
            },
            engineMode: 'orbit',
            currentNodeId: null,
            currentEventId: null,
            navigationState: null,
            counters: {
              routeId: 'route-a',
              remaining: 0,
              due: 0,
              total: 0,
              pendingAssociatedReview: 0,
              sourceNodes: 0,
            },
            sources: [],
            anchors: [],
            engineHistory: [],
            routeHistory: [],
            batchProgress: {
              kind: 'none',
              viewedCount: 0,
              totalCount: 0,
              remainingCount: 0,
              label: '',
            },
            updatedAt: Date.now(),
          },
          queueState: {
            version: 8,
            engineMode: 'orbit',
          },
          unavailableReason: null,
          message: null,
        },
      })),
    };
    const client = new SrsBackendClient(transport);

    await expect(client.neuralRoamCommand({
      queueType: 'neural-roam',
      command: {
        type: 'switch-route',
        routeId: 'route-a',
      },
    })).rejects.toThrow('neural-roam.command returned invalid payload');
  });
});
