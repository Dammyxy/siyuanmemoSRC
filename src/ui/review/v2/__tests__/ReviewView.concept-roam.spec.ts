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
    showAnswer: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    return () => h('div', { class: 'review-content-stub' }, [
      String((props.content as { data?: string; id?: string }).data || (props.content as { id?: string }).id || ''),
      h('span', { class: 'review-content-show-answer' }, props.showAnswer ? 'hidden' : 'revealed'),
    ]);
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  emits: ['reveal', 'grade', 'back'],
  setup(_, { emit }) {
    return () => h('div', { class: 'review-actions-stub' }, [
      h('button', { class: 'review-action-reveal', onClick: () => emit('reveal') }, 'Reveal'),
      h('button', { class: 'review-action-good', onClick: () => emit('grade', 3) }, 'Good'),
      h('button', { class: 'review-action-back', onClick: () => emit('back') }, 'Back'),
    ]);
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

function createNonEmptyAdapter() {
  return {
    toUIState: vi.fn(async () => ({
      ...createEmptyReviewUIState(),
      content: {
        type: 'protyle' as const,
        data: 'current-review-block',
        id: 'current-review-block',
      },
      actions: {
        showAnswer: true,
        grades: [{ label: 'Good', value: 3, color: 'green', kb: '3' }],
        menu: [],
      },
      meta: {
        transition: 'none' as const,
        queueProgress: null,
      },
    })),
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

  it('opens Neural Roam from concept roam when a stale Semantic preference exists', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1440,
      writable: true,
    });
    const dialogManager = {
      openNeuralRoamDialog: vi.fn(async () => undefined),
    };
    const reviewAIService = {
      state: {
        activeView: 'general-chat',
      },
    };
    const reviewAIRegistry = {
      hasReviewSession: vi.fn(() => true),
      getReviewSession: vi.fn(() => reviewAIService),
      openReviewSession: vi.fn(async () => reviewAIService),
      updateReviewSessionContext: vi.fn(async () => reviewAIService),
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
    const semanticReadSidebar = vi.fn(async () => ({
      status: 'ok',
      requestId: 'semantic-sidebar-read',
      model: {
        bindingState: { type: 'pinned-session', sessionId: 'semantic-session-1' },
        session: {
          sessionId: 'semantic-session-1',
          rootFocusNodeId: 'concept-block',
          currentNodeId: 'concept-block',
          activeLens: 'assimilation',
          narrativePath: [],
          startedAt: 1,
          endedAt: null,
        },
        currentNode: {
          nodeId: 'concept-block',
          nodeType: 'real-review-card',
          title: 'concept-block',
          preview: '',
          presentation: {
            displayTitle: 'Semantic concept',
            summary: 'Readable semantic root',
            nodeKind: 'block',
            breadcrumb: [],
            availability: { status: 'available', reason: null, message: null },
            sourceBlockId: 'concept-block',
            cardId: null,
            debugId: 'concept-block',
          },
          location: { blockId: 'concept-block', cardId: null, deckId: null, breadcrumb: [], backlinkBlockIds: [] },
        },
        activePath: [],
        activePathNodes: [],
        branches: [],
        candidates: { assimilation: [], accommodation: [], free: [] },
        later: [],
        suggestions: [],
        nodes: [],
      },
      diagnosticEventId: 'diag-sidebar',
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
            getSemanticActivationBrowserReadClient: () => ({
              readSidebar: semanticReadSidebar,
            }),
            getReviewAIWorkbenchRegistry: () => reviewAIRegistry,
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
    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'ai-sidebar', new MouseEvent('click'));
    await flushPromises();
    wrapper.getComponent(ReviewContentStub).vm.$emit('concept-roam', 'concept-block');
    await flushPromises();

    expect(dialogManager.openNeuralRoamDialog).toHaveBeenCalledWith({
      focusBlockId: 'concept-block',
      includeFocusAsFirst: true,
      startNewSession: true,
    });
    expect(semanticExecute).not.toHaveBeenCalled();
    expect(queue.onFeedback).not.toHaveBeenCalled();
    expect(wrapper.find('.fsrs-review-v2__side-tabs').exists()).toBe(true);
    expect(wrapper.findAll('.fsrs-review-v2__side-tab').map((button) => button.text())).toEqual(['AI']);
    expect(wrapper.find('.semantic-review-sidebar').exists()).toBe(false);
    expect(semanticReadSidebar).not.toHaveBeenCalled();

    await wrapper.findAll('.fsrs-review-v2__side-tab').find((button) => button.text() === 'AI')!.trigger('click');
    await flushPromises();
    expect(wrapper.find('.semantic-review-sidebar').exists()).toBe(false);

    wrapper.unmount();
  });

});
