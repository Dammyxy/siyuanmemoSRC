import { mount } from '@vue/test-utils';
import { defineComponent, nextTick, ref, type Ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeferredLoadingIndicator } from '../composables/useDeferredLoadingIndicator';

describe('useDeferredLoadingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mountHarness() {
    let loadingRef: Ref<boolean> | null = null;
    let showLoadingRef: Ref<boolean> | null = null;

    const Harness = defineComponent({
      setup() {
        const loading = ref(false);
        const { showLoading } = useDeferredLoadingIndicator(loading, { delayMs: 120 });
        loadingRef = loading;
        showLoadingRef = showLoading;
        return {};
      },
      template: '<div></div>',
    });

    const wrapper = mount(Harness);
    if (!loadingRef || !showLoadingRef) {
      throw new Error('Harness refs are not initialized');
    }

    return {
      wrapper,
      loadingRef,
      showLoadingRef,
    };
  }

  it('does not show loading when pending less than delay threshold', async () => {
    const { wrapper, loadingRef, showLoadingRef } = mountHarness();

    loadingRef.value = true;
    await nextTick();

    vi.advanceTimersByTime(119);
    await nextTick();

    expect(showLoadingRef.value).toBe(false);
    wrapper.unmount();
  });

  it('shows loading when pending reaches delay threshold', async () => {
    const { wrapper, loadingRef, showLoadingRef } = mountHarness();

    loadingRef.value = true;
    await nextTick();

    vi.advanceTimersByTime(120);
    await nextTick();

    expect(showLoadingRef.value).toBe(true);
    wrapper.unmount();
  });

  it('hides loading immediately when loading becomes false', async () => {
    const { wrapper, loadingRef, showLoadingRef } = mountHarness();

    loadingRef.value = true;
    await nextTick();
    vi.advanceTimersByTime(120);
    await nextTick();
    expect(showLoadingRef.value).toBe(true);

    loadingRef.value = false;
    await nextTick();
    expect(showLoadingRef.value).toBe(false);
    wrapper.unmount();
  });
});
