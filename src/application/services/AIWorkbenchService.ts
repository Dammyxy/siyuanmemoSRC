import { reactive } from 'vue';
import { BlockContextResolver } from '@/application/entries/BlockContextResolver';
import { resolveProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import type { CardContentQueryService } from '@/application/queries/CardContentQueryService';
import type { AISiyuanBlockRow, AISiyuanPort } from '@/application/ports/AISiyuanPort';
import type { LLMPort, LLMResponse } from '@/application/ports/LLMPort';
import { LLMError } from '@/application/ports/LLMPort';
import { getAIContextProviders } from '@/application/services/AIWorkbenchContextProviderRegistry';
import type { AIPromptTask } from '@/application/services/AIPromptComposer';
import { formatStructuredPromptContract, getPromptContractForTask } from '@/application/services/AIPromptContractRegistry';
import type { AIWorkbenchSessionStoreService } from '@/application/services/AIWorkbenchSessionStoreService';
import type { FSRSCard } from '@/types/card';
import type {
  AIAttachedContextItem,
  AIBlockContext,
  AIComposerContextState,
  AIContextProviderKey,
  AIExplainResult,
  AIFollowUpEntry,
  AIReviewCardContext,
  AITaskType,
  AIViewSessionState,
  AIWorkbenchAssistantResultMessage,
  AIWorkbenchAssistantTextMessage,
  AIWorkbenchContextSnapshot,
  AIWorkbenchMessage,
  AIWorkbenchMessageKind,
  AIWorkbenchOpenOptions,
  AIWorkbenchSessionRecord,
  AIWorkbenchSource,
  AIWorkbenchState,
  AIWorkbenchSurface,
  AIWorkbenchThreadRecord,
  AIWorkbenchUserMessagePurpose,
  AIWorkbenchUserMessage,
} from '@/types/ai';
import type { NeuralRoamBatchSnapshot } from '@/types/unified-data-source';
import type { AISettings } from '@/types/settings';

export type AIWorkbenchServiceDeps = {
  getAISettings: () => AISettings;
  cardContentQueryService: CardContentQueryService;
  siyuanPort: AISiyuanPort;
  llmPort: LLMPort;
  sessionStore?: Pick<
    AIWorkbenchSessionStoreService,
    'listSummaries' | 'loadSession' | 'saveSession' | 'renameSession' | 'deleteSession'
  >;
};

const ACTIVE_VIEW: AITaskType = 'explain';

const NOOP_SESSION_STORE: Required<NonNullable<AIWorkbenchServiceDeps['sessionStore']>> = {
  async listSummaries() { return []; },
  async loadSession() { return null; },
  async saveSession(record) { return record; },
  async renameSession() { return null; },
  async deleteSession() { return undefined; },
};

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => normalizeString(entry)).filter(Boolean)
    : [];
}

function normalizeLooseStringList(value: unknown): string[] {
  const list = normalizeStringArray(value);
  if (list.length > 0) {
    return list;
  }
  const text = normalizeString(value);
  return text ? [text] : [];
}

