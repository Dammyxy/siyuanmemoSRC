// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import type {
  AIExplainResult,
  AIWorkbenchState,
  AIViewSessionState,
  AIWorkbenchSurface,
} from '@/types/ai';
import AiWorkbenchPane from '../AiWorkbenchPane.vue';

function createViewState(): Record<'explain', AIViewSessionState> {
  return {
    explain: {
      resultContextSignature: null,
      stale: false,
      staleReason: null,
      followUps: [],
    },
  };
}

function createThreads() {
  return {
    explain: {
      view: 'explain' as const,
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
    activeView: 'explain',
    context: {
      source: 'review',
      selectedBlockIds: ['block-a', 'block-b'],
      blocks: [
        { blockId: 'block-a', text: '指数为定值，以 x 为自变量，幂值为因变量的函数叫做幂函数。', type: 'paragraph' },
        { blockId: 'block-b', text: 'y = x^a 是幂函数的一般形式。', type: 'paragraph' },
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
        roleDescription: '阅读型卡片',
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
        roundNodes: [],
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
    explainResult: null,
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
        lastActiveView: 'explain',
        activeViews: ['explain'],
        messageCount: 0,
      },
    ],
    threads: createThreads(),
    historyPanelOpen: false,
    contextPanelOpen: false,
    composerContexts: { items: [] },
    composerEditorOpen: false,
    editingMessageId: null,
    editingMessageKind: null,
  });

  const service = {
    state,
    setActiveView() {},
    setHistoryPanelOpen(open: boolean) {
      state.historyPanelOpen = open;
    },
    setContextPanelOpen(open: boolean) {
      state.contextPanelOpen = open;
    },
    getCurrentModelLabel: () => 'test-model',
    getThreadMessages: () => state.threads.explain.messages,
    getAvailableContextProviders: () => [],
    getComposerContexts: () => state.composerContexts.items,
    clearComposerContexts: () => {
      state.composerContexts.items = [];
    },
    attachContextFromProvider: async () => null,
    createNewSession: async () => {},
    openSession: async () => {},
    renameCurrentSession: async () => {},
    renameSession: async () => {},
    deleteSession: async () => {},
    runExplain: async () => {},
    submitFollowUp: async () => {},
    updateAssistantTextMessage: async () => {},
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
    explainResult: result,
    appliedContexts: [],
  });
}

describe('AiWorkbenchPane compact surfaces', () => {
  it('renders a compact explain-only shell and can reveal history/context drawers', async () => {
    const service = createService('review-dialog-sidecar');
    const wrapper = mount(AiWorkbenchPane, { props: { service } });

    expect(wrapper.find('.ai-chat--compact').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('AI 导师');
    expect(wrapper.text()).not.toContain('AI 辅助制卡');
    expect(wrapper.text()).toContain('解释此内容');
    expect((wrapper.find('.ai-chat__title-input').element as HTMLInputElement).value).toBe('幂函数 · AI 会话');

    await wrapper.findAll('.ai-chat__icon-button')[0]!.trigger('click');
    await nextTick();
    expect(wrapper.find('.ai-chat__history').exists()).toBe(true);

    await wrapper.findAll('.ai-chat__icon-button')
      .find((button) => (button.attributes('title') || '').includes('查看上下文'))!
      .trigger('click');
    await nextTick();
    expect(wrapper.find('.ai-chat__context').exists()).toBe(true);
    expect(wrapper.text()).toContain('当前队列');
    expect(wrapper.text()).toContain('神经漫游');
  });

  it('keeps the standalone surface clean and explanation-first', () => {
    const service = createService('standalone-dialog');
    const wrapper = mount(AiWorkbenchPane, { props: { service } });

    expect(wrapper.find('.ai-chat--compact').exists()).toBe(false);
    expect(wrapper.text()).toContain('AI 解释卡片');
    expect(wrapper.text()).toContain('Use Context');
    expect(wrapper.text()).not.toContain('AI 导师');
    expect(wrapper.text()).not.toContain('AI 辅助制卡');
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

    service.setContextPanelOpen(true);
    const wrapper = mount(AiWorkbenchPane, { props: { service } });
    await nextTick();

    expect(wrapper.text()).toContain('当前路径位置');
    expect(wrapper.text()).toContain('4/9');
  });

  it('renders explain results as assistant sections', () => {
    const service = createService('review-dialog-sidecar');
    pushExplainMessage(service, {
      workingDefinition: '抓住概念本质的短定义',
      whatItTests: '这张卡真正测试的是定义边界',
      whyItsTricky: '容易和相近概念混淆',
      connections: ['它和上位概念相关', '它和相邻概念形成辨析对'],
      triggers: ['看到相似表述时要想起它', '遇到这个应用场景时要调用它'],
      cardIdeas: ['可以补一张辨析题'],
      rawContent: '',
    });

    const wrapper = mount(AiWorkbenchPane, { props: { service } });

    expect(wrapper.text()).toContain('工作定义');
    expect(wrapper.text()).toContain('抓住概念本质的短定义');
    expect(wrapper.text()).toContain('这张卡在考什么');
    expect(wrapper.text()).toContain('为什么容易错');
    expect(wrapper.text()).toContain('它和现有知识网络的连接');
    expect(wrapper.text()).toContain('下次什么时候该想起它');
  });

  it('shows composer context chips and assistant edit actions in the chat shell', () => {
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
    service.state.threads.explain.messages.push({
      id: 'assistant-text-1',
      view: 'explain',
      kind: 'assistant-text',
      content: '这里有一段 **Markdown** 回复。',
      createdAt: Date.now(),
      sourceContent: '这里有一段 **Markdown** 回复。',
      appliedContexts: [],
    });

    const wrapper = mount(AiWorkbenchPane, { props: { service } });

    expect(wrapper.text()).toContain('Use Context');
    expect(wrapper.text()).toContain('手工材料');
    expect(wrapper.text()).toContain('编辑');
  });

  it('falls back to legacy alias keys when rendering persisted explain results', () => {
    const service = createService('review-dialog-sidecar');
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

    const wrapper = mount(AiWorkbenchPane, { props: { service } });

    expect(wrapper.text()).toContain('旧键定义');
    expect(wrapper.text()).toContain('旧键考点');
    expect(wrapper.text()).toContain('旧键混淆边界');
    expect(wrapper.text()).toContain('旧键知识连接');
    expect(wrapper.text()).toContain('旧键触发线索');
  });
});
