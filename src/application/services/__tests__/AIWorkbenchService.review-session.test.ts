import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import { createDefaultAIPromptProfileSet, type AISettings } from '@/types/settings';

function createAISettings(): AISettings {
  return {
    enabled: true,
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    model: 'test-model',
    timeoutMs: 30000,
    temperature: 0.2,
    defaultOutputLanguage: 'zh-CN',
    prompts: {
      tutor: 'Tutor prompt',
      explain: 'Explain prompt',
      cardCandidate: 'Card candidate prompt',
    },
    promptProfiles: createDefaultAIPromptProfileSet(),
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

function createService(options?: {
  llmChat?: ReturnType<typeof vi.fn>;
  getXiuyuanApplicationService?: ReturnType<typeof vi.fn>;
  siyuanPort?: ReturnType<typeof createSiyuanPort>;
  draftService?: ReturnType<typeof createDraftService>;
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
  });
}

describe('AIWorkbenchService review-session behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks explain results stale when the review card changes and resets follow-ups after rerun', async () => {
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
    expect(service.state.viewState.explain.stale).toBe(true);
    expect(service.getFollowUpDisabledReason('explain')).toContain('新卡片');
    await expect(service.submitFollowUp('继续解释')).rejects.toThrow('新卡片');

    await service.runExplain();

    expect(service.state.explainResult?.workingDefinition).toBe('Definition B');
    expect(service.state.explainResult?.whatItTests).toBe('Test B');
    expect(service.state.explainResult?.triggers).toEqual(['Trigger B']);
    expect(service.state.viewState.explain.stale).toBe(false);
    expect(service.getFollowUps('explain')).toHaveLength(0);
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
        dailyNoteDocId: 'daily-doc-1',
        rootBlockId: 'root-block-1',
        sessionBlockId: 'session-block-1',
        sourceRefsBlockId: 'refs-block-1',
        sessionId: 'session-id-1',
        savedAt: 1,
        session: {
          notebook: 'box-1',
          dailyNoteDocId: 'daily-doc-1',
          rootBlockId: 'root-block-1',
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
              dailyNoteDocId: 'daily-doc-1',
              rootBlockId: 'root-block-1',
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
        dailyNoteDocId: 'daily-doc-1',
        rootBlockId: 'root-block-1',
        sessionBlockId: 'session-block-1',
        sourceRefsBlockId: 'refs-block-1',
        sessionId: 'session-id-1',
        savedAt: 2,
        session: {
          notebook: 'box-1',
          dailyNoteDocId: 'daily-doc-1',
          rootBlockId: 'root-block-1',
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
              dailyNoteDocId: 'daily-doc-1',
              rootBlockId: 'root-block-1',
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
    await expect(service.createSelectedCandidates()).rejects.toThrow('请先把候选保存到 Daily Note 草稿后再创建卡片');

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
