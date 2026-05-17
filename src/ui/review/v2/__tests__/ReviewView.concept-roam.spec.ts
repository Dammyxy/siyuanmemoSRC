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

  it('starts Semantic Activation from concept roam when Semantic is the preferred Neural mode', async () => {
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

    expect(dialogManager.openNeuralRoamDialog).not.toHaveBeenCalled();
    expect(semanticExecute).toHaveBeenCalledWith(expect.objectContaining({
      method: 'semantic.command.execute',
      command: expect.objectContaining({
        type: 'start-session',
        rootFocusNodeId: 'concept-block',
      }),
    }));
    expect(queue.onFeedback).not.toHaveBeenCalled();
    expect(wrapper.find('.fsrs-review-v2__side-tabs').exists()).toBe(true);
    expect(wrapper.findAll('.fsrs-review-v2__side-tab').map((button) => button.text())).toEqual(['AI', '语义']);
    expect(wrapper.get('.semantic-review-sidebar').isVisible()).toBe(true);
    expect(wrapper.text()).toContain('Pinned session');
    expect(wrapper.text()).toContain('Semantic concept');
    expect(semanticReadSidebar).toHaveBeenCalledWith(expect.objectContaining({
      bindingMode: 'pinned-session',
      sessionId: 'semantic-session-1',
    }));

    await wrapper.findAll('.fsrs-review-v2__side-tab').find((button) => button.text() === 'AI')!.trigger('click');
    await flushPromises();
    expect(wrapper.get('.semantic-review-sidebar').isVisible()).toBe(false);

    await wrapper.findAll('.fsrs-review-v2__side-tab').find((button) => button.text() === '语义')!.trigger('click');
    await flushPromises();
    expect(wrapper.get('.semantic-review-sidebar').isVisible()).toBe(true);
    expect(wrapper.text()).toContain('Semantic concept');

    wrapper.unmount();
  });

  it('opens a Semantic node in temporary Review view and returns to the current review item', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1440,
      writable: true,
    });
    const SemanticReviewSidebarStub = defineComponent({
      name: 'SemanticReviewSidebar',
      emits: ['view-node'],
      setup(_, { emit }) {
        return () => h('button', {
          class: 'semantic-view-node-stub',
          onClick: () => emit('view-node', 'semantic-node-1', 'Readable semantic node', 'semantic-block-1'),
        }, 'View semantic node');
      },
    });
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
        narrativePath: [],
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
        adapter: createNonEmptyAdapter() as never,
        mode: 'dialog',
        title: '提取练习',
        headerVariant: 'retrieval-practice',
        plugin: {
          getContext: () => ({
            getDialogManager: () => ({ openNeuralRoamDialog: vi.fn() }),
            getSettingsService: () => ({
              getSettings: () => ({
                queues: { neuralRoam: { preferredMode: 'semantic-activation' } },
              }),
            }),
            getSemanticActivationCommandClient: () => ({ execute: semanticExecute }),
            getSemanticActivationBrowserReadClient: () => ({ readSidebar: vi.fn() }),
          }),
        },
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          SemanticReviewSidebar: SemanticReviewSidebarStub,
          FilterDialog: true,
          AiWorkbenchPane: true,
          teleport: true,
        },
      },
    });

    await flushPromises();
    expect(wrapper.find('.review-actions-stub').exists()).toBe(true);

    wrapper.getComponent(ReviewContentStub).vm.$emit('concept-roam', 'concept-block');
    await flushPromises();
    await wrapper.get('.semantic-view-node-stub').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Viewing: Readable semantic node');
    expect(wrapper.text()).toContain('semantic-block-1');
    expect(wrapper.find('.review-actions-stub').exists()).toBe(false);
    expect(queue.onFeedback).not.toHaveBeenCalled();

    await wrapper.findAll('button').find((button) => button.text() === 'Return to current review')!.trigger('click');
    await flushPromises();

    expect(wrapper.text()).not.toContain('Viewing: Readable semantic node');
    expect(wrapper.find('.review-actions-stub').exists()).toBe(true);

    wrapper.unmount();
  });

  it('temporarily reviews a Semantic flashcard without advancing the original queue', async () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1440,
      writable: true,
    });
    const SemanticReviewSidebarStub = defineComponent({
      name: 'SemanticReviewSidebar',
      emits: ['view-node'],
      setup(_, { emit }) {
        return () => h('button', {
          class: 'semantic-view-node-stub',
          onClick: () => emit('view-node', 'semantic-node-1', 'Semantic flashcard', 'semantic-card-block'),
        }, 'View semantic flashcard');
      },
    });
    const semanticCard = {
      id: 'semantic-card-1',
      cardID: 'semantic-card-1',
      blockId: 'semantic-card-block',
      blockID: 'semantic-card-block',
      deckId: 'deck-1',
      type: 'item',
      meta: {},
    };
    const queue = {
      ...createQueue(),
      hydrateCurrentItem: vi.fn(async (item) => item),
      suppressReviewedCardForCurrentSession: vi.fn(() => true),
    };
    const adapter = {
      ...createNonEmptyAdapter(),
      toUIState: vi.fn(async (_queue: unknown, item: { id?: string; blockId?: string } | null, context: { showAnswer?: boolean }) => ({
        ...createEmptyReviewUIState(),
        content: {
          type: 'protyle' as const,
          data: item?.blockId || 'current-review-block',
          id: item?.blockId || 'current-review-block',
          card: item || undefined,
        },
        actions: {
          showAnswer: !context.showAnswer,
          grades: [{ label: 'Good', value: 3, color: 'green', kb: '3' }],
          menu: [],
        },
        meta: {
          transition: 'none' as const,
          queueProgress: null,
          hasHiddenContent: true,
        },
      })),
    };

    const wrapper = mount(ReviewView, {
      attachTo: document.body,
      props: {
        app: {} as never,
        queue: queue as never,
        adapter: adapter as never,
        mode: 'dialog',
        title: '提取练习',
        headerVariant: 'retrieval-practice',
        plugin: {
          getContext: () => ({
            getDialogManager: () => ({ openNeuralRoamDialog: vi.fn() }),
            getSettingsService: () => ({
              getSettings: () => ({
                queues: { neuralRoam: { preferredMode: 'semantic-activation' } },
              }),
            }),
            getCardService: () => ({ getCardByBlockId: () => semanticCard }),
            getSemanticActivationCommandClient: () => ({
              execute: vi.fn(async () => ({
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
                  narrativePath: [],
                  startedAt: 1,
                  endedAt: null,
                },
              })),
            }),
            getSemanticActivationBrowserReadClient: () => ({ readSidebar: vi.fn() }),
          }),
        },
      },
      global: {
        stubs: {
          ReviewHeader: ReviewHeaderStub,
          ReviewContent: ReviewContentStub,
          ReviewActions: ReviewActionsStub,
          SemanticReviewSidebar: SemanticReviewSidebarStub,
          FilterDialog: true,
          AiWorkbenchPane: true,
          teleport: true,
        },
      },
    });

    await flushPromises();
    wrapper.getComponent(ReviewContentStub).vm.$emit('concept-roam', 'concept-block');
    await flushPromises();
    await wrapper.get('.semantic-view-node-stub').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Viewing: Semantic flashcard');
    expect(wrapper.get('.review-content-stub').text()).toContain('semantic-card-block');
    expect(wrapper.get('.review-content-show-answer').text()).toBe('hidden');
    expect(queue.onFeedback).not.toHaveBeenCalled();

    await wrapper.get('.review-action-reveal').trigger('click');
    await flushPromises();

    expect(wrapper.get('.review-content-show-answer').text()).toBe('revealed');
    expect(queue.onFeedback).not.toHaveBeenCalled();
    expect(queue.next).toHaveBeenCalledTimes(1);

    await wrapper.get('.review-action-good').trigger('click');
    await flushPromises();

    expect(queue.onFeedback).toHaveBeenCalledWith(semanticCard, { action: 'rate', rating: 3 });
    expect(queue.suppressReviewedCardForCurrentSession).toHaveBeenCalledWith(semanticCard);
    expect(queue.next).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).not.toContain('Viewing: Semantic flashcard');
    expect(wrapper.get('.review-content-stub').text()).toContain('current-review-block');

    wrapper.unmount();
  });
});
