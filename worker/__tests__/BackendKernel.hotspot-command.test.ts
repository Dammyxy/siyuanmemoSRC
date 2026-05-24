import { describe, expect, it, vi } from 'vitest';
import { BackendKernel } from '../bootstrap/BackendKernel';
import { WorkerSqliteDatabaseService } from '../db/SqliteDatabaseService';
import { createInMemorySqlitePersistenceBridge } from '../db/SqlitePersistenceBridge';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type {
  BackendNeuralGraphQueryRequest,
  BackendNeuralGraphQueryResult,
} from '../../packages/contracts/src/backend-rpc';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? overrides.id ?? 'block-1',
    due: overrides.due ?? now + 86_400_000,
    stability: overrides.stability ?? 4,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 3,
    lapses: overrides.lapses ?? 1,
    state: overrides.state ?? CardState.Review,
    lastReview: overrides.lastReview ?? now,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 7,
    priority: overrides.priority ?? 19,
    type: overrides.type ?? CardType.Item,
    tags: overrides.tags ?? [],
    neuralRoamSeed: overrides.neuralRoamSeed ?? false,
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ?? {},
  };
}

function createKernel(): BackendKernel {
  return new BackendKernel({
    database: new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge()),
  });
}

function createKernelWithDatabase(database: WorkerSqliteDatabaseService): BackendKernel {
  return new BackendKernel({ database });
}

