// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import { AI_CONCEPT_COACH_SKILL_ID, AI_CONCEPT_COACH_TAB_IDS } from '@/types/ai';
import type {
  AIExplainResult,
  AIWorkbenchState,
  AIViewSessionState,
  AIWorkbenchSurface,
} from '@/types/ai';
import AiWorkbenchPane from '../AiWorkbenchPane.vue';

const DEFAULT_CONCEPT_COACH_PROMPT = '请基于当前材料，完成 AI 理解与制卡：先解释清楚，再生成可自测的候选卡。';

const CONCEPT_COACH_TABS = [
  { id: 'working-definition', title: '工作定义', emptyHint: '先抓住这个概念最可用的 1-2 句话。' },
  { id: 'perspectives', title: '多视角理解', emptyHint: '从特性、辨析、整体、因果和意义五个角度理解。' },
  { id: 'integrated-understanding', title: '整合理解', emptyHint: '把分散视角压缩成能复述、能辨析、能应用的理解。' },
  { id: 'self-test-cards', title: '自测卡片', emptyHint: '把理解转成可回忆、可编辑、可选择的候选问答卡。' },
  { id: 'real-world-triggers', title: '现实触发器', emptyHint: '找到以后该想起这个概念的真实场景。' },
] as const;

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
    activeSkillId: AI_CONCEPT_COACH_SKILL_ID,
    activeTabId: 'working-definition',
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
    runStatus: null,
    error: null,
    failureDiagnostic: null,
    skillResults: { [AI_CONCEPT_COACH_SKILL_ID]: null },
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
    legacyNotice: null,
  });

  const service = {
    state,
    setActiveView() {},
    setActiveTab(tabId: string) {
      state.activeTabId = tabId as never;
    },
    setHistoryPanelOpen(open: boolean) {
      state.historyPanelOpen = open;
    },
    setContextPanelOpen(open: boolean) {
      state.contextPanelOpen = open;
    },
    getCurrentModelLabel: () => 'test-model',
    getSkillTabs: () => CONCEPT_COACH_TABS,
    getSkillTitle: () => 'AI 理解与制卡',
    getSkillBrief: () => '理解这份材料，并生成可自测的候选卡',
    getPrimaryActionLabel: () => '理解并制卡',
    getDefaultUserPrompt: () => DEFAULT_CONCEPT_COACH_PROMPT,
    getActiveTabDescriptor: () => CONCEPT_COACH_TABS.find((tab) => tab.id === state.activeTabId) || CONCEPT_COACH_TABS[0],
    hasStructuredResult: () => Boolean(state.explainResult),
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
    submitExplainPrompt: async () => {},
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
    expect(wrapper.find('.ai-chat__headline').text()).toBe('AI 理解与制卡');
    expect(wrapper.find('.ai-chat__brand').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('AI 导师');
    expect(wrapper.text()).not.toContain('AI 辅助制卡');
    expect(wrapper.text()).toContain('理解这份材料，并生成可自测的候选卡');
    expect(wrapper.text()).toContain('理解并制卡');
    expect(wrapper.find('.ai-chat__title-input').exists()).toBe(false);

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
    expect(wrapper.text()).toContain('AI 理解与制卡');
    expect(wrapper.text()).toContain('展开输入框');
    expect(wrapper.text()).not.toContain('Use Context');
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

  it('shows composer context chips, compact composer actions, and assistant edit actions in the chat shell', () => {
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

    expect(wrapper.find('.ai-chat__composer-plus').exists()).toBe(true);
    expect(wrapper.text()).toContain('展开输入框');
    expect(wrapper.text()).toContain('手工材料');
    expect(wrapper.text()).toContain('编辑');
    expect(wrapper.find('.ai-chat__composer-send').exists()).toBe(true);
  });

  it('fills the default concept-coach prompt from the empty-state button without running the model', async () => {
    const service = createService('review-dialog-sidecar');
    const runActiveSkill = vi.fn(async () => {});
    const runExplain = vi.fn(async () => {});
    service.runActiveSkill = runActiveSkill as never;
    service.runExplain = runExplain as never;

    const wrapper = mount(AiWorkbenchPane, {
      attachTo: document.body,
      props: { service },
    });

    await wrapper.find('.ai-chat__primary-button').trigger('click');
    await nextTick();

    const textarea = wrapper.find('.ai-chat__composer-input').element as HTMLTextAreaElement;
    expect(textarea.value).toBe(DEFAULT_CONCEPT_COACH_PROMPT);
    expect(document.activeElement).toBe(textarea);
    expect(runActiveSkill).not.toHaveBeenCalled();
    expect(runExplain).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('does not overwrite existing composer text when the empty-state button is clicked again', async () => {
    const service = createService('review-dialog-sidecar');
    const wrapper = mount(AiWorkbenchPane, {
      attachTo: document.body,
      props: { service },
    });
    const textarea = wrapper.find('.ai-chat__composer-input');

    await textarea.setValue('我已经写好的指令');
    await wrapper.find('.ai-chat__primary-button').trigger('click');
    await nextTick();

    expect((textarea.element as HTMLTextAreaElement).value).toBe('我已经写好的指令');

    wrapper.unmount();
  });

  it('renders a transient running assistant bubble when the service has a visible run status', () => {
    const service = createService('review-dialog-sidecar');
    service.state.runStatus = {
      mode: 'full-run',
      skillId: AI_CONCEPT_COACH_SKILL_ID,
      tabIds: [...AI_CONCEPT_COACH_TAB_IDS],
      activeTabId: 'working-definition',
      title: 'AI 正在理解材料',
      description: '正在生成 5 个阶段：工作定义、多视角理解、整合理解、自测卡片、现实触发器',
      startedAt: Date.now(),
    };

    const wrapper = mount(AiWorkbenchPane, { props: { service } });

    expect(wrapper.find('.ai-chat__bubble--pending').exists()).toBe(true);
    expect(wrapper.text()).toContain('AI 正在理解材料');
    expect(wrapper.text()).toContain('正在生成 5 个阶段');
    expect(wrapper.find('.ai-chat__empty-state').exists()).toBe(false);
  });

  it('shows the raw failure diagnostic in the error banner', () => {
    const service = createService('review-dialog-sidecar');
    service.state.error = 'AI 请求已发出，但模型返回了空正文。';
    service.state.failureDiagnostic = {
      content: '{\n  "choices": []\n}',
    };

    const wrapper = mount(AiWorkbenchPane, { props: { service } });

    expect(wrapper.text()).toContain('查看原始响应');
    expect(wrapper.find('.ai-chat__banner-pre').text()).toContain('"choices"');
  });

  it('renders a partial structured-result notice above salvaged perspectives content', () => {
    const service = createService('review-dialog-sidecar');
    service.setActiveTab('perspectives');
    service.state.threads.explain.messages.push({
      id: 'perspectives-message-1',
      tabId: 'perspectives',
      view: 'explain',
      kind: 'assistant-result',
      createdAt: Date.now(),
      rawContent: JSON.stringify({ compare: { points: ['Contrast A'] } }),
      conceptCoachResult: null,
      tabResult: {
        traits: { title: '特性和倾向', keyPoints: [] },
        contrasts: { title: '辨析异同', keyPoints: ['Contrast A'] },
        partsAndWhole: { title: '部分和整体', keyPoints: [] },
        causality: { title: '因果关系', keyPoints: [] },
        significance: { title: '意义和影响', keyPoints: [] },
      },
      normalizationDiagnostic: {
        status: 'partial',
        missingSections: ['traits', 'partsAndWhole', 'causality', 'significance'],
        rawShape: 'object:compare',
      },
      appliedContexts: [],
    } as never);

    const wrapper = mount(AiWorkbenchPane, { props: { service } });

    expect(wrapper.text()).toContain('模型只返回了部分结构');
    expect(wrapper.text()).toContain('特性和倾向');
    expect(wrapper.text()).toContain('Contrast A');
  });

  it('renders an empty structured-result notice instead of an empty assistant bubble', () => {
    const service = createService('review-dialog-sidecar');
    service.setActiveTab('integrated-understanding');
    service.state.threads.explain.messages.push({
      id: 'integrated-message-1',
      tabId: 'integrated-understanding',
      view: 'explain',
      kind: 'assistant-result',
      createdAt: Date.now(),
      rawContent: JSON.stringify({ integratedUnderstanding: {} }),
      conceptCoachResult: null,
      tabResult: {
        essence: '',
        notWhat: [],
        capabilities: [],
      },
      normalizationDiagnostic: {
        status: 'empty',
        missingSections: ['essence', 'notWhat', 'capabilities'],
        rawShape: 'object:integratedUnderstanding',
      },
      appliedContexts: [],
    } as never);

    const wrapper = mount(AiWorkbenchPane, { props: { service } });

    expect(wrapper.text()).toContain('当前阶段没有识别到可展示的结构字段');
    expect(wrapper.text()).toContain('原始形状');
  });

  it('allows first-turn custom text sending with Ctrl/Cmd+Enter and routes it to submitExplainPrompt', async () => {
    const service = createService('review-dialog-sidecar');
    const submitExplainPrompt = vi.fn(async () => {});
    const submitFollowUp = vi.fn(async () => {});
    service.submitExplainPrompt = submitExplainPrompt as never;
    service.submitFollowUp = submitFollowUp as never;

    const wrapper = mount(AiWorkbenchPane, { props: { service } });
    const textarea = wrapper.find('.ai-chat__composer-input');

    await textarea.setValue('请解释这张卡的考点');
    await textarea.trigger('keydown', { key: 'Enter' });
    expect(submitExplainPrompt).not.toHaveBeenCalled();

    expect(wrapper.find('.ai-chat__composer-send').attributes('disabled')).toBeUndefined();

    await textarea.trigger('keydown', { key: 'Enter', ctrlKey: true });

    expect(submitExplainPrompt).toHaveBeenCalledWith('请解释这张卡的考点');
    expect(submitFollowUp).not.toHaveBeenCalled();
  });

  it('opens the context provider menu from the plus button and closes it on outside click, escape, and selection', async () => {
    const service = createService('review-dialog-sidecar');
    const attachContextFromProvider = vi.fn(async () => null);
    service.getAvailableContextProviders = () => [
      {
        key: 'manual-text',
        title: '手工材料',
        description: '粘贴一段补充材料，只在下一次发送时生效。',
        inputKind: 'none',
      },
      {
        key: 'current-document',
        title: '当前文档',
        description: '读取当前活动文档。',
        inputKind: 'none',
      },
    ] as never;
    service.attachContextFromProvider = attachContextFromProvider as never;
    const wrapper = mount(AiWorkbenchPane, { props: { service } });

    await wrapper.find('.ai-chat__composer-plus').trigger('click');
    await nextTick();
    expect(wrapper.find('.ai-chat__context-menu').exists()).toBe(true);

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();
    expect(wrapper.find('.ai-chat__context-menu').exists()).toBe(false);

    await wrapper.find('.ai-chat__composer-plus').trigger('click');
    await nextTick();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(wrapper.find('.ai-chat__context-menu').exists()).toBe(false);

    await wrapper.find('.ai-chat__composer-plus').trigger('click');
    await nextTick();
    await wrapper.find('.ai-chat__context-menu-item').trigger('click');
    await nextTick();
    expect(attachContextFromProvider).toHaveBeenCalledWith('manual-text');
    expect(wrapper.find('.ai-chat__context-menu').exists()).toBe(false);
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
