// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import type {
  AIExplainResult,
  AIWorkbenchState,
  AITaskType,
  AIViewSessionState,
  AIWorkbenchSurface,
} from '@/types/ai';
import AiWorkbenchPane from '../AiWorkbenchPane.vue';

function createViewState(): Record<AITaskType, AIViewSessionState> {
  return {
    tutor: {
      resultContextSignature: null,
      stale: false,
      staleReason: null,
      followUps: [],
    },
    explain: {
      resultContextSignature: null,
      stale: false,
      staleReason: null,
      followUps: [],
    },
    'make-cards': {
      resultContextSignature: null,
      stale: false,
      staleReason: null,
      followUps: [],
    },
  };
}

function createThreads() {
  return {
    tutor: {
      view: 'tutor' as const,
      messages: [],
      resultContextSignature: null,
      stale: false,
      staleReason: null,
    },
    explain: {
      view: 'explain' as const,
      messages: [],
      resultContextSignature: null,
      stale: false,
      staleReason: null,
    },
    'make-cards': {
      view: 'make-cards' as const,
      messages: [],
      resultContextSignature: null,
      stale: false,
      staleReason: null,
    },
  };
}

function createService(surface: AIWorkbenchSurface): AIWorkbenchService {
  const state = reactive<AIWorkbenchState>({
    sessionId: 'ai-session-1',
    surface,
    sourceReviewSessionId: surface === 'standalone-dialog' ? null : 'review-session-1',
    contextSignature: 'ctx-1',
    viewState: createViewState(),
    activeView: 'tutor',
    context: {
      source: 'review',
      selectedBlockIds: ['block-a', 'block-b'],
      blocks: [
        {
          blockId: 'block-a',
          text: '指数为定值，以 x 为自变量，幂值为因变量的函数叫做幂函数。',
          type: 'paragraph',
        },
        {
          blockId: 'block-b',
          text: 'y = x^a 是幂函数的一般形式。',
          type: 'image',
        },
      ],
      queueType: 'neural-roam',
      queueProgress: {
        queueType: 'neural-roam',
        queueLabel: '神经漫游',
        completed: 12,
        remaining: 8,
        total: 20,
      },
      currentCard: {
        cardId: 'card-1',
        blockId: 'block-a',
        cardType: 'topic',
        revealed: false,
        hasAnswerFace: false,
        explainRequiresReveal: false,
        reviewActionLabel: '下一张',
        roleDescription: '阅读型卡片：用于维持对主题、概念和上下文的接触，不依赖正反面答案回忆。',
        sourceBlockIds: ['block-a'],
        frontText: '指数为定值，以 x 为自变量时，函数 y = x^a 叫什么？',
        backText: '',
        sourceText: '数学讲义 > 理科数学',
      },
      currentCardRaw: null,
      neuralBatch: {
        kind: 'orbit-round',
        engineMode: 'orbit',
        navigationState: {
          currentPathIndex: 0,
          currentNodeId: 'node-1',
          currentEventId: 'event-1',
          navigationMode: 'explore',
          engineMode: 'orbit',
          engineSessionId: 'engine-session-1',
          hasBookmark: false,
          pathLength: 1,
          sessionId: 'review-session-1',
        },
        focusNodeId: 'node-1',
        focusNodePreview: '幂函数',
        currentNodeId: 'node-1',
        roundSize: 5,
        viewedCount: 1,
        remainingCount: 4,
        roundNodes: [
          {
            eventId: 'event-1',
            nodeId: 'node-1',
            nodePreview: '幂函数',
            isVirtual: false,
            associationType: 'focus',
            reason: '概念卡：轨道中心节点',
            visitedAt: 1,
            sourceNodeId: null,
            sourceEventId: null,
          },
          {
            eventId: 'event-2',
            nodeId: 'node-2',
            nodePreview: '指数函数',
            isVirtual: false,
            associationType: 'backlink',
            reason: '反向链接',
            visitedAt: 2,
            sourceNodeId: 'node-1',
            sourceEventId: 'event-1',
          },
        ],
        recentPath: [],
        sourceSnapshot: [],
        seedSnapshot: [],
        anchorSnapshot: [],
      },
    },
    liveContext: null,
    contextIsHistorical: false,
    isLoading: false,
    error: null,
    tutorResult: null,
    explainResult: null,
    makeCardsResult: null,
    makeCardMode: 'qa',
    requestBatchSummary: false,
    sessionTitle: '幂函数 · AI 会话',
    sessionHistory: [
      {
        id: 'ai-session-1',
        title: '幂函数 · AI 会话',
        source: 'review',
        sourceReviewSessionId: 'review-session-1',
        surface,
        contextSignature: 'ctx-1',
        createdAt: 1,
        updatedAt: 2,
        lastActiveView: 'tutor',
        activeViews: ['tutor'],
        messageCount: 0,
      },
    ],
    threads: createThreads(),
    historyPanelOpen: false,
    contextPanelOpen: false,
    composerContexts: {
      items: [],
    },
    composerEditorOpen: false,
    editingMessageId: null,
    editingMessageKind: null,
  });

  const service = {
    state,
    setActiveView(view: AITaskType) {
      state.activeView = view;
    },
    setMakeCardMode(mode: AIWorkbenchState['makeCardMode']) {
      state.makeCardMode = mode;
    },
    setHistoryPanelOpen(open: boolean) {
      state.historyPanelOpen = open;
    },
    setContextPanelOpen(open: boolean) {
      state.contextPanelOpen = open;
    },
    getCurrentModelLabel: () => 'test-model',
    getThreadMessages: () => state.threads[state.activeView].messages,
    getAvailableContextProviders: () => [],
    getComposerContexts: () => state.composerContexts.items,
    replaceComposerContexts: () => {},
    runTutor: async () => {},
    rerunTutorWithSummary: async () => {},
    runExplain: async () => {},
    runMakeCards: async () => {},
    createNewSession: async () => {},
    openSession: async () => {},
    renameCurrentSession: async () => {},
    renameSession: async () => {},
    deleteSession: async () => {},
    runActiveView: async () => {},
    saveSelectedCandidatesToDailyNote: async () => {},
    createSelectedCandidates: async () => {},
    getDraftStorageMode: () => 'daily-note' as const,
    submitFollowUp: async () => {},
    toggleCandidateDiscarded: () => {},
    updateCandidateTitle: () => {},
    updateCandidateTemplateId: () => {},
    updateCandidateField: () => {},
    attachContextFromProvider: async () => null,
    removeComposerContext: () => {},
    clearComposerContexts: () => {},
    setComposerEditorOpen: () => {},
    setEditingMessage: () => {},
    updateAssistantTextMessage: async () => {},
    updateAssistantResultMessage: async () => {},
    getFollowUpDisabledReason: () => null,
  };

  return service as unknown as AIWorkbenchService;
}

