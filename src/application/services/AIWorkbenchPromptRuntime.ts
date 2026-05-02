import type { LLMMessage, LLMPort, LLMRequest, LLMResponse, LLMToolCall } from '@/application/ports/LLMPort';
import { LLMError } from '@/application/ports/LLMPort';
import type { AIChatRegisteredSkillDescriptor } from '@/application/services/AIChatSkillRegistry';
import type { ArenaSkillRuntimeOverrides } from '@/application/services/ArenaKernelService';
import type { AIBackendSessionService } from '@/application/services/AIBackendSessionService';
import {
  formatStructuredPromptContract,
  getPromptContractForResolvedSkillRun,
  getPromptContractForSkillRun,
  getSelfTestModeDescriptor,
} from '@/application/services/AIPromptContractRegistry';
import { tabResultFromConceptCoach } from '@/application/services/AIWorkbenchResultNormalization';
import { normalizeAIWorkbenchTabId } from '@/application/services/AIWorkbenchSkillRegistry';
import type {
  AIAttachedContextItem,
  AIChatToolCall,
  AIConceptCoachResult,
  AIConceptCoachSelfTestCreationMode,
  AIFollowUpEntry,
  AISkillId,
  AISkillTabId,
  AIWorkbenchContextSnapshot,
  AIWorkbenchFailureDiagnostic,
  AIWorkbenchRenderEntry,
  AIWorkbenchState,
} from '@/types/ai';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_CONCEPT_COACH_TAB_IDS,
} from '@/types/ai';
import {
  normalizeAISettings,
  normalizeAIPromptTemplates,
  type AIConceptCoachPromptTemplates,
  type AIProviderConfig,
  type AISettings,
} from '@/types/settings';

const CONCEPT_SKILL: AISkillId = AI_CONCEPT_COACH_SKILL_ID;
const ACTIVE_SKILL: AISkillId = AI_CONCEPT_COACH_SKILL_ID;

type ChatModelRequest = {
  settings: AISettings;
  provider: AIProviderConfig;
  tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
  observer?: Parameters<LLMPort['chat']>[0]['observer'];
  stream?: boolean;
};

export type AIWorkbenchPromptRuntimeDeps = {
  state: AIWorkbenchState;
  getAISettings: () => AISettings;
  llmPort: LLMPort;
  backendRuntimeEnabled?: boolean;
  backendSessionService?: Pick<
    AIBackendSessionService,
    | 'createSession'
    | 'startStream'
    | 'cancelStream'
    | 'getJob'
    | 'proxyNetwork'
  >;
  getSelfTestCreationMode: () => AIConceptCoachSelfTestCreationMode;
  getResolvedSkill: (skillId: AISkillId) => AIChatRegisteredSkillDescriptor;
  normalizeTabForCurrentSettings: (value: unknown, skillId: AISkillId) => AISkillTabId;
  getArenaRuntimeOverrides: (skillId: AISkillId) => ArenaSkillRuntimeOverrides;
  getRenderEntriesForTab: (tabId: AISkillTabId) => AIWorkbenchRenderEntry[];
  getFollowUpsForTab: (tabId: AISkillTabId) => AIFollowUpEntry[];
  findLatestConceptCoachResultForContext: (signature: string | null) => AIConceptCoachResult | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function tryParseJson(candidate: string): { ok: true; value: unknown } | { ok: false } {
  const normalized = candidate.trim().replace(/^json\s*[\r\n]+/i, '');
  if (!normalized) {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(normalized) };
  } catch {
    return { ok: false };
  }
}

function extractJsonPayload(raw: string): unknown {
  const direct = raw.trim();
  if (!direct) {
    throw new Error('AI returned empty content');
  }
  const directParsed = tryParseJson(direct);
  if (directParsed.ok) {
    return directParsed.value;
  }
  for (const match of direct.matchAll(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g)) {
    const parsed = tryParseJson(match[1] || '');
    if (parsed.ok) {
      return parsed.value;
    }
  }
  const objectStart = direct.indexOf('{');
  const objectEnd = direct.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    const parsed = tryParseJson(direct.slice(objectStart, objectEnd + 1));
    if (parsed.ok) {
      return parsed.value;
    }
  }
  throw new Error('AI response is not valid JSON');
}

