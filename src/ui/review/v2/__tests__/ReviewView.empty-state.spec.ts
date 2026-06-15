// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

const reviewViewLoggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  trace: vi.fn(),
}));

vi.mock('siyuan', () => ({
  Menu: class {
    addItem = vi.fn();
    addSeparator = vi.fn();
    open = vi.fn();
  },
  showMessage: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => reviewViewLoggerMocks,
  logger: reviewViewLoggerMocks,
  setGlobalLogLevel: vi.fn(),
  getGlobalLogLevel: vi.fn(() => 'warn'),
}));

vi.mock('@/ui/review/openReviewBlockAtSource', () => ({
  openReviewBlockAtSource: vi.fn(),
}));

const ReviewHeaderStub = defineComponent({
  name: 'ReviewHeader',
  emits: ['toolbar-action', 'action', 'context', 'breadcrumb-click'],
  setup() {
    return () => h('div', { class: 'review-header-stub' });
  },
});

const ReviewContentStub = defineComponent({
  name: 'ReviewContent',
  props: {
    content: {
      type: Object,
      required: true,
    },
    plugin: {
      type: Object,
      default: undefined,
    },
    renderServices: {
      type: Object,
      default: undefined,
    },
  },
  setup(props) {
    return () => h(
      'div',
      {
        class: 'review-content-stub',
        'data-content-type': (props.content as { type?: string }).type || '',
      },
      String((props.content as { id?: string }).id || ''),
    );
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  setup() {
    return () => h('div', { class: 'review-actions-stub' });
  },
});

function createQueue(nextImpl: () => Promise<unknown>) {
  return {
    next: vi.fn(nextImpl),
    onFeedback: vi.fn(async () => undefined),
    getStats: vi.fn(async () => ({ size: 0, label: '0 due' })),
    getUIConfig: vi.fn(() => ({
      statsType: 'queue-size' as const,
      showRatingButtons: true,
      allowSkip: true,
    })),
    canGoBack: vi.fn(() => false),
  };
}

function createRenderServicesStub() {
  return {
    quickCardRenderService: {},
    descriptorCardRenderService: {},
    conceptDefinitionCardRenderService: {},
    conceptCardRenderService: {},
    multiClozeCardRenderService: {},
  };
}

function createCompletedEmptyAdapter() {
  return {
    toUIState: vi.fn(async () => ({
      ...createEmptyReviewUIState(),
      header: {
        ...createEmptyReviewUIState().header,
        title: 'Review',
      },
      meta: {
        ...createEmptyReviewUIState().meta,
        emptyStateMode: 'completed' as const,
      },
      actions: {
        ...createEmptyReviewUIState().actions,
        showAnswer: false,
        grades: [],
      },
    })),
    cleanup: vi.fn(),
    resetSessionState: vi.fn(),
  };
}

function mountReviewView(options: {
  queue: ReturnType<typeof createQueue>;
  adapter: ReturnType<typeof createCompletedEmptyAdapter>;
  mode?: 'dialog' | 'tab';
  plugin?: unknown;
  reviewSessionId?: string;
}) {
  return mount(ReviewView, {
    props: {
      app: {} as never,
      queue: options.queue as never,
      adapter: options.adapter as never,
      mode: options.mode,
      plugin: options.plugin,
      reviewSessionId: options.reviewSessionId,
    },
    global: {
      stubs: {
        ReviewHeader: ReviewHeaderStub,
        ReviewContent: ReviewContentStub,
        ReviewActions: ReviewActionsStub,
        FilterDialog: true,
        teleport: true,
      },
    },
  });
}

describe('ReviewView empty state actions', () => {
  it('passes the plugin context to ReviewContent for renderer-owned Siyuan access', async () => {
    const queue = createQueue(async () => null);
    const adapter = createCompletedEmptyAdapter();
    const renderServices = createRenderServicesStub();
    const createReviewRenderServices = vi.fn(() => renderServices);
    const plugin = {
      getContext: () => ({
        createReviewRenderServices,
      }),
    };

    const wrapper = mountReviewView({
      queue,
      adapter,
      mode: 'tab',
      plugin,
    });

    await flushPromises();

    expect(wrapper.getComponent(ReviewContentStub).props('plugin')).toMatchObject({
      getContext: expect.any(Function),
    });
    expect(createReviewRenderServices).toHaveBeenCalledWith({ i18n: {} });
    expect(wrapper.getComponent(ReviewContentStub).props('renderServices')).toBe(renderServices);

    wrapper.unmount();
  });

  it('hides review actions and does not show exit during the initial placeholder state', async () => {
    const unresolvedNext = new Promise<null>(() => {});
    const queue = createQueue(() => unresolvedNext);
    const adapter = createCompletedEmptyAdapter();

    const wrapper = mountReviewView({
      queue,
      adapter,
      mode: 'dialog',
    });

    await Promise.resolve();

    expect(wrapper.find('.review-actions-stub').exists()).toBe(false);
    expect(wrapper.find('.fsrs-review-v2__empty-exit').exists()).toBe(false);
    expect(adapter.toUIState).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('shows only the dialog exit CTA for a completed empty state and emits close on click', async () => {
    const queue = createQueue(async () => null);
    const adapter = createCompletedEmptyAdapter();

    const wrapper = mountReviewView({
      queue,
      adapter,
      mode: 'dialog',
    });

    await flushPromises();

    expect(wrapper.find('.review-actions-stub').exists()).toBe(false);
    expect(wrapper.find('.review-content-stub').attributes('data-content-type')).toBe('empty');
    expect(wrapper.text()).not.toContain('显示答案');
    expect(wrapper.text()).not.toContain('跳过');

    const exitButton = wrapper.get('.fsrs-review-v2__empty-exit');
    expect(exitButton.text()).toBe('退出');

    await exitButton.trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();

    wrapper.unmount();
  });

  it('shows the tab exit CTA for a completed empty state and closes the active review tab', async () => {
    const queue = createQueue(async () => null);
    const adapter = createCompletedEmptyAdapter();
    const tabManager = {
      closeReviewTab: vi.fn(),
      openReviewTab: vi.fn(),
    };

    const wrapper = mountReviewView({
      queue,
      adapter,
      mode: 'tab',
      reviewSessionId: 'review-tab-1',
      plugin: {
        getContext: () => ({
          getTabManager: () => tabManager,
        }),
      },
    });

    await flushPromises();

    expect(wrapper.find('.review-actions-stub').exists()).toBe(false);
    const exitButton = wrapper.get('.fsrs-review-v2__empty-exit');
    expect(exitButton.text()).toBe('退出');

    await exitButton.trigger('click');
    expect(tabManager.closeReviewTab).toHaveBeenCalledWith('review-tab-1');
    expect(wrapper.emitted('close')).toBeFalsy();

    wrapper.unmount();
  });
});
