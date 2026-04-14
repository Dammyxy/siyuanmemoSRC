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
import type { AIDailyNoteDraftService } from '@/application/services/AIDailyNoteDraftService';
import type { AIWorkbenchSessionStoreService } from '@/application/services/AIWorkbenchSessionStoreService';
import type { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import type { FSRSCard } from '@/types/card';
import type {
  AICandidateDraftLocation,
  AICardCandidate,
  AIDraftSessionLocation,
  AIBlockContext,
  AIAttachedContextItem,
  AIExplainResult,
  AIContextProviderKey,
  AIFollowUpEntry,
  AIComposerContextState,
  AIMakeCardMode,
  AIMakeCardsResult,
  AITaskType,
  AITutorResult,
  AIWorkbenchContextSnapshot,
  AIWorkbenchAssistantResultMessage,
  AIWorkbenchAssistantTextMessage,
  AIWorkbenchCandidateBoardMessage,
  AIWorkbenchMessage,
  AIWorkbenchOpenOptions,
  AIWorkbenchSessionRecord,
  AIWorkbenchSource,
  AIWorkbenchSurface,
  AIWorkbenchState,
  AIWorkbenchThreadRecord,
  AIWorkbenchUserMessage,
  AIViewSessionState,
  AIReviewCardContext,
  AIWorkbenchMessageKind,
} from '@/types/ai';
import type { NeuralRoamBatchSnapshot } from '@/types/unified-data-source';
import type { AISettings } from '@/types/settings';

type TemplateField = {
  name: string;
  description?: string;
};

type XiuyuanTemplateLike = {
  id: string;
  name: string;
  fields: TemplateField[];
};

type ResolvedCandidateDraftSaveInput = {
  fieldOrder: string[];
  fieldValues: Record<string, string>;
};

export type AIWorkbenchServiceDeps = {
  getAISettings: () => AISettings;
  cardContentQueryService: CardContentQueryService;
  getXiuyuanApplicationService: () => Promise<XiuyuanApplicationService>;
  siyuanPort: AISiyuanPort;
  draftService: Pick<AIDailyNoteDraftService, 'saveCandidates' | 'markDraftStatus'>;
  llmPort: LLMPort;
  sessionStore?: Pick<
    AIWorkbenchSessionStoreService,
    'listSummaries' | 'loadSession' | 'saveSession' | 'renameSession' | 'deleteSession'
  >;
};

const NOOP_SESSION_STORE: Required<NonNullable<AIWorkbenchServiceDeps['sessionStore']>> = {
  async listSummaries() {
    return [];
  },
  async loadSession() {
    return null;
  },
  async saveSession(record) {
    return record;
  },
  async renameSession() {
    return null;
  },
  async deleteSession() {
    return undefined;
  },
};

const ALLOWED_TEMPLATE_IDS_BY_MODE: Record<AIMakeCardMode, string[]> = {
  qa: ['builtin-basic-qa', 'builtin-bidirectional'],
  cloze: ['builtin-multi-cloze'],
  'concept-descriptor': [
    'builtin-concept-definition',
    'builtin-concept-definition-forward',
    'builtin-concept-definition-reverse',
    'builtin-concept-descriptor',
    'builtin-concept-descriptor-auto',
    'builtin-concept-descriptor-reverse',
    'builtin-concept-descriptor-both',
  ],
  cdf: [
    'builtin-concept-definition',
    'builtin-concept-definition-forward',
    'builtin-concept-definition-reverse',
    'builtin-concept-descriptor',
    'builtin-concept-descriptor-auto',
    'builtin-concept-descriptor-reverse',
    'builtin-concept-descriptor-both',
  ],
};

const TEMPLATE_FIELD_ALIASES: Record<string, string[]> = {
  question: ['front', 'prompt', 'q'],
  answer: ['back', 'response', 'a'],
  term: ['front', 'question', 'prompt'],
  definition: ['back', 'answer', 'description', 'meaning'],
  concept: ['front', 'question', 'term', 'topic'],
  descriptor: ['back', 'answer', 'description', 'attribute', 'detail'],
  content: ['text', 'body', 'front'],
};

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(
    ids
      .map((id) => String(id || '').trim())
      .filter((id) => id.length > 0),
  ));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeFieldKey(value: string): string {
  return normalizeString(value).toLowerCase().replace(/[\s_-]+/g, '');
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeString(entry))
    .filter((entry) => entry.length > 0);
}

function normalizeLooseStringList(value: unknown): string[] {
  const directList = normalizeStringArray(value);
  if (directList.length > 0) {
    return directList;
  }
  const directText = normalizeString(value);
  return directText ? [directText] : [];
}

