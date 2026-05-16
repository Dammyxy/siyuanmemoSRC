// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';

const reviewViewConceptRoamMocks = vi.hoisted(() => ({
  showMessage: vi.fn(),
}));

const reviewViewConceptRoamLoggerMocks = vi.hoisted(() => ({
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
    open = vi.fn();
  },
  showMessage: reviewViewConceptRoamMocks.showMessage,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => reviewViewConceptRoamLoggerMocks,
  logger: reviewViewConceptRoamLoggerMocks,
  setGlobalLogLevel: vi.fn(),
  getGlobalLogLevel: vi.fn(() => 'warn'),
}));

vi.mock('@/ui/review/openReviewBlockAtSource', () => ({
  openReviewBlockAtSource: vi.fn(),
}));

const ReviewHeaderStub = defineComponent({
  name: 'ReviewHeader',
  setup() {
    return () => h('div', { class: 'review-header-stub' });
  },
});

const ReviewContentStub = defineComponent({
  name: 'ReviewContent',
  emits: ['concept-roam'],
  props: {
    content: {
      type: Object,
      required: true,
    },
  },
  setup() {
    return () => h('div', { class: 'review-content-stub' });
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  setup() {
    return () => h('div', { class: 'review-actions-stub' });
  },
});

function createQueue() {
  return {
    getType: () => 'retrieval-practice',
    next: vi.fn(async () => null),
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

function createAdapter() {
  return {
    toUIState: vi.fn(async () => createEmptyReviewUIState()),
    cleanup: vi.fn(),
    resetSessionState: vi.fn(),
  };
}

describe('ReviewView Concept roam entry', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('starts Neural Roam through DialogManager without submitting Review feedback', async () => {
    const dialogManager = {
      openNeuralRoamDialog: vi.fn(async () => undefined),
    };
    const queue = createQueue();

    const wrapper = mount(ReviewView, {
      attachTo: document.body,
      props: {
        app: {} as never,
        queue: queue as never,
        adapter: createAdapter() as never,
        mode: 'dialog',
        title: '提取练习',
        headerVariant: 'retrieval-practice',
        plugin: {
          getContext: () => ({
            getDialogManager: () => dialogManager,
          }),
        },
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

    await flushPromises();
    wrapper.getComponent(ReviewContentStub).vm.$emit('concept-roam', 'concept-block');
    await flushPromises();

    expect(dialogManager.openNeuralRoamDialog).toHaveBeenCalledWith({
      focusBlockId: 'concept-block',
      includeFocusAsFirst: true,
      startNewSession: true,
    });
    expect(queue.onFeedback).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('starts Semantic Activation from concept roam when Semantic is the preferred Neural mode', async () => {
    const dialogManager = {
      openNeuralRoamDialog: vi.fn(async () => undefined),
    };
    const semanticExecute = vi.fn(async () => ({
      status: 'ok',
      commandId: 'semantic-start',
      writerInstanceId: 'writer-1',
      changed: { semanticSessionIds: ['semantic-session-1'] },
      diagnosticEventId: 'semantic-diag-1',
      session: {
        sessionId: 'semantic-session-1',
        rootFocusNodeId: 'concept-block',
        currentNodeId: 'concept-block',
        activeLens: 'assimilation',
        narrativePath: [{
          nodeId: 'concept-block',
          lens: 'assimilation',
          eventId: 'event-1',
          visitedAt: 1,
        }],
        startedAt: 1,
        endedAt: null,
      },
    }));
    const queue = createQueue();

    const wrapper = mount(ReviewView, {
      attachTo: document.body,
      props: {
        app: {} as never,
        queue: queue as never,
        adapter: createAdapter() as never,
        mode: 'dialog',
        title: '提取练习',
        headerVariant: 'retrieval-practice',
        plugin: {
          getContext: () => ({
            getDialogManager: () => dialogManager,
            getSettingsService: () => ({
              getSettings: () => ({
                queues: {
                  neuralRoam: {
                    preferredMode: 'semantic-activation',
                  },
                },
              }),
            }),
            getSemanticActivationCommandClient: () => ({
              execute: semanticExecute,
            }),
          }),
        },
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

    await flushPromises();
    wrapper.getComponent(ReviewContentStub).vm.$emit('concept-roam', 'concept-block');
    await flushPromises();

    expect(dialogManager.openNeuralRoamDialog).not.toHaveBeenCalled();
    expect(semanticExecute).toHaveBeenCalledWith(expect.objectContaining({
      method: 'semantic.command.execute',
      command: expect.objectContaining({
        type: 'start-session',
        rootFocusNodeId: 'concept-block',
      }),
    }));
    expect(queue.onFeedback).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
