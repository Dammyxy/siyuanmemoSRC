import { describe, expect, it, vi } from 'vitest';
import type { BackendKernelTransactionAction } from '../../../packages/contracts/src/backend-rpc';
import { buildTransactionFanoutPlan } from '@/core/infrastructure/websocket/transaction-fanout-coordinator';
import { WorkerKernelTransactionRuntime } from '../WorkerKernelTransactionRuntime';

type MemoryKernelTransactionFileService = {
  readJSON<T>(fileName: string): Promise<T | null>;
  writeJSON(fileName: string, data: unknown): Promise<void>;
  json: Map<string, unknown>;
};

function createFileService(): MemoryKernelTransactionFileService {
  const json = new Map<string, unknown>();
  return {
    json,
    async readJSON<T>(fileName: string): Promise<T | null> {
      return (json.get(fileName) as T | undefined) ?? null;
    },
    async writeJSON(fileName: string, data: unknown): Promise<void> {
      json.set(fileName, JSON.parse(JSON.stringify(data)));
    },
  };
}

function createRuntime(options?: {
  now?: () => number;
  fileService?: MemoryKernelTransactionFileService;
  maxKernelTransactionQueueLength?: number;
  maxKernelQueuedTransactions?: number;
}) {
  const fileService = options?.fileService ?? createFileService();
  const runtime = new WorkerKernelTransactionRuntime({
    fileService,
    now: options?.now,
    maxKernelTransactionQueueLength: options?.maxKernelTransactionQueueLength,
    maxKernelQueuedTransactions: options?.maxKernelQueuedTransactions,
  });
  return { runtime, fileService };
}

function createIngestRequest(idempotencyKey = 'kernel-transaction-key') {
  return {
    source: 'ws-main' as const,
    receivedAt: 42,
    idempotencyKey,
    transactions: [
      {
        doOperations: [
          {
            action: 'removeFlashcards',
            blockIDs: ['block-remove-a', 'block-remove-b'],
          },
          {
            action: 'insert',
            id: 'block-auto-card',
            data: {
              new: {
                content: 'item >> prompt',
              },
            },
          },
        ],
      },
    ],
  };
}

