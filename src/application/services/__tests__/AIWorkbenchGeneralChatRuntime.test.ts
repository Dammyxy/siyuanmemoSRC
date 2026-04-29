import { describe, expect, it, vi } from 'vitest';
import { AIWorkbenchConversationTreeRuntime } from '../AIWorkbenchConversationTreeRuntime';
import { AIWorkbenchGeneralChatRuntime } from '../AIWorkbenchGeneralChatRuntime';
import {
  createEmptyConversationTree,
  createInitialThreads,
} from '../AIWorkbenchSessionRuntime';
import { DEFAULT_AI_SETTINGS, type AISettings } from '@/types/settings';
import {
  AI_GENERAL_CHAT_SKILL_ID,
  type AIAttachedContextItem,
  type AIChatToolCall,
  type AIChatToolExecutionResult,
  type AISkillTabId,
  type AIWorkbenchMessage,
  type AIWorkbenchState,
} from '@/types/ai';
import type { AIChatRegisteredSkillDescriptor } from '../AIChatSkillRegistry';
import type { LLMMessage, LLMToolCall } from '@/application/ports/LLMPort';

const chatSkill = {
  id: AI_GENERAL_CHAT_SKILL_ID,
  title: 'Chat',
  mode: 'chat',
  defaultToolGroups: ['vars'],
} as AIChatRegisteredSkillDescriptor;

function createSettings(maxToolRounds = 2): AISettings {
  return {
    ...DEFAULT_AI_SETTINGS,
    enabled: true,
    providers: [{
      id: 'provider-1',
      name: 'Provider',
      baseUrl: 'https://example.test/v1',
      apiKey: 'key',
      protocol: 'openai-compatible',
      models: [{ id: 'model-1', name: 'Model' }],
      enabled: true,
    }],
    defaultModelId: 'model-1',
    model: 'model-1',
    chatDefaults: {
      ...DEFAULT_AI_SETTINGS.chatDefaults,
      maxToolRounds,
      stream: false,
    },
  };
}

function createHarness(options?: {
  settings?: AISettings;
  requestChatModel?: ReturnType<typeof vi.fn>;
  executeToolCall?: ReturnType<typeof vi.fn>;
}) {
  const state = {
    activeSkillId: AI_GENERAL_CHAT_SKILL_ID,
    activeTabId: 'chat',
    context: null,
    contextSignature: null,
    threads: createInitialThreads(),
    tree: createEmptyConversationTree(),
    toolTimeline: [],
  } as AIWorkbenchState;
  const tree = new AIWorkbenchConversationTreeRuntime({
    state,
    normalizeSkillForCurrentSettings: (skillId) => skillId,
    normalizeTabForCurrentSettings: (tabId) => tabId,
    isContextScopedConceptTab: () => false,
  });
  const settings = options?.settings || createSettings();
  const executeToolCall = options?.executeToolCall || vi.fn(async (toolCall: AIChatToolCall, _runtime, input): Promise<AIChatToolExecutionResult> => ({
    status: 'success',
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    group: 'vars',
    args: toolCall.arguments,
    argsText: JSON.stringify(toolCall.arguments),
    finalText: 'tool result',
    resultText: 'tool result',
    roundIndex: input?.roundIndex,
    llmUsage: input?.llmUsage,
    createdAt: Date.now(),
  }));
  const requestChatModel = options?.requestChatModel || vi.fn(async () => ({
    content: 'Final answer',
    toolCalls: [],
  }));
  const runtime = new AIWorkbenchGeneralChatRuntime({
    state,
    toolRegistry: {
      get: () => ({ group: 'vars' }),
    } as never,
    toolExecutor: {
      getEnabledToolDefinitions: () => [],
      buildToolRules: () => 'Use tools when useful.',
      executeToolCall,
    },
    assertModelSettings: () => settings,
    resolveDefaultProvider: () => settings.providers[0],
    buildGeneralChatMessages: () => [{ role: 'user', content: 'Question' }] as LLMMessage[],
    requestChatModel,
    appendNodeMessage: (tabId, message, appendOptions) => tree.appendNodeMessage(tabId, message, appendOptions),
    patchActiveNodeMessage: (messageId, updater, patchOptions) => tree.patchActiveNodeMessage(messageId, updater, patchOptions),
    toRuntimeToolCall: (toolCall: LLMToolCall) => ({
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: JSON.parse(toolCall.function.arguments || '{}'),
    }),
    requestInlineToolApproval: vi.fn(async () => ({ approved: true })),
    appendToolLogMessage: vi.fn(),
    ensureRunNotAborted: vi.fn(),
  });
  return { runtime, state, requestChatModel, executeToolCall };
}

function toolCall(id: string): LLMToolCall {
  return {
    id,
    type: 'function',
    function: {
      name: 'ReadVar',
      arguments: JSON.stringify({ key: 'same' }),
    },
  };
}

describe('AIWorkbenchGeneralChatRuntime', () => {
  it('materializes a final assistant message when the model returns no tool calls', async () => {
    const { runtime, state, requestChatModel } = createHarness();

    await runtime.runToolLoop({
      skill: chatSkill,
      tabId: 'chat',
      attachedContexts: [] as AIAttachedContextItem[],
      runGroupId: 'run-1',
      requestSourceMessageId: 'user-1',
    });

    expect(requestChatModel).toHaveBeenCalledOnce();
    expect(state.threads[AI_GENERAL_CHAT_SKILL_ID].chat.messages.at(-1)).toMatchObject({
      kind: 'assistant-text',
      content: 'Final answer',
      sourceContent: 'Final answer',
      presentation: 'primary',
    });
  });

  it('rejects repeated identical tool calls and then requests a final summary', async () => {
    const requestChatModel = vi.fn()
      .mockResolvedValueOnce({ content: 'Need tool', toolCalls: [toolCall('call-1')] })
      .mockResolvedValueOnce({ content: 'Need tool again', toolCalls: [toolCall('call-2')] })
      .mockResolvedValueOnce({ content: 'Need tool again', toolCalls: [toolCall('call-3')] })
      .mockResolvedValueOnce({ content: 'Summary', toolCalls: [] });
    const executeToolCall = vi.fn(async (toolCallInput: AIChatToolCall, _runtime, input): Promise<AIChatToolExecutionResult> => ({
      status: 'success',
      toolCallId: toolCallInput.id,
      toolName: toolCallInput.name,
      group: 'vars',
      args: toolCallInput.arguments,
      argsText: JSON.stringify(toolCallInput.arguments),
      finalText: 'tool result',
      resultText: 'tool result',
      roundIndex: input?.roundIndex,
      createdAt: Date.now(),
    }));
    const { runtime, state } = createHarness({
      settings: createSettings(3),
      requestChatModel,
      executeToolCall,
    });

    await runtime.runToolLoop({
      skill: chatSkill,
      tabId: 'chat' as AISkillTabId,
      attachedContexts: [],
      runGroupId: 'run-1',
      requestSourceMessageId: 'user-1',
    });

    expect(executeToolCall).toHaveBeenCalledTimes(2);
    expect(requestChatModel).toHaveBeenCalledTimes(4);
    expect(state.toolTimeline.map((entry) => entry.status)).toEqual([
      'success',
      'success',
      'execution-rejected',
    ]);
    expect(state.toolTimeline[2]?.resultText).toContain('重复调用');
    expect(state.threads[AI_GENERAL_CHAT_SKILL_ID].chat.messages.at(-1)).toMatchObject({
      kind: 'assistant-text',
      content: 'Summary',
    });
  });
});