export function resolveDefaultAIProvider(settings: AISettings): AIProviderConfig {
  const matched = settings.providers.find((provider) => (
    provider.models.some((model) => model.id === settings.defaultModelId || model.id === settings.model)
  ));
  return matched || settings.providers[0];
}

function stripToolChainSummaryFromContent(content: string): string {
  return normalizeString(content)
    .replace(/<tool-chain-summary>[\s\S]*?<\/tool-chain-summary>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toGeneralChatHistoryMessage(entry: AIWorkbenchRenderEntry): LLMMessage | null {
  const primary = entry.primaryMessage;
  if (primary.kind === 'user') {
    const content = normalizeString(primary.content);
    return content ? { role: 'user', content } : null;
  }
  if (
    primary.kind !== 'assistant-text'
    || primary.presentation === 'supplemental'
    || primary.failureDiagnostic
  ) {
    return null;
  }
  const content = stripToolChainSummaryFromContent(primary.sourceContent || primary.content);
  return content ? { role: 'assistant', content } : null;
}

export function toAIWorkbenchRuntimeToolCall(toolCall: LLMToolCall): AIChatToolCall {
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(toolCall.function.arguments || '{}');
    args = isRecord(parsed) ? parsed : {};
  } catch {
    args = {};
  }
  return {
    id: toolCall.id,
    name: toolCall.function.name,
    arguments: args,
  };
}

export class AIWorkbenchPromptRuntime {
  private currentRunAbortController: AbortController | null = null;

  constructor(private readonly deps: AIWorkbenchPromptRuntimeDeps) {}

  cancelCurrentRun(): void {
    this.currentRunAbortController?.abort();
  }

  ensureRunNotAborted(): void {
    if (this.currentRunAbortController?.signal.aborted) {
      throw new Error('当前 AI 运行已停止。');
    }
  }

  assertModelSettings(): AISettings {
    const settings = normalizeAISettings(this.deps.getAISettings());
    if (!settings.enabled) {
      throw new Error('请先在设置中启用 AI 功能。');
    }
    if (!settings.apiKey.trim()) {
      throw new Error('请先在设置中填写 AI API Key。');
    }
    if (!settings.baseUrl.trim() || !settings.model.trim()) {
      throw new Error('AI Base URL 或模型名未配置。');
    }
    return {
      ...settings,
      prompts: normalizeAIPromptTemplates(settings.prompts),
    };
  }

  resolveDefaultProvider(settings: AISettings): AIProviderConfig {
    return resolveDefaultAIProvider(settings);
  }

  getCurrentModelLabel(): string {
    const settings = normalizeAISettings(this.deps.getAISettings());
    const provider = this.resolveDefaultProvider(settings);
    return [provider.name, settings.defaultModelId || settings.model].map(normalizeString).filter(Boolean).join(' · ') || '未配置模型';
  }

  buildGeneralChatMessages(
    settings: AISettings,
    skill: AIChatRegisteredSkillDescriptor,
    tabId: AISkillTabId,
    attachedContexts: AIAttachedContextItem[],
    toolRules = '',
  ): LLMMessage[] {
    const context = this.deps.state.context;
    const systemPayload = {
      language: settings.defaultOutputLanguage,
      skillId: skill.id,
      context: {
        source: context?.source || 'standalone',
        queueType: context?.queueType,
        queueProgress: context?.queueProgress,
        currentCard: context?.currentCard,
        selectedBlocks: context?.blocks.map((block) => ({
          blockId: block.blockId,
          type: block.type,
          hPath: block.hPath,
          text: block.text.slice(0, 1200),
        })) || [],
      },
      attachedContexts: attachedContexts.map((item) => ({
        title: item.title,
        summary: item.summary,
        blockIds: item.blockIds,
        preview: item.preview,
      })),
    };
    const systemMessage: LLMMessage = {
      role: 'system',
      content: [
        skill.systemPromptTemplate,
        toolRules,
        '工具规则：优先复用已有答案与工具摘要；确实需要时再继续调用工具。不要在同一轮里反复读取同一上下文。',
        '如果需要长结果，请优先使用 ListVars / ReadVar 管理工具缓存，不要把超长内容完整复述给用户。',
        '当前会话上下文：',
        JSON.stringify(systemPayload, null, 2),
      ].join('\n\n'),
    };

    const historyMessages = this.deps.getRenderEntriesForTab(tabId)
      .map((entry) => toGeneralChatHistoryMessage(entry))
      .filter((message): message is LLMMessage => Boolean(message))
      .slice(-12);
    return [systemMessage, ...historyMessages];
  }

  async requestChatModel(messages: LLMMessage[], input: ChatModelRequest): Promise<LLMResponse> {
    const settings = input.settings;
    const provider = input.provider;
    this.currentRunAbortController = new AbortController();
    const modelId = settings.defaultModelId || settings.model;
    try {
      return await this.dispatchChatRequest({
        baseUrl: provider.baseUrl || settings.baseUrl,
        apiKey: provider.apiKey || settings.apiKey,
        model: modelId,
        provider,
        protocol: provider.protocol,
        modelRef: {
          providerId: provider.id,
          modelId,
        },
        timeoutMs: settings.timeoutMs,
        temperature: settings.temperature,
        messages,
        tools: input.tools,
        toolChoice: input.tools?.length ? 'auto' : undefined,
        stream: input.stream ?? settings.chatDefaults.stream,
        abortSignal: this.currentRunAbortController.signal,
        observer: input.observer,
      });
    } catch (error) {
      if (error instanceof LLMError) {
        this.captureFailureDiagnostic(error);
        throw new Error(this.mapLlmError(error));
      }
      throw error;
    } finally {
      this.currentRunAbortController = null;
    }
  }

  toRuntimeToolCall(toolCall: LLMToolCall): AIChatToolCall {
    return toAIWorkbenchRuntimeToolCall(toolCall);
  }

  async requestConceptCoachResult(
    attachedContexts: AIAttachedContextItem[],
    userPrompt?: string,
  ): Promise<LLMResponse> {
    const context = this.requireContext();
    this.assertConceptCoachAllowed(context);
    return this.requestStructuredModel(
      this.buildConceptCoachPromptPayload({ attachedContexts, userPrompt }),
    );
  }

  async requestConceptCoachTabResult(
    tabId: AISkillTabId,
    attachedContexts: AIAttachedContextItem[],
  ): Promise<LLMResponse> {
    const context = this.requireContext();
    this.assertConceptCoachAllowed(context);
    return this.requestStructuredModel(
      this.buildConceptCoachPromptPayload({ attachedContexts, tabId }),
      tabId,
    );
  }

  async requestGenericStructuredResult(
    skill: AIChatRegisteredSkillDescriptor,
    attachedContexts: AIAttachedContextItem[],
    userPrompt?: string,
  ): Promise<LLMResponse> {
    return this.requestStructuredModel(
      this.buildGenericStructuredPromptPayload({ skill, attachedContexts, userPrompt }),
      undefined,
      skill,
    );
  }

  async requestGenericStructuredTabResult(
    skill: AIChatRegisteredSkillDescriptor,
    tabId: AISkillTabId,
    attachedContexts: AIAttachedContextItem[],
  ): Promise<LLMResponse> {
    return this.requestStructuredModel(
      this.buildGenericStructuredPromptPayload({ skill, attachedContexts, tabId }),
      tabId,
      skill,
    );
  }

  async requestFollowUp(
    tabId: AISkillTabId,
    attachedContexts: AIAttachedContextItem[] = [],
  ): Promise<LLMResponse> {
    const context = this.requireContext();
    const settings = this.assertModelSettings();
    const provider = this.resolveDefaultProvider(settings);
    const tabResult = tabResultFromConceptCoach(
      this.deps.findLatestConceptCoachResultForContext(this.deps.state.contextSignature),
      tabId,
    );
    if (!tabResult) {
      throw new Error('当前阶段没有可追问的结构化结果。');
    }
    const prompts = settings.prompts.skills.conceptCoach;
    this.currentRunAbortController = new AbortController();
    const modelId = settings.defaultModelId || settings.model;
    try {
      return await this.dispatchChatRequest({
        baseUrl: provider.baseUrl || settings.baseUrl,
        apiKey: provider.apiKey || settings.apiKey,
        model: modelId,
        provider,
        protocol: provider.protocol,
        modelRef: {
          providerId: provider.id,
          modelId,
        },
        timeoutMs: settings.timeoutMs,
        temperature: settings.temperature,
        messages: [
          {
            role: 'system',
            content: [
              this.deps.getResolvedSkill(this.deps.state.activeSkillId).systemPromptTemplate,
              this.deps.getArenaRuntimeOverrides(this.deps.state.activeSkillId).tabFollowUpPrompts?.[tabId],
              prompts.tabs[tabId].followUp,
            ].map((part) => normalizeString(part)).filter(Boolean).join('\n\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              language: settings.defaultOutputLanguage,
              skillId: ACTIVE_SKILL,
              contextSignature: this.deps.state.contextSignature,
              tabId,
              tabResult,
              attachedContexts,
              context: this.toStructuredContextPayload(context),
            }, null, 2),
          },
          ...this.deps.getFollowUpsForTab(tabId).map((entry) => ({
            role: entry.role,
            content: entry.content,
          })),
        ],
        abortSignal: this.currentRunAbortController.signal,
      });
    } catch (error) {
      if (error instanceof LLMError) {
        this.captureFailureDiagnostic(error);
        throw new Error(this.mapLlmError(error));
      }
      throw error;
    } finally {
      this.currentRunAbortController = null;
    }
  }

  async requestGenericFollowUp(
    skill: AIChatRegisteredSkillDescriptor,
    tabId: AISkillTabId,
    attachedContexts: AIAttachedContextItem[] = [],
  ): Promise<LLMResponse> {
    const context = this.requireContext();
    const settings = this.assertModelSettings();
    const provider = this.resolveDefaultProvider(settings);
    const section = (skill.sections || []).find((entry) => entry.id === tabId);
    const tabResult = this.deps.state.genericSkillResults[skill.id]?.sections.find((entry) => entry.id === tabId) || null;
    if (!section || !tabResult) {
      throw new Error('当前 section 没有可追问的结构化结果。');
    }
    this.currentRunAbortController = new AbortController();
    const modelId = settings.defaultModelId || settings.model;
    try {
      return await this.dispatchChatRequest({
        baseUrl: provider.baseUrl || settings.baseUrl,
        apiKey: provider.apiKey || settings.apiKey,
        model: modelId,
        provider,
        protocol: provider.protocol,
        modelRef: {
          providerId: provider.id,
          modelId,
        },
        timeoutMs: settings.timeoutMs,
        temperature: settings.temperature,
        messages: [
          {
            role: 'system',
            content: [
              skill.systemPromptTemplate,
              section.followUpPrompt,
              '只基于给定 section 结果、上下文和用户追问回答；不要执行未启用的写入动作。',
            ].map((part) => normalizeString(part)).filter(Boolean).join('\n\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              language: settings.defaultOutputLanguage,
              skillId: skill.id,
              tabId,
              tabResult,
              attachedContexts,
              context: this.toStructuredContextPayload(context),
            }, null, 2),
          },
          ...this.deps.getFollowUpsForTab(tabId).map((entry) => ({
            role: entry.role,
            content: entry.content,
          })),
        ],
        abortSignal: this.currentRunAbortController.signal,
      });
    } catch (error) {
      if (error instanceof LLMError) {
        this.captureFailureDiagnostic(error);
        throw new Error(this.mapLlmError(error));
      }
      throw error;
    } finally {
      this.currentRunAbortController = null;
    }
  }

  extractStructuredPayload(taskLabel: string, rawContent: string): unknown {
    try {
      return extractJsonPayload(rawContent);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.deps.state.failureDiagnostic = {
        content: [
          'Diagnostic type: invalid_json',
          `Task: ${taskLabel}`,
          `Reason: ${reason}`,
          'Response body:',
          rawContent.trim() || '<empty body>',
        ].join('\n'),
      };
      throw new Error(`${taskLabel}返回的内容不是合法 JSON。请检查设置里的 AI 理解与制卡 Prompt 是否把系统结构化输出要求冲掉了。原始原因：${reason}`);
    }
  }

  private buildConceptCoachPromptPayload(input: {
    attachedContexts: AIAttachedContextItem[];
    userPrompt?: string;
    tabId?: AISkillTabId;
  }): Record<string, unknown> {
    const context = this.requireContext();
    const tabId = input.tabId ? normalizeAIWorkbenchTabId(input.tabId) : null;
    const selfTestMode = this.deps.getSelfTestCreationMode();
    const selfTestDescriptor = getSelfTestModeDescriptor(selfTestMode);
    return {
      language: this.deps.getAISettings().defaultOutputLanguage,
      skillId: ACTIVE_SKILL,
      contextSignature: this.deps.state.contextSignature,
      tabIds: tabId ? [tabId] : [...AI_CONCEPT_COACH_TAB_IDS],
      ...(tabId ? {
        tabId,
        currentTabResult: tabResultFromConceptCoach(this.deps.state.skillResults[ACTIVE_SKILL], tabId),
      } : {}),
      attachedContexts: input.attachedContexts,
      ...(normalizeString(input.userPrompt) ? { userPrompt: normalizeString(input.userPrompt) } : {}),
      selfTestConfig: {
        creationMode: selfTestMode,
        label: selfTestDescriptor.label,
        summary: selfTestDescriptor.summary,
      },
      context: this.toStructuredContextPayload(context),
    };
  }

  private buildGenericStructuredPromptPayload(input: {
    skill: AIChatRegisteredSkillDescriptor;
    attachedContexts: AIAttachedContextItem[];
    userPrompt?: string;
    tabId?: AISkillTabId;
  }): Record<string, unknown> {
    const context = this.requireContext();
    const tabId = input.tabId ? this.deps.normalizeTabForCurrentSettings(input.tabId, input.skill.id) : null;
    return {
      language: this.deps.getAISettings().defaultOutputLanguage,
      skillId: input.skill.id,
      skillTitle: input.skill.title,
      tabIds: tabId ? [tabId] : input.skill.tabs.map((tab) => tab.id),
      sections: (input.skill.sections || [])
        .filter((section) => !tabId || section.id === tabId)
        .map((section) => ({
          id: section.id,
          title: section.title,
          responseKey: section.responseKey,
          renderer: section.renderer,
          required: section.required,
        })),
      ...(tabId ? {
        tabId,
        currentTabResult: this.deps.state.genericSkillResults[input.skill.id]?.sections.find((section) => section.id === tabId) || null,
      } : {}),
      attachedContexts: input.attachedContexts,
      ...(normalizeString(input.userPrompt) ? { userPrompt: normalizeString(input.userPrompt) } : {}),
      context: this.toStructuredContextPayload(context),
    };
  }

  private async requestStructuredModel(
    payload: Record<string, unknown>,
    tabId?: AISkillTabId,
    skill: AIChatRegisteredSkillDescriptor = this.deps.getResolvedSkill(CONCEPT_SKILL),
  ): Promise<LLMResponse> {
    const settings = this.assertModelSettings();
    const provider = this.resolveDefaultProvider(settings);
    this.currentRunAbortController = new AbortController();
    const modelId = settings.defaultModelId || settings.model;
    try {
      return await this.dispatchChatRequest({
        baseUrl: provider.baseUrl || settings.baseUrl,
        apiKey: provider.apiKey || settings.apiKey,
        model: modelId,
        provider,
        protocol: provider.protocol,
        modelRef: {
          providerId: provider.id,
          modelId,
        },
        timeoutMs: settings.timeoutMs,
        temperature: settings.temperature,
        responseFormat: 'json_object',
        messages: [
          {
            role: 'system',
            content: this.buildStructuredRunSystemPrompt(settings, skill, tabId),
          },
          {
            role: 'user',
            content: JSON.stringify(payload, null, 2),
          },
        ],
        abortSignal: this.currentRunAbortController.signal,
      });
    } catch (error) {
      if (error instanceof LLMError) {
        this.captureFailureDiagnostic(error);
        throw new Error(this.mapLlmError(error));
      }
      throw error;
    } finally {
      this.currentRunAbortController = null;
    }
  }

  private shouldUseBackendRuntime(): boolean {
    return this.deps.backendRuntimeEnabled === true;
  }

  private async dispatchChatRequest(request: LLMRequest): Promise<LLMResponse> {
    if (!this.shouldUseBackendRuntime()) {
      return this.callFrontendChat(request);
    }
    return this.callBackendChat(request);
  }

  private callFrontendChat(request: LLMRequest): Promise<LLMResponse> {
    const chat = this.deps.llmPort['chat'].bind(this.deps.llmPort);
    return chat(request);
  }

  private async callBackendChat(request: LLMRequest): Promise<LLMResponse> {
    const backendSessionService = this.deps.backendSessionService;
    if (!backendSessionService) {
      throw new LLMError('BACKEND_UNAVAILABLE: AI backend runtime service unavailable', {
        code: 'network_error',
      });
    }

    const now = Date.now();
    const sessionId = normalizeString(this.deps.state.sessionId) || `ai-session-${now.toString(36)}`;
    const streamId = `ai-stream-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const jobId = `ai-job-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const providerId = normalizeString(request.modelRef?.providerId || request.provider?.id || 'provider');
    const timeoutMs = Math.max(1_000, Number(request.timeoutMs || 0));
    const requiredSecretName = providerId ? `${providerId}:apiKey` : 'apiKey';
    const signal = request.abortSignal;

    const cancelStream = async (reason: string): Promise<void> => {
      try {
        await backendSessionService.cancelStream({
          streamId,
          sessionId,
          jobId,
          reason,
        });
      } catch {
        // best effort cancel
      }
    };

    try {
      await backendSessionService.createSession({
        sessionId,
        surfaceId: normalizeString(this.deps.state.surface || 'standalone-dialog') || 'standalone-dialog',
        reviewSessionId: normalizeString(this.deps.state.sourceReviewSessionId) || undefined,
        owner: 'backend',
        skillId: normalizeString(this.deps.state.activeSkillId) || undefined,
        providerId,
        modelId: normalizeString(request.model),
      });

      const streamStart = await backendSessionService.startStream({
        streamId,
        sessionId,
        jobId,
        providerId,
        modelId: normalizeString(request.model),
        timeoutMs,
        idempotencyKey: `${sessionId}:${jobId}`,
      });

      if (streamStart.state === 'timeout') {
        throw new LLMError('LLM request timed out', {
          code: 'timeout',
          retryable: true,
        });
      }
      if (streamStart.state === 'unavailable') {
        throw new LLMError('BACKEND_UNAVAILABLE: ai stream unavailable', {
          code: 'network_error',
        });
      }

      if (signal?.aborted) {
        await cancelStream('aborted-before-network');
        throw new LLMError('LLM request aborted', {
          code: 'aborted',
          retryable: true,
        });
      }

      const onAbort = () => {
        void cancelStream('aborted');
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const response = await backendSessionService.proxyNetwork({
          url: this.resolveChatEndpoint(request),
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${request.apiKey}`,
          },
          body: JSON.stringify(this.buildOpenAIRequestBody(request)),
          timeoutMs,
          requiredSecretName,
          redactionKeys: ['apiKey', `${providerId}:apiKey`],
        });

        if (signal?.aborted) {
          await cancelStream('aborted-after-network');
          throw new LLMError('LLM request aborted', {
            code: 'aborted',
            retryable: true,
          });
        }

        const parsed = this.parseBackendChatResponse(response.body);
        if (response.status >= 400) {
          throw this.httpStatusToLlmError(response.status, parsed.message || 'Backend AI proxy request failed', response.body);
        }
        const content = parsed.content;
        if (!content && parsed.toolCalls.length === 0) {
          throw new LLMError('LLM returned an empty completion', { code: 'empty_response' });
        }

        try {
          await backendSessionService.getJob({ jobId });
        } catch {
          // keep response path resilient when backend diagnostics is eventually consistent
        }

        return {
          role: 'assistant',
          content,
          toolCalls: parsed.toolCalls.length > 0 ? parsed.toolCalls : undefined,
          finishReason: parsed.finishReason,
          usage: parsed.usage,
          raw: {
            backend: true,
            status: response.status,
            headers: response.headers,
            body: parsed.raw,
            streamId,
            sessionId,
            jobId,
          },
        };
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      if (error instanceof LLMError) {
        throw error;
      }
      if (/timeout/i.test(message) || message.startsWith('TIMEOUT:')) {
        throw new LLMError('LLM request timed out', {
          code: 'timeout',
          retryable: true,
          diagnostic: message,
        });
      }
      if (/aborted/i.test(message) || /canceled/i.test(message)) {
        throw new LLMError('LLM request aborted', {
          code: 'aborted',
          retryable: true,
          diagnostic: message,
        });
      }
      throw new LLMError(message || 'BACKEND_UNAVAILABLE: AI backend runtime request failed', {
        code: 'network_error',
        retryable: true,
        diagnostic: message,
      });
    }
  }

  private resolveChatEndpoint(request: LLMRequest): string {
    const configured = normalizeString(request.provider?.endpoints?.chatCompletions);
    if (/^https?:\/\//i.test(configured)) {
      return configured;
    }
    const baseUrl = normalizeString(request.baseUrl).replace(/\/+$/u, '');
    const path = configured
      ? (configured.startsWith('/') ? configured : `/${configured}`)
      : '/chat/completions';
    return `${baseUrl}${path}`;
  }

  private buildOpenAIRequestBody(request: LLMRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: request.model,
      temperature: request.temperature,
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
        ...(message.name ? { name: message.name } : {}),
        ...(message.role === 'tool' && message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
      })),
      ...(request.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
      ...(request.tools?.length ? { tools: request.tools } : {}),
      ...(request.toolChoice ? { tool_choice: request.toolChoice } : {}),
      ...(request.stream === true ? { stream: true } : {}),
    };
    return body;
  }

  private parseBackendChatResponse(rawBody: string): {
    content: string;
    finishReason?: string;
    message?: string;
    toolCalls: LLMToolCall[];
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
    raw: unknown;
  } {
    const bodyText = String(rawBody || '');
    let raw: unknown = null;
    try {
      raw = JSON.parse(bodyText);
    } catch {
      raw = null;
    }
    if (!raw || typeof raw !== 'object') {
      return {
        content: bodyText.trim(),
        toolCalls: [],
        raw: bodyText,
      };
    }
    const payload = raw as {
      choices?: Array<{
        text?: unknown;
        finish_reason?: unknown;
        message?: {
          content?: unknown;
          tool_calls?: unknown[];
        };
      }>;
      usage?: {
        prompt_tokens?: unknown;
        completion_tokens?: unknown;
        total_tokens?: unknown;
      };
      error?: {
        message?: unknown;
      };
    };
    const firstChoice = payload.choices?.[0];
    const content = normalizeString(
      (typeof firstChoice?.message?.content === 'string' ? firstChoice.message.content : '')
      || (typeof firstChoice?.text === 'string' ? firstChoice.text : ''),
    );
    const toolCalls = Array.isArray(firstChoice?.message?.tool_calls)
      ? firstChoice!.message!.tool_calls!
        .map((candidate, index) => {
          if (!candidate || typeof candidate !== 'object') {
            return null;
          }
          const toolCall = candidate as {
            id?: unknown;
            function?: { name?: unknown; arguments?: unknown };
          };
          const name = normalizeString(toolCall.function?.name);
          if (!name) {
            return null;
          }
          return {
            id: normalizeString(toolCall.id) || `tool-${Date.now().toString(36)}-${index}`,
            type: 'function' as const,
            function: {
              name,
              arguments: typeof toolCall.function?.arguments === 'string'
                ? toolCall.function.arguments
                : JSON.stringify(toolCall.function?.arguments || {}),
            },
          };
        })
        .filter((value): value is LLMToolCall => Boolean(value))
      : [];
    return {
      content,
      finishReason: normalizeString(firstChoice?.finish_reason),
      message: normalizeString(payload.error?.message),
      toolCalls,
      usage: payload.usage
        ? {
            promptTokens: Number(payload.usage.prompt_tokens) || undefined,
            completionTokens: Number(payload.usage.completion_tokens) || undefined,
            totalTokens: Number(payload.usage.total_tokens) || undefined,
          }
        : undefined,
      raw,
    };
  }

  private httpStatusToLlmError(status: number, message: string, diagnostic: string): LLMError {
    if (status === 401) {
      return new LLMError(message, { code: 'unauthorized', status, diagnostic });
    }
    if (status === 429) {
      return new LLMError(message, { code: 'rate_limited', status, retryable: true, diagnostic });
    }
    return new LLMError(message, {
      code: 'http_error',
      status,
      retryable: status >= 500,
      diagnostic,
    });
  }

  private buildStructuredRunSystemPrompt(
    settings: AISettings,
    skill: AIChatRegisteredSkillDescriptor,
    tabId?: AISkillTabId,
  ): string {
    if (skill.id !== CONCEPT_SKILL) {
      const sections = (skill.sections || []).filter((section) => !tabId || section.id === tabId);
      const behaviorPrompts = [
        skill.systemPromptTemplate,
        ...sections.map((section) => section.runPrompt),
      ];
      const contractText = formatStructuredPromptContract(getPromptContractForResolvedSkillRun(skill, tabId));
      return [...behaviorPrompts, contractText]
        .map((section) => normalizeString(section))
        .filter(Boolean)
        .join('\n\n');
    }
    const prompts: AIConceptCoachPromptTemplates = settings.prompts.skills.conceptCoach;
    const arenaOverrides = this.deps.getArenaRuntimeOverrides(skill.id);
    const arenaRunOverride = tabId
      ? arenaOverrides.tabRunPrompts?.[tabId]
      : undefined;
    const conceptTabId = tabId as typeof AI_CONCEPT_COACH_TAB_IDS[number] | undefined;
    const behaviorPrompts = tabId
      ? [skill.systemPromptTemplate, prompts.baseRun, arenaRunOverride, prompts.tabs[conceptTabId!].run]
      : [
        skill.systemPromptTemplate,
        prompts.baseRun,
        ...Object.values(arenaOverrides.tabRunPrompts || {}),
        ...AI_CONCEPT_COACH_TAB_IDS.map((id) => prompts.tabs[id].run),
      ];
    const contractText = formatStructuredPromptContract(getPromptContractForSkillRun(ACTIVE_SKILL, tabId));
    return [...behaviorPrompts, contractText]
      .map((section) => normalizeString(section))
      .filter(Boolean)
      .join('\n\n');
  }

  private toStructuredContextPayload(context: AIWorkbenchContextSnapshot) {
    return {
      source: context.source,
      queueType: context.queueType,
      queueProgress: context.queueProgress,
      currentCard: context.currentCard,
      neuralBatch: context.neuralBatch,
      selectedBlocks: context.blocks,
    };
  }

  private requireContext(): AIWorkbenchContextSnapshot {
    if (!this.deps.state.context) {
      throw new Error('AI 工作台上下文还没有准备好。');
    }
    return this.deps.state.context;
  }

  private assertConceptCoachAllowed(context: AIWorkbenchContextSnapshot): void {
    if (
      context.source === 'review'
      && context.currentCard
      && context.currentCard.explainRequiresReveal
      && !context.currentCard.revealed
    ) {
      throw new Error('请先揭示答案，再使用 AI 理解与制卡。');
    }
  }

  private captureFailureDiagnostic(error: LLMError): void {
    const settings = normalizeAISettings(this.deps.getAISettings());
    const provider = this.resolveDefaultProvider(settings);
    const content = normalizeString(error.diagnostic) || [
      `Error code: ${error.code}`,
      ...(typeof error.status === 'number' ? [`HTTP status: ${error.status}`] : []),
      `Provider: ${normalizeString(provider.name) || '<unconfigured>'}`,
      `Model: ${normalizeString(settings.defaultModelId || settings.model) || '<unconfigured>'}`,
      `Base URL: ${normalizeString(provider.baseUrl || settings.baseUrl) || '<unconfigured>'}`,
      'Response body:',
      '<not captured>',
    ].join('\n');
    this.deps.state.failureDiagnostic = content
      ? { content } satisfies AIWorkbenchFailureDiagnostic
      : null;
  }

  private mapLlmError(error: LLMError): string {
    switch (error.code) {
      case 'unauthorized':
        return 'AI 请求鉴权失败，请检查 API Key。';
      case 'rate_limited':
        return 'AI 请求过于频繁，请稍后再试。';
      case 'timeout':
        return 'AI 请求超时，请检查网络或调大超时时间。';
      case 'aborted':
        return '已停止本次生成，已保留当前输出片段。';
      case 'empty_response':
        return 'AI 请求已发出，但模型返回了空正文。请重试；如果连续出现，请检查 Base URL、模型名，以及该模型是否支持 Chat Completions 的 json_object 输出。';
      default:
        return error.message || 'AI 请求失败。';
    }
  }
}