describe('WorkerKernelTransactionRuntime', () => {
  it('ingests, dequeues, and reports kernel transaction queue status', async () => {
    const { runtime } = createRuntime({
      now: () => 1_700_000_000_000,
    });

    await expect(runtime.ingestKernelTransactions(createIngestRequest())).resolves.toMatchObject({
      accepted: 1,
      queued: 1,
      duplicate: false,
      queueLength: 1,
      maxQueueLength: 256,
    });

    expect(runtime.getStatus()).toMatchObject({
      queueLength: 1,
      queuedTransactions: 1,
      acceptedTotal: 1,
      actionQueueLength: 1,
      actionEnqueuedTotal: 1,
      autoCardActionQueuedTotal: 1,
    });

    await expect(runtime.dequeueKernelTransactionActions(8)).resolves.toMatchObject({
      actions: [
        {
          type: 'auto-card-candidates',
          operations: [
            {
              action: 'insert',
              blockId: 'block-auto-card',
            },
          ],
          source: 'ws-main',
          receivedAt: 42,
          idempotencyKey: 'kernel-transaction-key',
        },
      ],
      remaining: 0,
    });

    expect(runtime.getStatus()).toMatchObject({
      queueLength: 0,
      actionQueueLength: 0,
      actionDequeuedTotal: 1,
      drainedTotal: 1,
      lastAcceptedAt: 1_700_000_000_000,
      lastDrainAt: 1_700_000_000_000,
    });
  });

  it('deduplicates repeated ingest requests and restores queue snapshots', async () => {
    const fileService = createFileService();
    const { runtime: first } = createRuntime({
      fileService,
      now: () => 1_700_000_000_000,
    });

    await expect(first.ingestKernelTransactions(createIngestRequest('same-key'))).resolves.toMatchObject({
      accepted: 1,
      duplicate: false,
    });
    await expect(first.ingestKernelTransactions(createIngestRequest('same-key'))).resolves.toMatchObject({
      accepted: 0,
      duplicate: true,
    });

    await first.persistSnapshots();

    const { runtime: restored } = createRuntime({
      fileService,
      now: () => 1_700_000_000_000,
    });
    await restored.restoreSnapshots();

    expect(restored.getStatus()).toMatchObject({
      queueLength: 1,
      queuedTransactions: 1,
      acceptedTotal: 1,
      deduplicatedTotal: 1,
      actionQueueLength: 1,
    });

    await expect(restored.dequeueKernelTransactionActions()).resolves.toMatchObject({
      actions: [
        expect.objectContaining({
          type: 'auto-card-candidates',
          idempotencyKey: 'same-key',
        }),
      ],
      remaining: 0,
    });
  });

  it('fails closed on a future ingest queue snapshot version', async () => {
    const fileService = createFileService();
    fileService.json.set('kernel-transaction-ingest.snapshot.json', {
      version: 2,
      queue: [],
    });
    const { runtime } = createRuntime({ fileService });

    await expect(runtime.restoreSnapshots())
      .rejects
      .toThrow('Unsupported kernel ingest queue snapshot version: 2');
  });

  it('fails closed on a future action queue snapshot version', async () => {
    const fileService = createFileService();
    fileService.json.set('kernel-transaction-actions.snapshot.json', {
      version: 2,
      actions: [],
    });
    const { runtime } = createRuntime({ fileService });

    await expect(runtime.restoreSnapshots())
      .rejects
      .toThrow('Unsupported kernel action queue snapshot version: 2');
  });

  it('requeues kernel transaction actions back onto the front of the queue', async () => {
    const { runtime } = createRuntime({
      now: () => 1_700_000_000_000,
    });

    const action: BackendKernelTransactionAction = {
      type: 'auto-card-candidates',
      operations: [{ action: 'update', blockId: 'block-requeue' }],
      source: 'ws-main',
      receivedAt: 1,
      idempotencyKey: 'requeue-key',
    };

    await expect(runtime.requeueKernelTransactionActions([action])).resolves.toMatchObject({
      requeued: 1,
      queueLength: 1,
    });
    expect(runtime.getStatus()).toMatchObject({
      actionQueueLength: 1,
      actionRequeuedTotal: 1,
    });
    await expect(runtime.dequeueKernelTransactionActions()).resolves.toMatchObject({
      actions: [action],
      remaining: 0,
    });
  });

  it('collects AutoCard candidates from transaction operations', async () => {
    const { runtime } = createRuntime();

    await runtime.ingestKernelTransactions({
      source: 'ws-main',
      idempotencyKey: 'collect-actions-key',
      transactions: [{
        doOperations: [
          { action: 'addFlashcards', blockIDs: ['block-upsert-a', 'block-upsert-b'] },
          {
            action: 'insert',
            id: 'block-plain-insert',
            data: { new: { content: 'ordinary paragraph without marker' } },
          },
          {
            action: 'update',
            id: 'block-marker-update',
            data: { new: { content: 'question >> answer' } },
          },
        ],
      }],
    });

    await expect(runtime.dequeueKernelTransactionActions(8)).resolves.toMatchObject({
      actions: [
        {
          type: 'auto-card-candidates',
          operations: [
            { action: 'update', blockId: 'block-marker-update' },
          ],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'collect-actions-key',
        },
      ],
      remaining: 0,
    });
  });

  it('recomputes the shared fan-out plan from raw transactions and provenance snapshots', async () => {
    const { runtime } = createRuntime();
    const transactions = [{
      doOperations: [
        {
          action: 'update',
          id: 'excerpt-topic',
          data: { new: { content: 'Prompt >> Answer' } },
        },
        {
          action: 'update',
          id: 'user-topic',
          data: { new: { content: 'User >> Answer' } },
        },
        { action: 'addFlashcards', blockIDs: ['riff-topic'] },
      ],
    }];
    const provenanceSnapshot = {
      capturedAt: 1_000,
      entries: [{
        blockId: 'excerpt-topic',
        expiresAt: 2_000,
        reason: 'progressive-excerpt-topic-card',
        source: 'progressive-excerpt',
      }],
    };
    const rendererPlan = buildTransactionFanoutPlan({
      transactions: transactions as never,
      provenance: provenanceSnapshot,
      now: 1_000,
    });

    await runtime.ingestKernelTransactions({
      source: 'ws-main',
      idempotencyKey: 'shared-plan-key',
      receivedAt: 1_000,
      transactions,
      provenanceSnapshot,
    });

    expect(rendererPlan.autoCard.candidateOperations.map((operation) => operation.blockId)).toEqual(['user-topic']);
    expect(rendererPlan.autoCard.suppressedOperations.map((operation) => operation.blockId)).toEqual(['excerpt-topic']);
    await expect(runtime.dequeueKernelTransactionActions(8)).resolves.toMatchObject({
      actions: [
        {
          type: 'auto-card-candidates',
          operations: [
            { action: 'update', blockId: 'user-topic' },
          ],
          source: 'ws-main',
          receivedAt: 1_000,
          idempotencyKey: 'shared-plan-key',
        },
      ],
      remaining: 0,
    });
  });

  it('coalesces AutoCard dequeue action batches before callers dispatch work', async () => {
    const { runtime } = createRuntime();

    await runtime.ingestKernelTransactions({
      source: 'ws-main',
      idempotencyKey: 'mixed-1',
      transactions: [{
        doOperations: [
          { action: 'removeFlashcards', blockIDs: ['block-rm-1'] },
          { action: 'addFlashcards', blockIDs: ['block-up-1'] },
          { action: 'insert', id: 'block-auto-x' },
        ],
      }],
    });
    await runtime.ingestKernelTransactions({
      source: 'ws-main',
      idempotencyKey: 'mixed-2',
      transactions: [{
        doOperations: [
          { action: 'removeFlashcards', blockIDs: ['block-rm-2'] },
          { action: 'addFlashcards', blockIDs: ['block-up-2'] },
          { action: 'delete', id: 'block-auto-x' },
          { action: 'update', id: 'block-auto-y' },
        ],
      }],
    });

    await expect(runtime.dequeueKernelTransactionActions(32)).resolves.toMatchObject({
      actions: [
        {
          type: 'auto-card-candidates',
          operations: [
            { action: 'update', blockId: 'block-auto-y' },
          ],
          source: 'ws-main',
          receivedAt: expect.any(Number),
          idempotencyKey: 'mixed-1',
        },
      ],
      remaining: 0,
    });
  });

  it('throws explicit backpressure errors and frees ingest capacity when actions drain', async () => {
    const { runtime } = createRuntime({
      maxKernelTransactionQueueLength: 1,
      maxKernelQueuedTransactions: 4,
    });

    await runtime.ingestKernelTransactions({
      source: 'ws-main',
      transactions: [{
        doOperations: [{ action: 'insert', id: 'block-drain-1' }],
      }],
      receivedAt: 1,
      idempotencyKey: 'drain-first',
    });
    await expect(runtime.ingestKernelTransactions({
      source: 'ws-main',
      transactions: [{ id: 'tx-2' }],
      receivedAt: 2,
      idempotencyKey: 'drain-second',
    })).rejects.toThrow(
      'SrsBackendWorker kernel.transaction.ingest unavailable: queue backpressure (pending=1, limit=1)',
    );

    await runtime.dequeueKernelTransactionActions(8);
    await expect(runtime.ingestKernelTransactions({
      source: 'ws-main',
      transactions: [{
        doOperations: [{ action: 'insert', id: 'block-drain-2' }],
      }],
      receivedAt: 3,
      idempotencyKey: 'drain-third',
    })).resolves.toMatchObject({
      accepted: 1,
      queued: 1,
      queueLength: 1,
      maxQueueLength: 1,
    });
  });
});