function pushExplainMessage(service: AIWorkbenchService, result: AIExplainResult) {
  service.state.threads.explain.messages.push({
    id: 'explain-message-1',
    view: 'explain',
    kind: 'assistant-result',
    createdAt: Date.now(),
    rawContent: '',
    tutorResult: null,
    explainResult: result,
    appliedContexts: [],
  });
}

describe('AiWorkbenchPane compact surfaces', () => {
  it('renders the compact chat shell and can reveal history/context drawers', async () => {
    const service = createService('review-dialog-sidecar');
    const wrapper = mount(AiWorkbenchPane, {
      props: {
        service,
      },
    });

    expect(wrapper.find('.ai-chat--compact').exists()).toBe(true);
    expect(wrapper.find('.ai-chat__history').exists()).toBe(false);
    expect(wrapper.find('.ai-chat__context').exists()).toBe(false);
    expect((wrapper.find('.ai-chat__title-input').element as HTMLInputElement).value).toBe('幂函数 · AI 会话');
    expect(wrapper.text()).toContain('模型: test-model');

    await wrapper.findAll('.b3-button').find((button) => button.text().includes('历史'))!.trigger('click');
    await nextTick();
    expect(wrapper.find('.ai-chat__history').exists()).toBe(true);
    expect(wrapper.text()).toContain('会话历史');

    await wrapper.findAll('.b3-button').find((button) => button.text().includes('查看上下文'))!.trigger('click');
    await nextTick();
    expect(wrapper.find('.ai-chat__context').exists()).toBe(true);
    expect(wrapper.text()).toContain('当前队列');
    expect(wrapper.text()).toContain('神经漫游');

    await wrapper.findAll('.ai-chat__tab')[1].trigger('click');
    await nextTick();
    expect(service.state.activeView).toBe('explain');
    expect(wrapper.find('.ai-chat__context').exists()).toBe(true);
  });

  it('keeps the standalone shell without compact modifier', () => {
    const service = createService('standalone-dialog');
    const wrapper = mount(AiWorkbenchPane, {
      props: {
        service,
      },
    });

    expect(wrapper.find('.ai-chat--compact').exists()).toBe(false);
    expect(wrapper.text()).toContain('AI 导师');
    expect(wrapper.text()).toContain('新建会话');
    expect(wrapper.text()).toContain('删除会话');
  });

  it('renders hyperspace path position in the context drawer', async () => {
    const service = createService('review-tab-companion');
    if (service.state.context?.neuralBatch) {
      service.state.context.neuralBatch = {
        ...service.state.context.neuralBatch,
        kind: 'hyperspace-current-node',
        engineMode: 'hyperspace',
        navigationState: {
          ...service.state.context.neuralBatch.navigationState,
          currentPathIndex: 3,
          pathLength: 9,
          engineMode: 'hyperspace',
        },
      } as never;
    }

    const wrapper = mount(AiWorkbenchPane, {
      props: {
        service,
      },
    });

    service.setContextPanelOpen(true);
    await nextTick();

    expect(wrapper.text()).toContain('当前路径位置');
    expect(wrapper.text()).toContain('4/9');
  });

  it('renders explain results as assistant message sections', async () => {
    const service = createService('review-dialog-sidecar');
    service.state.activeView = 'explain';
    pushExplainMessage(service, {
      workingDefinition: '抓住概念本质的短定义',
      whatItTests: '这张卡真正测试的是定义边界',
      whyItsTricky: '容易和相近概念混淆',
      connections: ['它和上位概念相关', '它和相邻概念形成辨析对'],
      triggers: ['看到相似表述时要想起它', '遇到这个应用场景时要调用它'],
      cardIdeas: ['可以补一张辨析题'],
      rawContent: '',
    });

    const wrapper = mount(AiWorkbenchPane, {
      props: {
        service,
      },
    });

    expect(wrapper.text()).toContain('工作定义');
    expect(wrapper.text()).toContain('抓住概念本质的短定义');
    expect(wrapper.text()).toContain('这张卡在考什么');
    expect(wrapper.text()).toContain('为什么容易错');
    expect(wrapper.text()).toContain('它和现有知识网络的连接');
    expect(wrapper.text()).toContain('下次什么时候该想起它');
  });

  it('shows composer context chips and assistant edit actions in the chat shell', async () => {
    const service = createService('review-dialog-sidecar');
    service.state.composerContexts.items.push({
      id: 'ctx-1',
      providerKey: 'manual-text',
      title: '手工材料',
      summary: '手工材料 · 12 字',
      preview: '补充材料',
      content: '补充材料',
      blockIds: [],
      createdAt: Date.now(),
    });
    service.state.threads.tutor.messages.push({
      id: 'assistant-text-1',
      view: 'tutor',
      kind: 'assistant-text',
      content: '这里有一段 **Markdown** 回复。',
      createdAt: Date.now(),
      sourceContent: '这里有一段 **Markdown** 回复。',
      appliedContexts: [],
    });

    const wrapper = mount(AiWorkbenchPane, {
      props: {
        service,
      },
    });

    expect(wrapper.text()).toContain('Use Context');
    expect(wrapper.text()).toContain('手工材料');
    expect(wrapper.text()).toContain('编辑');
  });

  it('falls back to raw explain JSON when a persisted message uses legacy alias keys', async () => {
    const service = createService('review-dialog-sidecar');
    service.state.activeView = 'explain';
    service.state.threads.explain.messages.push({
      id: 'explain-message-legacy',
      view: 'explain',
      kind: 'assistant-result',
      createdAt: Date.now(),
      rawContent: JSON.stringify({
        workDefinition: '旧键定义',
        testPoint: '旧键考点',
        confusionBoundary: '旧键混淆边界',
        knowledgeNetwork: '旧键知识连接',
        recallTrigger: '旧键触发线索',
      }),
      tutorResult: null,
      explainResult: {
        workingDefinition: '',
        whatItTests: '',
        whyItsTricky: '',
        connections: [],
        triggers: [],
        cardIdeas: [],
        rawContent: '',
      },
      appliedContexts: [],
    });

    const wrapper = mount(AiWorkbenchPane, {
      props: {
        service,
      },
    });

    expect(wrapper.text()).toContain('旧键定义');
    expect(wrapper.text()).toContain('旧键考点');
    expect(wrapper.text()).toContain('旧键混淆边界');
    expect(wrapper.text()).toContain('旧键知识连接');
    expect(wrapper.text()).toContain('旧键触发线索');
  });
});
