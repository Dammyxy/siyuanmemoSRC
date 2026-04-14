import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import type { AISettings } from '@/types/settings';

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
      tutor: {
        run: 'Tutor prompt',
        followUp: 'Tutor follow-up prompt',
      },
      explain: {
        run: 'Explain prompt',
        followUp: 'Explain follow-up prompt',
      },
      cardCandidate: {
        run: 'Card candidate prompt',
        followUp: 'Card candidate follow-up prompt',
      },
      cardCandidateCdf: {
        run: 'CDF card candidate prompt',
        followUp: 'CDF card candidate follow-up prompt',
      },
    },
    draftStorage: {
      mode: 'daily-note',
      notebookId: '',
      targetBlockId: '',
    },
  };
}

function createCard(
  cardId: string,
  blockId: string,
  frontId: string,
  backId: string,
  sourceId: string,
  type: 'item' | 'topic' | 'concept' | 'descriptor' = 'item',
) {
  return {
    id: cardId,
    cardID: cardId,
    blockId,
    blockID: blockId,
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
    type,
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
  };
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
  [
    'doc-source-1',
    {
      content: '[3]这个概念在 80 年',
      type: 'd',
      markdown: '[3]这个概念在 80 年',
      copyStdMarkdown: '# [3]这个概念在 80 年\n\n这个概念在 80 年代末由 Allan Collins、John Seely Brown 和 Susan Newman 提出。',
    },
  ],
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

function createDraftService() {
  return {
    saveCandidates: vi.fn(),
    markDraftStatus: vi.fn(),
  };
}

function createSessionStore() {
  const records = new Map<string, any>();

  const buildSummary = (record: any) => {
    const activeViews = (['tutor', 'explain', 'make-cards'] as const).filter((view) => (
      Array.isArray(record.threads?.[view]?.messages) && record.threads[view].messages.length > 0
    ));
    const messageCount = activeViews.reduce((count, view) => count + record.threads[view].messages.length, 0);
    return {
      id: record.id,
      title: record.title,
      source: record.source,
      sourceReviewSessionId: record.sourceReviewSessionId,
      surface: record.surface,
      contextSignature: record.contextSignature,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      lastActiveView: record.lastActiveView,
      activeViews,
      messageCount,
    };
  };

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
    saveSession: vi.fn(async (record: any) => {
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
  getXiuyuanApplicationService?: ReturnType<typeof vi.fn>;
  siyuanPort?: ReturnType<typeof createSiyuanPort>;
  draftService?: ReturnType<typeof createDraftService>;
  sessionStore?: ReturnType<typeof createSessionStore>;
}) {
  return new AIWorkbenchService({
    getAISettings: () => createAISettings(),
    cardContentQueryService: {
      getBlockContentsWithType: vi.fn(async (blockIds: string[]) => new Map(
        blockIds.map((id) => [id, contentMap.get(id) || { content: '' }]),
      )),
    } as never,
    getXiuyuanApplicationService: options?.getXiuyuanApplicationService || vi.fn(),
    siyuanPort: options?.siyuanPort || createSiyuanPort(),
    draftService: options?.draftService || createDraftService(),
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

  it('starts a new session when the review card changes and keeps the previous follow-up thread in history', async () => {
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
      view: 'explain',
      queueProgress: {
        queueType: 'retrieval',
        queueLabel: '提取练习',
        completed: 1,
        remaining: 9,
        total: 10,
      },
      currentCard: cardA as never,
      revealed: true,
    });

    await service.runExplain();

    expect(service.state.explainResult?.workingDefinition).toBe('Definition A');
    expect(service.state.explainResult?.whatItTests).toBe('Test A');
    expect(service.state.explainResult?.triggers).toEqual(['Trigger A']);
    expect(service.state.viewState.explain.stale).toBe(false);
    expect(service.getFollowUpDisabledReason('explain')).toBeNull();

    await service.submitFollowUp('为什么这张卡会出错？');

    expect(service.getFollowUps('explain')).toHaveLength(2);
    expect(service.getFollowUps('explain')[1]).toMatchObject({
      role: 'assistant',
      content: 'Follow-up answer',
    });
    const firstSessionId = service.state.sessionId;
    expect(firstSessionId).toBeTruthy();

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      view: 'explain',
      queueProgress: {
        queueType: 'retrieval',
        queueLabel: '提取练习',
        completed: 2,
        remaining: 8,
        total: 10,
      },
      currentCard: cardB as never,
      revealed: true,
    });

    expect(service.state.context?.currentCard?.cardId).toBe('card-b');
    expect(service.state.sessionId).not.toBe(firstSessionId);
    expect(service.state.explainResult).toBeNull();
    expect(service.getFollowUps('explain')).toHaveLength(0);
    expect(service.state.sessionHistory).toHaveLength(2);
    await expect(service.submitFollowUp('继续解释')).rejects.toThrow('请先运行一次当前视图');

    await service.runExplain();

    expect(service.state.explainResult?.workingDefinition).toBe('Definition B');
    expect(service.state.explainResult?.whatItTests).toBe('Test B');
    expect(service.state.explainResult?.triggers).toEqual(['Trigger B']);
    await service.openSession(firstSessionId!);
    expect(service.state.context?.currentCard?.cardId).toBe('card-a');
    expect(service.getFollowUps('explain')).toHaveLength(2);
    expect(service.getFollowUpDisabledReason('explain')).toBeNull();
  });

  it('treats topic cards as read-mode cards and allows explain before reveal', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        workingDefinition: 'Topic definition',
        whatItTests: 'Test topic',
        whyItsTricky: 'Tricky topic',
        connections: ['Connection topic'],
        triggers: ['Trigger topic'],
        cardIdeas: ['Idea topic'],
      }),
      raw: {},
    });

    const service = createService({ llmChat });

    const topicCard = createCard('card-topic', 'card-block-1', 'front-1', 'back-1', 'source-1', 'topic');

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-topic',
      view: 'explain',
      queueProgress: {
        queueType: 'neural-roam',
        queueLabel: '神经漫游',
        completed: 3,
        remaining: 2,
        total: 5,
      },
      currentCard: topicCard as never,
      revealed: false,
    });

    expect(service.state.context?.currentCard).toMatchObject({
      cardId: 'card-topic',
      cardType: 'topic',
      hasAnswerFace: false,
      explainRequiresReveal: false,
      reviewActionLabel: '下一张',
    });
    expect(service.state.context?.currentCard?.backText).toBe('');

    await expect(service.runExplain()).resolves.toBeUndefined();

    const payload = JSON.parse(llmChat.mock.calls[0][0].messages[1].content);
    expect(payload.context.currentCard.hasAnswerFace).toBe(false);
    expect(payload.context.currentCard.explainRequiresReveal).toBe(false);
    expect(payload.context.currentCard.roleDescription).toContain('阅读型');
    expect(payload.context.queueProgress).toEqual({
      queueType: 'neural-roam',
      queueLabel: '神经漫游',
      completed: 3,
      remaining: 2,
      total: 5,
    });
  });

  it('requests json_object for structured explain runs and accepts fenced JSON payloads', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: `\`\`\`json
{
  "workingDefinition": "Fenced definition",
  "whatItTests": "Fenced test",
  "whyItsTricky": "Fenced tricky",
  "connections": ["Fenced connection"],
  "triggers": ["Fenced trigger"],
  "cardIdeas": ["Fenced idea"]
}
\`\`\``,
      raw: {},
    });

    const service = createService({ llmChat });
    const card = createCard('card-fenced', 'card-block-1', 'front-1', 'back-1', 'source-1');

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-fenced',
      view: 'explain',
      currentCard: card as never,
      revealed: true,
    });

    await service.runExplain();

    expect(llmChat.mock.calls[0][0].responseFormat).toBe('json_object');
    expect(llmChat.mock.calls[0][0].messages[0].content).toContain('Explain prompt');
    expect(llmChat.mock.calls[0][0].messages[0].content).toContain('workingDefinition、whatItTests、whyItsTricky、connections、triggers、cardIdeas');
    expect(service.state.explainResult).toMatchObject({
      workingDefinition: 'Fenced definition',
      whatItTests: 'Fenced test',
      whyItsTricky: 'Fenced tricky',
      connections: ['Fenced connection'],
      triggers: ['Fenced trigger'],
      cardIdeas: ['Fenced idea'],
    });
  });

  it('normalizes legacy explain field aliases into the current explain result shape', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        workDefinition: 'Alias definition',
        testPoint: 'Alias test',
        confusionBoundary: 'Alias tricky',
        knowledgeNetwork: 'Alias connection',
        recallTrigger: 'Alias trigger',
      }),
      raw: {},
    });

    const service = createService({ llmChat });
    const card = createCard('card-alias', 'card-block-1', 'front-1', 'back-1', 'source-1');

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-alias',
      view: 'explain',
      currentCard: card as never,
      revealed: true,
    });

    await service.runExplain();

    expect(service.state.explainResult).toMatchObject({
      workingDefinition: 'Alias definition',
      whatItTests: 'Alias test',
      whyItsTricky: 'Alias tricky',
      connections: ['Alias connection'],
      triggers: ['Alias trigger'],
      cardIdeas: [],
    });
  });

  it('keeps follow-up chat requests freeform after the structured explain run', async () => {
    const llmChat = vi.fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          workingDefinition: 'Explain definition',
          whatItTests: 'Explain test',
          whyItsTricky: 'Explain tricky',
          connections: ['Explain connection'],
          triggers: ['Explain trigger'],
          cardIdeas: ['Explain idea'],
        }),
        raw: {},
      })
      .mockResolvedValueOnce({
        content: '这是追问回复',
        raw: {},
      });

    const service = createService({ llmChat });
    const card = createCard('card-follow-up', 'card-block-1', 'front-1', 'back-1', 'source-1');

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-follow-up-format',
      view: 'explain',
      currentCard: card as never,
      revealed: true,
    });

    await service.runExplain();
    await service.submitFollowUp('继续展开讲讲');

    expect(llmChat.mock.calls[0][0].responseFormat).toBe('json_object');
    expect(llmChat.mock.calls[1][0].responseFormat).toBeUndefined();
  });

  it('sends one-shot attached contexts with both structured runs and follow-ups, while keeping message snapshots', async () => {
    const llmChat = vi.fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          workingDefinition: 'With context definition',
          whatItTests: 'With context test',
          whyItsTricky: 'With context tricky',
          connections: ['With context connection'],
          triggers: ['With context trigger'],
          cardIdeas: ['With context idea'],
        }),
        raw: {},
      })
      .mockResolvedValueOnce({
        content: 'Follow-up answer with context',
        raw: {},
      });

    const service = createService({ llmChat });
    const card = createCard('card-attached', 'card-block-1', 'front-1', 'back-1', 'source-1');

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-attached-context',
      view: 'explain',
      currentCard: card as never,
      revealed: true,
    });

    await service.attachContextFromProvider('manual-text', '额外参考：这段材料来自旁边的笔记。');
    expect(service.state.composerContexts.items).toHaveLength(1);

    await service.runExplain();

    const structuredPayload = JSON.parse(llmChat.mock.calls[0][0].messages[1].content);
    expect(structuredPayload.attachedContexts).toEqual([
      expect.objectContaining({
        providerKey: 'manual-text',
        content: '额外参考：这段材料来自旁边的笔记。',
      }),
    ]);
    expect(service.state.composerContexts.items).toHaveLength(0);
    expect(service.state.threads.explain.messages[0]).toMatchObject({
      kind: 'assistant-result',
      appliedContexts: [
        expect.objectContaining({
          providerKey: 'manual-text',
        }),
      ],
    });

    await service.attachContextFromProvider('manual-text', '第二段临时材料');
    await service.submitFollowUp('继续展开');

    const followUpPayload = JSON.parse(llmChat.mock.calls[1][0].messages[1].content);
    expect(followUpPayload.attachedContexts).toEqual([
      expect.objectContaining({
        providerKey: 'manual-text',
        content: '第二段临时材料',
      }),
    ]);
    const threadMessages = service.state.threads.explain.messages;
    expect(threadMessages.find((message) => message.kind === 'user')).toMatchObject({
      attachedContexts: [
        expect.objectContaining({
          content: '第二段临时材料',
        }),
      ],
    });
    expect(threadMessages.find((message) => message.kind === 'assistant-text')).toMatchObject({
      appliedContexts: [
        expect.objectContaining({
          content: '第二段临时材料',
        }),
      ],
    });
    expect(service.state.composerContexts.items).toHaveLength(0);
  });

  it('persists local assistant edits and structured result edits without rerunning the model', async () => {
    const llmChat = vi.fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          workingDefinition: 'Original definition',
          whatItTests: 'Original test',
          whyItsTricky: 'Original tricky',
          connections: ['Original connection'],
          triggers: ['Original trigger'],
          cardIdeas: ['Original idea'],
        }),
        raw: {},
      })
      .mockResolvedValueOnce({
        content: 'Original assistant follow-up',
        raw: {},
      })
      .mockResolvedValueOnce({
        content: 'Second assistant follow-up',
        raw: {},
      });

    const service = createService({ llmChat });
    const card = createCard('card-local-edit', 'card-block-1', 'front-1', 'back-1', 'source-1');

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-local-edit',
      view: 'explain',
      currentCard: card as never,
      revealed: true,
    });

    await service.runExplain();
    const structuredMessage = service.state.threads.explain.messages.find((message) => message.kind === 'assistant-result');
    if (!structuredMessage || structuredMessage.kind !== 'assistant-result') {
      throw new Error('Expected structured explain message');
    }

    await service.updateAssistantResultMessage(structuredMessage.id, {
      workingDefinition: 'Locally edited definition',
      connections: ['Locally edited connection'],
    });
    expect(service.state.explainResult).toMatchObject({
      workingDefinition: 'Locally edited definition',
      connections: ['Locally edited connection'],
    });

    await service.submitFollowUp('先来一轮追问');
    const firstAssistantText = service.state.threads.explain.messages.find((message) => message.kind === 'assistant-text');
    if (!firstAssistantText || firstAssistantText.kind !== 'assistant-text') {
      throw new Error('Expected assistant follow-up message');
    }

    await service.updateAssistantTextMessage(firstAssistantText.id, 'Locally edited assistant follow-up');
    expect(service.getFollowUps('explain')[1]).toMatchObject({
      role: 'assistant',
      content: 'Locally edited assistant follow-up',
    });
    expect(llmChat).toHaveBeenCalledTimes(2);

    await service.submitFollowUp('再追问一次');
    const secondFollowUpPayload = JSON.parse(llmChat.mock.calls[2][0].messages[1].content);
    expect(secondFollowUpPayload.structuredResult.workingDefinition).toBe('Locally edited definition');
    expect(llmChat.mock.calls[2][0].messages.slice(2)).toEqual([
      expect.objectContaining({
        role: 'user',
        content: '先来一轮追问',
      }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Locally edited assistant follow-up',
      }),
      expect.objectContaining({
        role: 'user',
        content: '再追问一次',
      }),
    ]);
  });

  it('adds the default Andy learner profile to make-card requests while keeping JSON candidates', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        mode: 'qa',
        candidates: [
          {
            templateId: 'builtin-basic-qa',
            title: 'Candidate A',
            preview: 'Front A | Back A',
            fieldMapping: {
              front: 'Front A',
              back: 'Back A',
            },
            sourceBlockIds: ['source-1'],
            rationale: '因为这个点值得自测',
            confidence: 0.86,
          },
        ],
      }),
      raw: {},
    });

    const service = createService({ llmChat });

    const card = createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1');

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-cards',
      view: 'make-cards',
      queueProgress: {
        queueType: 'retrieval',
        queueLabel: '提取练习',
        completed: 4,
        remaining: 6,
        total: 10,
      },
      currentCard: card as never,
      revealed: true,
    });

    await service.runMakeCards();

    const payload = JSON.parse(llmChat.mock.calls[0][0].messages[1].content);
    expect(payload.learnerProfile).toEqual({
      existingLevel: '略懂',
      goal: '理解概念',
      outputDepth: '标准',
    });
    expect(payload.context.queueProgress).toEqual({
      queueType: 'retrieval',
      queueLabel: '提取练习',
      completed: 4,
      remaining: 6,
      total: 10,
    });
    expect(payload.context.currentCard.hasAnswerFace).toBe(true);
    expect(service.state.makeCardsResult?.mode).toBe('qa');
    expect(service.state.makeCardsResult?.candidates).toHaveLength(1);
  });

  it('uses the dedicated CDF prompt pair when make-card mode is cdf', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        mode: 'cdf',
        candidates: [
          {
            templateId: 'builtin-concept-definition',
            title: 'CDF Candidate',
            fieldMapping: {
              concept: '中子星',
              definition: '超新星爆发后留下的极端致密恒星残骸',
            },
          },
        ],
      }),
      raw: {},
    });

    const service = createService({ llmChat });
    const card = createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1');

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-cdf',
      view: 'make-cards',
      currentCard: card as never,
      revealed: true,
      makeCardMode: 'cdf',
    });

    await service.runMakeCards();

    expect(llmChat.mock.calls[0][0].messages[0].content).toContain('CDF card candidate prompt');
    expect(llmChat.mock.calls[0][0].messages[0].content).toContain('顶层字段必须是 mode、candidates。');
    const payload = JSON.parse(llmChat.mock.calls[0][0].messages[1].content);
    expect(payload.mode).toBe('cdf');
    expect(payload.allowedTemplateIds).toContain('builtin-concept-definition');
    expect(payload.allowedTemplateIds).toContain('builtin-concept-descriptor');
    expect(service.state.makeCardsResult?.mode).toBe('cdf');
  });

  it('expands document blocks into markdown body for review card context and selected blocks', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        mode: 'qa',
        candidates: [
          {
            templateId: 'builtin-basic-qa',
            title: 'Document candidate',
            fieldMapping: {
              front: 'Front doc',
              back: 'Back doc',
            },
          },
        ],
      }),
      raw: {},
    });
    const service = createService({ llmChat });
    const card = createCard('card-doc', 'doc-source-1', 'doc-source-1', 'back-1', 'doc-source-1', 'topic');

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-doc',
      view: 'make-cards',
      currentCard: card as never,
      revealed: true,
    });

    expect(service.state.context?.currentCard?.frontText).toContain('Allan Collins');
    expect(service.state.context?.currentCard?.sourceText).toContain('Susan Newman');
    expect(service.state.context?.blocks.find((block) => block.blockId === 'doc-source-1')?.text).toContain('John Seely Brown');

    await service.runMakeCards();

    const payload = JSON.parse(llmChat.mock.calls[0][0].messages[1].content);
    expect(payload.context.selectedBlocks[0].text).toContain('这个概念在 80 年代末');
  });

  it('auto-runs make-cards when the workbench is opened with autoRun enabled', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        mode: 'qa',
        candidates: [
          {
            templateId: 'builtin-basic-qa',
            title: 'Candidate Auto Run',
            fieldMapping: {
              front: 'Front auto',
              back: 'Back auto',
            },
          },
        ],
      }),
      raw: {},
    });
    const service = createService({ llmChat });

    await service.open({
      source: 'template-dialog',
      view: 'make-cards',
      selectedBlockIds: ['source-1'],
      makeCardMode: 'qa',
      autoRun: true,
    });

    expect(service.state.activeView).toBe('make-cards');
    expect(llmChat).toHaveBeenCalledTimes(1);
    expect(service.state.makeCardsResult?.candidates).toHaveLength(1);
  });

  it('uses document markdown body for template-dialog selected document blocks', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        mode: 'qa',
        candidates: [
          {
            templateId: 'builtin-basic-qa',
            title: 'Template document candidate',
            fieldMapping: {
              front: 'Front template doc',
              back: 'Back template doc',
            },
          },
        ],
      }),
      raw: {},
    });
    const service = createService({ llmChat });

    await service.open({
      source: 'template-dialog',
      view: 'make-cards',
      selectedBlockIds: ['doc-source-1'],
      makeCardMode: 'qa',
      autoRun: true,
    });

    const payload = JSON.parse(llmChat.mock.calls[0][0].messages[1].content);
    expect(payload.context.selectedBlocks).toEqual([
      expect.objectContaining({
        blockId: 'doc-source-1',
        text: expect.stringContaining('Allan Collins'),
      }),
    ]);
  });

  it('surfaces document body read failures as explicit workbench errors', async () => {
    const llmChat = vi.fn();
    const siyuanPort = createSiyuanPort();
    siyuanPort.copyStdMarkdown.mockRejectedValue(new Error('copy failed'));
    const service = createService({ llmChat, siyuanPort });

    await expect(service.open({
      source: 'template-dialog',
      view: 'make-cards',
      selectedBlockIds: ['doc-source-1'],
      makeCardMode: 'qa',
      autoRun: true,
    })).resolves.toBeUndefined();

    expect(service.state.context).toBeNull();
    expect(service.state.error).toContain('无法读取文档');
    expect(llmChat).not.toHaveBeenCalled();
  });

  it('saves candidates to daily note drafts, marks edits dirty, and creates cards from saved draft blocks only', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        mode: 'qa',
        candidates: [
          {
            templateId: 'builtin-basic-qa',
            title: 'Candidate Draft',
            preview: 'front/back',
            fieldMapping: {
              front: 'Front draft',
              back: 'Back draft',
            },
            sourceBlockIds: ['source-1'],
          },
        ],
      }),
      raw: {},
    });
    const draftService = createDraftService();
    const siyuanPort = createSiyuanPort();
    const xiuyuanService = {
      getTemplate: vi.fn().mockResolvedValue({
        id: 'builtin-basic-qa',
        name: '基础问答',
        fields: [{ name: 'question' }, { name: 'answer' }],
      }),
      createFromBlocks: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          xiuyuan: { id: 'xiuyuan-1' },
          cards: [{ id: 'card-1' }],
        },
      }),
    };
    const getXiuyuanApplicationService = vi.fn().mockResolvedValue(xiuyuanService);
    const service = createService({
      llmChat,
      draftService,
      siyuanPort,
      getXiuyuanApplicationService,
    });
    const card = createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1');

    draftService.saveCandidates
      .mockImplementationOnce(async (input) => ({
        notebook: 'box-1',
        storageMode: 'daily-note',
        containerDocId: 'daily-doc-1',
        containerBlockId: 'root-block-1',
        sessionBlockId: 'session-block-1',
        sourceRefsBlockId: 'refs-block-1',
        sessionId: 'session-id-1',
        savedAt: 1,
        session: {
          notebook: 'box-1',
          storageMode: 'daily-note',
          containerDocId: 'daily-doc-1',
          containerBlockId: 'root-block-1',
          sessionBlockId: 'session-block-1',
          sourceRefsBlockId: 'refs-block-1',
          sourceBlockIds: ['source-1'],
          sessionId: 'session-id-1',
          savedAt: 1,
        },
        deletedCandidateIds: [],
        saved: [
          {
            candidateId: input.candidates[0].candidateId,
            location: {
              notebook: 'box-1',
              storageMode: 'daily-note',
              containerDocId: 'daily-doc-1',
              containerBlockId: 'root-block-1',
              sessionBlockId: 'session-block-1',
              sourceRefsBlockId: 'refs-block-1',
              sessionId: 'session-id-1',
              candidateBlockId: 'candidate-block-1',
              fieldBlockIds: {
                question: 'draft-question-1',
                answer: 'draft-answer-1',
              },
              sourceBlockIds: ['source-1'],
              savedAt: 1,
            },
          },
        ],
        failed: [],
      }))
      .mockImplementationOnce(async (input) => ({
        notebook: 'box-1',
        storageMode: 'daily-note',
        containerDocId: 'daily-doc-1',
        containerBlockId: 'root-block-1',
        sessionBlockId: 'session-block-1',
        sourceRefsBlockId: 'refs-block-1',
        sessionId: 'session-id-1',
        savedAt: 2,
        session: {
          notebook: 'box-1',
          storageMode: 'daily-note',
          containerDocId: 'daily-doc-1',
          containerBlockId: 'root-block-1',
          sessionBlockId: 'session-block-1',
          sourceRefsBlockId: 'refs-block-1',
          sourceBlockIds: ['source-1'],
          sessionId: 'session-id-1',
          savedAt: 2,
        },
        deletedCandidateIds: [],
        saved: [
          {
            candidateId: input.candidates[0].candidateId,
            location: {
              notebook: 'box-1',
              storageMode: 'daily-note',
              containerDocId: 'daily-doc-1',
              containerBlockId: 'root-block-1',
              sessionBlockId: 'session-block-1',
              sourceRefsBlockId: 'refs-block-1',
              sessionId: 'session-id-1',
              candidateBlockId: 'candidate-block-1',
              fieldBlockIds: {
                question: 'draft-question-1',
                answer: 'draft-answer-1',
              },
              sourceBlockIds: ['source-1'],
              savedAt: 2,
            },
          },
        ],
        failed: [],
      }));

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-draft',
      view: 'make-cards',
      currentCard: card as never,
      revealed: true,
    });

    await service.runMakeCards();

    const candidate = service.state.makeCardsResult?.candidates[0];
    expect(candidate?.draftState).toBe('unsaved');

    await service.saveSelectedCandidatesToDailyNote();

    expect(draftService.saveCandidates).toHaveBeenCalledWith({
      mode: 'qa',
      existingSession: null,
      authoritativeCandidateIds: [candidate!.id],
      authoritativeSourceBlockIds: ['source-1', 'front-1', 'back-1', 'card-block-1'],
      storage: {
        mode: 'daily-note',
        notebookId: '',
        targetBlockId: '',
      },
      candidates: [
        expect.objectContaining({
          templateId: 'builtin-basic-qa',
          title: 'Candidate Draft',
          sourceBlockIds: ['source-1', 'front-1', 'back-1', 'card-block-1'],
          fieldOrder: ['question', 'answer'],
          fieldValues: {
            question: 'Front draft',
            answer: 'Back draft',
          },
          existingLocation: null,
        }),
      ],
    });
    expect(candidate?.draftState).toBe('saved');
    expect(candidate?.draftLocation?.fieldBlockIds).toEqual({
      question: 'draft-question-1',
      answer: 'draft-answer-1',
    });
    expect(service.state.makeCardsResult?.draftSession?.sessionBlockId).toBe('session-block-1');

    service.updateCandidateField(candidate!.id, 'back', 'Back draft updated');

    expect(candidate?.draftState).toBe('dirty');
    expect(candidate?.draftLocation?.sessionBlockId).toBe('session-block-1');
    await expect(service.createSelectedCandidates()).rejects.toThrow('请先把候选保存成草稿后再创建卡片');

    await service.saveSelectedCandidatesToDailyNote();
    await service.createSelectedCandidates();

    expect(draftService.saveCandidates).toHaveBeenNthCalledWith(2, {
      mode: 'qa',
      existingSession: expect.objectContaining({
        sessionBlockId: 'session-block-1',
        sessionId: 'session-id-1',
      }),
      authoritativeCandidateIds: [candidate!.id],
      authoritativeSourceBlockIds: ['source-1', 'front-1', 'back-1', 'card-block-1'],
      storage: {
        mode: 'daily-note',
        notebookId: '',
        targetBlockId: '',
      },
      candidates: [
        expect.objectContaining({
          sourceBlockIds: ['source-1', 'front-1', 'back-1', 'card-block-1'],
          fieldValues: {
            question: 'Front draft',
            answer: 'Back draft updated',
          },
          existingLocation: expect.objectContaining({
            candidateBlockId: 'candidate-block-1',
            sessionBlockId: 'session-block-1',
            fieldBlockIds: {
              question: 'draft-question-1',
              answer: 'draft-answer-1',
            },
          }),
        }),
      ],
    });

    expect(draftService.markDraftStatus).toHaveBeenNthCalledWith(1, expect.objectContaining({
      sessionBlockId: 'session-block-1',
    }), 'creating');
    expect(draftService.markDraftStatus).toHaveBeenNthCalledWith(2, expect.objectContaining({
      sessionBlockId: 'session-block-1',
    }), 'created');
    expect(xiuyuanService.createFromBlocks).toHaveBeenCalledWith({
      blockIds: ['draft-question-1', 'draft-answer-1'],
      templateId: 'builtin-basic-qa',
      fieldMapping: {
        question: 'draft-question-1',
        answer: 'draft-answer-1',
      },
    });
    expect(siyuanPort.appendBlockUnderParent).not.toHaveBeenCalled();
    expect(siyuanPort.insertBlockAfter).not.toHaveBeenCalled();
    expect(candidate?.draftState).toBe('created');
  });

  it('allows tutor in hyperspace neural roam and sends queue progress together with path context', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        blindSpots: ['盲点 A'],
        patterns: ['模式 A'],
        nextLines: ['下一步 A'],
        cardIdeas: ['卡点 A'],
        batchSummary: null,
      }),
      raw: {},
    });

    const service = createService({ llmChat });

    const card = createCard('card-h', 'card-block-1', 'front-1', 'back-1', 'source-1', 'topic');

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-hyperspace',
      view: 'tutor',
      queueType: 'neural-roam',
      queueProgress: {
        queueType: 'neural-roam',
        queueLabel: '神经漫游',
        completed: 7,
        remaining: 13,
        total: 20,
      },
      currentCard: card as never,
      revealed: false,
      neuralBatch: {
        kind: 'hyperspace-current-node',
        engineMode: 'hyperspace',
        navigationState: {
          currentPathIndex: 2,
          currentNodeId: 'node-3',
          currentEventId: 'event-3',
          navigationMode: 'explore',
          engineMode: 'hyperspace',
          engineSessionId: 'engine-session-2',
          hasBookmark: false,
          pathLength: 6,
          sessionId: 'review-session-hyperspace',
        },
        focusNodeId: 'node-1',
        focusNodePreview: 'focus',
        currentNodeId: 'node-3',
        currentEventId: 'event-3',
        roundSize: 3,
        viewedCount: 3,
        remainingCount: 0,
        roundNodes: [
          {
            eventId: 'event-1',
            nodeId: 'node-1',
            nodePreview: 'node-1',
            isVirtual: false,
            associationType: 'focus',
            reason: 'focus',
            visitedAt: 1,
            sourceNodeId: null,
            sourceEventId: null,
          },
        ],
        recentPath: [],
        sourceSnapshot: [],
        seedSnapshot: [],
        anchorSnapshot: [],
      } as never,
    });

    await expect(service.runTutor()).resolves.toBeUndefined();

    const payload = JSON.parse(llmChat.mock.calls[0][0].messages[1].content);
    expect(payload.context.neuralBatch.engineMode).toBe('hyperspace');
    expect(payload.context.queueProgress).toEqual({
      queueType: 'neural-roam',
      queueLabel: '神经漫游',
      completed: 7,
      remaining: 13,
      total: 20,
    });
    expect(service.state.tutorResult?.blindSpots).toEqual(['盲点 A']);
  });
});
