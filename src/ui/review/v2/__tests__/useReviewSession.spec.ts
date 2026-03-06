import { mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyReviewUIState, type ReviewSessionHook } from '../types';
import { useReviewSession } from '../useReviewSession';

function createItem(id: string) {
  return {
    id,
    cardID: id,
    blockId: `block-${id}`,
    blockID: `block-${id}`,
  };
}

function createQueue() {
  const items = [createItem('card-1'), createItem('card-2'), createItem('card-3')];
  let index = 0;

  return {
    next: vi.fn(async () => items[index++] ?? null),
    onFeedback: vi.fn(async () => undefined),
    getStats: vi.fn(async () => ({ size: items.length, label: `${items.length} due` })),
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
  };
}

function createAdapter() {
  return {
    toUIState: vi.fn(async () => createEmptyReviewUIState()),
    resetSessionState: vi.fn(),
    cleanup: vi.fn(),
  };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function mountHook() {
  const queue = createQueue();
  const adapter = createAdapter();
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
});
