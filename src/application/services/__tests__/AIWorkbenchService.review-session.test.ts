import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMError } from '@/application/ports/LLMPort';
import { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import { DEFAULT_AI_SETTINGS, type AISettings } from '@/types/settings';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_CONCEPT_COACH_TAB_IDS,
  AI_GENERAL_CHAT_SKILL_ID,
  AI_GENERAL_CHAT_TAB_ID,
  type AIWorkbenchSelfTestCardTargetMemory,
  type AIWorkbenchSessionRecord,
} from '@/types/ai';

function createAISettings(): AISettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    enabled: true,
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    model: 'test-model',
    timeoutMs: 30000,
    temperature: 0.2,
    defaultOutputLanguage: 'zh-CN',
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
    listNotebooks: vi.fn(async () => [
      { id: 'notebook-1', name: '学习笔记', icon: '', closed: false },
      { id: 'closed-notebook', name: '已关闭', icon: '', closed: true },
    ]),
    sql: vi.fn(async () => rows),
    getBlockText: vi.fn(async (blockId: string) => contentMap.get(blockId)?.content || ''),
    getBlockKramdown: vi.fn(async () => ({ kramdown: '' })),
    copyStdMarkdown: vi.fn(async (blockId: string) => contentMap.get(blockId)?.copyStdMarkdown || ''),
    ensureTodayDailyNote: vi.fn(async () => 'daily-doc-1'),
    setBlockAttrs: vi.fn(),
    getNotebookConf: vi.fn(),
    renderTemplate: vi.fn(),
    createDocWithMarkdown: vi.fn(),
    insertBlockAfter: vi.fn(),
    insertBlockAfterDetailed: vi.fn(),
    appendBlockUnderParent: vi.fn(),
    appendBlockUnderParentDetailed: vi.fn(),
    updateBlockMarkdown: vi.fn(async (blockId: string) => blockId),
    deleteBlock: vi.fn(),
  };
}

