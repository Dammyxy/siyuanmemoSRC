import {
  normalizeAIWorkbenchSkillId,
  normalizeAIWorkbenchTabId,
} from '@/application/services/AIWorkbenchSkillRegistry';
import {
  deriveTabNormalizationDiagnostic,
  normalizeConceptCoachResult,
  normalizeNormalizationDiagnostic,
  normalizeTabResultValue,
} from '@/application/services/AIWorkbenchResultNormalization';
import {
  createEmptyThreadRecord,
  createInitialThreads,
} from '@/application/services/AIWorkbenchSessionRuntime';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_CONCEPT_COACH_TAB_IDS,
  AI_GENERAL_CHAT_SKILL_ID,
  AI_GENERAL_CHAT_TAB_ID,
  type AIAttachedContextItem,
  type AIChatApprovalRequest,
  type AIExplainResult,
  type AISkillId,
  type AISkillTabId,
  type AIUserSkillStructuredResult,
  type AIUserSkillStructuredSectionResult,
  type AIViewSessionState,
  type AIWorkbenchApprovalMessage,
  type AIWorkbenchAssistantResultMessage,
  type AIWorkbenchAssistantTextMessage,
  type AIWorkbenchFailureDiagnostic,
  type AIWorkbenchMessage,
  type AIWorkbenchOpenView,
  type AIWorkbenchRunMode,
  type AIWorkbenchSeparatorMessage,
  type AIWorkbenchState,
  type AIWorkbenchThreads,
  type AIWorkbenchToolLogMessage,
  type AIWorkbenchUserMessage,
  type AIWorkbenchUserMessagePurpose,
} from '@/types/ai';

const CONCEPT_SKILL: AISkillId = AI_CONCEPT_COACH_SKILL_ID;
const GENERAL_SKILL: AISkillId = AI_GENERAL_CHAT_SKILL_ID;
const CHAT_TAB: AISkillTabId = AI_GENERAL_CHAT_TAB_ID;
const DEFAULT_TAB: AISkillTabId = 'working-definition';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function createEntryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

function describeRawShape(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).slice(0, 8);
    return `object:${keys.length ? keys.join(',') : '<empty>'}`;
  }
  if (typeof value === 'string') {
    return value.trim() ? 'string' : 'empty-string';
  }
  return typeof value;
}

function describeRawShapeFromContent(rawContent: string): string {
  const parsed = tryParseJson(rawContent);
  if (parsed.ok) {
    return describeRawShape(parsed.value);
  }
  return rawContent.trim() ? 'text' : 'persisted-result';
}

function normalizeStoredSkillId(value: unknown, fallback: AISkillId): AISkillId {
  if (typeof value === 'string' && /^user:[a-z0-9_-]+$/.test(value)) {
    return value as AISkillId;
  }
  return normalizeAIWorkbenchSkillId(value, fallback);
}

function normalizeStoredTabId(value: unknown, skillId: AISkillId): AISkillTabId {
  if (typeof value === 'string' && value.startsWith('user:')) {
    return value as AISkillTabId;
  }
  return normalizeAIWorkbenchTabId(value, skillId);
}

export function cloneAttachedContexts(items: AIAttachedContextItem[] | undefined | null): AIAttachedContextItem[] {
  return Array.isArray(items) ? items.map((item) => ({ ...item, blockIds: [...item.blockIds] })) : [];
}

export function resolveUserMessagePurpose(purpose: unknown): AIWorkbenchUserMessagePurpose {
  return purpose === 'follow-up' ? 'follow-up' : purpose === 'initial-explain' ? 'initial-explain' : 'initial-run';
}

export function createEmptyViewSessionState(): AIViewSessionState {
  return { resultContextSignature: null, stale: false, staleReason: null, followUps: [] };
}

export function createInitialViewState(): AIWorkbenchState['viewState'] {
  const makeSkillState = () => ({
    chat: createEmptyViewSessionState(),
    'working-definition': createEmptyViewSessionState(),
    perspectives: createEmptyViewSessionState(),
    'integrated-understanding': createEmptyViewSessionState(),
    'self-test-cards': createEmptyViewSessionState(),
    'cdf-structure': createEmptyViewSessionState(),
    'real-world-triggers': createEmptyViewSessionState(),
  });
  return {
    [GENERAL_SKILL]: makeSkillState(),
    [CONCEPT_SKILL]: makeSkillState(),
  };
}

