import type { LLMMessage, LLMPort, LLMResponse, LLMToolCall } from '@/application/ports/LLMPort';
import type { AIChatToolExecutorService } from '@/application/services/AIChatToolExecutorService';
import type { AIChatToolRegistry } from '@/application/services/AIChatToolRegistry';
import type { AIChatRegisteredSkillDescriptor } from '@/application/services/AIChatSkillRegistry';
import type {
  AIAttachedContextItem,
  AIChatApprovalRequest,
  AIChatToolCall,
  AIChatToolExecutionResult,
  AISkillTabId,
  AIWorkbenchAssistantTextMessage,
  AIWorkbenchMessage,
  AIWorkbenchNodeScope,
  AIWorkbenchState,
  AIWorkbenchTreeNode,
} from '@/types/ai';
import type { AIProviderConfig, AISettings } from '@/types/settings';

type ChatModelRequest = {
  settings: AISettings;
  provider: AIProviderConfig;
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
  observer?: Parameters<LLMPort['chat']>[0]['observer'];
  stream?: boolean;
};

export type AIWorkbenchGeneralChatRuntimeDeps = {
  state: AIWorkbenchState;
  toolRegistry: Pick<AIChatToolRegistry, 'get'>;
  toolExecutor: Pick<
    AIChatToolExecutorService,
    'getEnabledToolDefinitions' | 'buildToolRules' | 'executeToolCall'
  >;
  assertModelSettings: () => AISettings;
  resolveDefaultProvider: (settings: AISettings) => AIProviderConfig;
  buildGeneralChatMessages: (
    settings: AISettings,
    skill: AIChatRegisteredSkillDescriptor,
    tabId: AISkillTabId,
    attachedContexts: AIAttachedContextItem[],
    toolRules: string,
  ) => LLMMessage[];
  requestChatModel: (messages: LLMMessage[], input: ChatModelRequest) => Promise<LLMResponse>;
  appendNodeMessage: (
    tabId: AISkillTabId,
    message: AIWorkbenchMessage,
    options?: {
      scope?: AIWorkbenchNodeScope;
      parentNodeId?: string | null;
      activateView?: boolean;
      updateTabIds?: AISkillTabId[];
    },
  ) => AIWorkbenchTreeNode;
  patchActiveNodeMessage: (
    messageId: string,
    updater: (message: AIWorkbenchMessage) => AIWorkbenchMessage,
    options?: { status?: AIWorkbenchTreeNode['status'] },
  ) => AIWorkbenchMessage | null;
  toRuntimeToolCall: (toolCall: LLMToolCall) => AIChatToolCall;
  requestInlineToolApproval: (request: AIChatApprovalRequest) => Promise<{ approved: boolean; rejectReason?: string }>;
  appendToolLogMessage: (
    result: AIChatToolExecutionResult,
    skillId: AIChatRegisteredSkillDescriptor['id'],
    tabId: AISkillTabId,
    runGroupId: string,
  ) => void;
  ensureRunNotAborted: () => void;
};

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function createEntryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export type AIWorkbenchGeneralChatToolLoopInput = {
  skill: AIChatRegisteredSkillDescriptor;
  tabId: AISkillTabId;
  attachedContexts: AIAttachedContextItem[];
  runGroupId: string;
  requestSourceMessageId: string;
  onPrimaryAssistantMessage?: (messageId: string) => void;
};

export class AIWorkbenchGeneralChatRuntime {
  constructor(private readonly deps: AIWorkbenchGeneralChatRuntimeDeps) {}