function createSessionStore() {
  const records = new Map<string, AIWorkbenchSessionRecord>();
  let selfTestTargetMemory: AIWorkbenchSelfTestCardTargetMemory | null = null;

  const countMessages = (record: AIWorkbenchSessionRecord) => AI_CONCEPT_COACH_TAB_IDS.reduce(
    (total, tabId) => total + (record.threads?.[AI_CONCEPT_COACH_SKILL_ID]?.[tabId]?.messages?.length || 0),
    0,
  );

  const buildSummary = (record: AIWorkbenchSessionRecord) => {
    const messageCount = countMessages(record);
    return {
      id: record.id,
      title: record.title,
      source: record.source,
      sourceReviewSessionId: record.sourceReviewSessionId,
      reviewChatKey: record.reviewChatKey || null,
      surface: record.surface,
      contextSignature: record.contextSignature,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      activeSkillId: AI_CONCEPT_COACH_SKILL_ID,
      activeTabId: record.activeTabId || 'working-definition',
      activeSkills: messageCount > 0 ? [AI_CONCEPT_COACH_SKILL_ID] : [],
      lastActiveView: AI_CONCEPT_COACH_SKILL_ID,
      activeViews: messageCount > 0 ? [AI_CONCEPT_COACH_SKILL_ID] : [],
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
    findLatestByReviewChatKey: vi.fn(async ({ reviewChatKey, source = 'review' }: { reviewChatKey: string | null; source?: string }) => {
      const match = Array.from(records.values())
        .filter((record) => record.source === source && (record.reviewChatKey || null) === (reviewChatKey || null))
        .sort((left, right) => right.updatedAt - left.updatedAt)[0];
      return match ? buildSummary(match) : null;
    }),
    loadSelfTestCardTargetMemory: vi.fn(async () => selfTestTargetMemory ? JSON.parse(JSON.stringify(selfTestTargetMemory)) : null),
    saveSelfTestCardTargetMemory: vi.fn(async (memory: AIWorkbenchSelfTestCardTargetMemory) => {
      selfTestTargetMemory = JSON.parse(JSON.stringify(memory));
      return JSON.parse(JSON.stringify(memory));
    }),
  };
}

function createService(options?: {
  aiSettings?: AISettings;
  llmChat?: ReturnType<typeof vi.fn>;
  siyuanPort?: ReturnType<typeof createSiyuanPort>;
  sessionStore?: ReturnType<typeof createSessionStore>;
  xiuyuanService?: { createFromBlocks: ReturnType<typeof vi.fn> };
}) {
  return new AIWorkbenchService({
    getAISettings: () => options?.aiSettings || createAISettings(),
    cardContentQueryService: {
      getBlockContentsWithType: vi.fn(async (blockIds: string[]) => new Map(
        blockIds.map((id) => [id, contentMap.get(id) || { content: '' }]),
      )),
    } as never,
    siyuanPort: options?.siyuanPort || createSiyuanPort(),
    llmPort: {
      chat: options?.llmChat || vi.fn(),
    },
    getXiuyuanApplicationService: options?.xiuyuanService
      ? async () => options.xiuyuanService!
      : undefined,
    sessionStore: options?.sessionStore || createSessionStore(),
  });
}

function createConceptCoachPayload(workingDefinition = 'Definition A') {
  return {
    workingDefinition,
    perspectives: {
      traits: { title: '特性和倾向', keyPoints: ['Trait A'] },
      contrasts: { title: '辨析异同', keyPoints: ['Contrast A'] },
      partsAndWhole: { title: '部分和整体', keyPoints: ['Part A'] },
      causality: { title: '因果关系', keyPoints: ['Cause A'] },
      significance: { title: '意义和影响', keyPoints: ['Meaning A'] },
    },
    integratedUnderstanding: {
      essence: 'Essence A',
      notWhat: ['Not A'],
      capabilities: ['Capability A'],
    },
    selfTestCards: {
      cards: [{ id: 'candidate-a', question: 'Question A', answer: 'Answer A', kind: '应用', selected: true }],
    },
    realWorldTriggers: {
      triggers: ['Trigger A'],
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

function createQueueProgress(queueType: string, queueLabel: string) {
  return {
    queueType,
    queueLabel,
    completed: 1,
    remaining: 2,
    total: 3,
  };
}

function latestAssistantResult(service: AIWorkbenchService, tabId: (typeof AI_CONCEPT_COACH_TAB_IDS)[number]) {
  return [...service.state.threads[AI_CONCEPT_COACH_SKILL_ID][tabId].messages]
    .reverse()
    .find((message) => message.kind === 'assistant-result');
}

function extractQuotedSqlValues(stmt: string): string[] {
  return Array.from(stmt.matchAll(/'((?:[^']|'')+)'/g)).map((match) => match[1]!.replace(/''/g, "'"));
}

function createSelfTestMutationFixture(
  rootId: string,
  options?: {
    question?: string;
    answer?: string;
    includeQuestionParagraph?: boolean;
    includeAnswerParagraph?: boolean;
  },
) {
  const question = options?.question || 'Question A';
  const answer = options?.answer || 'Answer A';
  const includeQuestionParagraph = options?.includeQuestionParagraph !== false;
  const includeAnswerParagraph = options?.includeAnswerParagraph !== false;
  const listId = `${rootId}-list`;
  const questionParagraphId = `${rootId}-question`;
  const nestedListId = `${rootId}-nested-list`;
  const answerItemId = `${rootId}-answer-item`;
  const answerParagraphId = `${rootId}-answer`;
  const rows = [
    { id: listId, parent_id: 'target-doc', root_id: 'target-doc', type: 'l', content: '', markdown: '', sort: '1' },
    { id: rootId, parent_id: listId, root_id: 'target-doc', type: 'i', content: question, markdown: question, sort: '1' },
    includeQuestionParagraph
      ? { id: questionParagraphId, parent_id: rootId, root_id: 'target-doc', type: 'p', content: question, markdown: question, sort: '1' }
      : null,
    { id: nestedListId, parent_id: rootId, root_id: 'target-doc', type: 'l', content: '', markdown: '', sort: '2' },
    { id: answerItemId, parent_id: nestedListId, root_id: 'target-doc', type: 'i', content: answer, markdown: answer, sort: '1' },
    includeAnswerParagraph
      ? { id: answerParagraphId, parent_id: answerItemId, root_id: 'target-doc', type: 'p', content: answer, markdown: answer, sort: '1' }
      : null,
  ].filter(Boolean);
  return {
    rootId,
    listId,
    answerItemId,
    questionBlockId: includeQuestionParagraph ? questionParagraphId : rootId,
    answerBlockId: includeAnswerParagraph ? answerParagraphId : answerItemId,
    mutation: {
      doOperations: rows.map((row) => ({
        id: row!.id,
        parentID: row!.parent_id,
        action: 'insert',
        data: row!.markdown,
      })),
    },
    rows,
  };
}

function createSelfTestKramdown(fixture: ReturnType<typeof createSelfTestMutationFixture>): string {
  const questionText = fixture.rows.find((row) => row?.id === fixture.rootId)?.content || 'Question';
  const answerText = fixture.rows.find((row) => row?.id === fixture.answerItemId)?.content || 'Answer';
  const questionParagraphLine = fixture.questionBlockId !== fixture.rootId
    ? `  {: id="${fixture.questionBlockId}" updated="20260417000000"}`
    : '';
  const answerParagraphLine = fixture.answerBlockId !== fixture.answerItemId
    ? `    {: id="${fixture.answerBlockId}" updated="20260417000000"}`
    : '';
  return [
    `* {: id="${fixture.rootId}" updated="20260417000000"}${questionText}`,
    questionParagraphLine,
    '',
    `  * {: id="${fixture.answerItemId}" updated="20260417000000"}${answerText}`,
    answerParagraphLine,
  ].filter((line) => line.length > 0).join('\n');
}

describe('AIWorkbenchService review-session behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens standalone sessions as general chat and sends enabled tool definitions', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: '可以，我们从当前材料开始聊。',
      raw: {},
    });
    const service = createService({ llmChat });

    await service.open({
      source: 'standalone',
      surface: 'standalone-dialog',
    });
    await service.submitSkillPrompt('先帮我概括一下。');

    expect(service.state.activeSkillId).toBe(AI_GENERAL_CHAT_SKILL_ID);
    expect(service.state.activeTabId).toBe(AI_GENERAL_CHAT_TAB_ID);
    expect(llmChat).toHaveBeenCalledTimes(1);
    expect(llmChat.mock.calls[0][0].tools.map((tool: { function: { name: string } }) => tool.function.name))
      .toEqual(expect.arrayContaining(['GetCurrentContext', 'ReadBlock', 'ListVars', 'ReadVar']));
    expect(service.state.threads[AI_GENERAL_CHAT_SKILL_ID][AI_GENERAL_CHAT_TAB_ID].messages).toEqual([
      expect.objectContaining({ kind: 'user', content: '先帮我概括一下。' }),
      expect.objectContaining({ kind: 'assistant-text', content: '可以，我们从当前材料开始聊。' }),
    ]);
  });

  it('executes read tools in the general chat loop and feeds tool results back to the model', async () => {
    const llmChat = vi.fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{
          id: 'call-context',
          type: 'function',
          function: {
            name: 'GetCurrentContext',
            arguments: '{"includeFullText":true}',
          },
        }],
        raw: {},
      })
      .mockResolvedValueOnce({
        content: '已读取当前上下文，选中块是 Front A。',
        raw: {},
      });
    const service = createService({ llmChat });

    await service.open({
      source: 'standalone',
      surface: 'standalone-dialog',
      selectedBlockIds: ['front-1'],
    });
    await service.submitSkillPrompt('读取上下文。');

    expect(llmChat).toHaveBeenCalledTimes(2);
    expect(service.state.toolTimeline[0]).toMatchObject({
      toolName: 'GetCurrentContext',
      status: 'success',
    });
    expect(service.state.threads[AI_GENERAL_CHAT_SKILL_ID][AI_GENERAL_CHAT_TAB_ID].messages)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'tool-log', toolName: 'GetCurrentContext', status: 'success' }),
        expect.objectContaining({ kind: 'assistant-text', content: '已读取当前上下文，选中块是 Front A。' }),
      ]));
    const renderEntries = service.getRenderEntries(undefined, AI_GENERAL_CHAT_TAB_ID);
    expect(renderEntries.map((entry) => entry.primaryMessage.kind)).toEqual(['user', 'assistant-text']);
    expect(renderEntries.at(-1)).toMatchObject({
      primaryMessage: expect.objectContaining({
        kind: 'assistant-text',
        content: '已读取当前上下文，选中块是 Front A。',
        presentation: 'primary',
      }),
      stepCount: 2,
      supplementalMessages: expect.arrayContaining([
        expect.objectContaining({ kind: 'tool-log', presentation: 'supplemental' }),
      ]),
    });
    expect(llmChat.mock.calls[1][0].messages.at(-1)).toMatchObject({
      role: 'tool',
      toolCallId: 'call-context',
      name: 'GetCurrentContext',
    });
  });

  it('requests execution approval for enabled legacy staging tools and resumes after approval', async () => {
    const aiSettings = JSON.parse(JSON.stringify(createAISettings())) as AISettings;
    aiSettings.toolPolicies.groupDefaults['flashcard-write'] = true;
    aiSettings.toolPolicies.toolDefaults.StageFlashcardDraft = true;
    const llmChat = vi.fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{
          id: 'call-write',
          type: 'function',
          function: {
            name: 'StageFlashcardDraft',
            arguments: '{"cards":[{"question":"Q","answer":"A","kind":"应用"}]}',
          },
        }],
        raw: {},
      })
      .mockResolvedValueOnce({
        content: '已暂存候选卡。',
        raw: {},
      });
    const service = createService({ aiSettings, llmChat });

    await service.open({
      source: 'standalone',
      surface: 'standalone-dialog',
    });
    const run = service.submitSkillPrompt('暂存这张卡。');

    await vi.waitFor(() => {
      expect(service.state.pendingApprovals).toHaveLength(1);
    });

    expect(llmChat).toHaveBeenCalledTimes(1);
    expect(service.state.toolTimeline).toHaveLength(0);
    expect(service.state.pendingApprovals).toHaveLength(1);
    expect(service.state.threads[AI_GENERAL_CHAT_SKILL_ID][AI_GENERAL_CHAT_TAB_ID].messages)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: 'approval',
          request: expect.objectContaining({
            type: 'execution',
            toolName: 'StageFlashcardDraft',
            status: 'pending',
          }),
        }),
        expect.objectContaining({ kind: 'assistant-text', content: expect.stringContaining('请先确认') }),
      ]));
    expect(service.getRenderEntries(undefined, AI_GENERAL_CHAT_TAB_ID).at(-1)?.pendingApproval)
      .toMatchObject({
        request: expect.objectContaining({
          toolName: 'StageFlashcardDraft',
          status: 'pending',
        }),
      });

    await service.resolveToolApproval(service.state.pendingApprovals[0].id, true);
    await run;

    expect(service.state.pendingApprovals).toHaveLength(0);
    expect(llmChat).toHaveBeenCalledTimes(2);
    expect(service.state.toolTimeline[0]).toMatchObject({
      toolName: 'StageFlashcardDraft',
      status: 'success',
    });
    expect(service.state.threads[AI_GENERAL_CHAT_SKILL_ID][AI_GENERAL_CHAT_TAB_ID].messages)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'approval', request: expect.objectContaining({ status: 'approved' }) }),
        expect.objectContaining({ kind: 'assistant-text', content: '已暂存候选卡。' }),
        expect.objectContaining({ kind: 'tool-log', toolName: 'StageFlashcardDraft', status: 'success' }),
      ]));
  });

  it('exposes transient full-run status while the first skill prompt is pending', async () => {
    const pending = createDeferred<{ content: string; raw: unknown }>();
    const llmChat = vi.fn(() => pending.promise);
    const service = createService({ llmChat });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });

    const run = service.submitSkillPrompt('解释此内容');

    expect(service.state.runStatus).toMatchObject({
      mode: 'full-run',
      skillId: AI_CONCEPT_COACH_SKILL_ID,
      activeTabId: 'working-definition',
      title: 'AI 正在理解材料',
    });
    expect(service.state.runStatus?.tabIds).toEqual(AI_CONCEPT_COACH_TAB_IDS);

    pending.resolve({
      content: JSON.stringify(createConceptCoachPayload('Run status done')),
      raw: {},
    });
    await run;

    expect(service.state.runStatus).toBeNull();
    expect(service.state.explainResult?.workingDefinition).toBe('Run status done');
  });

  it('exposes tab rerun status only for the current tab and clears it after merging the tab result', async () => {
    const pending = createDeferred<{ content: string; raw: unknown }>();
    const llmChat = vi.fn(() => pending.promise);
    const service = createService({ llmChat });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });
    service.setActiveTab('self-test-cards');

    const run = service.runActiveTab();

    expect(service.state.runStatus).toMatchObject({
      mode: 'tab-rerun',
      activeTabId: 'self-test-cards',
      tabIds: ['self-test-cards'],
      title: 'AI 正在重跑当前阶段',
    });

    pending.resolve({
      content: JSON.stringify({
        selfTestCards: {
          cards: [{ question: '如何应用？', answer: '在具体场景里识别触发条件。', kind: '应用', selected: true }],
        },
      }),
      raw: {},
    });
    await run;

    expect(service.state.runStatus).toBeNull();
    expect(service.state.skillResults[AI_CONCEPT_COACH_SKILL_ID]?.selfTestCards.cards[0]?.question).toBe('如何应用？');
  });

  it('exposes follow-up status and clears it after a failed follow-up', async () => {
    const pending = createDeferred<{ content: string; raw: unknown }>();
    const llmChat = vi.fn()
      .mockResolvedValueOnce({
        content: JSON.stringify(createConceptCoachPayload()),
        raw: {},
      })
      .mockImplementationOnce(() => pending.promise);
    const service = createService({ llmChat });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });
    await service.submitSkillPrompt('解释此内容');

    const followUp = service.submitFollowUp('继续展开');

    expect(service.state.runStatus).toMatchObject({
      mode: 'follow-up',
      activeTabId: 'working-definition',
      tabIds: ['working-definition'],
      title: 'AI 正在回应追问',
    });

    pending.reject(new Error('follow-up failed'));
    await followUp;

    expect(service.state.runStatus).toBeNull();
    expect(service.state.error).toBe('follow-up failed');
  });

  it('maps empty model responses to a diagnostic recovery hint', async () => {
    const llmChat = vi.fn(async () => {
      throw new LLMError('LLM returned an empty completion', {
        code: 'empty_response',
        diagnostic: '{\n  "choices": []\n}',
      });
    });
    const service = createService({ llmChat });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });

    await service.runExplain();

    expect(service.state.error).toContain('AI 请求已发出');
    expect(service.state.error).toContain('空正文');
    expect(service.state.error).toContain('json_object');
    expect(service.state.failureDiagnostic?.content).toContain('"choices"');
    expect(service.state.runStatus).toBeNull();
  });

  it('builds a fallback failure diagnostic when the llm error has no raw payload', async () => {
    const llmChat = vi.fn(async () => {
      throw new LLMError('LLM returned an empty completion', { code: 'empty_response' });
    });
    const service = createService({ llmChat });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });

    await service.runExplain();

    expect(service.state.failureDiagnostic?.content).toContain('Error code: empty_response');
    expect(service.state.failureDiagnostic?.content).toContain('Model: test-model');
    expect(service.state.failureDiagnostic?.content).toContain('Base URL: https://example.test/v1');
  });

  it('salvages aliased perspectives and integrated-understanding payloads into partial tab results', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        workingDefinition: 'Definition A',
        perspectives: {
          compare: { points: ['Contrast A'] },
          partWhole: { summary: 'Part A' },
          meaning: { importance: 'Meaning A' },
        },
        integratedUnderstanding: {
          summary: 'Essence A',
          applications: ['Capability A'],
        },
        selfTestCards: {
          cards: [{ question: 'Question A', answer: 'Answer A', kind: '应用', selected: true }],
        },
        realWorldTriggers: {
          triggers: ['Trigger A'],
        },
      }),
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

    await service.runExplain();

    expect(service.state.skillResults[AI_CONCEPT_COACH_SKILL_ID]?.perspectives.contrasts.keyPoints).toEqual(['Contrast A']);
    expect(service.state.skillResults[AI_CONCEPT_COACH_SKILL_ID]?.perspectives.partsAndWhole.keyPoints).toEqual(['Part A']);
    expect(service.state.skillResults[AI_CONCEPT_COACH_SKILL_ID]?.integratedUnderstanding).toMatchObject({
      essence: 'Essence A',
      capabilities: ['Capability A'],
    });
    expect(service.hasStructuredResult(undefined, 'perspectives')).toBe(true);
    expect(service.hasStructuredResult(undefined, 'integrated-understanding')).toBe(true);
    expect(latestAssistantResult(service, 'perspectives')).toMatchObject({
      normalizationDiagnostic: {
        status: 'partial',
        missingSections: expect.arrayContaining(['traits', 'causality']),
      },
    });
    expect(latestAssistantResult(service, 'integrated-understanding')).toMatchObject({
      normalizationDiagnostic: {
        status: 'partial',
        missingSections: ['notWhat'],
      },
    });
  });

  it('captures invalid-json diagnostics when the model returns non-JSON structured output', async () => {
    const llmChat = vi.fn().mockResolvedValue({
      content: '```markdown\nnot json\n```',
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

    await service.runExplain();

    expect(service.state.error).toContain('不是合法 JSON');
    expect(service.state.failureDiagnostic?.content).toContain('Diagnostic type: invalid_json');
    expect(service.state.failureDiagnostic?.content).toContain('not json');
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
    expect(service.getFollowUps()).toHaveLength(0);
    expect(service.state.sessionHistory).toHaveLength(2);

    await service.runExplain();
    expect(service.state.explainResult?.workingDefinition).toBe('Definition B');

    await service.openSession(firstSessionId!);
    expect(service.state.context?.currentCard?.cardId).toBe('card-a');
    expect(service.getFollowUps()).toHaveLength(2);
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

    expect(service.state.threads[AI_CONCEPT_COACH_SKILL_ID]['working-definition'].messages[0]).toMatchObject({
      kind: 'user',
      purpose: 'initial-run',
      content: '解释此内容',
    });
    expect(service.state.threads[AI_CONCEPT_COACH_SKILL_ID]['working-definition'].messages[1]).toMatchObject({
      kind: 'assistant-result',
    });
    expect(service.getFollowUps()).toEqual([]);

    const explainPayload = JSON.parse(llmChat.mock.calls[0][0].messages[1].content);
    expect(explainPayload.userPrompt).toBe('解释此内容');

    await service.submitFollowUp('继续展开');

    expect(service.getFollowUps()).toHaveLength(2);
    expect(service.getFollowUps()[0]).toMatchObject({
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

    expect(service.state.activeView).toBe(AI_CONCEPT_COACH_SKILL_ID);
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

    expect(service.state.activeView).toBe(AI_CONCEPT_COACH_SKILL_ID);
  });

  it('reuses the latest persisted review session by reviewChatKey across new runtimes and card switches', async () => {
    const sessionStore = createSessionStore();
    const llmChat = vi.fn().mockResolvedValue({
      content: JSON.stringify(createConceptCoachPayload('Shared queue definition')),
      raw: {},
    });
    const reviewChatKey = 'neural-roam::Neural Queue';
    const queueProgress = createQueueProgress('neural-roam', 'Neural Queue');

    const firstService = createService({ llmChat, sessionStore });
    await firstService.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-a',
      sourceReviewSessionId: 'review-session-a',
      reviewChatKey,
      queueType: 'neural-roam',
      queueProgress,
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });
    await firstService.submitSkillPrompt('解释这张卡');
    const sharedSessionId = firstService.state.sessionId;

    const secondService = createService({ sessionStore });
    await secondService.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-b',
      sourceReviewSessionId: 'review-session-b',
      reviewChatKey,
      queueType: 'neural-roam',
      queueProgress,
      currentCard: createCard('card-b', 'card-block-2', 'front-2', 'back-2', 'source-2') as never,
      revealed: true,
    });

    expect(secondService.state.sessionId).toBe(sharedSessionId);
    expect(secondService.state.context?.currentCard?.cardId).toBe('card-b');
    expect(secondService.state.threads[AI_CONCEPT_COACH_SKILL_ID]['working-definition'].messages.length).toBeGreaterThan(0);

    await secondService.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-b',
      sourceReviewSessionId: 'review-session-b',
      reviewChatKey,
      queueType: 'neural-roam',
      queueProgress,
      currentCard: createCard('card-c', 'card-block-2', 'front-2', 'back-2', 'source-2') as never,
      revealed: true,
    });

    expect(secondService.state.sessionId).toBe(sharedSessionId);
    expect(secondService.state.context?.currentCard?.cardId).toBe('card-c');
  });

  it('does not auto-jump away after manually creating or opening a review session in the same queue', async () => {
    const sessionStore = createSessionStore();
    const llmChat = vi.fn().mockResolvedValue({
      content: JSON.stringify(createConceptCoachPayload('Manual session definition')),
      raw: {},
    });
    const reviewChatKey = 'retrieval::Review Queue';
    const queueProgress = createQueueProgress('retrieval', 'Review Queue');

    const seedService = createService({ llmChat, sessionStore });
    await seedService.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-seed',
      sourceReviewSessionId: 'review-session-seed',
      reviewChatKey,
      queueType: 'retrieval',
      queueProgress,
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });
    await seedService.submitSkillPrompt('解释这张卡');
    const sharedSessionId = seedService.state.sessionId!;

    const service = createService({ sessionStore });
    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-live',
      sourceReviewSessionId: 'review-session-live',
      reviewChatKey,
      queueType: 'retrieval',
      queueProgress,
      currentCard: createCard('card-b', 'card-block-2', 'front-2', 'back-2', 'source-2') as never,
      revealed: true,
    });

    await service.createNewSession();
    const manualNewSessionId = service.state.sessionId;
    expect(manualNewSessionId).not.toBe(sharedSessionId);

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-live',
      sourceReviewSessionId: 'review-session-live',
      reviewChatKey,
      queueType: 'retrieval',
      queueProgress,
      currentCard: createCard('card-c', 'card-block-2', 'front-2', 'back-2', 'source-2') as never,
      revealed: true,
    });
    expect(service.state.sessionId).toBe(manualNewSessionId);

    await service.openSession(sharedSessionId);
    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-live',
      sourceReviewSessionId: 'review-session-live',
      reviewChatKey,
      queueType: 'retrieval',
      queueProgress,
      currentCard: createCard('card-d', 'card-block-2', 'front-2', 'back-2', 'source-2') as never,
      revealed: true,
    });
    expect(service.state.sessionId).toBe(sharedSessionId);
  });

  it('updates self-test candidate selection per message without rebounding and supports bulk toggle', async () => {
    const llmChat = vi.fn(async () => ({
      content: JSON.stringify({
        selfTestCards: {
          cards: [
            { id: 'candidate-a', question: 'Question A', answer: 'Answer A', kind: '应用', selected: true },
            { id: 'candidate-b', question: 'Question B', answer: 'Answer B', kind: '定义', selected: true },
          ],
        },
      }),
      raw: {},
    }));
    const service = createService({ llmChat });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });
    service.setActiveTab('self-test-cards');
    await service.runActiveTab();

    const message = latestAssistantResult(service, 'self-test-cards');
    expect(message?.kind).toBe('assistant-result');

    await service.updateCandidateCard(message!.id, 'candidate-a', { selected: false });
    await service.updateCandidateCard(message!.id, 'candidate-b', { selected: false });

    const updatedMessage = latestAssistantResult(service, 'self-test-cards');
    const updatedCards = (updatedMessage?.tabResult as { cards: Array<{ id: string; selected: boolean }> }).cards;
    expect(updatedCards).toEqual([
      expect.objectContaining({ id: 'candidate-a', selected: false }),
      expect.objectContaining({ id: 'candidate-b', selected: false }),
    ]);

    await service.setCandidateCardsSelected(message!.id, true);

    const reselectedMessage = latestAssistantResult(service, 'self-test-cards');
    const reselectedCards = (reselectedMessage?.tabResult as { cards: Array<{ selected: boolean }> }).cards;
    expect(reselectedCards.every((card) => card.selected)).toBe(true);
  });

  it('creates selected self-test cards in today daily note using paragraph blocks after mutation visibility retry', async () => {
    const siyuanPort = createSiyuanPort();
    const fixture = createSelfTestMutationFixture('inserted-root-1');
    let visibilityAttempts = 0;
    siyuanPort.appendBlockUnderParentDetailed.mockResolvedValue(fixture.mutation);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      const ids = extractQuotedSqlValues(stmt);
      if (ids.some((id) => fixture.rows.some((row) => row!.id === id))) {
        visibilityAttempts += 1;
        return visibilityAttempts === 1
          ? []
          : fixture.rows.filter((row) => ids.includes(row!.id));
      }
      return [];
    });
    const createFromBlocks = vi.fn(async () => ({
      ok: true,
      value: {
        xiuyuan: { id: 'xy-question-1', blockIDs: [fixture.questionBlockId, fixture.answerBlockId], templateID: 'builtin-basic-qa' },
        cards: [{ id: 'riff-card-1', xiuyuanId: 'xy-question-1', faceIndex: 0 }],
      },
    }));
    const service = createService({
      siyuanPort,
      xiuyuanService: { createFromBlocks },
      llmChat: vi.fn(async () => ({
        content: JSON.stringify({
          selfTestCards: {
            cards: [{ id: 'candidate-a', question: 'Question A', answer: 'Answer A', kind: '应用', selected: true }],
          },
        }),
        raw: {},
      })),
    });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });
    service.setActiveTab('self-test-cards');
    await service.runActiveTab();
    const message = latestAssistantResult(service, 'self-test-cards');

    const result = await service.createSelfTestCardsFromSelectedCandidates({
      mode: 'daily-note',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
    }, message!.id);

    expect(siyuanPort.ensureTodayDailyNote).toHaveBeenCalledWith('notebook-1');
    expect(siyuanPort.appendBlockUnderParentDetailed).toHaveBeenCalledWith('* Question A\n\n  * Answer A', 'daily-doc-1');
    expect(createFromBlocks).toHaveBeenCalledWith(expect.objectContaining({
      templateId: 'builtin-basic-qa',
      fieldMapping: {
        question: fixture.questionBlockId,
        answer: fixture.answerBlockId,
      },
      blockIds: [fixture.questionBlockId, fixture.answerBlockId],
      deckId: 'deck-1',
      source: 'ai-workbench',
      duplicatePolicy: 'reuse-existing',
    }));
    expect(visibilityAttempts).toBeGreaterThan(1);
    expect(result.createdCount).toBe(1);
    expect(result.createdCardIds).toEqual(['riff-card-1']);
  });

  it('falls back to root list-item kramdown when the mutation subtree is not immediately queryable', async () => {
    const siyuanPort = createSiyuanPort();
    const fixture = createSelfTestMutationFixture('inserted-root-kramdown');
    siyuanPort.appendBlockUnderParentDetailed.mockResolvedValue(fixture.mutation);
    siyuanPort.getBlockKramdown.mockResolvedValue({ kramdown: createSelfTestKramdown(fixture) });
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      if (stmt.includes('WITH RECURSIVE')) {
        return [];
      }
      const ids = extractQuotedSqlValues(stmt);
      return fixture.rows.filter((row) => ids.includes(row!.id));
    });
    const createFromBlocks = vi.fn(async () => ({
      ok: true,
      value: {
        xiuyuan: { id: 'xy-kramdown', blockIDs: [fixture.questionBlockId, fixture.answerBlockId], templateID: 'builtin-basic-qa' },
        cards: [{ id: 'riff-card-kramdown', xiuyuanId: 'xy-kramdown', faceIndex: 0 }],
      },
    }));
    const service = createService({
      siyuanPort,
      xiuyuanService: { createFromBlocks },
      llmChat: vi.fn(async () => ({
        content: JSON.stringify({
          selfTestCards: {
            cards: [{ id: 'candidate-a', question: 'Question A', answer: 'Answer A', kind: '应用', selected: true }],
          },
        }),
        raw: {},
      })),
    });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });
    service.setActiveTab('self-test-cards');
    await service.runActiveTab();
    const message = latestAssistantResult(service, 'self-test-cards');

    const result = await service.createSelfTestCardsFromSelectedCandidates({
      mode: 'daily-note',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
    }, message!.id);

    expect(siyuanPort.getBlockKramdown).toHaveBeenCalledWith(fixture.rootId);
    expect(createFromBlocks).toHaveBeenCalledWith(expect.objectContaining({
      fieldMapping: {
        question: fixture.questionBlockId,
        answer: fixture.answerBlockId,
      },
      blockIds: [fixture.questionBlockId, fixture.answerBlockId],
    }));
    expect(result.createdCardIds).toEqual(['riff-card-kramdown']);
  });

  it('creates cards from the requested self-test message instead of the latest aggregate result', async () => {
    const siyuanPort = createSiyuanPort();
    const fixture = createSelfTestMutationFixture('inserted-root-message-1', {
      question: 'Question B',
      answer: 'Answer B',
    });
    siyuanPort.appendBlockUnderParentDetailed.mockResolvedValue(fixture.mutation);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      const ids = extractQuotedSqlValues(stmt);
      return fixture.rows.filter((row) => ids.includes(row!.id));
    });
    const createFromBlocks = vi.fn(async () => ({
      ok: true,
      value: {
        xiuyuan: { id: 'xy-question-b', blockIDs: [fixture.questionBlockId, fixture.answerBlockId], templateID: 'builtin-basic-qa' },
        cards: [{ id: 'riff-card-b', xiuyuanId: 'xy-question-b', faceIndex: 0 }],
      },
    }));
    const llmChat = vi.fn()
      .mockResolvedValueOnce({
        content: JSON.stringify({
          selfTestCards: {
            cards: [
              { id: 'candidate-a', question: 'Question A', answer: 'Answer A', kind: '应用', selected: true },
              { id: 'candidate-b', question: 'Question B', answer: 'Answer B', kind: '定义', selected: true },
            ],
          },
        }),
        raw: {},
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          selfTestCards: {
            cards: [{ id: 'candidate-c', question: 'Latest Question', answer: 'Latest Answer', kind: '定义', selected: true }],
          },
        }),
        raw: {},
      });
    const service = createService({
      siyuanPort,
      xiuyuanService: { createFromBlocks },
      llmChat,
    });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });
    service.setActiveTab('self-test-cards');
    await service.runActiveTab();
    const firstMessage = latestAssistantResult(service, 'self-test-cards');
    await service.runActiveTab();

    await service.updateCandidateCard(firstMessage!.id, 'candidate-a', { selected: false });

    const result = await service.createSelfTestCardsFromSelectedCandidates({
      mode: 'daily-note',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
    }, firstMessage!.id);

    expect(siyuanPort.appendBlockUnderParentDetailed).toHaveBeenCalledTimes(1);
    expect(siyuanPort.appendBlockUnderParentDetailed).toHaveBeenCalledWith('* Question B\n\n  * Answer B', 'daily-doc-1');
    expect(result.itemResults[0]).toMatchObject({
      candidateId: 'candidate-b',
      question: 'Question B',
      status: 'created',
    });
  });

  it('inserts self-test cards after leaf targets using parsed list-item anchors and falls back to list items when paragraph blocks are missing', async () => {
    const siyuanPort = createSiyuanPort();
    const firstFixture = createSelfTestMutationFixture('inserted-root-1', {
      question: 'Question A',
      answer: 'Answer A',
    });
    const secondFixture = createSelfTestMutationFixture('inserted-root-2', {
      question: 'Question B',
      answer: 'Answer B',
      includeAnswerParagraph: false,
    });
    siyuanPort.insertBlockAfterDetailed
      .mockResolvedValueOnce(firstFixture.mutation)
      .mockResolvedValueOnce(secondFixture.mutation);
    siyuanPort.sql.mockImplementation(async (stmt: string) => {
      if (stmt.includes("WHERE id = 'target-leaf'")) {
        return [{ id: 'target-leaf', box: 'notebook-1', root_id: 'target-doc', type: 'p', content: '落点', hpath: '/落点' }];
      }
      const ids = extractQuotedSqlValues(stmt);
      return [...firstFixture.rows, ...secondFixture.rows].filter((row) => ids.includes(row!.id));
    });
    const createFromBlocks = vi.fn(async (command: { blockIds: string[]; fieldMapping: Record<string, string> }) => ({
      ok: true,
      value: {
        xiuyuan: { id: `xy-${command.blockIds.join('-')}`, blockIDs: command.blockIds, templateID: 'builtin-basic-qa' },
        cards: [{ id: `card-${command.blockIds[0]}`, xiuyuanId: 'xy', faceIndex: 0 }],
      },
    }));
    const service = createService({
      siyuanPort,
      xiuyuanService: { createFromBlocks },
      llmChat: vi.fn(async () => ({
        content: JSON.stringify({
          selfTestCards: {
            cards: [
              { id: 'candidate-a', question: 'Question A', answer: 'Answer A', kind: '应用', selected: true },
              { id: 'candidate-b', question: 'Question B', answer: 'Answer B', kind: '定义', selected: true },
            ],
          },
        }),
        raw: {},
      })),
    });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });
    service.setActiveTab('self-test-cards');
    await service.runActiveTab();
    const message = latestAssistantResult(service, 'self-test-cards');

    const result = await service.createSelfTestCardsFromSelectedCandidates({
      mode: 'block',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
      targetBlockId: 'target-leaf',
    }, message!.id);

    expect(siyuanPort.insertBlockAfterDetailed).toHaveBeenNthCalledWith(1, '* Question A\n\n  * Answer A', 'target-leaf');
    expect(siyuanPort.insertBlockAfterDetailed).toHaveBeenNthCalledWith(2, '* Question B\n\n  * Answer B', firstFixture.rootId);
    expect(createFromBlocks).toHaveBeenNthCalledWith(2, expect.objectContaining({
      fieldMapping: {
        question: secondFixture.questionBlockId,
        answer: secondFixture.answerBlockId,
      },
      blockIds: [secondFixture.questionBlockId, secondFixture.answerBlockId],
    }));
    expect(result.insertedRootBlockIds).toEqual([firstFixture.rootId, secondFixture.rootId]);
    expect(result.createdCount).toBe(2);
  });

  it('refuses self-test card creation when the self-test result is stale', async () => {
    const service = createService({
      xiuyuanService: { createFromBlocks: vi.fn() },
      llmChat: vi.fn(async () => ({
        content: JSON.stringify({
          selfTestCards: {
            cards: [{ id: 'candidate-a', question: 'Question A', answer: 'Answer A', kind: '应用', selected: true }],
          },
        }),
        raw: {},
      })),
    });

    await service.open({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: createCard('card-a', 'card-block-1', 'front-1', 'back-1', 'source-1') as never,
      revealed: true,
    });
    service.setActiveTab('self-test-cards');
    await service.runActiveTab();
    const message = latestAssistantResult(service, 'self-test-cards');
    service.state.viewState[AI_CONCEPT_COACH_SKILL_ID]['self-test-cards'].stale = true;
    service.state.viewState[AI_CONCEPT_COACH_SKILL_ID]['self-test-cards'].staleReason = '当前上下文已变化，请先重新运行。';

    await expect(service.createSelfTestCardsFromSelectedCandidates({
      mode: 'daily-note',
      notebookId: 'notebook-1',
      notebookName: '学习笔记',
    }, message!.id)).rejects.toThrow('当前上下文已变化，请先重新运行。');
  });
});