export function normalizeMessage(
  message: unknown,
  fallbackSkillId: AISkillId,
  fallbackTabId: AISkillTabId,
): AIWorkbenchMessage | null {
  if (!isRecord(message) || message.kind === 'candidate-board') {
    return null;
  }
  const kind = normalizeString(message.kind);
  const skillId = normalizeStoredSkillId(message.skillId || fallbackSkillId, fallbackSkillId);
  const base = {
    id: normalizeString(message.id) || createEntryId('ai-msg'),
    skillId,
    tabId: normalizeStoredTabId(message.tabId || fallbackTabId, skillId),
    view: normalizeString(message.view) as AIWorkbenchOpenView || undefined,
    contextSignature: normalizeString(message.contextSignature) || null,
    createdAt: Number(message.createdAt) || Date.now(),
  };
  if (kind === 'user') {
    return {
      ...base,
      kind,
      purpose: resolveUserMessagePurpose(message.purpose),
      content: normalizeString(message.content),
      editedFromMessageId: normalizeString(message.editedFromMessageId) || null,
      attachedContexts: cloneAttachedContexts(message.attachedContexts as AIAttachedContextItem[]),
      runGroupId: normalizeString(message.runGroupId) || null,
      presentation: normalizeString(message.presentation) as AIWorkbenchUserMessage['presentation'],
    };
  }
  if (kind === 'assistant-text') {
    return {
      ...base,
      kind,
      content: normalizeString(message.content),
      sourceContent: normalizeString(message.sourceContent) || null,
      appliedContexts: cloneAttachedContexts(message.appliedContexts as AIAttachedContextItem[]),
      reasoningContent: normalizeString(message.reasoningContent) || null,
      diagnostics: Array.isArray(message.diagnostics) ? message.diagnostics.map((entry) => normalizeString(entry)).filter(Boolean) : [],
      interrupted: message.interrupted === true,
      requestSourceMessageId: normalizeString(message.requestSourceMessageId) || null,
      failureDiagnostic: isRecord(message.failureDiagnostic)
        ? {
          content: normalizeString(message.failureDiagnostic.content),
        } satisfies AIWorkbenchFailureDiagnostic
        : null,
      failureRunMode: normalizeString(message.failureRunMode) as AIWorkbenchRunMode || null,
      runGroupId: normalizeString(message.runGroupId) || null,
      presentation: normalizeString(message.presentation) as AIWorkbenchAssistantTextMessage['presentation'],
    };
  }
  if (kind === 'assistant-result') {
    const rawContent = normalizeString(message.rawContent);
    const conceptCoachResult = isRecord(message.conceptCoachResult)
      ? normalizeConceptCoachResult(message.conceptCoachResult, rawContent)
      : null;
    const tabResult = normalizeTabResultValue(base.tabId, message.tabResult, conceptCoachResult);
    const genericStructuredResult = isRecord(message.genericStructuredResult)
      ? message.genericStructuredResult as AIUserSkillStructuredResult
      : null;
    const genericSectionResult = isRecord(message.genericSectionResult)
      ? message.genericSectionResult as AIUserSkillStructuredSectionResult
      : genericStructuredResult?.sections.find((section) => section.id === base.tabId) || null;
    return {
      ...base,
      kind,
      rawContent,
      conceptCoachResult,
      tabResult,
      genericStructuredResult,
      genericSectionResult,
      normalizationDiagnostic: normalizeNormalizationDiagnostic(message.normalizationDiagnostic)
        ?? deriveTabNormalizationDiagnostic(base.tabId, tabResult, describeRawShapeFromContent(rawContent)),
      explainResult: isRecord(message.explainResult) ? message.explainResult as AIExplainResult : null,
      appliedContexts: cloneAttachedContexts(message.appliedContexts as AIAttachedContextItem[]),
      reasoningContent: normalizeString(message.reasoningContent) || null,
      diagnostics: Array.isArray(message.diagnostics) ? message.diagnostics.map((entry) => normalizeString(entry)).filter(Boolean) : [],
      interrupted: message.interrupted === true,
      runGroupId: normalizeString(message.runGroupId) || null,
      presentation: normalizeString(message.presentation) as AIWorkbenchAssistantResultMessage['presentation'],
    };
  }
  if (kind === 'tool-log') {
    return {
      ...base,
      kind,
      toolCallId: normalizeString(message.toolCallId),
      toolName: normalizeString(message.toolName),
      group: normalizeString(message.group) as AIWorkbenchToolLogMessage['group'],
      status: normalizeString(message.status) as AIWorkbenchToolLogMessage['status'],
      content: normalizeString(message.content),
      argsText: normalizeString(message.argsText) || null,
      resultText: normalizeString(message.resultText) || null,
      error: normalizeString(message.error) || null,
      argsVarRef: normalizeString(message.argsVarRef) || null,
      varRef: normalizeString(message.varRef) || null,
      durationMs: Number(message.durationMs) || null,
      roundIndex: Number(message.roundIndex) || null,
      llmUsage: typeof message.llmUsage === 'object' && message.llmUsage !== null
        ? {
          promptTokens: Number((message.llmUsage as { promptTokens?: unknown }).promptTokens) || undefined,
          completionTokens: Number((message.llmUsage as { completionTokens?: unknown }).completionTokens) || undefined,
          totalTokens: Number((message.llmUsage as { totalTokens?: unknown }).totalTokens) || undefined,
        }
        : null,
      runGroupId: normalizeString(message.runGroupId) || null,
      presentation: normalizeString(message.presentation) as AIWorkbenchToolLogMessage['presentation'],
    };
  }
  if (kind === 'approval' && isRecord(message.request)) {
    const request = message.request as Record<string, unknown>;
    return {
      ...base,
      kind,
      request: {
        id: normalizeString(request.id),
        type: normalizeString(request.type) === 'result' ? 'result' : 'execution',
        toolCallId: normalizeString(request.toolCallId),
        toolName: normalizeString(request.toolName),
        group: normalizeString(request.group) as AIChatApprovalRequest['group'],
        title: normalizeString(request.title),
        description: normalizeString(request.description),
        args: isRecord(request.args) ? request.args : {},
        argsText: normalizeString(request.argsText) || undefined,
        resultText: normalizeString(request.resultText) || undefined,
        resultStatus: normalizeString(request.resultStatus) as AIChatApprovalRequest['resultStatus'],
        argsVarRef: normalizeString(request.argsVarRef) || undefined,
        resultVarRef: normalizeString(request.resultVarRef) || undefined,
        runGroupId: normalizeString(request.runGroupId) || null,
        skillId: normalizeString(request.skillId) as AIChatApprovalRequest['skillId'],
        tabId: normalizeString(request.tabId) as AIChatApprovalRequest['tabId'],
        status: normalizeString(request.status) === 'approved'
          ? 'approved'
          : normalizeString(request.status) === 'rejected'
            ? 'rejected'
            : 'pending',
        createdAt: Number(request.createdAt) || base.createdAt,
        resolvedAt: Number(request.resolvedAt) || undefined,
        rejectReason: normalizeString(request.rejectReason) || undefined,
      } satisfies AIChatApprovalRequest,
      runGroupId: normalizeString(message.runGroupId) || null,
      presentation: normalizeString(message.presentation) as AIWorkbenchApprovalMessage['presentation'],
    };
  }
  if (kind === 'separator') {
    return {
      ...base,
      kind,
      label: normalizeString(message.label) || '分隔',
      runGroupId: normalizeString(message.runGroupId) || null,
      presentation: normalizeString(message.presentation) as AIWorkbenchSeparatorMessage['presentation'],
    } satisfies AIWorkbenchSeparatorMessage;
  }
  return null;
}

