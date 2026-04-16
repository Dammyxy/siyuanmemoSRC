import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMError } from '@/application/ports/LLMPort';
import { AIWorkbenchService } from '@/application/services/AIWorkbenchService';
import { DEFAULT_AI_SETTINGS, type AISettings } from '@/types/settings';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_CONCEPT_COACH_TAB_IDS,
  AI_GENERAL_CHAT_SKILL_ID,
  AI_GENERAL_CHAT_TAB_ID,
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
  };
}

function createService(options?: {
  aiSettings?: AISettings;
  llmChat?: ReturnType<typeof vi.fn>;
  siyuanPort?: ReturnType<typeof createSiyuanPort>;
  sessionStore?: ReturnType<typeof createSessionStore>;
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
      cards: [{ question: 'Question A', answer: 'Answer A', kind: '应用', selected: true }],
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

function latestAssistantResult(service: AIWorkbenchService, tabId: (typeof AI_CONCEPT_COACH_TAB_IDS)[number]) {
  return [...service.state.threads[AI_CONCEPT_COACH_SKILL_ID][tabId].messages]
    .reverse()
    .find((message) => message.kind === 'assistant-result');
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
    expect(llmChat.mock.calls[1][0].messages.at(-1)).toMatchObject({
      role: 'tool',
      toolCallId: 'call-context',
      name: 'GetCurrentContext',
    });
  });

  it('turns write-intent tool calls into inline approvals without executing writes', async () => {
    const aiSettings = JSON.parse(JSON.stringify(createAISettings())) as AISettings;
    aiSettings.toolPolicies.groupDefaults['flashcard-write'] = true;
    const llmChat = vi.fn().mockResolvedValue({
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
    });
    const service = createService({ aiSettings, llmChat });

    await service.open({
      source: 'standalone',
      surface: 'standalone-dialog',
    });
    await service.submitSkillPrompt('暂存这张卡。');

    expect(llmChat).toHaveBeenCalledTimes(1);
    expect(service.state.toolTimeline[0]).toMatchObject({
      toolName: 'StageFlashcardDraft',
      status: 'approval-required',
    });
    expect(service.state.pendingApprovals).toHaveLength(1);
    expect(service.state.threads[AI_GENERAL_CHAT_SKILL_ID][AI_GENERAL_CHAT_TAB_ID].messages)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'approval' }),
        expect.objectContaining({ kind: 'assistant-text', content: expect.stringContaining('需要你审批') }),
      ]));

    await service.resolveToolApproval(service.state.pendingApprovals[0].id, true);

    expect(service.state.pendingApprovals).toHaveLength(0);
    expect(service.state.threads[AI_GENERAL_CHAT_SKILL_ID][AI_GENERAL_CHAT_TAB_ID].messages)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'approval', request: expect.objectContaining({ status: 'approved' }) }),
        expect.objectContaining({ kind: 'assistant-text', content: expect.stringContaining('第一阶段不会自动落库') }),
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
});
