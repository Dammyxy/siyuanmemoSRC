import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { QueueItemUnavailableError } from '@/core/queue/abstraction/Strategy';
import { createEmptyReviewUIState, type ReviewSessionHook, type ReviewUIState } from '../types';
import { createReviewSessionController, useReviewSession } from '../useReviewSession';

function createItem(id: string) {
  return {
    id,
    cardID: id,
    blockId: `block-${id}`,
    blockID: `block-${id}`,
    deckId: 'deck-1',
  };
}

function createNextDues() {
  return {
    1: '1m',
    2: '10m',
    3: '1d',
    4: '4d',
  } as const;
}

function hydrateItem<T extends Record<string, unknown> | null>(item: T): T {
  if (!item) {
    return item;
  }

  return {
    ...item,
    nextDues: createNextDues(),
  } as T;
}

function createQueue() {
  const items = [createItem('card-1'), createItem('card-2'), createItem('card-3')];
  let index = 0;

  return {
    next: vi.fn(async () => items[index++] ?? null),
    onFeedback: vi.fn(async () => undefined),
    getStats: vi.fn(async () => ({ size: items.length, label: `${items.length} due` })),
    getCounterSnapshot: vi.fn(async () => ({
      version: 1,
      remaining: Math.max(0, items.length - Math.max(0, index - 1)),
      due: Math.max(0, items.length - Math.max(0, index - 1)),
      total: items.length,
      buckets: {
        all: items.length,
        item: items.length,
        descriptor: 0,
        topic: 0,
        concept: 0,
      },
      source: 'hot' as const,
    })),
    getUIConfig: vi.fn(() => ({
      statsType: 'queue-size' as const,
      showRatingButtons: true,
      allowSkip: true,
    })),
    hydrateCurrentItem: vi.fn(async (item) => hydrateItem(item)),
    canGoBack: vi.fn(() => true),
    goBack: vi.fn(async () => items[0]),
    resetSessionState: vi.fn(() => {
      index = 0;
    }),
    cleanup: vi.fn(),
  };
}

type AdapterStub = {
  toUIState: ReturnType<typeof vi.fn>;
  fetchAuxiliaryData?: ReturnType<typeof vi.fn>;
  resetSessionState: ReturnType<typeof vi.fn>;
  cleanup: ReturnType<typeof vi.fn>;
};

