import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMError, type LLMRequest } from '@/application/ports/LLMPort';
import { getAIChatSkill, type AIChatRegisteredSkillDescriptor } from '@/application/services/AIChatSkillRegistry';
import { AIWorkbenchPromptRuntime } from '@/application/services/AIWorkbenchPromptRuntime';
import {
  createInitialThreads,
} from '@/application/services/AIWorkbenchSessionRuntime';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  type AIAttachedContextItem,
  type AIWorkbenchRenderEntry,
  type AIWorkbenchState,
} from '@/types/ai';
import { DEFAULT_AI_SETTINGS, type AISettings } from '@/types/settings';

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => loggerMocks,
}));

function createSettings(): AISettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    enabled: true,
    baseUrl: 'https://fallback.test/v1',
    apiKey: 'fallback-key',
    model: 'fallback-model',
    defaultModelId: 'model-1',
    defaultOutputLanguage: 'zh-CN',
    providers: [
      {
        id: 'provider-1',
        name: 'Provider One',
        baseUrl: 'https://provider.test/v1',
        apiKey: 'provider-key',
        protocol: 'openai-compatible',
        models: [{ id: 'model-1', name: 'Model One' }],
        enabled: true,
      },
    ],
    chatDefaults: {
      ...DEFAULT_AI_SETTINGS.chatDefaults,
      stream: false,
    },
  };
}

function createState(): AIWorkbenchState {
  return {
    activeSkillId: AI_CONCEPT_COACH_SKILL_ID,
    activeTabId: 'working-definition',
    contextSignature: 'ctx-1',
    context: {
      source: 'standalone',
      selectedBlockIds: ['block-1'],
      blocks: [{
        blockId: 'block-1',
        text: 'Block text',
        type: 'p',
        hPath: '/Doc/Block',
      }],
      queueType: null,
      queueProgress: null,
      currentCard: null,
      neuralBatch: null,
    },
    threads: createInitialThreads(),
    skillResults: {
      [AI_CONCEPT_COACH_SKILL_ID]: null,
    },
    genericSkillResults: {},
    failureDiagnostic: null,
  } as AIWorkbenchState;
}

