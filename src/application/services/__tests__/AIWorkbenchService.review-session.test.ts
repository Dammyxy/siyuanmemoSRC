import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import type { AISettings } from '@/types/settings';
import type { AIWorkbenchSessionRecord } from '@/types/ai';

function createAISettings(): AISettings {
  return {
    enabled: true,
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    model: 'test-model',
    timeoutMs: 30000,
    temperature: 0.2,
    defaultOutputLanguage: 'zh-CN',
    promptContractVersion: 2,
    prompts: {
      explain: {
        run: 'Explain prompt',
        followUp: 'Explain follow-up prompt',
      },
    },
  };
}

function createCard(cardId: string, blockId: string, frontId: string, backId: string, sourceId: string) {
  return {
    id: cardId,
    xiuyuanID: `x-${cardId}`,
    blockId,
    deckId: 'deck-1',
    due: Date.now(),
    stability: 1,
    difficulty: 1,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: 0,
    priority: 10,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    extractedFrom: sourceId,
    meta: {
      frontBlockIDs: [frontId],
      backBlockIDs: [backId],
    },
  } as const;
}

type TestBlockContent = {
  content: string;
  type?: string;
  markdown?: string;
  copyStdMarkdown?: string;
};

const contentMap = new Map<string, TestBlockContent>([
  ['front-1', { content: 'Front A' }],
  ['back-1', { content: 'Back A' }],
  ['source-1', { content: 'Source A' }],
  ['card-block-1', { content: 'Card A' }],
  ['front-2', { content: 'Front B' }],
  ['back-2', { content: 'Back B' }],
  ['source-2', { content: 'Source B' }],
  ['card-block-2', { content: 'Card B' }],
]);

const siyuanRows = Array.from(contentMap.entries()).map(([id, value]) => ({
  id,
  parent_id: null,
  root_id: `root-${id}`,
  type: value.type || 'p',
  subtype: '',
  content: value.content,
  markdown: value.markdown || value.content,
  hpath: `/doc/${id}`,
}));

function createSiyuanPort(rows = siyuanRows) {
  return {
    sql: vi.fn(async () => rows),
    getBlockText: vi.fn(async (blockId: string) => contentMap.get(blockId)?.content || ''),
    copyStdMarkdown: vi.fn(async (blockId: string) => contentMap.get(blockId)?.copyStdMarkdown || ''),
    ensureTodayDailyNote: vi.fn(async () => 'daily-doc-1'),
    setBlockAttrs: vi.fn(),
    getNotebookConf: vi.fn(),
    renderTemplate: vi.fn(),
    createDocWithMarkdown: vi.fn(),
    insertBlockAfter: vi.fn(),
    appendBlockUnderParent: vi.fn(),
    updateBlockMarkdown: vi.fn(async (blockId: string) => blockId),
    deleteBlock: vi.fn(),
  };
}

function createSessionStore() {
  const records = new Map<string, AIWorkbenchSessionRecord>();

  const buildSummary = (record: AIWorkbenchSessionRecord) => ({
    id: record.id,
    title: record.title,
    source: record.source,
    sourceReviewSessionId: record.sourceReviewSessionId,
    surface: record.surface,
    contextSignature: record.contextSignature,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastActiveView: 'explain' as const,
    activeViews: record.threads.explain.messages.length > 0 ? ['explain' as const] : [],
    messageCount: record.threads.explain.messages.length,
  });

  return {
    listSummaries: vi.fn(async () => (
      Array.from(records.values())
        .map((record) => buildSummary(record))
        .sort((left, right) => right.updatedAt - left.updatedAt)
    )),
    loadSession: vi.fn(async (sessionId: string) => {
      const record = records.get(sessionId);
      return record ? JSON.parse(JSON.stringify(record)) : null;
    }),
    saveSession: vi.fn(async (record: AIWorkbenchSessionRecord) => {
      const cloned = JSON.parse(JSON.stringify(record));
      records.set(cloned.id, cloned);
      return JSON.parse(JSON.stringify(cloned));
    }),
    renameSession: vi.fn(async (sessionId: string, title: string) => {
      const record = records.get(sessionId);
      if (!record) {
        return null;
      }
      record.title = title;
      record.updatedAt = Date.now();
      return JSON.parse(JSON.stringify(record));
    }),
    deleteSession: vi.fn(async (sessionId: string) => {
      records.delete(sessionId);
    }),
  };
}

function createService(options?: {
  llmChat?: ReturnType<typeof vi.fn>;
  siyuanPort?: ReturnType<typeof createSiyuanPort>;
  sessionStore?: ReturnType<typeof createSessionStore>;
}) {
  return new AIWorkbenchService({
    getAISettings: () => createAISettings(),
    cardContentQueryService: {
      getBlockContentsWithType: vi.fn(async (blockIds: string[]) => new Map(
        blockIds.map((id) => [id, contentMap.get(id) || { content: '' }]),
      )),
    } as never,
    siyuanPort: options?.siyuanPort || createSiyuanPort(),
    llmPort: {
      chat: options?.llmChat || vi.fn(),
    },
    sessionStore: options?.sessionStore || createSessionStore(),
  });
}