function createAdapter(overrides: Partial<AdapterStub> = {}): AdapterStub {
  return {
    toUIState: vi.fn(async () => createEmptyReviewUIState()),
    resetSessionState: vi.fn(),
    cleanup: vi.fn(),
    ...overrides,
  };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function mountHook(options: {
  queue?: ReturnType<typeof createQueue>;
  adapter?: ReturnType<typeof createAdapter>;
  initialSessionState?: {
    initialTotal?: number;
    answeredCount?: number;
    correctCount?: number;
  };
  initialCurrentItem?: ReturnType<typeof createItem> | null;
  initialShowAnswer?: boolean;
} = {}) {
  const queue = options.queue ?? createQueue();
  const adapter = options.adapter ?? createAdapter();
  let hook: ReviewSessionHook | null = null;

  const Harness = defineComponent({
    setup() {
      hook = useReviewSession(queue as never, adapter as never, {
        initialSessionState: options.initialSessionState,
        initialCurrentItem: options.initialCurrentItem as never,
        initialShowAnswer: options.initialShowAnswer,
      });
      return () => h('div');
    },
  });

  const wrapper = mount(Harness);
  return {
    queue,
    adapter,
    wrapper,
    getHook: () => {
      if (!hook) {
        throw new Error('Hook not initialized');
      }
      return hook;
    },
  };
}

function mountSharedHooks(options: {
  queue?: ReturnType<typeof createQueue>;
  adapter?: ReturnType<typeof createAdapter>;
} = {}) {
  const queue = options.queue ?? createQueue();
  const adapter = options.adapter ?? createAdapter({
    toUIState: vi.fn(async (_queue: unknown, item: { id?: string } | null) => createReviewState(item?.id ?? 'empty')),
  });
  const controller = createReviewSessionController(queue as never, adapter as never);
  let hookA: ReviewSessionHook | null = null;
  let hookB: ReviewSessionHook | null = null;

  const HarnessA = defineComponent({
    setup() {
      hookA = useReviewSession(queue as never, adapter as never, {
        controller: controller as never,
        surfaceId: 'surface-a',
      });
      return () => h('div');
    },
  });

  const HarnessB = defineComponent({
    setup() {
      hookB = useReviewSession(queue as never, adapter as never, {
        controller: controller as never,
        surfaceId: 'surface-b',
      });
      return () => h('div');
    },
  });

  return {
    queue,
    adapter,
    controller,
    wrapperA: mount(HarnessA),
    wrapperB: mount(HarnessB),
    getHookA: () => {
      if (!hookA) {
        throw new Error('Hook A not initialized');
      }
      return hookA;
    },
    getHookB: () => {
      if (!hookB) {
        throw new Error('Hook B not initialized');
      }
      return hookB;
    },
  };
}

function createReviewState(itemId: string): ReviewUIState {
  return {
    ...createEmptyReviewUIState(),
    header: {
      ...createEmptyReviewUIState().header,
      stats: {
        current: 0,
        total: 0,
        label: '',
        queueName: 'Unified Queue',
      },
    },
    content: {
      type: 'html',
      data: itemId,
      id: itemId,
    },
  };
}

function createAuxState(current: number, total: number, label: string): Partial<ReviewUIState> {
  return {
    header: {
      ...createEmptyReviewUIState().header,
      stats: {
        current,
        total,
        label,
        queueName: 'Unified Queue',
      },
    },
    meta: {
      ...createEmptyReviewUIState().meta,
      queueSize: total,
      remainingSize: current,
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createNeuralUnderlyingQueue(resolver: (blockId: string) => unknown) {
  return {
    getEngineMode: vi.fn(() => 'orbit'),
    setEngineMode: vi.fn(async () => undefined),
    getSourceSnapshot: vi.fn(() => []),
    setSourceEntry: vi.fn(async () => undefined),
    getSeedSnapshot: vi.fn(() => []),
    setSeedEntry: vi.fn(async () => undefined),
    getAnchorSnapshot: vi.fn(() => []),
    setAnchorEntry: vi.fn(async () => undefined),
    clearAnchors: vi.fn(async () => undefined),
    getCurrentBatchSnapshot: vi.fn(() => null),
    getConceptBlocks: vi.fn(() => []),
    getFocusPoolSnapshot: vi.fn(() => []),
    setFocusPoolEntry: vi.fn(async () => undefined),
    clearFocusPool: vi.fn(async () => undefined),
    setCurrentFocus: vi.fn(async () => undefined),
    startRoamingFromFocus: vi.fn(async () => undefined),
    getHistoryCount: vi.fn(() => 0),
    getHistoryPage: vi.fn(() => ({ entries: [], totalCount: 0, hasMore: false })),
    getHistorySnapshot: vi.fn(() => []),
    getHistoryEntryByEventId: vi.fn(() => null),
    getHistoryEntriesByNodeId: vi.fn(() => []),
    getHistoryHitCount: vi.fn(() => 0),
    getActivationTrace: vi.fn(() => null),
    getSessionFocusStack: vi.fn(() => []),
    getPinnedFocusBlocks: vi.fn(() => []),
    setPinnedFocusBlock: vi.fn(async () => undefined),
    jumpToHistoryNode: vi.fn(async () => true),
    getPathItemByNodeId: vi.fn(async (blockId: string) => resolver(blockId)),
    getNavigationState: vi.fn(() => ({
      currentPathIndex: 0,
      currentNodeId: null,
      currentEventId: null,
      navigationMode: 'follow',
      engineMode: 'orbit',
      engineSessionId: 'engine-session',
      hasBookmark: false,
      pathLength: 0,
      sessionId: 'session-1',
    })),
    setNavigationMode: vi.fn(),
    returnToBookmark: vi.fn(() => false),
    clearHistory: vi.fn(),
  };
}

describe('useReviewSession', () => {
  it('increments answered and correct counts on grade', async () => {
    const { getHook, wrapper } = mountHook();
    await flushAsync();

    const hook = getHook();
    await hook.grade(3);

    expect(hook.context.value.session?.answeredCount).toBe(1);
    expect(hook.context.value.session?.correctCount).toBe(1);

    wrapper.unmount();
  });

  it('advances past an unavailable graded item without counting it as reviewed', async () => {
    const queue = createQueue();
    queue.onFeedback = vi.fn(async () => {
      throw new QueueItemUnavailableError('stale card', {
        cardId: 'card-1',
        blockId: 'block-card-1',
        queueType: 'incremental-learning',
      });
    });
    const adapter = createAdapter({
      toUIState: vi.fn(async (_queue: unknown, item: { id?: string } | null) => createReviewState(item?.id ?? 'empty')),
    });

    const { getHook, wrapper } = mountHook({ queue, adapter });
    await flushAsync();

    const hook = getHook();
    expect(hook.state.value.content.id).toBe('card-1');

    await hook.grade(3);

    expect(hook.state.value.content.id).toBe('card-2');
    expect(hook.state.value.content.type).not.toBe('empty');
    expect(hook.context.value.session?.answeredCount).toBe(0);
    expect(hook.context.value.session?.correctCount).toBe(0);

    wrapper.unmount();
  });

  it('hydrates initial session counters on mount when provided', async () => {
    const { getHook, wrapper } = mountHook({
      initialSessionState: {
        initialTotal: 8,
        answeredCount: 3,
        correctCount: 2,
      },
    });
    await flushAsync();

    const hook = getHook();
    expect(hook.context.value.session?.initialTotal).toBe(8);
    expect(hook.context.value.session?.answeredCount).toBe(3);
    expect(hook.context.value.session?.correctCount).toBe(2);

    wrapper.unmount();
  });

  it('hydrates the current item from review-tab runtime state without consuming queue.next', async () => {
    const queue = createQueue();
    const adapter = createAdapter({
      toUIState: vi.fn(async (_queue: unknown, item: { id?: string } | null) => createReviewState(item?.id ?? 'empty')),
    });

    const { getHook, wrapper } = mountHook({
      queue,
      adapter,
      initialCurrentItem: createItem('restored-card'),
      initialShowAnswer: true,
    });
    await flushAsync();
    await flushAsync();

    const hook = getHook();
    expect(queue.next).not.toHaveBeenCalled();
    expect(queue.hydrateCurrentItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'restored-card' }));
    expect(hook.state.value.content.id).toBe('restored-card');
    expect(hook.context.value.showAnswer).toBe(true);
    expect(adapter.toUIState).toHaveBeenLastCalledWith(
      queue,
      expect.objectContaining({
        id: 'restored-card',
        nextDues: createNextDues(),
      }),
      expect.anything(),
    );

    wrapper.unmount();
  });

  it('shares one controller across two surfaces without double-consuming queue.next', async () => {
    const { queue, wrapperA, wrapperB, getHookA, getHookB } = mountSharedHooks();
    await flushAsync();

    const hookA = getHookA();
    const hookB = getHookB();

    expect(queue.next).toHaveBeenCalledTimes(1);
    expect(hookA.state.value.content.id).toBe('card-1');
    expect(hookB.state.value.content.id).toBe('card-1');

    wrapperA.unmount();
    wrapperB.unmount();
  });

  it('syncs graded progress across shared review surfaces', async () => {
    const { wrapperA, wrapperB, getHookA, getHookB } = mountSharedHooks();
    await flushAsync();

    const hookA = getHookA();
    const hookB = getHookB();

    await hookA.grade(4);

    expect(hookA.context.value.session?.answeredCount).toBe(1);
    expect(hookB.context.value.session?.answeredCount).toBe(1);
    expect(hookA.state.value.content.id).toBe('card-2');
    expect(hookB.state.value.content.id).toBe('card-2');

    wrapperA.unmount();
    wrapperB.unmount();
  });

  it('keeps a shared controller alive until the last surface detaches', async () => {
    const adapter = createAdapter({
      toUIState: vi.fn(async (_queue: unknown, item: { id?: string } | null) => createReviewState(item?.id ?? 'empty')),
    });
    const { wrapperA, wrapperB } = mountSharedHooks({ adapter });
    await flushAsync();

    wrapperA.unmount();
    expect(adapter.cleanup).not.toHaveBeenCalled();

    wrapperB.unmount();
    expect(adapter.cleanup).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent grade actions from shared review surfaces', async () => {
    const { queue, wrapperA, wrapperB, getHookA, getHookB } = mountSharedHooks();
    await flushAsync();

    const hookA = getHookA();
    const hookB = getHookB();

    await Promise.all([
      hookA.grade(4),
      hookB.grade(2),
    ]);

    expect(queue.onFeedback).toHaveBeenCalledTimes(2);
    expect(queue.onFeedback.mock.calls[0]?.[0]?.id).toBe('card-1');
    expect(queue.onFeedback.mock.calls[1]?.[0]?.id).toBe('card-2');
    expect(hookA.state.value.content.id).toBe('card-3');
    expect(hookB.state.value.content.id).toBe('card-3');

    wrapperA.unmount();
    wrapperB.unmount();
  });

  it('does not increment answered count on skip', async () => {
    const { getHook, wrapper } = mountHook();
    await flushAsync();

    const hook = getHook();
    await hook.skip();

    expect(hook.context.value.session?.answeredCount).toBe(0);
    expect(hook.context.value.session?.correctCount).toBe(0);

    wrapper.unmount();
  });

  it('rolls back the last graded session counters on back', async () => {
    const { getHook, wrapper } = mountHook();
    await flushAsync();

    const hook = getHook();
    await hook.grade(4);
    expect(hook.context.value.session?.answeredCount).toBe(1);
    expect(hook.context.value.session?.correctCount).toBe(1);

    await hook.back();

    expect(hook.context.value.session?.answeredCount).toBe(0);
    expect(hook.context.value.session?.correctCount).toBe(0);

    wrapper.unmount();
  });

  it('increments baselineVersion and resets adapter session state on reload', async () => {
    const { getHook, adapter, queue, wrapper } = mountHook();
    await flushAsync();

    const hook = getHook();
    expect(hook.context.value.session?.baselineVersion).toBe(0);

    await hook.reload();

    expect(hook.context.value.session?.baselineVersion).toBe(1);
    expect(adapter.resetSessionState).toHaveBeenCalledTimes(2);
    expect(queue.resetSessionState).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('updates content before auxiliary header and ignores stale auxiliary results', async () => {
    const queue = createQueue();
    const card1Aux = createDeferred<Partial<ReviewUIState>>();
    const card2Aux = createDeferred<Partial<ReviewUIState>>();
    const adapter = createAdapter({
      toUIState: vi.fn(async (_queue: unknown, item: { id?: string } | null) => createReviewState(item?.id ?? 'empty')),
      fetchAuxiliaryData: vi.fn((item: { id?: string } | null) => {
        if (item?.id === 'card-1') {
          return card1Aux.promise;
        }
        if (item?.id === 'card-2') {
          return card2Aux.promise;
        }
        return Promise.resolve({});
      }),
    });

    const { getHook, wrapper } = mountHook({ queue, adapter });
    await flushAsync();

    const hook = getHook();
    expect(hook.state.value.content.id).toBe('card-1');

    await hook.grade(3);
    await flushAsync();

    expect(hook.state.value.content.id).toBe('card-2');
    expect(hook.state.value.header.stats.label).toBe('');

    card1Aux.resolve({
      ...createAuxState(99, 100, 'stale'),
    });
    await flushAsync();

    expect(hook.state.value.content.id).toBe('card-2');
    expect(hook.state.value.header.stats.label).toBe('');
    expect(hook.state.value.meta.queueSize).not.toBe(100);

    card2Aux.resolve({
      ...createAuxState(2, 3, '2 due'),
    });
    await flushAsync();

    expect(hook.state.value.header.stats.label).toBe('2 due');
    expect(hook.state.value.meta.queueSize).toBe(3);
    expect(hook.state.value.meta.remainingSize).toBe(2);

    wrapper.unmount();
  });

  it('rebuilds UI state when refreshCurrentItem replaces the active card', async () => {
    const queue = createQueue();
    const adapter = createAdapter({
      toUIState: vi.fn(async (_queue: unknown, item: { id?: string; priority?: number } | null) => ({
        ...createEmptyReviewUIState(),
        header: {
          ...createEmptyReviewUIState().header,
          priorityBadge: {
            label: 'P',
            value: item ? String(item.priority ?? '-') : '-',
            priority: item?.priority ?? null,
            ariaLabel: item ? `Priority ${item.priority ?? '-'}` : 'Priority -',
          },
          stats: {
            current: 1,
            total: 1,
            label: '1 due',
            queueName: 'Unified Queue',
          },
        },
        content: {
          type: 'html',
          data: item?.id ?? 'empty',
          id: item?.id ?? 'empty',
          card: item as never,
        },
      })),
    });

    const { getHook, wrapper } = mountHook({ queue, adapter });
    await flushAsync();

    const hook = getHook();
    expect(hook.state.value.content.id).toBe('card-1');

    await hook.refreshCurrentItem({
      id: 'card-1',
      cardID: 'card-1',
      blockId: 'block-card-1',
      blockID: 'block-card-1',
      priority: 7,
    });

    expect(hook.state.value.content.id).toBe('card-1');
    expect(hook.state.value.header.priorityBadge.value).toBe('7');
    expect(hook.state.value.header.priorityBadge.priority).toBe(7);
    expect(queue.hydrateCurrentItem).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'card-1',
      priority: 7,
    }));
    expect(adapter.toUIState).toHaveBeenLastCalledWith(
      queue,
      expect.objectContaining({
        id: 'card-1',
        priority: 7,
        nextDues: createNextDues(),
      }),
      expect.anything(),
    );

    wrapper.unmount();
  });

  it('hydrates path-loaded current items before rebuilding neural roam UI state', async () => {
    const queue = {
      ...createQueue(),
    };
    const underlyingQueue = createNeuralUnderlyingQueue((blockId) => ({
      ...createItem(`node:${blockId}`),
      id: `node:${blockId}`,
      cardID: `node:${blockId}`,
      blockId,
      blockID: blockId,
      meta: {
        neuralContext: {
          isFlashcard: true,
          blockType: 'item',
        },
      },
    }));
    queue.getUnderlyingQueue = vi.fn(() => underlyingQueue);

    const adapter = createAdapter({
      toUIState: vi.fn(async (_queue: unknown, item: { id?: string; nextDues?: unknown } | null) => ({
        ...createReviewState(item?.id ?? 'empty'),
        header: {
          ...createReviewState(item?.id ?? 'empty').header,
          stats: {
            current: item?.nextDues ? 1 : 0,
            total: 1,
            label: item?.nextDues ? 'hydrated' : 'missing',
            queueName: 'Neural Roam',
          },
        },
      })),
    });

    const { getHook, wrapper } = mountHook({ queue, adapter });
    await flushAsync();

    const hook = getHook();
    await hook.loadCardByBlockId('node-target');

    expect(underlyingQueue.getPathItemByNodeId).toHaveBeenCalledWith('node-target');
    expect(queue.hydrateCurrentItem).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'node:node-target',
      blockId: 'node-target',
    }));
    expect(adapter.toUIState).toHaveBeenLastCalledWith(
      queue,
      expect.objectContaining({
        id: 'node:node-target',
        nextDues: createNextDues(),
      }),
      expect.anything(),
    );
    expect(hook.state.value.header.stats.label).toBe('hydrated');

    wrapper.unmount();
  });

  it('skips a guarded refreshCurrentItem when a serialized grade already advanced to another card', async () => {
    const onFeedbackGate = createDeferred<void>();
    const queue = createQueue();
    queue.onFeedback = vi.fn(async () => {
      await onFeedbackGate.promise;
    });

    const adapter = createAdapter({
      toUIState: vi.fn(async (_queue: unknown, item: { id?: string; priority?: number } | null) => ({
        ...createEmptyReviewUIState(),
        header: {
          ...createEmptyReviewUIState().header,
          priorityBadge: {
            label: 'P',
            value: item ? String(item.priority ?? '-') : '-',
            priority: item?.priority ?? null,
            ariaLabel: item ? `Priority ${item.priority ?? '-'}` : 'Priority -',
          },
          stats: {
            current: 2,
            total: 2,
            label: '2 due',
            queueName: 'Unified Queue',
          },
        },
        content: {
          type: 'html',
          data: item?.id ?? 'empty',
          id: item?.id ?? 'empty',
          card: item as never,
        },
      })),
    });

    const { getHook, wrapper } = mountHook({ queue, adapter });
    await flushAsync();

    const hook = getHook();
    expect(hook.state.value.content.id).toBe('card-1');

    const gradePromise = hook.grade(3);
    await flushAsync();

    const refreshPromise = hook.refreshCurrentItem({
      id: 'card-1',
      cardID: 'card-1',
      blockId: 'block-card-1',
      blockID: 'block-card-1',
      priority: 99,
    }, {
      expectedCurrentCardId: 'card-1',
      expectedCurrentBlockId: 'block-card-1',
    });

    onFeedbackGate.resolve();
    await gradePromise;
    await refreshPromise;

    expect(hook.state.value.content.id).toBe('card-2');
    expect(hook.state.value.header.priorityBadge.value).not.toBe('99');

    wrapper.unmount();
  });

  it('does not fetch auxiliary data on reveal', async () => {
    const adapter = createAdapter({
      toUIState: vi.fn(async () => createEmptyReviewUIState()),
      fetchAuxiliaryData: vi.fn(async () => createAuxState(1, 3, '1 due')),
    });
    const { getHook, wrapper } = mountHook({ adapter });
    await flushAsync();

    const hook = getHook();
    const initialCalls = (adapter.fetchAuxiliaryData as ReturnType<typeof vi.fn>).mock.calls.length;
    hook.reveal();
    await flushAsync();

    expect((adapter.fetchAuxiliaryData as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialCalls);
    wrapper.unmount();
  });

  it('calls queue cleanup on unmount', async () => {
    const { queue, wrapper } = mountHook();
    await flushAsync();

    wrapper.unmount();

    expect(queue.cleanup).toHaveBeenCalledTimes(1);
  });
});