function truncateText(value: string, limit = 140): string {
  const normalized = normalizeString(value).replace(/\s+/g, ' ');
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}…`;
}

function cloneAttachedContexts(items: AIAttachedContextItem[] | undefined | null): AIAttachedContextItem[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => ({
    ...item,
    blockIds: [...item.blockIds],
  }));
}

function createEmptyComposerContextState(): AIComposerContextState {
  return {
    items: [],
  };
}

function uniqueContextItems(items: AIAttachedContextItem[]): AIAttachedContextItem[] {
  const seen = new Set<string>();
  const result: AIAttachedContextItem[] = [];
  for (const item of items) {
    const signature = [
      item.providerKey,
      normalizeString(item.title),
      normalizeString(item.content),
      item.blockIds.join(','),
    ].join('::');
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    result.push({
      ...item,
      blockIds: [...item.blockIds],
    });
  }
  return result;
}

function parseBlockReferenceIds(value: string): string[] {
  const normalized = normalizeString(value);
  if (!normalized) {
    return [];
  }

  const matched = normalized.match(/\d{14}-[0-9a-z]{7}/ig) || [];
  return uniqueIds(matched);
}

function createEntryId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyViewSessionState(): AIViewSessionState {
  return {
    resultContextSignature: null,
    stale: false,
    staleReason: null,
    followUps: [],
  };
}

function createInitialViewState(): Record<AITaskType, AIViewSessionState> {
  return {
    tutor: createEmptyViewSessionState(),
    explain: createEmptyViewSessionState(),
    'make-cards': createEmptyViewSessionState(),
  };
}

function createEmptyThreadRecord(view: AITaskType): AIWorkbenchThreadRecord {
  return {
    view,
    messages: [],
    resultContextSignature: null,
    stale: false,
    staleReason: null,
  };
}

function createInitialThreads(): Record<AITaskType, AIWorkbenchThreadRecord> {
  return {
    tutor: createEmptyThreadRecord('tutor'),
    explain: createEmptyThreadRecord('explain'),
    'make-cards': createEmptyThreadRecord('make-cards'),
  };
}

function normalizeSurface(value: unknown): AIWorkbenchSurface {
  switch (value) {
    case 'review-dialog-sidecar':
    case 'review-tab-companion':
    case 'standalone-dialog':
      return value;
    default:
      return 'standalone-dialog';
  }
}

function serializeNeuralBatch(batch: NeuralRoamBatchSnapshot | null): unknown {
  if (!batch) {
    return null;
  }

  if (batch.kind === 'orbit-round') {
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

  return batch;
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
    return {
      ok: true,
      value: JSON.parse(normalized),
    };
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

  const fencedMatches = direct.matchAll(/```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g);
  for (const match of fencedMatches) {
    const fencedParsed = tryParseJson(match[1] || '');
    if (fencedParsed.ok) {
      return fencedParsed.value;
    }
  }

  const objectStart = direct.indexOf('{');
  const objectEnd = direct.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    const objectParsed = tryParseJson(direct.slice(objectStart, objectEnd + 1));
    if (objectParsed.ok) {
      return objectParsed.value;
    }
  }

  const arrayStart = direct.indexOf('[');
  const arrayEnd = direct.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    const arrayParsed = tryParseJson(direct.slice(arrayStart, arrayEnd + 1));
    if (arrayParsed.ok) {
      return arrayParsed.value;
    }
  }

  throw new Error('AI response is not valid JSON');
}

function summarizeFieldMapping(fieldMapping: Record<string, string>): string {
  const parts = Object.entries(fieldMapping)
    .map(([key, value]) => `${key}: ${value}`)
    .filter((entry) => entry.trim().length > 0);
  return parts.join(' | ');
}

function resolveDefaultTemplateId(mode: AIMakeCardMode): string {
  return ALLOWED_TEMPLATE_IDS_BY_MODE[mode][0];
}

function safeTemplateId(mode: AIMakeCardMode, value: unknown): string {
  const normalized = normalizeString(value);
  return ALLOWED_TEMPLATE_IDS_BY_MODE[mode].includes(normalized)
    ? normalized
    : resolveDefaultTemplateId(mode);
}