export function normalizeThreadRecord(
  thread: unknown,
  skillId: AISkillId,
  tabId: AISkillTabId,
): AIWorkbenchThreads[string][string] {
  if (!isRecord(thread)) {
    return createEmptyThreadRecord(skillId, tabId);
  }
  const resultContextSignature = normalizeString(thread.resultContextSignature) || null;
  const messages = Array.isArray(thread.messages)
    ? thread.messages
      .map((message) => normalizeMessage(message, skillId, tabId))
      .filter((message): message is AIWorkbenchMessage => Boolean(message))
      .map((message) => (
        skillId === CONCEPT_SKILL && tabId !== CHAT_TAB && !normalizeString(message.contextSignature)
          ? { ...message, contextSignature: resultContextSignature }
          : message
      ))
    : [];
  return {
    skillId,
    tabId,
    messages,
    resultContextSignature,
    stale: thread.stale === true,
    staleReason: normalizeString(thread.staleReason) || null,
  };
}

export function normalizeThreads(threads: unknown): AIWorkbenchThreads {
  const base = createInitialThreads();
  const raw = isRecord(threads) ? threads : {};
  const generalThreads = isRecord(raw[GENERAL_SKILL])
    ? raw[GENERAL_SKILL] as Record<string, unknown>
    : null;
  const conceptCoachThreads = isRecord(raw[CONCEPT_SKILL])
    ? raw[CONCEPT_SKILL] as Record<string, unknown>
    : raw;
  if (generalThreads) {
    base[GENERAL_SKILL][CHAT_TAB] = normalizeThreadRecord(generalThreads[CHAT_TAB], GENERAL_SKILL, CHAT_TAB);
  }
  for (const tabId of AI_CONCEPT_COACH_TAB_IDS) {
    base[CONCEPT_SKILL][tabId] = normalizeThreadRecord(conceptCoachThreads[tabId], CONCEPT_SKILL, tabId);
  }
  const legacyExplain = isRecord(raw.explain) ? normalizeThreadRecord(raw.explain, CONCEPT_SKILL, DEFAULT_TAB) : null;
  if (legacyExplain && legacyExplain.messages.length > 0) {
    base[CONCEPT_SKILL][DEFAULT_TAB] = legacyExplain;
  }
  for (const [rawSkillId, rawSkillThreads] of Object.entries(raw)) {
    if (!/^user:[a-z0-9_-]+$/.test(rawSkillId) || !isRecord(rawSkillThreads)) {
      continue;
    }
    const skillId = rawSkillId as AISkillId;
    base[skillId] = base[skillId] || {};
    for (const [rawTabId, rawThread] of Object.entries(rawSkillThreads)) {
      if (typeof rawTabId !== 'string' || (!rawTabId.startsWith('user:') && rawTabId !== CHAT_TAB)) {
        continue;
      }
      const tabId = rawTabId as AISkillTabId;
      base[skillId][tabId] = normalizeThreadRecord(rawThread, skillId, tabId);
    }
  }
  return base;
}