function truncateText(value: string, limit = 140): string {
  const normalized = normalizeString(value).replace(/\s+/g, ' ');
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`;
}

function cloneAttachedContexts(items: AIAttachedContextItem[] | undefined | null): AIAttachedContextItem[] {
  return Array.isArray(items) ? items.map((item) => ({ ...item, blockIds: [...item.blockIds] })) : [];
}

function createEmptyComposerContextState(): AIComposerContextState {
  return { items: [] };
}

function uniqueContextItems(items: AIAttachedContextItem[]): AIAttachedContextItem[] {
  const seen = new Set<string>();
  const result: AIAttachedContextItem[] = [];
  for (const item of items) {
    const signature = [item.providerKey, item.title, item.content, item.blockIds.join(',')].join('::');
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    result.push({ ...item, blockIds: [...item.blockIds] });
  }
  return result;
}

function parseBlockReferenceIds(value: string): string[] {
  return uniqueIds((normalizeString(value).match(/\d{14}-[0-9a-z]{7}/ig) || []));
}

function createEntryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveUserMessagePurpose(purpose: unknown): AIWorkbenchUserMessagePurpose {
  return purpose === 'initial-explain' ? 'initial-explain' : 'follow-up';
}

function createEmptyViewSessionState(): AIViewSessionState {
  return { resultContextSignature: null, stale: false, staleReason: null, followUps: [] };
}

function createInitialViewState(): Record<AITaskType, AIViewSessionState> {
  return { explain: createEmptyViewSessionState() };
}

function createEmptyThreadRecord(): AIWorkbenchThreadRecord {
  return { view: ACTIVE_VIEW, messages: [], resultContextSignature: null, stale: false, staleReason: null };
}

function createInitialThreads(): Record<AITaskType, AIWorkbenchThreadRecord> {
  return { explain: createEmptyThreadRecord() };
}

function normalizeSurface(value: unknown): AIWorkbenchSurface {
  return value === 'review-dialog-sidecar' || value === 'review-tab-companion' || value === 'standalone-dialog'
    ? value
    : 'standalone-dialog';
}

function serializeNeuralBatch(batch: NeuralRoamBatchSnapshot | null): unknown {
  if (!batch) {
    return null;
  }
  if (batch.kind !== 'orbit-round') {
    return batch;
  }
  return {
    kind: batch.kind,
    engineMode: batch.engineMode,
    currentNodeId: batch.currentNodeId,
    currentEventId: batch.currentEventId,
    roundSize: batch.roundSize,
    viewedCount: batch.viewedCount,
    remainingCount: batch.remainingCount,
    roundNodes: batch.roundNodes.map((node) => node.nodeId),
  };
}

function buildContextSignature(context: AIWorkbenchContextSnapshot | null): string | null {
  if (!context) {
    return null;
  }
  return JSON.stringify({
    source: context.source,
    queueType: context.queueType ?? null,
    queueProgress: context.queueProgress ?? null,
    selectedBlockIds: context.selectedBlockIds,
    blockIds: context.blocks.map((block) => block.blockId),
    currentCard: context.currentCard ? {
      cardId: context.currentCard.cardId,
      blockId: context.currentCard.blockId,
      cardType: context.currentCard.cardType,
      revealed: context.currentCard.revealed,
      hasAnswerFace: context.currentCard.hasAnswerFace,
      explainRequiresReveal: context.currentCard.explainRequiresReveal,
      reviewActionLabel: context.currentCard.reviewActionLabel,
      roleDescription: context.currentCard.roleDescription,
      sourceBlockIds: context.currentCard.sourceBlockIds,
    } : null,
    neuralBatch: serializeNeuralBatch(context.neuralBatch),
  });
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

function readXiuyuanMeta(card: FSRSCard | null | undefined): Record<string, unknown> | null {
  return isRecord(card?.meta) ? card!.meta as Record<string, unknown> : null;
}

function readStringArrayFromMeta(meta: Record<string, unknown> | null, key: string): string[] {
  return normalizeStringArray(meta?.[key]);
}

function isDocumentBlockType(value: unknown): boolean {
  const normalized = normalizeString(value).toLowerCase();
  return normalized === 'd' || normalized === 'nodedocument';
}

function isReadModeCardType(cardType: unknown): boolean {
  const normalized = normalizeString(cardType).toLowerCase();
  return normalized === 'topic' || normalized === 'concept';
}

function buildReviewCardSemantics(cardType: unknown): Pick<
  AIReviewCardContext,
  'hasAnswerFace' | 'explainRequiresReveal' | 'reviewActionLabel' | 'roleDescription'
> {
  if (isReadModeCardType(cardType)) {
    return {
      hasAnswerFace: false,
      explainRequiresReveal: false,
      reviewActionLabel: '下一张',
      roleDescription: '阅读型卡片：用于维持对主题、概念和上下文的接触，不依赖正反面答案回忆。',
    };
  }
  return {
    hasAnswerFace: true,
    explainRequiresReveal: true,
    reviewActionLabel: '显示答案',
    roleDescription: '提取型卡片：先尝试回忆，再揭示答案，用来训练稳定检索。',
  };
}

function normalizeThreadRecord(thread: AIWorkbenchThreadRecord | null | undefined): AIWorkbenchThreadRecord {
  if (!thread) {
    return createEmptyThreadRecord();
  }
  return {
    view: ACTIVE_VIEW,
    messages: Array.isArray(thread.messages)
      ? thread.messages.filter((message): message is AIWorkbenchMessage => (
        isRecord(message)
        && (message as { kind?: string }).kind !== 'candidate-board'
      ))
      : [],
    resultContextSignature: normalizeString(thread.resultContextSignature) || null,
    stale: thread.stale === true,
    staleReason: normalizeString(thread.staleReason) || null,
  };
}

export class AIWorkbenchService {
  readonly state = reactive<AIWorkbenchState>({
    sessionId: null,
    surface: 'standalone-dialog',
    sourceReviewSessionId: null,
    contextSignature: null,
    viewState: createInitialViewState(),
    activeView: ACTIVE_VIEW,
    context: null,
    liveContext: null,
    contextIsHistorical: false,
    isLoading: false,
    error: null,
    explainResult: null,
    sessionTitle: '',
    sessionHistory: [],
    threads: createInitialThreads(),
    historyPanelOpen: false,
    contextPanelOpen: false,
    composerContexts: createEmptyComposerContextState(),
    composerEditorOpen: false,
    editingMessageId: null,
    editingMessageKind: null,
  });

  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: AIWorkbenchServiceDeps) {}

  private getSessionStore() {
    return this.deps.sessionStore || NOOP_SESSION_STORE;
  }

  async open(options: AIWorkbenchOpenOptions = {}): Promise<void> {
    await this.refreshSessionHistory();
    this.state.activeView = ACTIVE_VIEW;
    this.state.surface = normalizeSurface(options.surface ?? this.state.surface);
    this.state.sourceReviewSessionId = normalizeString(options.sourceReviewSessionId)
      || (normalizeString(options.source) === 'review' ? normalizeString(options.sessionId) : '')
      || this.state.sourceReviewSessionId
      || null;
    this.state.error = null;
    try {
      const nextContext = await this.buildContextSnapshot(options);
      this.state.liveContext = nextContext;
      await this.activateLiveContext(nextContext);
    } catch (error) {
      this.state.context = null;
      this.state.liveContext = null;
      this.state.contextSignature = null;
      this.state.error = error instanceof Error ? error.message : String(error);
      return;
    }
    if (options.autoRun && this.state.context) {
      await this.runExplain();
    }
  }

  getViewState(_view: AITaskType = ACTIVE_VIEW): AIViewSessionState {
    return this.state.viewState.explain;
  }

  getThread(_view: AITaskType = ACTIVE_VIEW): AIWorkbenchThreadRecord {
    return this.state.threads.explain;
  }

  getThreadMessages(_view: AITaskType = ACTIVE_VIEW): AIWorkbenchMessage[] {
    return this.state.threads.explain.messages;
  }

  isViewStale(_view: AITaskType = ACTIVE_VIEW): boolean {
    return this.state.viewState.explain.stale;
  }

  getFollowUps(_view: AITaskType = ACTIVE_VIEW): AIFollowUpEntry[] {
    return this.state.viewState.explain.followUps;
  }

  hasStructuredResult(_view: AITaskType = ACTIVE_VIEW): boolean {
    return this.state.explainResult !== null;
  }

  getFollowUpDisabledReason(_view: AITaskType = ACTIVE_VIEW): string | null {
    if (this.state.isLoading) {
      return 'AI 正在处理中，请稍后继续追问。';
    }
    if (!this.hasStructuredResult()) {
      return '请先运行一次当前视图，再继续追问。';
    }
    if (this.isViewStale()) {
      return this.state.viewState.explain.staleReason || '当前上下文已变化，请先重新运行。';
    }
    return null;
  }

  getCurrentModelLabel(): string {
    return normalizeString(this.deps.getAISettings().model) || '未配置模型';
  }

  setActiveView(_view: AITaskType): void {
    this.state.activeView = ACTIVE_VIEW;
    this.schedulePersistCurrentSession();
  }

  setHistoryPanelOpen(open: boolean): void {
    this.state.historyPanelOpen = open;
  }

  setContextPanelOpen(open: boolean): void {
    this.state.contextPanelOpen = open;
  }

  setComposerEditorOpen(open: boolean): void {
    this.state.composerEditorOpen = open;
  }

  setEditingMessage(messageId: string | null, kind: AIWorkbenchMessageKind | null): void {
    this.state.editingMessageId = normalizeString(messageId) || null;
    this.state.editingMessageKind = kind;
  }

  getAvailableContextProviders() {
    return getAIContextProviders();
  }

  getComposerContexts(): AIAttachedContextItem[] {
    return cloneAttachedContexts(this.state.composerContexts.items);
  }

  replaceComposerContexts(items: AIAttachedContextItem[]): void {
    this.state.composerContexts.items = uniqueContextItems(cloneAttachedContexts(items));
  }

  removeComposerContext(contextId: string): void {
    const normalizedId = normalizeString(contextId);
    if (!normalizedId) {
      return;
    }
    this.state.composerContexts.items = this.state.composerContexts.items.filter((item) => item.id !== normalizedId);
  }

  clearComposerContexts(): void {
    this.state.composerContexts.items = [];
  }

  async attachContextFromProvider(
    providerKey: AIContextProviderKey,
    input?: string,
  ): Promise<AIAttachedContextItem | null> {
    let item: AIAttachedContextItem | null = null;
    switch (providerKey) {
      case 'manual-text':
        item = this.createManualContextAttachment(input);
        break;
      case 'selected-content':
        item = await this.createSelectedContentAttachment();
        break;
      case 'block-refs':
        item = await this.createBlockRefsAttachment(input);
        break;
      case 'current-document':
        item = await this.createCurrentDocumentAttachment();
        break;
      default:
        item = null;
    }
    if (!item) {
      return null;
    }
    this.state.composerContexts.items = uniqueContextItems([
      ...this.state.composerContexts.items,
      item,
    ]);
    return item;
  }

  async updateAssistantTextMessage(messageId: string, content: string): Promise<void> {
    const target = this.findMessage(messageId);
    if (!target || target.message.kind !== 'assistant-text') {
      return;
    }
    target.message.sourceContent = target.message.sourceContent || target.message.content;
    target.message.content = normalizeString(content);
    this.syncDerivedStateFromThreads();
    await this.persistCurrentSession();
  }

  async updateAssistantResultMessage(messageId: string, payload: Partial<AIExplainResult>): Promise<void> {
    const target = this.findMessage(messageId);
    if (!target || target.message.kind !== 'assistant-result' || !target.message.explainResult) {
      return;
    }
    target.message.explainResult = {
      ...target.message.explainResult,
      workingDefinition: Object.prototype.hasOwnProperty.call(payload, 'workingDefinition')
        ? normalizeString(payload.workingDefinition)
        : target.message.explainResult.workingDefinition,
      whatItTests: Object.prototype.hasOwnProperty.call(payload, 'whatItTests')
        ? normalizeString(payload.whatItTests)
        : target.message.explainResult.whatItTests,
      whyItsTricky: Object.prototype.hasOwnProperty.call(payload, 'whyItsTricky')
        ? normalizeString(payload.whyItsTricky)
        : target.message.explainResult.whyItsTricky,
      connections: Array.isArray(payload.connections)
        ? normalizeLooseStringList(payload.connections)
        : target.message.explainResult.connections,
      triggers: Array.isArray(payload.triggers)
        ? normalizeLooseStringList(payload.triggers)
        : target.message.explainResult.triggers,
      cardIdeas: Array.isArray(payload.cardIdeas)
        ? normalizeLooseStringList(payload.cardIdeas)
        : target.message.explainResult.cardIdeas,
    };
    target.message.rawContent = JSON.stringify(target.message.explainResult, null, 2);
    this.syncDerivedStateFromThreads();
    await this.persistCurrentSession();
  }

  async createNewSession(): Promise<void> {
    const liveContext = this.state.liveContext || this.state.context;
    if (!liveContext) {
      return;
    }
    await this.activateLiveContext(liveContext, { forceNewSession: true });
  }

  async openSession(sessionId: string): Promise<void> {
    const record = await this.getSessionStore().loadSession(sessionId);
    if (!record) {
      throw this.fail('会话不存在或已被删除。');
    }
    this.applySessionRecord(record, this.state.liveContext);
    await this.refreshSessionHistory();
  }

  async renameCurrentSession(title: string): Promise<void> {
    await this.renameSession(this.state.sessionId, title);
  }

  async renameSession(sessionId: string | null, title: string): Promise<void> {
    const normalizedId = normalizeString(sessionId);
    if (!normalizedId) {
      return;
    }
    const renamed = await this.getSessionStore().renameSession(normalizedId, title);
    if (!renamed) {
      return;
    }
    if (this.state.sessionId === normalizedId) {
      this.applySessionRecord(renamed, this.state.liveContext);
    }
    await this.refreshSessionHistory();
  }

  async deleteSession(sessionId = this.state.sessionId): Promise<void> {
    const normalizedId = normalizeString(sessionId);
    if (!normalizedId) {
      return;
    }
    await this.getSessionStore().deleteSession(normalizedId);
    await this.refreshSessionHistory();
    if (this.state.sessionId !== normalizedId) {
      return;
    }
    const nextSummary = this.state.sessionHistory[0] || null;
    if (nextSummary) {
      const nextRecord = await this.getSessionStore().loadSession(nextSummary.id);
      if (nextRecord) {
        this.applySessionRecord(nextRecord, this.state.liveContext);
        return;
      }
    }
    await this.createNewSession();
  }

  async runActiveView(): Promise<void> {
    await this.runExplain();
  }

  async runExplain(): Promise<void> {
    await this.runTask(async () => {
      const attachedContexts = this.consumeComposerContexts();
      const response = await this.requestExplainResult(attachedContexts);
      this.appendExplainResultMessage(response.content, attachedContexts);
    });
  }

  async submitExplainPrompt(question: string): Promise<void> {
    const normalizedQuestion = normalizeString(question);
    if (!normalizedQuestion) {
      return;
    }
    await this.runTask(async () => {
      const attachedContexts = this.consumeComposerContexts();
      this.appendMessage({
        id: createEntryId('ai-msg'),
        view: ACTIVE_VIEW,
        kind: 'user',
        purpose: 'initial-explain',
        content: normalizedQuestion,
        createdAt: Date.now(),
        editedFromMessageId: null,
        attachedContexts,
      } satisfies AIWorkbenchUserMessage);
      const response = await this.requestExplainResult(attachedContexts, normalizedQuestion);
      this.appendExplainResultMessage(response.content, attachedContexts);
    });
  }

  async submitFollowUp(question: string, options?: { editedFromMessageId?: string | null }): Promise<void> {
    const normalizedQuestion = normalizeString(question);
    if (!normalizedQuestion) {
      return;
    }
    const disabledReason = this.getFollowUpDisabledReason();
    if (disabledReason) {
      throw this.fail(disabledReason);
    }
    const attachedContexts = this.consumeComposerContexts();
    this.appendMessage({
      id: createEntryId('ai-msg'),
      view: ACTIVE_VIEW,
      kind: 'user',
      purpose: 'follow-up',
      content: normalizedQuestion,
      createdAt: Date.now(),
      editedFromMessageId: normalizeString(options?.editedFromMessageId) || null,
      attachedContexts,
    } satisfies AIWorkbenchUserMessage);

    this.state.isLoading = true;
    this.state.error = null;
    try {
      const response = await this.requestFollowUp(attachedContexts);
      const content = normalizeString(response.content) || '这次没有返回可用内容。';
      this.appendMessage({
        id: createEntryId('ai-msg'),
        view: ACTIVE_VIEW,
        kind: 'assistant-text',
        content,
        createdAt: Date.now(),
        sourceContent: content,
        appliedContexts: attachedContexts,
      } satisfies AIWorkbenchAssistantTextMessage);
      await this.persistCurrentSession();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.state.isLoading = false;
    }
  }

  private async activateLiveContext(
    nextContext: AIWorkbenchContextSnapshot,
    options?: { forceNewSession?: boolean },
  ): Promise<void> {
    const nextSignature = buildContextSignature(nextContext);
    const currentSignature = this.state.contextSignature;
    const currentSource = this.state.context?.source || null;
    const shouldCreateNewSession = options?.forceNewSession === true
      || this.state.contextIsHistorical
      || !this.state.sessionId
      || currentSignature !== nextSignature
      || currentSource !== nextContext.source;

    if (shouldCreateNewSession) {
      const record = this.createSessionRecord(nextContext, nextSignature);
      await this.applyAndPersistSession(record, nextContext);
      return;
    }

    this.state.context = nextContext;
    this.state.liveContext = nextContext;
    this.state.contextSignature = nextSignature;
    this.state.contextIsHistorical = false;
    await this.persistCurrentSession();
  }

  private createSessionRecord(
    context: AIWorkbenchContextSnapshot,
    contextSignature: string | null,
  ): AIWorkbenchSessionRecord {
    const now = Date.now();
    return {
      id: createEntryId('ai-session'),
      title: this.generateSessionTitle(context),
      source: context.source,
      sourceReviewSessionId: this.state.sourceReviewSessionId,
      surface: this.state.surface,
      contextSignature,
      createdAt: now,
      updatedAt: now,
      lastActiveView: ACTIVE_VIEW,
      activeViews: [],
      messageCount: 0,
      context,
      threads: createInitialThreads(),
    };
  }

  private async applyAndPersistSession(
    record: AIWorkbenchSessionRecord,
    liveContext: AIWorkbenchContextSnapshot | null,
  ): Promise<void> {
    const persisted = await this.getSessionStore().saveSession(record);
    this.applySessionRecord(persisted, liveContext);
    await this.refreshSessionHistory();
  }

  private applySessionRecord(
    record: AIWorkbenchSessionRecord,
    liveContext: AIWorkbenchContextSnapshot | null,
  ): void {
    this.state.sessionId = record.id;
    this.state.sessionTitle = record.title;
    this.state.surface = normalizeSurface(record.surface);
    this.state.sourceReviewSessionId = record.sourceReviewSessionId;
    this.state.context = record.context;
    this.state.contextSignature = record.contextSignature;
    this.state.liveContext = liveContext;
    this.state.contextIsHistorical = Boolean(
      record.contextSignature
      && liveContext
      && record.contextSignature !== buildContextSignature(liveContext)
    );
    this.state.activeView = ACTIVE_VIEW;
    this.state.threads = {
      explain: normalizeThreadRecord(record.threads?.explain),
    };
    this.state.composerContexts = createEmptyComposerContextState();
    this.state.composerEditorOpen = false;
    this.state.editingMessageId = null;
    this.state.editingMessageKind = null;
    this.syncDerivedStateFromThreads();
  }

  private syncDerivedStateFromThreads(): void {
    const thread = this.state.threads.explain;
    const viewState = this.state.viewState.explain;
    viewState.resultContextSignature = thread.resultContextSignature;
    viewState.stale = thread.stale;
    viewState.staleReason = thread.staleReason;
    viewState.followUps = thread.messages
      .filter((message) => (
        message.kind === 'assistant-text'
        || (message.kind === 'user' && resolveUserMessagePurpose(message.purpose) === 'follow-up')
      ))
      .map((message) => ({
        id: message.id,
        view: ACTIVE_VIEW,
        role: message.kind === 'user' ? 'user' : 'assistant',
        content: message.content,
        createdAt: message.createdAt,
      }));
    this.state.explainResult = this.findLatestExplainResult();
  }

  private findLatestExplainResult(): AIExplainResult | null {
    const messages = [...this.state.threads.explain.messages].reverse();
    const latest = messages.find((message) => message.kind === 'assistant-result');
    return latest?.kind === 'assistant-result' ? latest.explainResult : null;
  }

  private appendMessage(message: AIWorkbenchMessage): void {
    this.state.threads.explain.messages.push(message);
    this.syncDerivedStateFromThreads();
    this.schedulePersistCurrentSession();
  }

  private consumeComposerContexts(): AIAttachedContextItem[] {
    const snapshot = cloneAttachedContexts(this.state.composerContexts.items);
    this.state.composerContexts.items = [];
    return snapshot;
  }

  private findMessage(messageId: string): { index: number; message: AIWorkbenchMessage } | null {
    const normalizedId = normalizeString(messageId);
    if (!normalizedId) {
      return null;
    }
    const messages = this.state.threads.explain.messages;
    const index = messages.findIndex((message) => message.id === normalizedId);
    return index >= 0 ? { index, message: messages[index] } : null;
  }

  private async refreshSessionHistory(): Promise<void> {
    this.state.sessionHistory = await this.getSessionStore().listSummaries();
  }

  private async buildContextSnapshot(options: AIWorkbenchOpenOptions): Promise<AIWorkbenchContextSnapshot> {
    const currentCard = options.currentCard ?? null;
    const sourceBlockIdsFromCard = this.resolveSourceBlockIdsFromCard(currentCard);
    const selectedBlockIds = uniqueIds([
      ...(options.selectedBlockIds || []),
      options.currentBlockId || null,
      ...sourceBlockIdsFromCard,
    ]);
    const blocks = await this.loadBlockContexts(selectedBlockIds);
    return {
      source: options.source || 'standalone',
      selectedBlockIds,
      blocks,
      queueType: options.queueType ?? null,
      queueProgress: options.queueProgress ?? null,
      currentCard: await this.buildReviewCardContext(currentCard, options.revealed === true),
      currentCardRaw: currentCard,
      neuralBatch: options.neuralBatch ?? null,
    };
  }

  private async buildReviewCardContext(card: FSRSCard | null, revealed: boolean): Promise<AIReviewCardContext | null> {
    if (!card) {
      return null;
    }
    const semantics = buildReviewCardSemantics(card.type);
    const meta = readXiuyuanMeta(card);
    const frontBlockIds = readStringArrayFromMeta(meta, 'frontBlockIDs');
    const backBlockIds = readStringArrayFromMeta(meta, 'backBlockIDs');
    const sourceBlockIds = uniqueIds([
      ...frontBlockIds,
      ...backBlockIds,
      card.blockId,
      typeof card.extractedFrom === 'string' ? card.extractedFrom : '',
    ]);
    const contentMap = await this.resolveAIBlockContents(sourceBlockIds);
    const frontText = frontBlockIds
      .map((blockId) => contentMap.get(blockId)?.content || '')
      .filter(Boolean)
      .join('\n\n');
    const backText = backBlockIds
      .map((blockId) => contentMap.get(blockId)?.content || '')
      .filter(Boolean)
      .join('\n\n');
    const sourceText = sourceBlockIds
      .map((blockId) => contentMap.get(blockId)?.content || '')
      .filter(Boolean)
      .join('\n\n');
    return {
      cardId: card.id,
      blockId: card.blockId,
      cardType: String(card.type || ''),
      revealed,
      ...semantics,
      sourceBlockIds,
      frontText,
      backText: semantics.hasAnswerFace ? backText : '',
      sourceText,
    };
  }

  private async loadBlockContexts(blockIds: string[]): Promise<AIBlockContext[]> {
    if (blockIds.length === 0) {
      return [];
    }
    const escapedIds = blockIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
    const rows = await this.deps.siyuanPort.sql<AISiyuanBlockRow>(`
      SELECT id, parent_id, root_id, type, subtype, content, markdown, hpath
      FROM blocks
      WHERE id IN (${escapedIds})
      LIMIT ${blockIds.length}
    `);
    const documentMarkdownById = await this.resolveDocumentMarkdownByRows(rows);
    const byId = new Map(rows.map((row) => [row.id, row] as const));
    return blockIds.map((blockId) => {
      const row = byId.get(blockId);
      const documentMarkdown = documentMarkdownById.get(blockId);
      const fallbackMarkdown = normalizeString(row?.markdown);
      const fallbackContent = normalizeString(row?.content);
      return {
        blockId,
        text: documentMarkdown || fallbackMarkdown || fallbackContent,
        markdown: documentMarkdown || fallbackMarkdown,
        type: normalizeString(row?.type) || undefined,
        parentId: normalizeString(row?.parent_id) || null,
        rootId: normalizeString(row?.root_id) || null,
        hPath: normalizeString(row?.hpath) || null,
      } satisfies AIBlockContext;
    });
  }

  private buildAttachedContextItem(input: {
    providerKey: AIContextProviderKey;
    title: string;
    content: string;
    blockIds?: string[];
    summary?: string;
    preview?: string;
  }): AIAttachedContextItem | null {
    const content = normalizeString(input.content);
    if (!content) {
      return null;
    }
    const blockIds = uniqueIds(input.blockIds || []);
    return {
      id: createEntryId('ai-context'),
      providerKey: input.providerKey,
      title: normalizeString(input.title) || '补充上下文',
      summary: normalizeString(input.summary)
        || `${blockIds.length > 0 ? `${blockIds.length} 个块` : '临时材料'} · ${content.length} 字`,
      preview: normalizeString(input.preview) || truncateText(content, 80),
      content,
      blockIds,
      createdAt: Date.now(),
    };
  }

  private createManualContextAttachment(input?: string): AIAttachedContextItem | null {
    const content = normalizeString(input);
    return this.buildAttachedContextItem({
      providerKey: 'manual-text',
      title: '手工材料',
      content,
      summary: `手工材料 · ${content.length} 字`,
    });
  }

  private async createSelectedContentAttachment(): Promise<AIAttachedContextItem | null> {
    const selectionSnapshot = resolveProgressiveExcerptSelectionSnapshot();
    if (selectionSnapshot?.text) {
      return this.buildAttachedContextItem({
        providerKey: 'selected-content',
        title: '选中内容',
        content: selectionSnapshot.text,
        blockIds: selectionSnapshot.sourceBlockIds,
        summary: `${selectionSnapshot.sourceBlockIds.length} 个块 · ${selectionSnapshot.text.length} 字`,
      });
    }
    const resolver = new BlockContextResolver({ i18n: {}, notify: () => {} });
    const resolved = resolver.resolve({});
    const blockIds = uniqueIds(
      (resolved?.blockElements || []).map((element) => element.getAttribute('data-node-id')),
    );
    if (blockIds.length === 0) {
      return null;
    }
    const blocks = await this.loadBlockContexts(blockIds);
    const content = blocks
      .map((block) => normalizeString(block.markdown || block.text))
      .filter(Boolean)
      .join('\n\n');
    return this.buildAttachedContextItem({
      providerKey: 'selected-content',
      title: '选中内容',
      content,
      blockIds,
      summary: `${blockIds.length} 个块 · ${content.length} 字`,
    });
  }

  private async createBlockRefsAttachment(input?: string): Promise<AIAttachedContextItem | null> {
    const blockIds = parseBlockReferenceIds(normalizeString(input));
    if (blockIds.length === 0) {
      return null;
    }
    const blocks = await this.loadBlockContexts(blockIds);
    const content = blocks
      .map((block) => normalizeString(block.markdown || block.text))
      .filter(Boolean)
      .join('\n\n');
    return this.buildAttachedContextItem({
      providerKey: 'block-refs',
      title: '指定块内容',
      content,
      blockIds,
      summary: `${blockIds.length} 个块 · ${content.length} 字`,
    });
  }

  private async createCurrentDocumentAttachment(): Promise<AIAttachedContextItem | null> {
    const liveOrHistoricalContext = this.state.liveContext || this.state.context;
    const candidateRootIds = uniqueIds([
      ...(liveOrHistoricalContext?.blocks || []).map((block) => block.rootId),
      liveOrHistoricalContext?.currentCard?.blockId || null,
    ]);
    let documentId = candidateRootIds[0] || '';
    if (!documentId) {
      const resolver = new BlockContextResolver({ i18n: {}, notify: () => {} });
      const resolved = resolver.resolve({});
      const firstBlockId = normalizeString(resolved?.blockElements?.[0]?.getAttribute('data-node-id'));
      if (firstBlockId) {
        const rows = await this.deps.siyuanPort.sql<{ root_id?: string }>(`
          SELECT root_id
          FROM blocks
          WHERE id = '${firstBlockId.replace(/'/g, "''")}'
          LIMIT 1
        `);
        documentId = normalizeString(rows[0]?.root_id);
      }
    }
    if (!documentId) {
      return null;
    }
    const [documentBlock] = await this.loadBlockContexts([documentId]);
    if (!documentBlock) {
      return null;
    }
    return this.buildAttachedContextItem({
      providerKey: 'current-document',
      title: '当前文档',
      content: normalizeString(documentBlock.markdown || documentBlock.text),
      blockIds: [documentId],
      summary: `${documentBlock.hPath || '当前文档'} · ${normalizeString(documentBlock.text).length} 字`,
      preview: truncateText(normalizeString(documentBlock.text), 96),
    });
  }

  private resolveSourceBlockIdsFromCard(card: FSRSCard | null): string[] {
    if (!card) {
      return [];
    }
    const meta = readXiuyuanMeta(card);
    return uniqueIds([
      ...readStringArrayFromMeta(meta, 'frontBlockIDs'),
      ...readStringArrayFromMeta(meta, 'backBlockIDs'),
      card.blockId,
      typeof card.extractedFrom === 'string' ? card.extractedFrom : '',
    ]);
  }

  private async resolveAIBlockContents(
    blockIds: string[],
  ): Promise<Map<string, { content: string; type: string; isDocument: boolean }>> {
    const queryResults = await this.deps.cardContentQueryService.getBlockContentsWithType(blockIds);
    const resolved = new Map<string, { content: string; type: string; isDocument: boolean }>();
    for (const blockId of blockIds) {
      const entry = queryResults.get(blockId);
      const type = normalizeString(entry?.type);
      const title = normalizeString(entry?.content);
      if (isDocumentBlockType(type)) {
        resolved.set(blockId, {
          content: await this.readDocumentMarkdown(blockId, title),
          type: type || 'd',
          isDocument: true,
        });
        continue;
      }
      resolved.set(blockId, {
        content: title,
        type,
        isDocument: entry?.isDocument === true,
      });
    }
    return resolved;
  }

  private async resolveDocumentMarkdownByRows(rows: AISiyuanBlockRow[]): Promise<Map<string, string>> {
    const documentRows = rows.filter((row) => isDocumentBlockType(row.type));
    const resolved = new Map<string, string>();
    for (const row of documentRows) {
      const blockId = normalizeString(row.id);
      if (!blockId) {
        continue;
      }
      const title = normalizeString(row.content) || normalizeString(row.hpath);
      resolved.set(blockId, await this.readDocumentMarkdown(blockId, title));
    }
    return resolved;
  }

  private async readDocumentMarkdown(blockId: string, title?: string): Promise<string> {
    try {
      return normalizeString(await this.deps.siyuanPort.copyStdMarkdown(blockId));
    } catch {
      const label = normalizeString(title) || blockId;
      throw this.fail(`AI 无法读取文档「${label}」的正文，请稍后重试。`);
    }
  }

  private async requestExplainResult(
    attachedContexts: AIAttachedContextItem[],
    userPrompt?: string,
  ): Promise<LLMResponse> {
    const context = this.requireContext();
    this.assertExplainAllowed(context);
    return this.requestModel('explain', {
      language: this.deps.getAISettings().defaultOutputLanguage,
      attachedContexts,
      ...(normalizeString(userPrompt) ? { userPrompt: normalizeString(userPrompt) } : {}),
      context: {
        source: context.source,
        queueType: context.queueType,
        queueProgress: context.queueProgress,
        currentCard: context.currentCard,
        neuralBatch: context.neuralBatch,
        selectedBlocks: context.blocks,
      },
    });
  }

  private async requestModel(promptTask: AIPromptTask, payload: Record<string, unknown>): Promise<LLMResponse> {
    const settings = this.assertModelSettings();
    try {
      return await this.deps.llmPort.chat({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        timeoutMs: settings.timeoutMs,
        temperature: settings.temperature,
        responseFormat: 'json_object',
        messages: [
          {
            role: 'system',
            content: this.buildStructuredRunSystemPrompt(promptTask, settings),
          },
          {
            role: 'user',
            content: JSON.stringify(payload, null, 2),
          },
        ],
      });
    } catch (error) {
      if (error instanceof LLMError) {
        throw this.fail(this.mapLlmError(error));
      }
      throw error;
    }
  }

  private async requestFollowUp(attachedContexts: AIAttachedContextItem[] = []): Promise<LLMResponse> {
    const context = this.requireContext();
    const settings = this.assertModelSettings();
    const structuredResult = this.state.explainResult;
    if (!structuredResult) {
      throw this.fail('当前没有可追问的结构化结果。');
    }
    try {
      return await this.deps.llmPort.chat({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        timeoutMs: settings.timeoutMs,
        temperature: settings.temperature,
        messages: [
          {
            role: 'system',
            content: settings.prompts.explain.followUp,
          },
          {
            role: 'user',
            content: JSON.stringify({
              language: settings.defaultOutputLanguage,
              view: ACTIVE_VIEW,
              structuredResult,
              attachedContexts,
              context: {
                source: context.source,
                queueType: context.queueType,
                queueProgress: context.queueProgress,
                currentCard: context.currentCard,
                neuralBatch: context.neuralBatch,
                selectedBlocks: context.blocks,
              },
            }, null, 2),
          },
          ...this.getFollowUps().map((entry) => ({
            role: entry.role,
            content: entry.content,
          })),
        ],
      });
    } catch (error) {
      if (error instanceof LLMError) {
        throw this.fail(this.mapLlmError(error));
      }
      throw error;
    }
  }

  private assertModelSettings(): AISettings {
    const settings = this.deps.getAISettings();
    if (!settings.enabled) {
      throw this.fail('请先在设置中启用 AI 功能。');
    }
    if (!settings.apiKey.trim()) {
      throw this.fail('请先在设置中填写 AI API Key。');
    }
    if (!settings.baseUrl.trim() || !settings.model.trim()) {
      throw this.fail('AI Base URL 或模型名未配置。');
    }
    return settings;
  }

  private buildStructuredRunSystemPrompt(task: AIPromptTask, settings: AISettings): string {
    const behaviorPrompt = settings.prompts.explain.run;
    const contractText = formatStructuredPromptContract(getPromptContractForTask(task));
    return [behaviorPrompt, contractText]
      .map((section) => normalizeString(section))
      .filter(Boolean)
      .join('\n\n');
  }

  private extractStructuredPayload(taskLabel: string, rawContent: string): unknown {
    try {
      return extractJsonPayload(rawContent);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw this.fail(`${taskLabel}返回的内容不是合法 JSON。请检查设置里的 AI 解释行为 Prompt 是否把系统结构化输出要求冲掉了。原始原因：${reason}`);
    }
  }

  private normalizeExplainResult(payload: unknown, rawContent: string): AIExplainResult {
    const value = isRecord(payload) ? payload : {};
    return {
      workingDefinition: normalizeString(value.workingDefinition ?? value.workDefinition),
      whatItTests: normalizeString(value.whatItTests ?? value.testPoint),
      whyItsTricky: normalizeString(value.whyItsTricky ?? value.confusionBoundary),
      connections: normalizeLooseStringList(value.connections ?? value.knowledgeNetwork),
      triggers: normalizeLooseStringList(value.triggers ?? value.recognizeNextTime ?? value.recallTrigger),
      cardIdeas: normalizeLooseStringList(value.cardIdeas),
      rawContent,
    };
  }

  private assertExplainAllowed(context: AIWorkbenchContextSnapshot): void {
    if (
      context.source === 'review'
      && context.currentCard
      && context.currentCard.explainRequiresReveal
      && !context.currentCard.revealed
    ) {
      throw this.fail('请先揭示答案，再使用 AI 解释卡片。');
    }
  }

  private appendExplainResultMessage(rawContent: string, appliedContexts: AIAttachedContextItem[]): void {
    const payload = this.extractStructuredPayload('AI 解释卡片', rawContent);
    this.state.explainResult = this.normalizeExplainResult(payload, rawContent);
    this.appendMessage({
      id: createEntryId('ai-msg'),
      view: ACTIVE_VIEW,
      kind: 'assistant-result',
      createdAt: Date.now(),
      rawContent,
      explainResult: this.state.explainResult,
      appliedContexts,
    } satisfies AIWorkbenchAssistantResultMessage);
  }

  private requireContext(): AIWorkbenchContextSnapshot {
    if (!this.state.context) {
      throw this.fail('AI 工作台上下文还没有准备好。');
    }
    return this.state.context;
  }

  private async runTask(runner: () => Promise<void>): Promise<void> {
    this.state.isLoading = true;
    this.state.error = null;
    const thread = this.state.threads.explain;
    thread.stale = false;
    thread.staleReason = null;
    try {
      await runner();
      thread.resultContextSignature = this.state.contextSignature;
      thread.stale = false;
      thread.staleReason = null;
      this.syncDerivedStateFromThreads();
      await this.persistCurrentSession();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.state.isLoading = false;
    }
  }

  private generateSessionTitle(context: AIWorkbenchContextSnapshot): string {
    const currentCard = context.currentCard;
    if (currentCard) {
      const cardText = normalizeString(currentCard.frontText) || normalizeString(currentCard.sourceText);
      if (cardText) {
        return this.truncateTitle(cardText);
      }
    }
    const firstBlockText = context.blocks
      .map((block) => normalizeString(block.text))
      .find((text) => text.length > 0);
    if (firstBlockText) {
      return this.truncateTitle(firstBlockText);
    }
    const sourceTitle = this.getSourceTitle(context.source);
    return context.neuralBatch ? `${sourceTitle} · 神经漫游` : `${sourceTitle} · AI 会话`;
  }

  private truncateTitle(value: string): string {
    const singleLine = value.replace(/\s+/g, ' ').trim();
    return singleLine.length > 28 ? `${singleLine.slice(0, 28)}...` : singleLine;
  }

  private getSourceTitle(source: AIWorkbenchSource): string {
    switch (source) {
      case 'review':
        return '复习';
      case 'browser':
        return '浏览器';
      case 'template-dialog':
        return '模板制卡';
      default:
        return '工作台';
    }
  }

  private buildCurrentSessionRecord(): AIWorkbenchSessionRecord | null {
    const sessionId = normalizeString(this.state.sessionId);
    if (!sessionId) {
      return null;
    }
    const messages = this.state.threads.explain.messages;
    return {
      id: sessionId,
      title: normalizeString(this.state.sessionTitle) || '未命名会话',
      source: this.state.context?.source || this.state.liveContext?.source || 'standalone',
      sourceReviewSessionId: this.state.sourceReviewSessionId,
      surface: this.state.surface,
      contextSignature: this.state.contextSignature,
      createdAt: this.resolveExistingSummary(sessionId)?.createdAt || Date.now(),
      updatedAt: Date.now(),
      lastActiveView: ACTIVE_VIEW,
      activeViews: messages.length > 0 ? [ACTIVE_VIEW] : [],
      messageCount: messages.length,
      context: this.state.context,
      threads: {
        explain: normalizeThreadRecord(this.state.threads.explain),
      },
    };
  }

  private resolveExistingSummary(sessionId: string) {
    return this.state.sessionHistory.find((summary) => summary.id === sessionId) || null;
  }

  private schedulePersistCurrentSession(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistCurrentSession().catch((error) => {
        this.state.error = error instanceof Error ? error.message : String(error);
      });
    }, 220);
  }

  private async persistCurrentSession(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const record = this.buildCurrentSessionRecord();
    if (!record) {
      return;
    }
    await this.getSessionStore().saveSession(record);
    await this.refreshSessionHistory();
  }

  private fail(message: string): Error {
    return new Error(message);
  }

  private mapLlmError(error: LLMError): string {
    switch (error.code) {
      case 'unauthorized':
        return 'AI 请求鉴权失败，请检查 API Key。';
      case 'rate_limited':
        return 'AI 请求过于频繁，请稍后再试。';
      case 'timeout':
        return 'AI 请求超时，请检查网络或调大超时时间。';
      case 'empty_response':
        return 'AI 返回为空，请重试。';
      default:
        return error.message || 'AI 请求失败。';
    }
  }
}