describe('AIWorkbenchService review-session behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts a new session when the review card changes and keeps the previous explain thread in history', async () => {
    const llmChat = vi.fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          workingDefinition: 'Definition A',
          whatItTests: 'Test A',
          whyItsTricky: 'Tricky A',
          connections: ['Connection A'],
          triggers: ['Trigger A'],
          cardIdeas: ['Idea A'],
        }),
        raw: {},
      })
      .mockResolvedValueOnce({
        content: 'Follow-up answer',
        raw: {},
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          workingDefinition: 'Definition B',
          whatItTests: 'Test B',
          whyItsTricky: 'Tricky B',
          connections: ['Connection B'],
          triggers: ['Trigger B'],
          cardIdeas: ['Idea B'],
        }),
        raw: {},
      });

    const service = createService({ llmChat });
    const cardA = createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1');
    const cardB = createCard('card-b', 'card-block-2', 'front-2', 'back-2', 'source-2');

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: cardA as never,
      revealed: true,
    });
    await service.runExplain();
    await service.submitFollowUp('为什么这张卡会出错？');

    const firstSessionId = service.state.sessionId;

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: cardB as never,
      revealed: true,
    });

    expect(service.state.context?.currentCard?.cardId).toBe('card-b');
    expect(service.state.sessionId).not.toBe(firstSessionId);
    expect(service.state.explainResult).toBeNull();
    expect(service.getFollowUps('explain')).toHaveLength(0);
    expect(service.state.sessionHistory).toHaveLength(2);

    await service.runExplain();
    expect(service.state.explainResult?.workingDefinition).toBe('Definition B');

    await service.openSession(firstSessionId!);
    expect(service.state.context?.currentCard?.cardId).toBe('card-a');
    expect(service.getFollowUps('explain')).toHaveLength(2);
  });

  it('includes attached manual context in the explain and follow-up requests', async () => {
    const llmChat = vi.fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          workingDefinition: 'Definition A',
          whatItTests: 'Test A',
          whyItsTricky: 'Tricky A',
          connections: ['Connection A'],
          triggers: ['Trigger A'],
          cardIdeas: ['Idea A'],
        }),
        raw: {},
      })
      .mockResolvedValueOnce({
        content: 'Follow-up answer',
        raw: {},
      });

    const service = createService({ llmChat });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });

    await service.attachContextFromProvider('manual-text', '额外参考：这段材料来自旁边的笔记。');
    await service.runExplain();

    const explainPayload = JSON.parse(llmChat.mock.calls[0][0].messages[1].content);
    expect(explainPayload.attachedContexts).toHaveLength(1);
    expect(explainPayload.attachedContexts[0].content).toContain('旁边的笔记');

    await service.attachContextFromProvider('manual-text', '第二段临时材料');
    await service.submitFollowUp('继续展开');

    const followUpPayload = JSON.parse(llmChat.mock.calls[1][0].messages[1].content);
    expect(followUpPayload.attachedContexts).toHaveLength(1);
    expect(followUpPayload.attachedContexts[0].content).toContain('第二段临时材料');
  });

  it('supports first-turn custom explain prompts without polluting the follow-up transcript', async () => {
    const llmChat = vi.fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          workingDefinition: 'Definition A',
          whatItTests: 'Test A',
          whyItsTricky: 'Tricky A',
          connections: ['Connection A'],
          triggers: ['Trigger A'],
          cardIdeas: ['Idea A'],
        }),
        raw: {},
      })
      .mockResolvedValueOnce({
        content: 'Follow-up answer',
        raw: {},
      });

    const service = createService({ llmChat });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });

    await service.submitExplainPrompt('解释此内容');

    expect(service.state.threads.explain.messages[0]).toMatchObject({
      kind: 'user',
      purpose: 'initial-explain',
      content: '解释此内容',
    });
    expect(service.state.threads.explain.messages[1]).toMatchObject({
      kind: 'assistant-result',
    });
    expect(service.getFollowUps('explain')).toEqual([]);

    const explainPayload = JSON.parse(llmChat.mock.calls[0][0].messages[1].content);
    expect(explainPayload.userPrompt).toBe('解释此内容');

    await service.submitFollowUp('继续展开');

    expect(service.getFollowUps('explain')).toHaveLength(2);
    expect(service.getFollowUps('explain')[0]).toMatchObject({
      role: 'user',
      content: '继续展开',
    });
  });

  it('normalizes legacy make-cards opens to explain and auto-runs explain', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        workingDefinition: 'Definition A',
        whatItTests: 'Test A',
        whyItsTricky: 'Tricky A',
        connections: ['Connection A'],
        triggers: ['Trigger A'],
        cardIdeas: ['Idea A'],
      }),
      raw: {},
    });

    const service = createService({ llmChat });

    await service.open({
      view: 'make-cards' as never,
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
      autoRun: true,
    });

    expect(service.state.activeView).toBe('explain');
    expect(service.state.explainResult?.workingDefinition).toBe('Definition A');
    expect(llmChat).toHaveBeenCalledTimes(1);
  });

  it('maps legacy make-cards session records back to explain on openSession', async () => {
    const sessionStore = createSessionStore();
    const service = createService({ sessionStore });

    await sessionStore.saveSession({
      ...({
        id: 'legacy-session',
        title: 'Legacy Session',
        source: 'review',
        sourceReviewSessionId: 'review-session-1',
        surface: 'review-dialog-sidecar',
        contextSignature: 'ctx-legacy',
        createdAt: 1,
        updatedAt: 2,
        lastActiveView: 'make-cards',
        activeViews: [],
        messageCount: 0,
        context: {
          source: 'review',
          selectedBlockIds: ['block-a'],
          blocks: [{ blockId: 'block-a', text: 'content' }],
          queueType: 'retrieval',
          queueProgress: null,
          currentCard: null,
          currentCardRaw: null,
          neuralBatch: null,
        },
        threads: {
          explain: {
            view: 'explain',
            messages: [],
            resultContextSignature: null,
            stale: false,
            staleReason: null,
          },
        },
      } as unknown as AIWorkbenchSessionRecord),
    });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });
    await service.openSession('legacy-session');

    expect(service.state.activeView).toBe('explain');
  });
});