function createRuntime(options?: {
  settings?: AISettings;
  state?: AIWorkbenchState;
  llmChat?: ReturnType<typeof vi.fn>;
  renderEntries?: AIWorkbenchRenderEntry[];
  backendRuntimeEnabled?: boolean;
  backendSessionService?: {
    createSession: ReturnType<typeof vi.fn>;
    executePrompt: ReturnType<typeof vi.fn>;
    startStream: ReturnType<typeof vi.fn>;
    cancelStream: ReturnType<typeof vi.fn>;
    getJob: ReturnType<typeof vi.fn>;
    proxyNetwork: ReturnType<typeof vi.fn>;
  };
}) {
  const settings = options?.settings || createSettings();
  const state = options?.state || createState();
  const llmChat = options?.llmChat || vi.fn(async () => ({ content: '{}', raw: {} }));
  const backendSessionService = options?.backendSessionService || {
    createSession: vi.fn(async () => ({ ok: true, session: { sessionId: 'session-1' } })),
    executePrompt: vi.fn(async () => ({
      ok: true,
      sessionId: 'session-1',
      streamId: 'stream-1',
      jobId: 'job-1',
      state: 'completed',
      diagnosticEventId: 'diag-exec',
      response: {
        status: 200,
        headers: {},
        body: JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
        }),
      },
    })),
    startStream: vi.fn(async () => ({
      ok: true,
      streamId: 'stream-1',
      sessionId: 'session-1',
      jobId: 'job-1',
      state: 'started',
      diagnosticEventId: 'diag-start',
    })),
    cancelStream: vi.fn(async () => ({
      ok: true,
      streamId: 'stream-1',
      sessionId: 'session-1',
      jobId: 'job-1',
      state: 'canceled',
      diagnosticEventId: 'diag-cancel',
    })),
    getJob: vi.fn(async () => ({ ok: true, job: { jobId: 'job-1', state: 'completed' } })),
    proxyNetwork: vi.fn(async () => ({
      status: 200,
      headers: {},
      body: JSON.stringify({
        choices: [{
          message: { content: '{"ok":true}' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
      }),
    })),
  };
  const runtime = new AIWorkbenchPromptRuntime({
    state,
    getAISettings: () => settings,
    llmPort: {
      chat: llmChat,
    },
    backendRuntimeEnabled: options?.backendRuntimeEnabled,
    backendSessionService,
    getSelfTestCreationMode: () => 'list-item',
    getResolvedSkill: (skillId) => getAIChatSkill(skillId, settings),
    normalizeTabForCurrentSettings: (value) => String(value || 'working-definition') as never,
    getArenaRuntimeOverrides: () => ({
      selectedPackId: null,
      selectedPackTitle: null,
      challengeTrigger: null,
      challengers: [],
      tabRunPrompts: {
        'working-definition': 'Arena run override',
      },
      tabFollowUpPrompts: {
        'working-definition': 'Arena follow-up override',
      },
    }),
    getRenderEntriesForTab: () => options?.renderEntries || [],
    getFollowUpsForTab: () => [],
    findLatestConceptCoachResultForContext: () => null,
  });
  return { runtime, state, llmChat, settings, backendSessionService };
}

function attachedContext(): AIAttachedContextItem {
  return {
    id: 'ctx-item-1',
    providerKey: 'manual',
    title: 'Manual',
    summary: 'Summary',
    preview: 'Preview',
    content: 'Content',
    blockIds: ['block-1'],
    createdAt: 1,
  };
}

describe('AIWorkbenchPromptRuntime', () => {
  beforeEach(() => {
    loggerMocks.debug.mockClear();
    loggerMocks.error.mockClear();
    loggerMocks.info.mockClear();
    loggerMocks.warn.mockClear();
  });

  it('preserves the concept coach structured request wire shape', async () => {
    const { runtime, llmChat } = createRuntime();

    await runtime.requestConceptCoachTabResult('working-definition', [attachedContext()]);

    const request = llmChat.mock.calls[0]?.[0] as LLMRequest;
    expect(request).toMatchObject({
      baseUrl: 'https://provider.test/v1',
      apiKey: 'provider-key',
      model: 'model-1',
      responseFormat: 'json_object',
      modelRef: {
        providerId: 'provider-1',
        modelId: 'model-1',
      },
    });
    expect(request.messages[0]).toMatchObject({ role: 'system' });
    expect(request.messages[0]?.content).toContain('Arena run override');
    const payload = JSON.parse(request.messages[1]?.content || '{}');
    expect(payload).toMatchObject({
      language: 'zh-CN',
      skillId: AI_CONCEPT_COACH_SKILL_ID,
      contextSignature: 'ctx-1',
      tabIds: ['working-definition'],
      tabId: 'working-definition',
      selfTestConfig: {
        creationMode: 'list-item',
      },
      context: {
        source: 'standalone',
        selectedBlocks: [{
          blockId: 'block-1',
          text: 'Block text',
          type: 'p',
          hPath: '/Doc/Block',
        }],
      },
    });
    expect(payload.attachedContexts).toEqual([attachedContext()]);
  });

  it('builds general chat system context and keeps only usable history', () => {
    const renderEntries = [
      {
        primaryMessage: {
          kind: 'user',
          content: 'Question A',
        },
      },
      {
        primaryMessage: {
          kind: 'assistant-text',
          content: 'Rendered',
          sourceContent: 'Answer A\n<tool-chain-summary>hide me</tool-chain-summary>\n\n\nTail',
        },
      },
      {
        primaryMessage: {
          kind: 'assistant-text',
          content: 'Tool log should not become history',
          presentation: 'supplemental',
        },
      },
      {
        primaryMessage: {
          kind: 'assistant-text',
          content: 'Failure should not become history',
          failureDiagnostic: { content: 'bad' },
        },
      },
    ] as AIWorkbenchRenderEntry[];
    const { runtime, settings } = createRuntime({ renderEntries });
    const skill = {
      id: 'user:chat',
      title: 'User Chat',
      mode: 'chat',
      systemPromptTemplate: 'System prompt',
      defaultToolGroups: [],
      tabs: [{ id: 'chat', title: 'Chat', emptyHint: '' }],
    } as AIChatRegisteredSkillDescriptor;

    const messages = runtime.buildGeneralChatMessages(settings, skill, 'chat', [attachedContext()], 'Tool rules');

    expect(messages.map((message) => message.role)).toEqual(['system', 'user', 'assistant']);
    expect(messages[0]?.content).toContain('Tool rules');
    expect(messages[0]?.content).toContain('"blockId": "block-1"');
    expect(messages[1]?.content).toBe('Question A');
    expect(messages[2]?.content).toBe('Answer A\n\nTail');
  });

  it('extracts fenced JSON and records invalid JSON diagnostics', () => {
    const { runtime, state } = createRuntime();

    expect(runtime.extractStructuredPayload('Draft', '```json\n{"ok": true}\n```')).toEqual({ ok: true });
    expect(() => runtime.extractStructuredPayload('Draft', 'not json')).toThrow('Draft返回的内容不是合法 JSON');
    expect(state.failureDiagnostic?.content).toContain('Diagnostic type: invalid_json');
    expect(state.failureDiagnostic?.content).toContain('Task: Draft');
    expect(state.failureDiagnostic?.content).toContain('not json');
  });

  it('maps LLM errors and stores provider diagnostics', async () => {
    const llmChat = vi.fn(async () => {
      throw new LLMError('empty', {
        code: 'empty_response',
        diagnostic: 'provider diagnostic',
      });
    });
    const { runtime, state, settings } = createRuntime({ llmChat });

    await expect(runtime.requestChatModel([], {
      settings,
      provider: settings.providers[0]!,
    })).rejects.toThrow('AI 请求已发出，但模型返回了空正文');
    expect(state.failureDiagnostic?.content).toBe('provider diagnostic');
  });

  it('routes chat through backend runtime when enabled and avoids frontend llmPort chat', async () => {
    const { runtime, settings, llmChat, backendSessionService } = createRuntime({
      backendRuntimeEnabled: true,
      state: {
        ...createState(),
        sessionId: 'session-1',
        surface: 'standalone-dialog',
      } as AIWorkbenchState,
    });

    const response = await runtime.requestChatModel(
      [{ role: 'user', content: 'hello backend' }],
      {
        settings,
        provider: settings.providers[0]!,
      },
    );

    expect(llmChat).not.toHaveBeenCalled();
    expect(backendSessionService.createSession).toHaveBeenCalled();
    expect(backendSessionService.executePrompt).toHaveBeenCalled();
    expect(response.content).toBe('{"ok":true}');
    expect(response.raw).toMatchObject({
      backend: true,
      sessionId: 'session-1',
    });
    expect(loggerMocks.info).toHaveBeenCalledWith(
      '[AIWorkbenchPromptRuntime] backend ai prompt submitted',
      expect.objectContaining({
        sessionId: 'session-1',
        surface: 'standalone-dialog',
        providerId: 'provider-1',
        modelId: 'model-1',
      }),
    );
    expect(loggerMocks.info).toHaveBeenCalledWith(
      '[AIWorkbenchPromptRuntime] backend ai prompt completed',
      expect.objectContaining({
        sessionId: 'session-1',
        status: 200,
        state: 'completed',
        diagnosticEventId: 'diag-exec',
      }),
    );
    expect(JSON.stringify(loggerMocks.info.mock.calls)).not.toContain('provider-key');
  });

  it('returns backend unavailable error when backend runtime is enabled but unavailable', async () => {
    const backendSessionService = {
      createSession: vi.fn(async () => {
        throw new Error('BACKEND_UNAVAILABLE: backend worker unavailable');
      }),
      executePrompt: vi.fn(),
      startStream: vi.fn(),
      cancelStream: vi.fn(),
      getJob: vi.fn(),
      proxyNetwork: vi.fn(),
    };
    const { runtime, settings } = createRuntime({
      backendRuntimeEnabled: true,
      backendSessionService,
      state: {
        ...createState(),
        sessionId: 'session-2',
        surface: 'standalone-dialog',
      } as AIWorkbenchState,
    });

    await expect(runtime.requestChatModel([], {
      settings,
      provider: settings.providers[0]!,
    })).rejects.toThrow('BACKEND_UNAVAILABLE');
  });

  it('maps backend prompt timeout to user-facing timeout error', async () => {
    const { runtime, settings } = createRuntime({
      backendRuntimeEnabled: true,
      backendSessionService: {
        createSession: vi.fn(async () => ({ ok: true, session: { sessionId: 's-timeout' } })),
        executePrompt: vi.fn(async () => ({
          ok: true,
          sessionId: 's-timeout',
          streamId: 'st-timeout',
          jobId: 'j-timeout',
          state: 'timeout',
          unavailableClass: 'TIMEOUT',
          diagnosticEventId: 'diag-timeout',
        })),
        startStream: vi.fn(),
        cancelStream: vi.fn(),
        getJob: vi.fn(),
        proxyNetwork: vi.fn(),
      },
      state: {
        ...createState(),
        sessionId: 's-timeout',
        surface: 'standalone-dialog',
      } as AIWorkbenchState,
    });

    await expect(runtime.requestChatModel([], {
      settings,
      provider: settings.providers[0]!,
    })).rejects.toThrow('请求超时');
  });
});
