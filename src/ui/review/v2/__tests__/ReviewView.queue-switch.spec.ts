// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

const reviewViewQueueSwitchMocks = vi.hoisted(() => {
  const instances: Array<{ addItem: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }> = [];

  class MockMenu {
    addItem = vi.fn();
    open = vi.fn();

    constructor() {
      instances.push(this);
    }
  }

  return {
    instances,
    MockMenu,
    showMessage: vi.fn(),
  };
});

const reviewViewQueueSwitchLoggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  trace: vi.fn(),
}));

vi.mock('siyuan', () => ({
  Menu: reviewViewQueueSwitchMocks.MockMenu,
  showMessage: reviewViewQueueSwitchMocks.showMessage,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => reviewViewQueueSwitchLoggerMocks,
  logger: reviewViewQueueSwitchLoggerMocks,
  setGlobalLogLevel: vi.fn(),
  getGlobalLogLevel: vi.fn(() => 'warn'),
}));

vi.mock('@/ui/review/openReviewBlockAtSource', () => ({
  openReviewBlockAtSource: vi.fn(),
}));

const ReviewHeaderStub = defineComponent({
  name: 'ReviewHeader',
  emits: ['queue-switch'],
  setup(_props, { emit }) {
    return () => h('button', {
      class: 'review-header-queue-switch',
      onClick: (event: MouseEvent) => emit('queue-switch', event),
    }, 'switch');
  },
});

const ReviewContentStub = defineComponent({
  name: 'ReviewContent',
  props: {
    content: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => h('div', {
      class: 'review-content-stub',
      'data-content-id': String((props.content as { id?: string }).id || ''),
    });
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  setup() {
    return () => h('div', { class: 'review-actions-stub' });
  },
});

function createQueue(nextImpl: () => Promise<unknown>, queueType = 'retrieval-practice') {
  return {
    getType: () => queueType,
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

function createCompletedEmptyAdapter() {
  return {
    toUIState: vi.fn(async () => ({
      ...createEmptyReviewUIState(),
      header: {
        ...createEmptyReviewUIState().header,
        title: '提取练习',
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
  mode: 'dialog' | 'tab';
  title: string;
  headerVariant: 'retrieval-practice' | 'incremental-learning' | 'final-drill' | 'filter-group' | 'neural-roam';
  plugin?: unknown;
  nativeDialogTitlebar?: boolean;
}) {
  return mount(ReviewView, {
    attachTo: document.body,
    props: {
      app: {} as never,
      queue: createQueue(async () => null, options.headerVariant) as never,
      adapter: createCompletedEmptyAdapter() as never,
      mode: options.mode,
      title: options.title,
      headerVariant: options.headerVariant,
      nativeDialogTitlebar: options.nativeDialogTitlebar,
      plugin: options.plugin,
    },
    global: {
      stubs: {
        ReviewHeader: ReviewHeaderStub,
        ReviewContent: ReviewContentStub,
        ReviewActions: ReviewActionsStub,
        FilterDialog: true,
        AiWorkbenchPane: true,
        teleport: true,
      },
    },
  });
}

describe('ReviewView queue switch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    reviewViewQueueSwitchMocks.instances.length = 0;
    document.body.innerHTML = `
      <div class="b3-dialog__container siyuanmemo-review-dialog-container">
        <div class="b3-dialog__header">
          <div class="b3-dialog__title">提取练习</div>
        </div>
      </div>
    `;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('replaces the native dialog titlebar title with a queue switch trigger and keeps switching in dialog surface', async () => {
    const dialogManager = {
      switchStandardReviewDialogQueue: vi.fn(),
    };

    mountReviewView({
      mode: 'dialog',
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      nativeDialogTitlebar: true,
      plugin: {
        getContext: () => ({
          getDialogManager: () => dialogManager,
        }),
      },
    });

    await flushPromises();
    await vi.runAllTimersAsync();
    await nextTick();

    const trigger = document.querySelector('.siyuanmemo-review-titlebar__queue-switch') as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toBe('提取练习');

    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 24, clientY: 16 }));
    await nextTick();

    const menu = reviewViewQueueSwitchMocks.instances.at(-1);
    expect(menu?.addItem).toHaveBeenCalledTimes(5);
    expect(menu?.addItem.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      label: '提取练习',
      disabled: true,
      icon: 'iconCheck',
    }));

    const incrementalItem = menu?.addItem.mock.calls.find(([item]) => item.label === '渐进学习')?.[0];
    expect(incrementalItem).toBeTruthy();
    await incrementalItem.click();

    expect(dialogManager.switchStandardReviewDialogQueue).toHaveBeenCalledWith('incremental-learning');
  });

  it('opens the same queue-switch menu from tab headers and replaces the current review tab', async () => {
    const tabManager = {
      replaceCurrentReviewTabWithStandardQueue: vi.fn(),
    };

    const wrapper = mountReviewView({
      mode: 'tab',
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      plugin: {
        getContext: () => ({
          getTabManager: () => tabManager,
        }),
      },
    });

    await flushPromises();
    await wrapper.get('.review-header-queue-switch').trigger('click', {
      clientX: 48,
      clientY: 18,
    });

    const menu = reviewViewQueueSwitchMocks.instances.at(-1);
    expect(menu?.addItem).toHaveBeenCalledTimes(5);

    const filterGroupItem = menu?.addItem.mock.calls.find(([item]) => item.label === '分组队列')?.[0];
    expect(filterGroupItem).toBeTruthy();
    await filterGroupItem.click();

    expect(tabManager.replaceCurrentReviewTabWithStandardQueue).toHaveBeenCalledWith('filter-group');
  });
});
