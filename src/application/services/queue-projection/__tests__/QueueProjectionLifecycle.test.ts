import { describe, expect, it, vi } from 'vitest';
import { QueueType } from '@/types/unified-data-source';
import type { QueueProjectionLiveIdentityEvent } from '@/types/queue-projection-live-identity';
import { QueueProjectionLifecycle } from '../QueueProjectionReadModule';

function createRuntime() {
  let listener: ((event: QueueProjectionLiveIdentityEvent) => void) | null = null;
  const runtime = {
    ensureReady: vi.fn(async () => ({
      status: 'ready' as const,
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 7,
    })),
    readSnapshot: vi.fn(async () => ({
      queueType: QueueType.RetrievalPractice,
      policyHash: 'policy-a',
      generation: 7,
      rows: [],
      counters: null,
    })),
    getCardsBySnapshotIds: vi.fn(async () => []),
    getRolloutDiagnostics: vi.fn(() => []),
    materialize: vi.fn(async () => ({
      status: 'ready' as const,
      queueType: QueueType.RetrievalPractice,
      policyHash: 'policy-b',
      generation: 8,
      rows: 0,
      counters: null,
    })),
    clearMaterializedProjectionEcho: vi.fn(),
    subscribeLiveIdentityEvents: vi.fn((next: (event: QueueProjectionLiveIdentityEvent) => void) => {
      listener = next;
      return () => {
        listener = null;
      };
    }),
  };
  return {
    runtime,
    emit(event: QueueProjectionLiveIdentityEvent) {
      listener?.(event);
    },
    hasListener() {
      return listener !== null;
    },
  };
}

describe('QueueProjectionLifecycle', () => {
  it.each([
    {
      status: 'ready' as const,
      readiness: {
        status: 'ready' as const,
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        generation: 7,
      },
    },
    {
      status: 'refreshing' as const,
      readiness: {
        status: 'refreshing' as const,
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        cause: 'policy_mismatch' as const,
        retryAfterMs: 100,
      },
    },
    {
      status: 'unavailable' as const,
      readiness: {
        status: 'unavailable' as const,
        queueId: QueueType.RetrievalPractice,
        policyId: 'policy-a',
        cause: 'backend_unavailable' as const,
        reason: 'backend unavailable',
        recoverable: true,
      },
    },
  ])('returns passive $status readiness without repair', async ({ readiness }) => {
    const { runtime } = createRuntime();
    runtime.ensureReady.mockResolvedValueOnce(readiness);
    const lifecycle = new QueueProjectionLifecycle({ runtime });

    await expect(lifecycle.read({
      type: 'readiness',
      request: { queueType: QueueType.RetrievalPractice },
    })).resolves.toEqual({
      type: 'readiness',
      readiness,
    });

    expect(runtime.materialize).not.toHaveBeenCalled();
    expect(runtime.clearMaterializedProjectionEcho).not.toHaveBeenCalled();
  });

  it('keeps a zero-row projection ready', async () => {
    const { runtime } = createRuntime();
    const lifecycle = new QueueProjectionLifecycle({ runtime });

    await expect(lifecycle.read({
      type: 'snapshot',
      queueType: QueueType.RetrievalPractice,
    })).resolves.toMatchObject({
      type: 'snapshot',
      status: 'ready',
      snapshot: {
        rows: [],
        generation: 7,
      },
    });

    expect(runtime.materialize).not.toHaveBeenCalled();
  });

  it('returns refreshing snapshot state without starting repair', async () => {
    const { runtime } = createRuntime();
    runtime.ensureReady.mockResolvedValueOnce({
      status: 'refreshing',
      queueId: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      cause: 'generation_mismatch',
      retryAfterMs: 100,
    });
    const lifecycle = new QueueProjectionLifecycle({ runtime });

    await expect(lifecycle.read({
      type: 'snapshot',
      queueType: QueueType.RetrievalPractice,
    })).resolves.toMatchObject({
      type: 'snapshot',
      status: 'refreshing',
      snapshot: null,
    });

    expect(runtime.readSnapshot).not.toHaveBeenCalled();
    expect(runtime.materialize).not.toHaveBeenCalled();
  });

  it('relays concurrent repair calls to runtime single-flight ownership', async () => {
    const { runtime } = createRuntime();
    let resolveRepair!: (value: Awaited<ReturnType<typeof runtime.materialize>>) => void;
    const repair = new Promise<Awaited<ReturnType<typeof runtime.materialize>>>((resolve) => {
      resolveRepair = resolve;
    });
    runtime.materialize.mockReturnValue(repair);
    const lifecycle = new QueueProjectionLifecycle({ runtime });

    const first = lifecycle.repair({
      type: 'refresh',
      queueType: QueueType.RetrievalPractice,
    });
    const second = lifecycle.repair({
      type: 'refresh',
      queueType: QueueType.RetrievalPractice,
    });
    resolveRepair({
      status: 'ready',
      queueType: QueueType.RetrievalPractice,
      policyHash: 'policy-b',
      generation: 8,
      rows: 0,
      counters: null,
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: 'ready', generation: 8 }),
      expect.objectContaining({ status: 'ready', generation: 8 }),
    ]);
    expect(runtime.materialize).toHaveBeenCalledTimes(2);
  });

  it('publishes lifecycle identity and disposes observer', () => {
    const harness = createRuntime();
    const lifecycle = new QueueProjectionLifecycle({ runtime: harness.runtime });
    const listener = vi.fn();
    const dispose = lifecycle.observe(listener);
    const event: QueueProjectionLiveIdentityEvent = {
      type: 'queue-projection-live-identity',
      queueId: QueueType.RetrievalPractice,
      queueType: QueueType.RetrievalPractice,
      policyId: 'policy-a',
      generation: 7,
      reason: 'materialized',
      source: 'backend',
      timestamp: 1,
    };

    harness.emit(event);
    expect(listener).toHaveBeenCalledWith(event);
    expect(harness.hasListener()).toBe(true);

    dispose();
    harness.emit({ ...event, generation: 8 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(harness.hasListener()).toBe(false);
  });

  it('invalidates only through explicit repair', async () => {
    const { runtime } = createRuntime();
    const lifecycle = new QueueProjectionLifecycle({ runtime });

    await expect(lifecycle.repair({
      type: 'invalidate',
      queueType: QueueType.RetrievalPractice,
      reason: 'source-changed',
    })).resolves.toEqual({
      status: 'invalidated',
      queueType: QueueType.RetrievalPractice,
      reason: 'source-changed',
    });

    expect(runtime.clearMaterializedProjectionEcho).toHaveBeenCalledWith(QueueType.RetrievalPractice);
  });
});