describe('BackendKernel hotspot command runtime', () => {
  it('accepts hotspot commands and replays duplicate idempotency keys without creating another command', async () => {
    const kernel = createKernel();
    const params = {
      envelope: {
        family: 'progressive.command' as const,
        commandId: 'progressive-command-1',
        idempotencyKey: 'progressive-idempotency-1',
        caller: {
          instanceId: 'instance-a',
          runtimeRole: 'follower' as const,
          surface: 'review' as const,
        },
        writerExpectation: {
          mode: 'required' as const,
          expectedWriterInstanceId: 'writer-a',
          relayAllowed: true,
        },
        deadlineAt: 1_700_000_100_000,
        submittedAt: 1_700_000_000_000,
        payload: {
          sourceBlockId: 'block-1',
        },
      },
    };

    const first = await kernel.handle({
      id: 'hotspot-submit-1',
      jsonrpc: '2.0',
      method: 'hotspot.command.submit',
      params: [params],
    });
    const duplicate = await kernel.handle({
      id: 'hotspot-submit-2',
      jsonrpc: '2.0',
      method: 'hotspot.command.submit',
      params: [params],
    });
    const job = await kernel.handle({
      id: 'hotspot-job-get',
      jsonrpc: '2.0',
      method: 'hotspot.job.get',
      params: [{
        family: 'progressive.command',
        commandId: 'progressive-command-1',
        idempotencyKey: 'progressive-idempotency-1',
      }],
    });
    const diagnostics = await kernel.handle({
      id: 'diagnostics',
      jsonrpc: '2.0',
      method: 'diagnostics.status',
      params: [],
    });

    expect(first).toEqual(expect.objectContaining({
      id: 'hotspot-submit-1',
      result: expect.objectContaining({
        ok: true,
        accepted: true,
        family: 'progressive.command',
        commandId: 'progressive-command-1',
        idempotencyKey: 'progressive-idempotency-1',
        state: 'accepted',
      }),
    }));
    expect(duplicate).toEqual(expect.objectContaining({
      id: 'hotspot-submit-2',
      result: expect.objectContaining({
        ok: true,
        accepted: true,
        commandId: 'progressive-command-1',
        idempotencyKey: 'progressive-idempotency-1',
      }),
    }));
    expect(job).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        ok: true,
        accepted: true,
        commandId: 'progressive-command-1',
      }),
    }));
    expect(diagnostics).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        hotspot: expect.objectContaining({
          submittedTotal: 1,
          idempotencyHitTotal: 1,
          acceptedLatencyMsTotal: expect.any(Number),
          lastAcceptedLatencyMs: expect.any(Number),
          pendingCount: 1,
          writerRelayFailureTotal: 0,
          kernelProxyFailureTotal: 0,
        }),
      }),
    }));
  });

  it('returns typed unavailable for missing hotspot command state', async () => {
    const kernel = createKernel();

    const response = await kernel.handle({
      id: 'hotspot-job-missing',
      jsonrpc: '2.0',
      method: 'hotspot.job.get',
      params: [{
        family: 'xiuyuan.sync',
        commandId: 'missing-command',
      }],
    });

    expect(response).toEqual({
      id: 'hotspot-job-missing',
      jsonrpc: '2.0',
      result: {
        ok: false,
        family: 'xiuyuan.sync',
        commandId: 'missing-command',
        state: 'unavailable',
        unavailableClass: 'BACKEND_UNAVAILABLE',
        reason: 'hotspot command state unavailable',
        recoverable: true,
      },
    });
  });

  it('serves backend Browser aggregate snapshot, page, focus, and stale generation results', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const kernel = new BackendKernel({ database });
    const cards = Array.from({ length: 130 }, (_, index) => buildCard({
      id: `card-${String(index + 1).padStart(3, '0')}`,
      blockId: `block-${String(index + 1).padStart(3, '0')}`,
      meta: { rootId: 'root-1', parentId: index > 0 ? `block-${String(index).padStart(3, '0')}` : null },
    }));
    await database.upsertCards(cards);
    await database.updateSourceExistence([
      { blockId: 'block-065', exists: true },
    ], 1_700_000_100_000);

    const snapshot = await kernel.handle({
      id: 'aggregate-snapshot',
      jsonrpc: '2.0',
      method: 'browser.aggregate.snapshot',
      params: [{
        requestId: 'aggregate-request-1',
        datasourceId: 'deck:all',
        scope: { pageSize: 50 },
      }],
    });
    expect(snapshot).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'ready',
        totalCount: 130,
        pageSize: 50,
        identity: expect.objectContaining({
          datasourceId: 'deck:all',
          generation: 1,
        }),
      }),
    }));
    if (!('result' in snapshot) || !snapshot.result.identity) {
      throw new Error('expected aggregate identity');
    }
    const identity = snapshot.result.identity;

    const page = await kernel.handle({
      id: 'aggregate-page',
      jsonrpc: '2.0',
      method: 'browser.aggregate.page',
      params: [{
        requestId: 'page-request-1',
        identity,
        limit: 50,
      }],
    });
    const focus = await kernel.handle({
      id: 'aggregate-focus',
      jsonrpc: '2.0',
      method: 'browser.aggregate.focus',
      params: [{
        requestId: 'focus-request-1',
        identity,
        focus: { type: 'card', cardId: 'card-065' },
        limitBefore: 1,
        limitAfter: 1,
      }],
    });

    await kernel.handle({
      id: 'aggregate-snapshot-new-generation',
      jsonrpc: '2.0',
      method: 'browser.aggregate.snapshot',
      params: [{
        requestId: 'aggregate-request-2',
        datasourceId: 'deck:all',
        scope: { pageSize: 50 },
      }],
    });
    const stalePage = await kernel.handle({
      id: 'aggregate-page-stale',
      jsonrpc: '2.0',
      method: 'browser.aggregate.page',
      params: [{
        requestId: 'page-request-stale',
        identity,
        limit: 50,
      }],
    });

    expect(page).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'ready',
        identity,
        rows: expect.arrayContaining([expect.objectContaining({ id: 'card-001' })]),
        totalCount: 130,
        nextCursor: '50',
      }),
    }));
    expect(focus).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'ready',
        identity,
        focusFound: true,
        rows: expect.arrayContaining([expect.objectContaining({ id: 'card-065' })]),
        hierarchy: expect.objectContaining({
          rootId: 'root-1',
          parentId: 'block-064',
        }),
        sourceExistence: expect.objectContaining({
          'block-065': true,
        }),
      }),
    }));
    expect(stalePage).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'stale-generation',
        unavailableClass: 'INVALID_REQUEST',
      }),
    }));
  });

  it('returns ready-empty Browser aggregate snapshots without renderer fallback', async () => {
    const kernel = createKernel();

    const snapshot = await kernel.handle({
      id: 'aggregate-empty',
      jsonrpc: '2.0',
      method: 'browser.aggregate.snapshot',
      params: [{
        requestId: 'aggregate-empty-1',
        datasourceId: 'deck:empty',
      }],
    });

    expect(snapshot).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'ready-empty',
        totalCount: 0,
        pageSize: expect.any(Number),
        identity: expect.objectContaining({
          datasourceId: 'deck:empty',
        }),
      }),
    }));
  });

  it('serves backend graph query presentation models with limit and content-safe diagnostics', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const blocks = {
      source: { id: 'source', content: 'Private source body should stay out of diagnostics', type: 'd' },
      target1: { id: 'target1', content: 'Target one title', type: 'p', parent_id: 'source', root_id: 'source' },
      target2: { id: 'target2', content: 'Target two title', type: 'i', parent_id: 'source', root_id: 'source' },
    };
    const resolveNeuralGraphQuery = vi.fn(async (
      request: BackendNeuralGraphQueryRequest,
    ): Promise<BackendNeuralGraphQueryResult> => {
      if (request.operation === 'fetchBlockData') {
        const block = blocks[request.blockId as keyof typeof blocks];
        return block
          ? { status: 'found', blockId: request.blockId, data: block, error: null }
          : { status: 'known-missing', blockId: request.blockId, data: null, error: null };
      }
      if (request.operation === 'fetchNeighbors') {
        return {
          status: 'found',
          blockId: request.blockId,
          data: [
            { id: 'target1', type: 'backlink', weight: 15 },
            { id: 'target2', type: 'outgoing-direct', weight: 10 },
          ],
          error: null,
        };
      }
      return { status: 'found', blockId: request.blockId, data: [], error: null };
    });
    const kernel = new BackendKernel({ database, resolveNeuralGraphQuery });

    const response = await kernel.handle({
      id: 'graph-ready',
      jsonrpc: '2.0',
      method: 'graph.query',
      params: [{
        queryId: 'graph-ready-1',
        kind: 'neighbors',
        sourceNodeId: 'source',
        limit: 1,
      }],
    });

    expect(response).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'partial',
        queryId: 'graph-ready-1',
        kind: 'neighbors',
        limitReached: true,
        continuation: '1',
        nodes: expect.arrayContaining([
          expect.objectContaining({ nodeId: 'source', title: 'Private source body should stay out of diagnostics' }),
          expect.objectContaining({ nodeId: 'target1', title: 'Target one title' }),
        ]),
        edges: [expect.objectContaining({
          sourceNodeId: 'source',
          targetNodeId: 'target1',
          kind: 'backlink',
        })],
        diagnostics: expect.objectContaining({
          nodeCount: 2,
          edgeCount: 1,
          sourceAvailability: 'available',
        }),
      }),
    }));
    expect(JSON.stringify((response as { result: unknown }).result).includes('Private source body should stay out of diagnostics')).toBe(true);
    expect(JSON.stringify((response as { result: { diagnostics: unknown } }).result.diagnostics)).not.toContain('Private source body');
  });

  it('classifies graph query unavailable, missing, and unreadable historical nodes explicitly', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const unavailableKernel = new BackendKernel({ database });
    const unavailable = await unavailableKernel.handle({
      id: 'graph-unavailable',
      jsonrpc: '2.0',
      method: 'graph.query',
      params: [{ queryId: 'graph-unavailable-1', kind: 'neighbors', sourceNodeId: 'source' }],
    });
    expect(unavailable).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'unavailable',
        unavailableClass: 'BACKEND_UNAVAILABLE',
      }),
    }));

    const resolveNeuralGraphQuery = vi.fn(async (
      request: BackendNeuralGraphQueryRequest,
    ): Promise<BackendNeuralGraphQueryResult> => {
      if (request.operation === 'fetchBlockData') {
        if (request.blockId === 'source-missing') {
          return { status: 'known-missing', blockId: request.blockId, data: null, error: null };
        }
        if (request.blockId === 'target-unreadable') {
          return { status: 'failed', blockId: request.blockId, data: null, error: 'read failed: sensitive body omitted' };
        }
        return { status: 'found', blockId: request.blockId, data: { id: request.blockId, content: 'Readable title', type: 'p' }, error: null };
      }
      return {
        status: 'found',
        blockId: request.blockId,
        data: [{ id: 'target-unreadable', type: 'backlink', weight: 1 }],
        error: null,
      };
    });
    const kernel = new BackendKernel({ database, resolveNeuralGraphQuery });

    const missing = await kernel.handle({
      id: 'graph-missing',
      jsonrpc: '2.0',
      method: 'graph.query',
      params: [{ queryId: 'graph-missing-1', kind: 'neighbors', sourceNodeId: 'source-missing' }],
    });
    const unreadable = await kernel.handle({
      id: 'graph-unreadable',
      jsonrpc: '2.0',
      method: 'graph.query',
      params: [{ queryId: 'graph-unreadable-1', kind: 'neighbors', sourceNodeId: 'source' }],
    });

    expect(missing).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'partial',
        nodes: [expect.objectContaining({
          nodeId: 'source-missing',
          availability: 'unavailable',
          unavailableReason: 'known-missing',
        })],
      }),
    }));
    expect(unreadable).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'partial',
        nodes: expect.arrayContaining([
          expect.objectContaining({
            nodeId: 'target-unreadable',
            availability: 'unavailable',
            title: 'Unavailable node',
            unavailableReason: 'unreadable',
          }),
        ]),
      }),
    }));
  });

  it('executes progressive and topic-derived command callbacks idempotently', async () => {
    const progressive = vi.fn(async (request) => ({
      status: 'completed' as const,
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      operation: request.operation,
      result: { docId: 'progressive-doc-1' },
      rollback: { attempted: false, status: 'not-needed' as const },
      progress: { state: 'succeeded' as const, updatedAt: 1 },
      diagnostics: {
        diagnosticEventId: 'diag-progressive-1',
        family: 'progressive.command' as const,
        commandId: request.commandId,
        errorCategory: null,
      },
    }));
    const topic = vi.fn(async (request) => ({
      status: 'completed' as const,
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      operation: 'create-from-topic-source' as const,
      result: { created: 1, skipped: 0, items: [] },
      audit: { created: 1, skipped: 0, nativeRiffRegistered: 1 },
      rollback: { attempted: false, status: 'not-needed' as const },
      progress: { state: 'succeeded' as const, updatedAt: 1 },
      diagnostics: {
        diagnosticEventId: 'diag-topic-1',
        family: 'topic-derived.command' as const,
        commandId: request.commandId,
        errorCategory: null,
      },
    }));
    const kernel = new BackendKernel({
      database: new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge()),
      executeProgressiveCommand: progressive,
      executeTopicDerivedCommand: topic,
    });
    const progressiveParams = {
      requestId: 'progressive-request-1',
      commandId: 'progressive-command-1',
      idempotencyKey: 'progressive-key-1',
      operation: 'create-child-doc',
      input: { sourceDocId: 'doc-1' },
      requestedAt: 1,
    };
    const topicParams = {
      requestId: 'topic-request-1',
      commandId: 'topic-command-1',
      idempotencyKey: 'topic-key-1',
      operation: 'create-from-topic-source',
      input: { sourceBlockId: 'block-1' },
      requestedAt: 1,
    };

    const firstProgressive = await kernel.handle({
      id: 'progressive-1',
      jsonrpc: '2.0',
      method: 'progressive.command.execute',
      params: [progressiveParams],
    });
    const duplicateProgressive = await kernel.handle({
      id: 'progressive-2',
      jsonrpc: '2.0',
      method: 'progressive.command.execute',
      params: [progressiveParams],
    });
    const firstTopic = await kernel.handle({
      id: 'topic-1',
      jsonrpc: '2.0',
      method: 'topic-derived.command.execute',
      params: [topicParams],
    });
    const duplicateTopic = await kernel.handle({
      id: 'topic-2',
      jsonrpc: '2.0',
      method: 'topic-derived.command.execute',
      params: [topicParams],
    });

    expect(firstProgressive).toEqual(expect.objectContaining({
      result: expect.objectContaining({ status: 'completed', commandId: 'progressive-command-1' }),
    }));
    expect(duplicateProgressive).toEqual(expect.objectContaining({
      result: expect.objectContaining({ status: 'duplicate', commandId: 'progressive-command-1' }),
    }));
    expect(firstTopic).toEqual(expect.objectContaining({
      result: expect.objectContaining({ status: 'completed', commandId: 'topic-command-1' }),
    }));
    expect(duplicateTopic).toEqual(expect.objectContaining({
      result: expect.objectContaining({ status: 'duplicate', commandId: 'topic-command-1' }),
    }));
    expect(progressive).toHaveBeenCalledTimes(1);
    expect(topic).toHaveBeenCalledTimes(1);
  });

  it('keeps AI tool job lifecycle backend-authoritative and content-safe', async () => {
    const kernel = createKernel();
    const execute = await kernel.handle({
      id: 'ai-tool-1',
      jsonrpc: '2.0',
      method: 'ai.tool.job.execute',
      params: [{
        jobId: 'job-1',
        sessionId: 'session-1',
        commandId: 'command-1',
        idempotencyKey: 'ai-tool-key-1',
        toolName: 'flashcard.create',
        providerId: 'openai',
        modelId: 'model-a',
        requiresApproval: true,
        writeIntent: {
          kind: 'flashcard',
          sourceId: 'source-1',
          cardCount: 2,
        },
      }],
    });
    const duplicate = await kernel.handle({
      id: 'ai-tool-dup',
      jsonrpc: '2.0',
      method: 'ai.tool.job.execute',
      params: [{
        jobId: 'job-1',
        sessionId: 'session-1',
        commandId: 'command-1',
        idempotencyKey: 'ai-tool-key-1',
        toolName: 'flashcard.create',
        requiresApproval: true,
      }],
    });
    const rejected = await kernel.handle({
      id: 'ai-tool-reject',
      jsonrpc: '2.0',
      method: 'ai.tool.job.approval',
      params: [{
        jobId: 'job-1',
        sessionId: 'session-1',
        commandId: 'command-1',
        idempotencyKey: 'ai-tool-key-1',
        decision: 'rejected',
        decidedAt: 2,
      }],
    });

    expect(execute).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'waiting-for-user-approval',
        phase: 'approval-wait',
        progress: expect.objectContaining({ state: 'waiting-for-user-approval' }),
      }),
    }));
    expect(duplicate).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'waiting-for-user-approval',
      }),
    }));
    expect(rejected).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'rejected',
        phase: 'terminal',
        diagnostics: expect.objectContaining({
          family: 'ai.tool-job',
          errorCategory: 'VALIDATION_FAILED',
        }),
      }),
    }));
    expect(JSON.stringify((execute as { result: unknown }).result)).not.toContain('source document body');
  });

  it('executes Review Riff feedback through host effect idempotently and fails closed when unavailable', async () => {
    const executeReviewRiffFeedback = vi.fn(async (request) => ({
      status: 'completed' as const,
      commandId: request.commandId,
      idempotencyKey: request.idempotencyKey,
      action: request.action,
      updated: request.action === 'rate' ? 1 : 0,
      skipped: request.action === 'skip' ? 1 : 0,
      queueImpact: {
        refreshRequired: true,
        projectionChanged: true,
        removedFromQueue: request.action === 'rate' && Number(request.rating) >= 4,
      },
      diagnostics: {
        diagnosticEventId: 'diag-riff-1',
        family: 'review.riff-feedback' as const,
        commandId: request.commandId,
        errorCategory: null,
      },
    }));
    const kernel = new BackendKernel({
      database: new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge()),
      executeReviewRiffFeedback,
    });
    const request = {
      commandId: 'riff-command-1',
      idempotencyKey: 'riff-key-1',
      action: 'rate',
      deckId: 'deck-1',
      riffCardId: 'riff-card-1',
      rating: 4,
    };

    const first = await kernel.handle({
      id: 'riff-1',
      jsonrpc: '2.0',
      method: 'review.riffFeedback.execute',
      params: [request],
    });
    const duplicate = await kernel.handle({
      id: 'riff-2',
      jsonrpc: '2.0',
      method: 'review.riffFeedback.execute',
      params: [request],
    });
    const unavailable = await createKernel().handle({
      id: 'riff-unavailable',
      jsonrpc: '2.0',
      method: 'review.riffFeedback.execute',
      params: [request],
    });

    expect(first).toEqual(expect.objectContaining({
      result: expect.objectContaining({ status: 'completed', updated: 1 }),
    }));
    expect(duplicate).toEqual(expect.objectContaining({
      result: expect.objectContaining({ status: 'duplicate', updated: 1 }),
    }));
    expect(unavailable).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'unavailable',
        unavailableClass: 'BACKEND_UNAVAILABLE',
      }),
    }));
    expect(executeReviewRiffFeedback).toHaveBeenCalledTimes(1);
  });

  it('returns backend-authored Review source refresh impact', async () => {
    const kernel = createKernel();

    const refresh = await kernel.handle({
      id: 'refresh-1',
      jsonrpc: '2.0',
      method: 'review.sourceRefresh.execute',
      params: [{
        commandId: 'refresh-command-1',
        idempotencyKey: 'refresh-key-1',
        currentCardId: 'card-1',
        changedBlockIds: ['block-2', 'block-3'],
        dependencyBlockIds: ['block-1', 'block-2'],
      }],
    });
    const noOp = await kernel.handle({
      id: 'refresh-2',
      jsonrpc: '2.0',
      method: 'review.sourceRefresh.execute',
      params: [{
        commandId: 'refresh-command-2',
        idempotencyKey: 'refresh-key-2',
        currentCardId: 'card-1',
        changedBlockIds: ['block-3'],
        dependencyBlockIds: ['block-1', 'block-2'],
      }],
    });

    expect(refresh).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'refresh-required',
        matchedBlockIds: ['block-2'],
        impact: expect.objectContaining({ refreshVisibleContent: true }),
      }),
    }));
    expect(noOp).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'no-op',
        matchedBlockIds: [],
        impact: expect.objectContaining({ refreshVisibleContent: false }),
      }),
    }));
  });

  it('routes Review missing-source cleanup through backend source-existence mutation', async () => {
    const database = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    const updateSourceExistence = vi.spyOn(database, 'updateSourceExistence').mockResolvedValue();
    const kernel = createKernelWithDatabase(database);

    const result = await kernel.handle({
      id: 'refresh-missing-source',
      jsonrpc: '2.0',
      method: 'review.sourceRefresh.execute',
      params: [{
        commandId: 'refresh-command-missing',
        idempotencyKey: 'refresh-key-missing',
        currentCardId: 'card-missing',
        currentBlockId: 'block-missing',
        changedBlockIds: ['block-missing'],
        dependencyBlockIds: ['block-missing'],
        missingSourceBlockIds: ['block-missing'],
      }],
    });

    expect(result).toEqual(expect.objectContaining({
      result: expect.objectContaining({
        status: 'missing-source',
        matchedBlockIds: ['block-missing'],
        impact: expect.objectContaining({
          refreshVisibleContent: false,
          cleanupMissingSource: true,
        }),
      }),
    }));
    expect(updateSourceExistence).toHaveBeenCalledWith([
      { cardId: 'card-missing', blockId: 'block-missing', exists: false },
    ], expect.any(Number));
  });
});
