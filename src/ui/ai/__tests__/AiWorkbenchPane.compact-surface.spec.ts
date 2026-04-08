// @vitest-environment happy-dom

import { mount } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';
import { describe, expect, it } from 'vitest';
import type { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import type { AIWorkbenchState, AITaskType, AIViewSessionState, AIWorkbenchSurface } from '@/types/ai';
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

function createService(surface: AIWorkbenchSurface): AIWorkbenchService {
  const state = reactive<AIWorkbenchState>({
    sessionId: surface === 'standalone-dialog' ? null : 'review-session-1',
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
        backText: '幂函数',
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
            reason: '轨道中心节点',
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
    isLoading: false,
    error: null,
    tutorResult: null,
    explainResult: null,
    makeCardsResult: null,
    makeCardMode: 'qa',
    requestBatchSummary: false,
    history: [],
  });

  const service = {
    state,
    setActiveView(view: AITaskType) {
      state.activeView = view;
    },
    setMakeCardMode(mode: AIWorkbenchState['makeCardMode']) {
      state.makeCardMode = mode;
    },
    runTutor: async () => {},
    rerunTutorWithSummary: async () => {},
    runExplain: async () => {},
    runMakeCards: async () => {},
    runActiveView: async () => {},
    saveSelectedCandidatesToDailyNote: async () => {},
    createSelectedCandidates: async () => {},
    getDraftStorageMode: () => 'daily-note' as const,
    submitFollowUp: async () => {},
    toggleCandidateDiscarded: () => {},
    updateCandidateTitle: () => {},
    updateCandidateTemplateId: () => {},
    updateCandidateField: () => {},
    getFollowUps: () => state.viewState[state.activeView].followUps,
    getFollowUpDisabledReason: () => null,
  };

  return service as unknown as AIWorkbenchService;
}

describe('AiWorkbenchPane compact surfaces', () => {
  it('renders the review compact shell with hidden details by default and keeps details open across view switches', async () => {
    const service = createService('review-dialog-sidecar');
    const wrapper = mount(AiWorkbenchPane, {
      props: {
        service,
      },
    });

    expect(wrapper.find('.ai-workbench__sidebar').exists()).toBe(false);
    expect(wrapper.find('.ai-workbench__hero').exists()).toBe(false);
    expect(wrapper.find('.ai-workbench__compact-switcher').exists()).toBe(true);
    expect(wrapper.find('.ai-workbench__compact-message-card').exists()).toBe(true);
    expect(wrapper.find('.ai-workbench__compact-details-tray').exists()).toBe(false);
    expect(wrapper.find('.ai-workbench__details-toggle').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('复习中');
    expect(wrapper.text()).not.toContain('12/20');
    expect(wrapper.text()).not.toContain('答案隐藏中');

    await wrapper.find('.ai-workbench__details-toggle').trigger('click');
    await nextTick();

    expect(wrapper.find('.ai-workbench__compact-details-tray').exists()).toBe(true);
    expect(wrapper.text()).toContain('阅读型卡片');
    expect(wrapper.text()).toContain('当前队列');
    expect(wrapper.text()).toContain('神经漫游');
    expect(wrapper.text()).toContain('本次复习进度');
    expect(wrapper.text()).toContain('已复习 12/20');
    expect(wrapper.text()).toContain('当前轨道轮次');
    expect(wrapper.text()).toContain('1/2');
    expect(wrapper.text()).toContain('指数为定值');
    expect(wrapper.text()).not.toContain('答案隐藏中');

    if (service.state.context?.neuralBatch?.kind === 'orbit-round') {
      service.state.context.neuralBatch.viewedCount = 38;
      service.state.context.neuralBatch.currentNodeId = 'node-2';
    }
    await nextTick();

    expect(wrapper.text()).toContain('2/2');
    expect(wrapper.text()).not.toContain('38/5');

    await wrapper.findAll('.ai-workbench__compact-switch')[1].trigger('click');
    await nextTick();

    expect(service.state.activeView).toBe('explain');
    expect(wrapper.find('.ai-workbench__compact-details-tray').exists()).toBe(true);
    expect(wrapper.text()).toContain('AI 解释卡片');
  });

  it('keeps the full sidebar shell for standalone dialog surface', () => {
    const service = createService('standalone-dialog');
    const wrapper = mount(AiWorkbenchPane, {
      props: {
        service,
      },
    });

    expect(wrapper.find('.ai-workbench__sidebar').exists()).toBe(true);
    expect(wrapper.find('.ai-workbench__hero').exists()).toBe(true);
    expect(wrapper.find('.ai-workbench__compact-switcher').exists()).toBe(false);
    expect(wrapper.text()).toContain('当前队列');
    expect(wrapper.text()).toContain('神经漫游');
    expect(wrapper.text()).toContain('本次复习进度');
    expect(wrapper.text()).toContain('已复习 12/20');
    expect(wrapper.text()).toContain('当前轨道轮次');
    expect(wrapper.text()).not.toContain('当前批次进度');
  });

  it('renders hyperspace path position instead of batch progress on compact details', async () => {
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

    await wrapper.find('.ai-workbench__details-toggle').trigger('click');
    await nextTick();

    expect(wrapper.text()).toContain('当前路径位置');
    expect(wrapper.text()).toContain('4/9');
    expect(wrapper.text()).not.toContain('当前批次进度');
  });

  it('renders the upgraded explain schema with working definition and triggers', async () => {
    const service = createService('review-dialog-sidecar');
    service.state.activeView = 'explain';
    service.state.explainResult = {
      workingDefinition: '抓住概念本质的短定义',
      whatItTests: '这张卡真正测试的是定义边界',
      whyItsTricky: '容易和相近概念混淆',
      connections: ['它和上位概念相关', '它和相邻概念形成辨析对'],
      triggers: ['看到相似表述时要想起它', '遇到这个应用场景时要调用它'],
      cardIdeas: ['可以补一张辨析题'],
      rawContent: '',
    };

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
    expect(wrapper.text()).not.toContain('下次遇到相似材料怎么识别');
  });
});