  async runToolLoop(input: AIWorkbenchGeneralChatToolLoopInput): Promise<void> {
    const {
      skill,
      tabId,
      attachedContexts,
      runGroupId,
      requestSourceMessageId,
      onPrimaryAssistantMessage,
    } = input;
    const settings = this.deps.assertModelSettings();
    const provider = this.deps.resolveDefaultProvider(settings);
    const enabledTools = this.deps.toolExecutor.getEnabledToolDefinitions(skill.defaultToolGroups);
    const llmMessages: LLMMessage[] = this.deps.buildGeneralChatMessages(
      settings,
      skill,
      tabId,
      attachedContexts,
      this.deps.toolExecutor.buildToolRules(skill.defaultToolGroups),
    );
    const maxRounds = Math.max(1, settings.chatDefaults.maxToolRounds || 4);
    const maxToolCalls = Math.max(6, maxRounds * 4);
    const repeatedToolCalls = new Map<string, number>();
    let totalToolCalls = 0;
    let toolBudgetReached = false;

    for (let round = 0; round < maxRounds; round += 1) {
      this.deps.ensureRunNotAborted();
      const assistantMessageId = createEntryId('ai-msg');
      const placeholderNode = this.deps.appendNodeMessage(tabId, {
        id: assistantMessageId,
        skillId: skill.id,
        tabId,
        view: skill.id,
        kind: 'assistant-text',
        content: '',
        createdAt: Date.now(),
        sourceContent: null,
        appliedContexts: attachedContexts,
        reasoningContent: '',
        diagnostics: [],
        requestSourceMessageId,
        runGroupId,
        presentation: 'primary',
      } satisfies AIWorkbenchAssistantTextMessage, {
        scope: 'skill',
      });
      placeholderNode.status = 'streaming';
      onPrimaryAssistantMessage?.(assistantMessageId);
      let response: LLMResponse;
      try {
        response = await this.deps.requestChatModel(llmMessages, {
          settings,
          provider,
          tools: enabledTools,
          observer: {
            onTextDelta: (delta) => {
              if (!delta) {
                return;
              }
              this.deps.patchActiveNodeMessage(assistantMessageId, (message) => ({
                ...(message as AIWorkbenchAssistantTextMessage),
                content: `${(message as AIWorkbenchAssistantTextMessage).content || ''}${delta}`,
              } satisfies AIWorkbenchAssistantTextMessage), { status: 'streaming' });
            },
            onReasoningDelta: (delta) => {
              if (!delta) {
                return;
              }
              this.deps.patchActiveNodeMessage(assistantMessageId, (message) => ({
                ...(message as AIWorkbenchAssistantTextMessage),
                reasoningContent: `${(message as AIWorkbenchAssistantTextMessage).reasoningContent || ''}${delta}`,
              } satisfies AIWorkbenchAssistantTextMessage), { status: 'streaming' });
            },
            onDiagnostic: (diagnostic) => {
              if (!diagnostic) {
                return;
              }
              this.deps.patchActiveNodeMessage(assistantMessageId, (message) => ({
                ...(message as AIWorkbenchAssistantTextMessage),
                diagnostics: [
                  ...((message as AIWorkbenchAssistantTextMessage).diagnostics || []),
                  diagnostic,
                ].slice(-8),
              } satisfies AIWorkbenchAssistantTextMessage), { status: 'streaming' });
            },
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('已停止') || message.includes('aborted')) {
          this.deps.patchActiveNodeMessage(assistantMessageId, (entry) => ({
            ...(entry as AIWorkbenchAssistantTextMessage),
            interrupted: true,
          } satisfies AIWorkbenchAssistantTextMessage), { status: 'interrupted' });
        }
        throw error;
      }
      const assistantContent = normalizeString(response.content);
      const toolCalls = response.toolCalls || [];
      if (toolCalls.length === 0) {
        this.deps.patchActiveNodeMessage(assistantMessageId, (message) => ({
          ...(message as AIWorkbenchAssistantTextMessage),
          content: assistantContent || '这次没有返回可用内容。',
          sourceContent: assistantContent || null,
          reasoningContent: response.reasoningContent || (message as AIWorkbenchAssistantTextMessage).reasoningContent || null,
          diagnostics: response.diagnostics || (message as AIWorkbenchAssistantTextMessage).diagnostics || [],
          interrupted: false,
          presentation: 'primary',
        } satisfies AIWorkbenchAssistantTextMessage), { status: 'ready' });
        return;
      }

      llmMessages.push({
        role: 'assistant',
        content: assistantContent,
        toolCalls,
        reasoningContent: response.reasoningContent,
      });

      this.deps.patchActiveNodeMessage(assistantMessageId, (message) => ({
        ...(message as AIWorkbenchAssistantTextMessage),
        content: assistantContent || '我先调用几步工具来补全信息。',
        sourceContent: assistantContent || (message as AIWorkbenchAssistantTextMessage).sourceContent || null,
        reasoningContent: response.reasoningContent || (message as AIWorkbenchAssistantTextMessage).reasoningContent || null,
        diagnostics: response.diagnostics || (message as AIWorkbenchAssistantTextMessage).diagnostics || [],
        interrupted: false,
        presentation: 'supplemental',
      } satisfies AIWorkbenchAssistantTextMessage), { status: 'ready' });

      for (const llmToolCall of toolCalls) {
        this.deps.ensureRunNotAborted();
        const toolCall = this.deps.toRuntimeToolCall(llmToolCall);
        const toolCallSignature = `${toolCall.name}:${stableStringify(toolCall.arguments)}`;
        const previousCount = repeatedToolCalls.get(toolCallSignature) || 0;
        let result: AIChatToolExecutionResult;
        if (totalToolCalls >= maxToolCalls) {
          toolBudgetReached = true;
          result = this.buildToolLoopGuardResult(
            toolCall,
            settings,
            'execution-rejected',
            `工具调用预算已达到上限（${maxToolCalls} 次）。请直接基于当前结果给出最终答复。`,
            round + 1,
            response.usage,
          );
        } else if (previousCount >= 2) {
          result = this.buildToolLoopGuardResult(
            toolCall,
            settings,
            'execution-rejected',
            '同一轮里重复调用了相同工具和参数。请改用已有结果、ReadVar，或直接总结。',
            round + 1,
            response.usage,
          );
        } else {
          repeatedToolCalls.set(toolCallSignature, previousCount + 1);
          totalToolCalls += 1;
          result = await this.deps.toolExecutor.executeToolCall(toolCall, {
            context: this.deps.state.context,
            attachedContexts,
          }, {
            roundIndex: round + 1,
            llmUsage: response.usage,
            approvals: {
              requestApproval: (request) => this.deps.requestInlineToolApproval({
                ...request,
                runGroupId,
                skillId: skill.id,
                tabId,
              }),
            },
          });
        }
        this.deps.ensureRunNotAborted();
        this.deps.state.toolTimeline.push(result);
        this.deps.appendToolLogMessage(result, skill.id, tabId, runGroupId);
        llmMessages.push({
          role: 'tool',
          toolCallId: result.toolCallId,
          name: result.toolName,
          content: result.finalText || (result.status === 'success' ? 'Tool finished with no textual output.' : result.error || 'Tool call was rejected.'),
        });
        if (toolBudgetReached) {
          break;
        }
      }
      if (toolBudgetReached) {
        break;
      }
    }

    await this.requestToolchainSummary(
      skill,
      tabId,
      attachedContexts,
      llmMessages,
      settings,
      provider,
      runGroupId,
      requestSourceMessageId,
      onPrimaryAssistantMessage,
    );
  }

  private buildToolLoopGuardResult(
    toolCall: AIChatToolCall,
    settings: AISettings,
    status: AIChatToolExecutionResult['status'],
    message: string,
    roundIndex?: number,
    llmUsage?: AIChatToolExecutionResult['llmUsage'],
  ): AIChatToolExecutionResult {
    return {
      status,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      group: this.deps.toolRegistry.get(toolCall.name, settings)?.group || 'vars',
      args: { ...toolCall.arguments },
      argsText: JSON.stringify(toolCall.arguments, null, 2),
      finalText: message,
      resultText: message,
      error: status === 'success' ? undefined : message,
      roundIndex,
      llmUsage,
      createdAt: Date.now(),
    };
  }

  private async requestToolchainSummary(
    skill: AIChatRegisteredSkillDescriptor,
    tabId: AISkillTabId,
    attachedContexts: AIAttachedContextItem[],
    llmMessages: LLMMessage[],
    settings: AISettings,
    provider: AIProviderConfig,
    runGroupId: string,
    requestSourceMessageId: string,
    onPrimaryAssistantMessage?: (messageId: string) => void,
  ): Promise<void> {
    const assistantMessageId = createEntryId('ai-msg');
    const placeholderNode = this.deps.appendNodeMessage(tabId, {
      id: assistantMessageId,
      skillId: skill.id,
      tabId,
      view: skill.id,
      kind: 'assistant-text',
      content: '',
      createdAt: Date.now(),
      sourceContent: null,
      appliedContexts: attachedContexts,
      reasoningContent: '',
      diagnostics: [],
      requestSourceMessageId,
      runGroupId,
      presentation: 'primary',
    } satisfies AIWorkbenchAssistantTextMessage, {
      scope: 'skill',
    });
    placeholderNode.status = 'streaming';
    onPrimaryAssistantMessage?.(assistantMessageId);

    const response = await this.deps.requestChatModel([
      ...llmMessages,
      {
        role: 'system',
        content: '你已经完成当前轮次的工具调用。现在不要再调用工具，只根据已有工具结果和上下文，给用户一个清晰、简短、可执行的最终答复。',
      },
    ], {
      settings,
      provider,
      observer: {
        onTextDelta: (delta) => {
          if (!delta) {
            return;
          }
          this.deps.patchActiveNodeMessage(assistantMessageId, (message) => ({
            ...(message as AIWorkbenchAssistantTextMessage),
            content: `${(message as AIWorkbenchAssistantTextMessage).content || ''}${delta}`,
          } satisfies AIWorkbenchAssistantTextMessage), { status: 'streaming' });
        },
        onReasoningDelta: (delta) => {
          if (!delta) {
            return;
          }
          this.deps.patchActiveNodeMessage(assistantMessageId, (message) => ({
            ...(message as AIWorkbenchAssistantTextMessage),
            reasoningContent: `${(message as AIWorkbenchAssistantTextMessage).reasoningContent || ''}${delta}`,
          } satisfies AIWorkbenchAssistantTextMessage), { status: 'streaming' });
        },
        onDiagnostic: (diagnostic) => {
          if (!diagnostic) {
            return;
          }
          this.deps.patchActiveNodeMessage(assistantMessageId, (message) => ({
            ...(message as AIWorkbenchAssistantTextMessage),
            diagnostics: [
              ...((message as AIWorkbenchAssistantTextMessage).diagnostics || []),
              diagnostic,
            ].slice(-8),
          } satisfies AIWorkbenchAssistantTextMessage), { status: 'streaming' });
        },
      },
    });

    const assistantContent = normalizeString(response.content)
      || '工具链已达到最大轮数，我先根据现有结果整理到这里。';
    this.deps.patchActiveNodeMessage(assistantMessageId, (message) => ({
      ...(message as AIWorkbenchAssistantTextMessage),
      content: assistantContent,
      sourceContent: assistantContent,
      reasoningContent: response.reasoningContent || (message as AIWorkbenchAssistantTextMessage).reasoningContent || null,
      diagnostics: response.diagnostics || (message as AIWorkbenchAssistantTextMessage).diagnostics || [],
      interrupted: false,
      presentation: 'primary',
    } satisfies AIWorkbenchAssistantTextMessage), { status: 'ready' });
  }
}
