import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyReviewUIState, type ReviewSessionHook, type ReviewUIState } from '../types';
import { useReviewSession } from '../useReviewSession';

function createItem(id: string) {
  return {
    id,
    cardID: id,
    blockId: `block-${id}`,
    blockID: `block-${id}`,
    deckId: 'deck-1',
  };
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
} = {}) {
  const queue = options.queue ?? createQueue();
  const adapter = options.adapter ?? createAdapter();
  let hook: ReviewSessionHook | null = null;

  const Harness = defineComponent({
    setup() {
      hook = useReviewSession(queue as never, adapter as never);
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
