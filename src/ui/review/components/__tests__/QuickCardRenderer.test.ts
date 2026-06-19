import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import QuickCardRenderer from '../QuickCardRenderer.vue';
import type { QuickCardRenderService, QuickCardViewModel } from '@/core/card/quick-card/application/QuickCardRenderService';
import type { RichContentResult } from '@/core/card/common/application/richContent';

function richContent(html: string, field = 'front'): RichContentResult {
  return {
    html,
    atoms: [],
    diagnostics: [],
    source: {
      kind: 'quick',
      field,
    },
    renderKind: 'html',
  };
}

function createViewModel(partial: Partial<QuickCardViewModel> = {}): QuickCardViewModel {
  return {
    blockId: 'block-1',
    breadcrumbs: [],
    content: richContent('<div>Test content</div>'),
    cssClasses: [],
    cardType: 'basic',
    metadata: { symbol: '>>' },
    ...partial,
  } as QuickCardViewModel;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('QuickCardRenderer.vue', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads front side on mount', async () => {
    const viewModel = createViewModel();
    const prepareViewModel = vi.fn().mockResolvedValue(viewModel);

    mount(QuickCardRenderer, {
      props: {
        blockId: '123',
        renderService: { prepareViewModel } as unknown as QuickCardRenderService,
      },
    });

    await flushMicrotasks();
    expect(prepareViewModel).toHaveBeenCalledWith('123', 'front', undefined);
  });

  it('uses a prepared view model without entering the loading path', async () => {
    const viewModel = createViewModel({ content: richContent('<div>Prepared quick</div>') });
    const prepareViewModel = vi.fn().mockResolvedValue(viewModel);

    const wrapper = mount(QuickCardRenderer, {
      props: {
        blockId: '123',
        cardId: 'card-123',
        renderService: { prepareViewModel } as unknown as QuickCardRenderService,
        preparedViewModel: viewModel,
        preparedIdentity: '123:card-123:front',
      },
    });

    await wrapper.vm.$nextTick();

    expect(prepareViewModel).not.toHaveBeenCalled();
    expect(wrapper.find('.card-loading-state').exists()).toBe(false);
    expect(wrapper.html()).toContain('Prepared quick');
    expect(wrapper.emitted('loaded')).toBeTruthy();
  });

  it('loads back side when showAnswer is true', async () => {
    const viewModel = createViewModel();
    const prepareViewModel = vi.fn().mockResolvedValue(viewModel);

    mount(QuickCardRenderer, {
      props: {
        blockId: '123',
        showAnswer: true,
        renderService: { prepareViewModel } as unknown as QuickCardRenderService,
      },
    });

    await flushMicrotasks();
    expect(prepareViewModel).toHaveBeenCalledWith('123', 'back', undefined);
  });

  it('renders content and emits loaded event when view model resolves', async () => {
    const viewModel = createViewModel({
      cssClasses: ['card__block--hidemark'],
    });
    const prepareViewModel = vi.fn().mockResolvedValue(viewModel);

    const wrapper = mount(QuickCardRenderer, {
      props: {
        blockId: '123',
        renderService: { prepareViewModel } as unknown as QuickCardRenderService,
      },
    });

    await flushMicrotasks();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.quick-card-renderer__content').exists()).toBe(true);
    expect(wrapper.html()).toContain('Test content');
    expect(wrapper.find('.quick-card-renderer__card').classes()).toContain('card__block--hidemark');
    expect(wrapper.find('.review-rich-html-content').exists()).toBe(true);
    expect(wrapper.emitted('loaded')).toBeTruthy();
  });

  it('emits error and renders error state when load fails', async () => {
    const prepareViewModel = vi.fn().mockRejectedValue(new Error('Render failed'));

    const wrapper = mount(QuickCardRenderer, {
      props: {
        blockId: '123',
        renderService: { prepareViewModel } as unknown as QuickCardRenderService,
      },
    });

    await flushMicrotasks();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.card-error-state').exists()).toBe(true);
    expect(wrapper.text()).toContain('Render failed');
    expect(wrapper.emitted('error')).toBeTruthy();
  });

  it('shows deferred loading indicator only after 120ms threshold', async () => {
    vi.useFakeTimers();

    const viewModel = createViewModel();
    const prepareViewModel = vi.fn().mockImplementation(
      () =>
        new Promise<QuickCardViewModel>((resolve) => {
          setTimeout(() => resolve(viewModel), 200);
        })
    );

    const wrapper = mount(QuickCardRenderer, {
      props: {
        blockId: '123',
        renderService: { prepareViewModel } as unknown as QuickCardRenderService,
      },
    });

    await wrapper.vm.$nextTick();
    expect(wrapper.find('.card-loading-state').exists()).toBe(false);

    vi.advanceTimersByTime(119);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.card-loading-state').exists()).toBe(false);

    vi.advanceTimersByTime(1);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.card-loading-state').exists()).toBe(true);

    vi.advanceTimersByTime(80);
    await flushMicrotasks();
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.card-loading-state').exists()).toBe(false);
    expect(wrapper.find('.quick-card-renderer__content').exists()).toBe(true);
  });

  it('reuses the local cache when flipping back to an already rendered side', async () => {
    const frontViewModel = createViewModel({ content: richContent('<div>Front</div>', 'front') });
    const backViewModel = createViewModel({ content: richContent('<div>Back</div>', 'back') });
    const prepareViewModel = vi.fn()
      .mockResolvedValueOnce(frontViewModel)
      .mockResolvedValueOnce(backViewModel);

    const wrapper = mount(QuickCardRenderer, {
      props: {
        blockId: '123',
        renderService: { prepareViewModel } as unknown as QuickCardRenderService,
      },
    });

    await flushMicrotasks();
    await wrapper.vm.$nextTick();

    await wrapper.setProps({ showAnswer: true });
    await flushMicrotasks();
    await wrapper.vm.$nextTick();

    await wrapper.setProps({ showAnswer: false });
    await flushMicrotasks();
    await wrapper.vm.$nextTick();

    expect(prepareViewModel).toHaveBeenCalledTimes(2);
    expect(prepareViewModel).toHaveBeenNthCalledWith(1, '123', 'front', undefined);
    expect(prepareViewModel).toHaveBeenNthCalledWith(2, '123', 'back', undefined);
    expect(wrapper.html()).toContain('Front');
  });
});