function readXiuyuanMeta(card: FSRSCard | null | undefined): Record<string, unknown> | null {
  if (!isRecord(card?.meta)) {
    return null;
  }
  return card!.meta as Record<string, unknown>;
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

export class AIWorkbenchService {
  readonly state = reactive<AIWorkbenchState>({
    sessionId: null,
    surface: 'standalone-dialog',
    sourceReviewSessionId: null,
    contextSignature: null,
    viewState: createInitialViewState(),
    activeView: 'tutor',
    context: null,
    liveContext: null,
    contextIsHistorical: false,
    isLoading: false,
    error: null,
    tutorResult: null,
    explainResult: null,
    makeCardsResult: null,
    makeCardMode: 'qa',
    requestBatchSummary: false,
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
    if (options.view) {
      this.state.activeView = options.view;
    }
    if (options.makeCardMode) {
      this.state.makeCardMode = options.makeCardMode;
    }
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
      await this.runActiveView();
    }
  }

  getViewState(view: AITaskType = this.state.activeView): AIViewSessionState {
    return this.state.viewState[view];
  }

  getThread(view: AITaskType = this.state.activeView): AIWorkbenchThreadRecord {
    return this.state.threads[view];
  }

  getThreadMessages(view: AITaskType = this.state.activeView): AIWorkbenchMessage[] {
    return this.getThread(view).messages;
  }

  isViewStale(view: AITaskType = this.state.activeView): boolean {
    return this.getViewState(view).stale;
  }

  getFollowUps(view: AITaskType = this.state.activeView): AIFollowUpEntry[] {
    return this.getViewState(view).followUps;
  }

  hasStructuredResult(view: AITaskType = this.state.activeView): boolean {
    switch (view) {
      case 'tutor':
        return this.state.tutorResult !== null;
      case 'explain':
        return this.state.explainResult !== null;
      case 'make-cards':
        return this.state.makeCardsResult !== null;
      default:
        return false;
    }
  }

  getFollowUpDisabledReason(view: AITaskType = this.state.activeView): string | null {
    if (this.state.isLoading) {
      return 'AI 正在处理中，请稍后继续追问。';
    }
    if (!this.hasStructuredResult(view)) {
      return '请先运行一次当前视图，再继续追问。';
    }
    if (this.isViewStale(view)) {
      return this.getViewState(view).staleReason || '当前上下文已变化，请先重新运行。';
    }
    return null;
  }

  getCurrentModelLabel(): string {
    return normalizeString(this.deps.getAISettings().model) || '未配置模型';
  }

  setActiveView(view: AITaskType): void {
    this.state.activeView = view;
    this.schedulePersistCurrentSession();
  }

  setMakeCardMode(mode: AIMakeCardMode): void {
    this.state.makeCardMode = mode;
    this.schedulePersistCurrentSession();
  }

  setRequestBatchSummary(enabled: boolean): void {
    this.state.requestBatchSummary = enabled;
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

  setEditingMessage(
    messageId: string | null,
    kind: AIWorkbenchMessageKind | null,
  ): void {
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

  async updateAssistantResultMessage(
    messageId: string,
    payload: Partial<AITutorResult> | Partial<AIExplainResult>,
  ): Promise<void> {
    const target = this.findMessage(messageId);
    if (!target || target.message.kind !== 'assistant-result') {
      return;
    }

    if (target.message.view === 'tutor' && target.message.tutorResult) {
      target.message.tutorResult = {
        ...target.message.tutorResult,
        blindSpots: Array.isArray((payload as Partial<AITutorResult>).blindSpots)
          ? normalizeLooseStringList((payload as Partial<AITutorResult>).blindSpots)
          : target.message.tutorResult.blindSpots,
        patterns: Array.isArray((payload as Partial<AITutorResult>).patterns)
          ? normalizeLooseStringList((payload as Partial<AITutorResult>).patterns)
          : target.message.tutorResult.patterns,
        nextLines: Array.isArray((payload as Partial<AITutorResult>).nextLines)
          ? normalizeLooseStringList((payload as Partial<AITutorResult>).nextLines)
          : target.message.tutorResult.nextLines,
        cardIdeas: Array.isArray((payload as Partial<AITutorResult>).cardIdeas)
          ? normalizeLooseStringList((payload as Partial<AITutorResult>).cardIdeas)
          : target.message.tutorResult.cardIdeas,
        batchSummary: Object.prototype.hasOwnProperty.call(payload, 'batchSummary')
          ? normalizeString((payload as Partial<AITutorResult>).batchSummary) || null
          : target.message.tutorResult.batchSummary,
      };
      target.message.rawContent = JSON.stringify(target.message.tutorResult, null, 2);
    }

    if (target.message.view === 'explain' && target.message.explainResult) {
      target.message.explainResult = {
        ...target.message.explainResult,
        workingDefinition: Object.prototype.hasOwnProperty.call(payload, 'workingDefinition')
          ? normalizeString((payload as Partial<AIExplainResult>).workingDefinition)
          : target.message.explainResult.workingDefinition,
        whatItTests: Object.prototype.hasOwnProperty.call(payload, 'whatItTests')
          ? normalizeString((payload as Partial<AIExplainResult>).whatItTests)
          : target.message.explainResult.whatItTests,
        whyItsTricky: Object.prototype.hasOwnProperty.call(payload, 'whyItsTricky')
          ? normalizeString((payload as Partial<AIExplainResult>).whyItsTricky)
          : target.message.explainResult.whyItsTricky,
        connections: Array.isArray((payload as Partial<AIExplainResult>).connections)
          ? normalizeLooseStringList((payload as Partial<AIExplainResult>).connections)
          : target.message.explainResult.connections,
        triggers: Array.isArray((payload as Partial<AIExplainResult>).triggers)
          ? normalizeLooseStringList((payload as Partial<AIExplainResult>).triggers)
          : target.message.explainResult.triggers,
        cardIdeas: Array.isArray((payload as Partial<AIExplainResult>).cardIdeas)
          ? normalizeLooseStringList((payload as Partial<AIExplainResult>).cardIdeas)
          : target.message.explainResult.cardIdeas,
      };
      target.message.rawContent = JSON.stringify(target.message.explainResult, null, 2);
    }

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
    if (this.state.activeView === 'tutor') {
      await this.runTutor();
      return;
    }
    if (this.state.activeView === 'explain') {
      await this.runExplain();
      return;
    }
    await this.runMakeCards();
  }

  async rerunTutorWithSummary(): Promise<void> {
    this.state.requestBatchSummary = true;
    await this.runTutor();
  }

  async runTutor(): Promise<void> {
    await this.runTask('tutor', async () => {
      const context = this.requireContext();
      const batch = context.neuralBatch;
      if (!batch) {
        throw this.fail('AI 导师目前主要在神经漫游复习中可用。');
      }
      const attachedContexts = this.consumeComposerContexts();

      const response = await this.requestModel('tutor', {
        language: this.deps.getAISettings().defaultOutputLanguage,
        requestBatchSummary: this.state.requestBatchSummary,
        attachedContexts,
        context: {
          source: context.source,
          queueType: context.queueType,
          queueProgress: context.queueProgress,
          currentCard: context.currentCard,
          neuralBatch: batch,
          selectedBlocks: context.blocks,
        },
      });
      const payload = this.extractStructuredPayload('AI 导师', response.content, 'tutor');
      this.state.tutorResult = this.normalizeTutorResult(payload, response.content);
      this.appendMessage('tutor', {
        id: createEntryId('ai-msg'),
        view: 'tutor',
        kind: 'assistant-result',
        createdAt: Date.now(),
        rawContent: response.content,
        tutorResult: this.state.tutorResult,
        explainResult: null,
        appliedContexts: attachedContexts,
      } satisfies AIWorkbenchAssistantResultMessage);
    });
  }

  async runExplain(): Promise<void> {
    await this.runTask('explain', async () => {
      const context = this.requireContext();
      if (
        context.source === 'review'
        && context.currentCard
        && context.currentCard.explainRequiresReveal
        && !context.currentCard.revealed
      ) {
        throw this.fail('请先揭示答案，再使用 AI 解释卡片。');
      }
      const attachedContexts = this.consumeComposerContexts();

      const response = await this.requestModel('explain', {
        language: this.deps.getAISettings().defaultOutputLanguage,
        attachedContexts,
        context: {
          source: context.source,
          queueType: context.queueType,
          queueProgress: context.queueProgress,
          currentCard: context.currentCard,
          neuralBatch: context.neuralBatch,
          selectedBlocks: context.blocks,
        },
      });
      const payload = this.extractStructuredPayload('AI 解释卡片', response.content, 'explain');
      this.state.explainResult = this.normalizeExplainResult(payload, response.content);
      this.appendMessage('explain', {
        id: createEntryId('ai-msg'),
        view: 'explain',
        kind: 'assistant-result',
        createdAt: Date.now(),
        rawContent: response.content,
        tutorResult: null,
        explainResult: this.state.explainResult,
        appliedContexts: attachedContexts,
      } satisfies AIWorkbenchAssistantResultMessage);
    });
  }

  async runMakeCards(): Promise<void> {
    await this.runTask('make-cards', async () => {
      const context = this.requireContext();
      const mode = this.state.makeCardMode;
      const attachedContexts = this.consumeComposerContexts();
      const response = await this.requestModel('card-candidate', {
        language: this.deps.getAISettings().defaultOutputLanguage,
        mode,
        allowedTemplateIds: ALLOWED_TEMPLATE_IDS_BY_MODE[mode],
        learnerProfile: {
          existingLevel: '略懂',
          goal: '理解概念',
          outputDepth: '标准',
        },
        attachedContexts,
        context: {
          source: context.source,
          queueType: context.queueType,
          queueProgress: context.queueProgress,
          currentCard: context.currentCard,
          neuralBatch: context.neuralBatch,
          selectedBlocks: context.blocks,
        },
      }, { mode });
      const taskLabel = mode === 'cdf' ? 'CDF 辅助制卡' : 'AI 辅助制卡';
      const payload = this.extractStructuredPayload(taskLabel, response.content, 'make-cards');
      this.state.makeCardsResult = this.normalizeMakeCardsResult(mode, payload, response.content, context);
      this.appendMessage('make-cards', {
        id: createEntryId('ai-msg'),
        view: 'make-cards',
        kind: 'candidate-board',
        createdAt: Date.now(),
        mode,
        result: this.state.makeCardsResult,
        appliedContexts: attachedContexts,
      } satisfies AIWorkbenchCandidateBoardMessage);
    });
  }

  async submitFollowUp(question: string, options?: { editedFromMessageId?: string | null }): Promise<void> {
    const normalizedQuestion = normalizeString(question);
    if (!normalizedQuestion) {
      return;
    }

    const view = this.state.activeView;
    const disabledReason = this.getFollowUpDisabledReason(view);
    if (disabledReason) {
      throw this.fail(disabledReason);
    }

    const thread = this.getViewState(view).followUps;
    const attachedContexts = this.consumeComposerContexts();
    const userEntry: AIFollowUpEntry = {
      id: createEntryId('follow-up'),
      view,
      role: 'user',
      content: normalizedQuestion,
      createdAt: Date.now(),
    };
    thread.push(userEntry);
    this.appendMessage(view, {
      id: createEntryId('ai-msg'),
      view,
      kind: 'user',
      content: normalizedQuestion,
      createdAt: userEntry.createdAt,
      editedFromMessageId: normalizeString(options?.editedFromMessageId) || null,
      attachedContexts,
    } satisfies AIWorkbenchUserMessage);

    this.state.isLoading = true;
    this.state.error = null;
    try {
      const response = await this.requestFollowUp(view, attachedContexts);
      const assistantFollowUp: AIFollowUpEntry = {
        id: createEntryId('follow-up'),
        view,
        role: 'assistant',
        content: normalizeString(response.content) || '这次没有返回可用内容。',
        createdAt: Date.now(),
      };
      thread.push(assistantFollowUp);
      this.appendMessage(view, {
        id: createEntryId('ai-msg'),
        view,
        kind: 'assistant-text',
        content: assistantFollowUp.content,
        createdAt: assistantFollowUp.createdAt,
        sourceContent: assistantFollowUp.content,
        appliedContexts: attachedContexts,
      } satisfies AIWorkbenchAssistantTextMessage);
      await this.persistCurrentSession();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.state.isLoading = false;
    }
  }

  toggleCandidateDiscarded(candidateId: string): void {
    if (this.isViewStale('make-cards')) {
      return;
    }
    const candidate = this.findCandidate(candidateId);
    if (!candidate || this.isCandidateMutating(candidate)) {
      return;
    }
    candidate.discarded = candidate.discarded !== true;
    this.schedulePersistCurrentSession();
  }

  updateCandidateField(candidateId: string, fieldName: string, value: string): void {
    if (this.isViewStale('make-cards')) {
      return;
    }
    const candidate = this.findCandidate(candidateId);
    if (!candidate || !this.canEditCandidate(candidate)) {
      return;
    }
    candidate.fieldMapping[fieldName] = value;
    candidate.preview = summarizeFieldMapping(candidate.fieldMapping);
    this.markCandidateDirty(candidate);
    this.schedulePersistCurrentSession();
  }

  updateCandidateTitle(candidateId: string, value: string): void {
    if (this.isViewStale('make-cards')) {
      return;
    }
    const candidate = this.findCandidate(candidateId);
    if (!candidate || !this.canEditCandidate(candidate)) {
      return;
    }
    candidate.title = value;
    this.markCandidateDirty(candidate);
    this.schedulePersistCurrentSession();
  }

  updateCandidateTemplateId(candidateId: string, value: string): void {
    if (this.isViewStale('make-cards')) {
      return;
    }
    const candidate = this.findCandidate(candidateId);
    if (!candidate || !this.canEditCandidate(candidate)) {
      return;
    }
    const mode = this.state.makeCardsResult?.mode || this.state.makeCardMode;
    candidate.templateId = safeTemplateId(mode, value);
    this.markCandidateDirty(candidate);
    this.schedulePersistCurrentSession();
  }

  getDraftStorageMode(): AISettings['draftStorage']['mode'] {
    const storage = this.deps.getAISettings().draftStorage;
    return storage?.mode === 'library' ? 'library' : 'daily-note';
  }

  async saveSelectedCandidatesToDailyNote(candidateIds?: string[]): Promise<number> {
    if (this.isViewStale('make-cards')) {
      throw this.fail('当前候选基于旧上下文生成，请先重新生成候选卡。');
    }
    const result = this.state.makeCardsResult;
    if (!result) {
      throw this.fail('当前没有可保存的候选卡。');
    }

    const targets = this.resolveSelectedCandidates(candidateIds);
    const saveTargets = targets.filter((candidate) => this.needsDraftSave(candidate));
    const bulkSave = uniqueIds(candidateIds || []).length === 0;
    const cleanupNeeded = bulkSave && this.hasDraftCleanupWork(result);
    if (saveTargets.length === 0 && !cleanupNeeded) {
      return 0;
    }

    this.state.isLoading = true;
    this.state.error = null;

    try {
      const resolvedSaveInputs = saveTargets.length > 0
        ? await this.resolveCandidateDraftSaveInputs(saveTargets)
        : new Map<string, ResolvedCandidateDraftSaveInput>();
      const previousLocations = new Map(
        saveTargets.map((candidate) => [candidate.id, candidate.draftLocation] as const),
      );
      for (const candidate of saveTargets) {
        candidate.draftState = 'saving';
        candidate.draftError = null;
        candidate.draftErrorOperation = null;
      }

      const saveResult = await this.deps.draftService.saveCandidates({
        mode: result.mode,
        existingSession: result.draftSession,
        authoritativeCandidateIds: bulkSave ? targets.map((candidate) => candidate.id) : undefined,
        authoritativeSourceBlockIds: bulkSave
          ? uniqueIds(targets.flatMap((candidate) => candidate.sourceBlockIds))
          : undefined,
        storage: this.deps.getAISettings().draftStorage,
        candidates: saveTargets.map((candidate) => {
          const resolved = resolvedSaveInputs.get(candidate.id);
          if (!resolved) {
            throw new Error(`候选 ${candidate.id} 缺少模板字段映射，无法保存草稿。`);
          }
          return {
            candidateId: candidate.id,
            title: candidate.title,
            templateId: candidate.templateId,
            sourceBlockIds: candidate.sourceBlockIds,
            fieldValues: resolved.fieldValues,
            fieldOrder: resolved.fieldOrder,
            existingLocation: candidate.draftLocation,
          };
        }),
      });
      result.draftSession = saveResult.session;

      const savedById = new Map(saveResult.saved.map((entry) => [entry.candidateId, entry.location] as const));
      const failedById = new Map(saveResult.failed.map((entry) => [entry.candidateId, entry.error] as const));

      for (const candidate of saveTargets) {
        const savedLocation = savedById.get(candidate.id);
        if (savedLocation) {
          candidate.draftState = 'saved';
          candidate.draftError = null;
          candidate.draftErrorOperation = null;
          candidate.draftLocation = savedLocation;
          continue;
        }

        const failedError = failedById.get(candidate.id) || new Error('保存草稿失败。');
        candidate.draftState = 'error';
        candidate.draftError = failedError.message;
        candidate.draftErrorOperation = 'save';
        candidate.draftLocation = previousLocations.get(candidate.id) || null;
      }

      this.applyDeletedDraftCandidates(saveResult.deletedCandidateIds, saveResult.session);

      if (saveResult.failed.length > 0) {
        this.state.error = `${saveResult.failed.length} 条候选保存草稿失败，请检查后重试。`;
      }

      await this.persistCurrentSession();
      return saveResult.saved.length;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      const previousLocations = new Map(
        saveTargets.map((candidate) => [candidate.id, candidate.draftLocation] as const),
      );
      for (const candidate of saveTargets) {
        if (candidate.draftState === 'saving') {
          candidate.draftState = 'error';
          candidate.draftError = normalized.message;
          candidate.draftErrorOperation = 'save';
          candidate.draftLocation = previousLocations.get(candidate.id) || candidate.draftLocation;
        }
      }
      this.state.error = normalized.message;
      await this.persistCurrentSession();
      throw normalized;
    } finally {
      this.state.isLoading = false;
    }
  }

  async createSelectedCandidates(candidateIds?: string[]): Promise<number> {
    if (this.isViewStale('make-cards')) {
      throw this.fail('当前候选基于旧上下文生成，请先重新生成候选卡。');
    }
    const result = this.state.makeCardsResult;
    if (!result) {
      throw this.fail('当前没有可创建的候选卡。');
    }

    const targets = this.resolveSelectedCandidates(candidateIds);

    if (targets.length === 0) {
      return 0;
    }

    if (targets.some((candidate) => !this.canCreateCandidateFromDraft(candidate))) {
      throw this.fail('请先把候选保存成草稿后再创建卡片。');
    }

    this.state.isLoading = true;
    this.state.error = null;

    try {
      const xiuyuanService = await this.deps.getXiuyuanApplicationService();
      let createdCount = 0;
      let hasCreateError = false;
      for (const candidate of targets) {
        const draftLocation = candidate.draftLocation;
        if (!draftLocation) {
          throw this.fail('候选缺少草稿位置，请先重新保存草稿。');
        }

        candidate.draftState = 'creating';
        candidate.draftError = null;
        candidate.draftErrorOperation = null;
        await this.markDraftStatusSafely(draftLocation, 'creating');
        try {
          await this.createCandidateFromDraft(xiuyuanService, candidate, draftLocation);
          await this.markDraftStatusSafely(draftLocation, 'created');
          candidate.draftState = 'created';
          createdCount += 1;
        } catch (error) {
          hasCreateError = true;
          await this.markDraftStatusSafely(draftLocation, 'error');
          candidate.draftState = 'error';
          candidate.draftError = error instanceof Error ? error.message : String(error);
          candidate.draftErrorOperation = 'create';
        }
      }
      if (hasCreateError) {
        this.state.error = '部分候选创建失败，可在保留草稿的前提下重试。';
      }
      await this.persistCurrentSession();
      return createdCount;
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
      lastActiveView: this.state.activeView,
      activeViews: [],
      messageCount: 0,
      context,
      makeCardMode: this.state.makeCardMode,
      requestBatchSummary: this.state.requestBatchSummary,
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
    this.state.activeView = record.lastActiveView;
    this.state.makeCardMode = record.makeCardMode;
    this.state.requestBatchSummary = record.requestBatchSummary;
    this.state.threads = record.threads;
    this.state.composerContexts = createEmptyComposerContextState();
    this.state.composerEditorOpen = false;
    this.state.editingMessageId = null;
    this.state.editingMessageKind = null;
    this.syncDerivedStateFromThreads();
  }

  private syncDerivedStateFromThreads(): void {
    for (const view of ['tutor', 'explain', 'make-cards'] as const) {
      const thread = this.getThread(view);
      const viewState = this.getViewState(view);
      viewState.resultContextSignature = thread.resultContextSignature;
      viewState.stale = thread.stale;
      viewState.staleReason = thread.staleReason;
      viewState.followUps = thread.messages
        .filter((message) => message.kind === 'user' || message.kind === 'assistant-text')
        .map((message) => ({
          id: message.id,
          view,
          role: message.kind === 'user' ? 'user' : 'assistant',
          content: message.content,
          createdAt: message.createdAt,
        }));
    }
    this.state.tutorResult = this.findLatestTutorResult();
    this.state.explainResult = this.findLatestExplainResult();
    this.state.makeCardsResult = this.findLatestMakeCardsResult();
  }

  private findLatestTutorResult(): AITutorResult | null {
    const messages = [...this.state.threads.tutor.messages].reverse();
    const latest = messages.find((message) => message.kind === 'assistant-result' && message.view === 'tutor');
    return latest?.kind === 'assistant-result' ? latest.tutorResult : null;
  }

  private findLatestExplainResult(): AIExplainResult | null {
    const messages = [...this.state.threads.explain.messages].reverse();
    const latest = messages.find((message) => message.kind === 'assistant-result' && message.view === 'explain');
    return latest?.kind === 'assistant-result' ? latest.explainResult : null;
  }

  private findLatestMakeCardsResult(): AIMakeCardsResult | null {
    const messages = [...this.state.threads['make-cards'].messages].reverse();
    const latest = messages.find((message) => message.kind === 'candidate-board');
    return latest?.kind === 'candidate-board' ? latest.result : null;
  }

  private appendMessage(view: AITaskType, message: AIWorkbenchMessage): void {
    this.getThread(view).messages.push(message);
    this.syncDerivedStateFromThreads();
    this.schedulePersistCurrentSession();
  }

  private consumeComposerContexts(): AIAttachedContextItem[] {
    const snapshot = cloneAttachedContexts(this.state.composerContexts.items);
    this.state.composerContexts.items = [];
    return snapshot;
  }

  private findMessage(
    messageId: string,
  ): { view: AITaskType; index: number; message: AIWorkbenchMessage } | null {
    const normalizedId = normalizeString(messageId);
    if (!normalizedId) {
      return null;
    }
    for (const view of ['tutor', 'explain', 'make-cards'] as const) {
      const messages = this.getThread(view).messages;
      const index = messages.findIndex((message) => message.id === normalizedId);
      if (index >= 0) {
        return {
          view,
          index,
          message: messages[index],
        };
      }
    }
    return null;
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
      .filter((entry) => entry.length > 0)
      .join('\n\n');
    const backText = backBlockIds
      .map((blockId) => contentMap.get(blockId)?.content || '')
      .filter((entry) => entry.length > 0)
      .join('\n\n');
    const sourceText = sourceBlockIds
      .map((blockId) => contentMap.get(blockId)?.content || '')
      .filter((entry) => entry.length > 0)
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

    const resolver = new BlockContextResolver({
      i18n: {},
      notify: () => {},
    });
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
      .filter((entry) => entry.length > 0)
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
      .filter((entry) => entry.length > 0)
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
      const resolver = new BlockContextResolver({
        i18n: {},
        notify: () => {},
      });
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
    } catch (error) {
      const label = normalizeString(title) || blockId;
      throw this.fail(`AI 无法读取文档「${label}」的正文，请稍后重试。`);
    }
  }

  private async requestModel(
    promptTask: AIPromptTask,
    payload: Record<string, unknown>,
    options?: { mode?: AIMakeCardMode },
  ): Promise<LLMResponse> {
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
            content: this.buildStructuredRunSystemPrompt(promptTask, settings, options),
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

  private async requestFollowUp(
    view: AITaskType,
    attachedContexts: AIAttachedContextItem[] = [],
  ): Promise<LLMResponse> {
    const context = this.requireContext();
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

    const thread = this.getFollowUps(view);
    const structuredResult = this.getStructuredResult(view);
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
            content: this.getPromptTemplateForView(view, settings, { followUp: true }),
          },
          {
            role: 'user',
            content: JSON.stringify({
              language: settings.defaultOutputLanguage,
              view,
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
          ...thread.map((entry) => ({
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

  private getPromptTaskForView(view: AITaskType): AIPromptTask {
    return view === 'make-cards' ? 'card-candidate' : view;
  }

  private getPromptTemplateForView(
    view: AITaskType,
    settings: AISettings,
    options?: { followUp?: boolean },
  ): string {
    const mode = view === 'make-cards'
      ? (this.state.makeCardsResult?.mode || this.state.makeCardMode)
      : undefined;
    return this.getPromptTemplate(this.getPromptTaskForView(view), settings, {
      followUp: options?.followUp,
      mode,
    });
  }

  private getPromptTemplate(
    task: AIPromptTask,
    settings: AISettings,
    options?: { followUp?: boolean; mode?: AIMakeCardMode },
  ): string {
    const followUp = options?.followUp === true;
    switch (task) {
      case 'tutor':
        return followUp ? settings.prompts.tutor.followUp : settings.prompts.tutor.run;
      case 'explain':
        return followUp ? settings.prompts.explain.followUp : settings.prompts.explain.run;
      case 'card-candidate':
        if (options?.mode === 'cdf') {
          return followUp ? settings.prompts.cardCandidateCdf.followUp : settings.prompts.cardCandidateCdf.run;
        }
        return followUp ? settings.prompts.cardCandidate.followUp : settings.prompts.cardCandidate.run;
      default:
        return followUp ? settings.prompts.explain.followUp : settings.prompts.explain.run;
    }
  }

  private buildStructuredRunSystemPrompt(
    task: AIPromptTask,
    settings: AISettings,
    options?: { mode?: AIMakeCardMode },
  ): string {
    const behaviorPrompt = this.getPromptTemplate(task, settings, {
      followUp: false,
      mode: options?.mode,
    });
    const contractText = formatStructuredPromptContract(
      getPromptContractForTask(task === 'card-candidate' && options?.mode === 'cdf' ? 'card-candidate-cdf' : task, {
        mode: options?.mode,
      }),
    );
    return [behaviorPrompt, contractText]
      .map((section) => normalizeString(section))
      .filter((section) => section.length > 0)
      .join('\n\n');
  }

  private extractStructuredPayload(taskLabel: string, rawContent: string, view: AITaskType): unknown {
    try {
      return extractJsonPayload(rawContent);
    } catch (error) {
      const promptLabel = view === 'make-cards'
        ? (this.state.makeCardMode === 'cdf' ? 'CDF 辅助制卡行为 Prompt' : 'AI 制卡行为 Prompt')
        : view === 'tutor'
          ? 'AI 导师行为 Prompt'
          : 'AI 解释行为 Prompt';
      const reason = error instanceof Error ? error.message : String(error);
      throw this.fail(`${taskLabel}返回的内容不是合法 JSON。请检查设置里的 ${promptLabel} 是否把系统结构化输出要求冲掉了。原始原因：${reason}`);
    }
  }

  private getStructuredResult(view: AITaskType): AITutorResult | AIExplainResult | AIMakeCardsResult | null {
    switch (view) {
      case 'tutor':
        return this.state.tutorResult;
      case 'explain':
        return this.state.explainResult;
      case 'make-cards':
        return this.state.makeCardsResult;
      default:
        return null;
    }
  }

  private normalizeTutorResult(payload: unknown, rawContent: string): AITutorResult {
    const value = isRecord(payload) ? payload : {};
    return {
      blindSpots: normalizeLooseStringList(value.blindSpots),
      patterns: normalizeLooseStringList(value.patterns),
      nextLines: normalizeLooseStringList(value.nextLines),
      cardIdeas: normalizeLooseStringList(value.cardIdeas),
      batchSummary: normalizeString(value.batchSummary) || null,
      rawContent,
    };
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

  private normalizeMakeCardsResult(
    mode: AIMakeCardMode,
    payload: unknown,
    rawContent: string,
    context: AIWorkbenchContextSnapshot,
  ): AIMakeCardsResult {
    const value = isRecord(payload) ? payload : {};
    const rawCandidates = Array.isArray(value.candidates) ? value.candidates : [];
    return {
      mode,
      rawContent,
      draftSession: null,
      candidates: rawCandidates
        .map((candidate) => this.normalizeCandidate(mode, candidate, context))
        .filter((candidate): candidate is AICardCandidate => Boolean(candidate)),
    };
  }

  private normalizeCandidate(
    mode: AIMakeCardMode,
    payload: unknown,
    context: AIWorkbenchContextSnapshot,
  ): AICardCandidate | null {
    if (!isRecord(payload)) {
      return null;
    }

    const rawFieldMapping = isRecord(payload.fieldMapping) ? payload.fieldMapping : {};
    const fieldMapping = Object.fromEntries(
      Object.entries(rawFieldMapping)
        .map(([key, value]) => [key, normalizeString(value)])
        .filter(([, value]) => value.length > 0),
    );
    if (Object.keys(fieldMapping).length === 0) {
      return null;
    }

    const title = normalizeString(payload.title) || summarizeFieldMapping(fieldMapping).slice(0, 80);
    const preview = normalizeString(payload.preview) || summarizeFieldMapping(fieldMapping);
    return {
      id: createEntryId('candidate'),
      templateId: safeTemplateId(mode, payload.templateId),
      title,
      preview,
      fieldMapping,
      sourceBlockIds: uniqueIds([
        ...normalizeStringArray(payload.sourceBlockIds),
        ...context.selectedBlockIds,
      ]),
      rationale: normalizeString(payload.rationale),
      confidence: clamp(Number(payload.confidence) || 0.6, 0, 1),
      discarded: false,
      draftState: 'unsaved',
      draftError: null,
      draftErrorOperation: null,
      draftLocation: null,
    };
  }

  private findCandidate(candidateId: string): AICardCandidate | null {
    return this.state.makeCardsResult?.candidates.find((candidate) => candidate.id === candidateId) || null;
  }

  private isCandidateMutating(candidate: AICardCandidate): boolean {
    return candidate.draftState === 'saving' || candidate.draftState === 'creating';
  }

  private canEditCandidate(candidate: AICardCandidate): boolean {
    return !this.isCandidateMutating(candidate) && candidate.draftState !== 'created';
  }

  private resolveSelectedCandidates(candidateIds?: string[]): AICardCandidate[] {
    const allowedIds = new Set(uniqueIds(candidateIds || []));
    return this.state.makeCardsResult?.candidates.filter((candidate) => {
      if (candidate.discarded) {
        return false;
      }
      if (allowedIds.size > 0 && !allowedIds.has(candidate.id)) {
        return false;
      }
      return candidate.draftState !== 'created';
    }) || [];
  }

  private needsDraftSave(candidate: AICardCandidate): boolean {
    if (candidate.discarded || this.isCandidateMutating(candidate) || candidate.draftState === 'created') {
      return false;
    }
    if (candidate.draftState === 'unsaved' || candidate.draftState === 'dirty') {
      return true;
    }
    return candidate.draftState === 'error' && candidate.draftErrorOperation !== 'create';
  }

  private canCreateCandidateFromDraft(candidate: AICardCandidate): boolean {
    if (candidate.discarded || this.isCandidateMutating(candidate) || candidate.draftState === 'created') {
      return false;
    }
    if (candidate.draftState === 'saved') {
      return candidate.draftLocation !== null;
    }
    return candidate.draftState === 'error'
      && candidate.draftErrorOperation === 'create'
      && candidate.draftLocation !== null;
  }

  private markCandidateDirty(candidate: AICardCandidate): void {
    if (candidate.draftState === 'created') {
      return;
    }
    candidate.draftState = candidate.draftLocation ? 'dirty' : 'unsaved';
    candidate.draftError = null;
    candidate.draftErrorOperation = null;
  }

  private hasDraftCleanupWork(result: AIMakeCardsResult): boolean {
    const activeSession = result.draftSession;
    if (!activeSession) {
      return false;
    }
    return result.candidates.some((candidate) => (
      candidate.discarded === true
      && candidate.draftState !== 'created'
      && candidate.draftLocation !== null
      && candidate.draftLocation.sessionBlockId === activeSession.sessionBlockId
    ));
  }

  private applyDeletedDraftCandidates(
    deletedCandidateIds: string[],
    session: AIDraftSessionLocation,
  ): void {
    if (!deletedCandidateIds.length || !this.state.makeCardsResult) {
      return;
    }
    const deleted = new Set(uniqueIds(deletedCandidateIds));
    for (const candidate of this.state.makeCardsResult.candidates) {
      if (!deleted.has(candidate.id)) {
        continue;
      }
      if (candidate.draftLocation?.sessionBlockId !== session.sessionBlockId) {
        continue;
      }
      candidate.draftLocation = null;
      candidate.draftError = null;
      candidate.draftErrorOperation = null;
      candidate.draftState = candidate.discarded ? 'unsaved' : candidate.draftState;
    }
  }

  private async resolveCandidateDraftSaveInputs(candidates: AICardCandidate[]): Promise<Map<string, ResolvedCandidateDraftSaveInput>> {
    const xiuyuanService = await this.deps.getXiuyuanApplicationService();
    const templateEntries = await Promise.all(
      uniqueIds(candidates.map((candidate) => candidate.templateId)).map(async (templateId) => [
        templateId,
        await xiuyuanService.getTemplate(templateId) as XiuyuanTemplateLike,
      ] as const),
    );
    const templatesById = new Map(templateEntries);

    return new Map(candidates.map((candidate) => {
      const template = templatesById.get(candidate.templateId);
      if (!template?.fields?.length) {
        throw new Error(`模版 ${candidate.templateId} 不存在或字段为空`);
      }
      return [candidate.id, this.resolveCandidateFieldValuesForTemplate(candidate, template)] as const;
    }));
  }

  private resolveCandidateFieldValuesForTemplate(
    candidate: AICardCandidate,
    template: XiuyuanTemplateLike,
  ): ResolvedCandidateDraftSaveInput {
    const sourceEntries = Object.entries(candidate.fieldMapping)
      .map(([key, value]) => ({
        key: normalizeString(key),
        normalizedKey: normalizeFieldKey(key),
        value: normalizeString(value),
      }))
      .filter((entry) => entry.key.length > 0 && entry.value.length > 0);

    const fieldOrder = template.fields.map((field) => field.name);
    const fieldValues: Record<string, string> = {};
    const usedSourceKeys = new Set<string>();

    const tryTakeSourceEntry = (keys: string[]): { key: string; value: string } | null => {
      for (const rawKey of keys) {
        const normalizedKey = normalizeFieldKey(rawKey);
        const match = sourceEntries.find((entry) => (
          entry.normalizedKey === normalizedKey
          && !usedSourceKeys.has(entry.key)
        ));
        if (match) {
          return { key: match.key, value: match.value };
        }
      }
      return null;
    };

    for (const fieldName of fieldOrder) {
      const aliases = [fieldName, ...(TEMPLATE_FIELD_ALIASES[fieldName] || [])];
      let match = tryTakeSourceEntry(aliases);
      if (!match && fieldOrder.length === 1 && sourceEntries.length === 1) {
        const loneEntry = sourceEntries[0];
        if (!usedSourceKeys.has(loneEntry.key)) {
          match = { key: loneEntry.key, value: loneEntry.value };
        }
      }
      if (!match) {
        const availableFields = sourceEntries.map((entry) => entry.key).join('、') || '无';
        throw new Error(`候选“${candidate.title || candidate.id}”缺少模版字段 ${fieldName}（模版：${template.name || template.id}，当前字段：${availableFields}）。`);
      }
      usedSourceKeys.add(match.key);
      fieldValues[fieldName] = match.value;
    }

    return {
      fieldOrder,
      fieldValues,
    };
  }

  private async markDraftStatusSafely(
    location: AICandidateDraftLocation,
    status: 'saved' | 'creating' | 'created' | 'error',
  ): Promise<void> {
    try {
      await this.deps.draftService.markDraftStatus(location, status);
    } catch {
      // Draft status sync is best-effort; card creation should not fail only because attrs could not be refreshed.
    }
  }

  private async createCandidateFromDraft(
    xiuyuanService: XiuyuanApplicationService,
    candidate: AICardCandidate,
    draftLocation: AICandidateDraftLocation,
  ): Promise<void> {
    const template = await xiuyuanService.getTemplate(candidate.templateId) as XiuyuanTemplateLike;
    if (!template?.fields?.length) {
      throw new Error(`模版 ${candidate.templateId} 不存在或字段为空`);
    }

    const fieldMapping = Object.fromEntries(template.fields.map((field) => {
      const fieldBlockId = normalizeString(draftLocation.fieldBlockIds[field.name]);
      if (!fieldBlockId) {
        throw new Error(`字段 ${field.name} 缺少草稿块，请先重新保存草稿。`);
      }
      return [field.name, fieldBlockId];
    }));
    const blockIds = template.fields.map((field) => fieldMapping[field.name]);
    const result = await xiuyuanService.createFromBlocks({
      blockIds,
      templateId: candidate.templateId,
      fieldMapping,
    });
    if (!result.ok) {
      throw result.error instanceof Error ? result.error : new Error(String(result.error));
    }
  }

  private requireContext(): AIWorkbenchContextSnapshot {
    if (!this.state.context) {
      throw this.fail('AI 工作台上下文还没有准备好。');
    }
    return this.state.context;
  }

  private async runTask(taskType: AITaskType, runner: () => Promise<void>): Promise<void> {
    this.state.isLoading = true;
    this.state.error = null;
    const thread = this.getThread(taskType);
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
    if (context.neuralBatch) {
      return `${sourceTitle} · 神经漫游`;
    }
    return `${sourceTitle} · AI 会话`;
  }

  private truncateTitle(value: string): string {
    const singleLine = value.replace(/\s+/g, ' ').trim();
    return singleLine.length > 28 ? `${singleLine.slice(0, 28)}…` : singleLine;
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
    return {
      id: sessionId,
      title: normalizeString(this.state.sessionTitle) || '未命名会话',
      source: this.state.context?.source || this.state.liveContext?.source || 'standalone',
      sourceReviewSessionId: this.state.sourceReviewSessionId,
      surface: this.state.surface,
      contextSignature: this.state.contextSignature,
      createdAt: this.resolveExistingSummary(sessionId)?.createdAt || Date.now(),
      updatedAt: Date.now(),
      lastActiveView: this.state.activeView,
      activeViews: [],
      messageCount: 0,
      context: this.state.context,
      makeCardMode: this.state.makeCardMode,
      requestBatchSummary: this.state.requestBatchSummary,
      threads: this.state.threads,
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
