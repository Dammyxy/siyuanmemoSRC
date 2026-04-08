import { reactive } from 'vue';
import type { CardContentQueryService } from '@/application/queries/CardContentQueryService';
import type { AISiyuanBlockRow, AISiyuanPort } from '@/application/ports/AISiyuanPort';
import type { LLMPort, LLMResponse } from '@/application/ports/LLMPort';
import { LLMError } from '@/application/ports/LLMPort';
import { composePrompt, type AIPromptTask } from '@/application/services/AIPromptComposer';
import type { AIDailyNoteDraftService } from '@/application/services/AIDailyNoteDraftService';
import type { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import type { FSRSCard } from '@/types/card';
import type {
  AICandidateDraftLocation,
  AICardCandidate,
  AIDraftSessionLocation,
  AIBlockContext,
  AIExplainResult,
  AIFollowUpEntry,
  AIMakeCardMode,
  AIMakeCardsResult,
  AITaskType,
  AITutorResult,
  AIWorkbenchContextSnapshot,
  AIWorkbenchHistoryEntry,
  AIWorkbenchOpenOptions,
  AIWorkbenchSurface,
  AIWorkbenchState,
  AIViewSessionState,
  AIReviewCardContext,
} from '@/types/ai';
import type { NeuralRoamBatchSnapshot } from '@/types/unified-data-source';
import { resolveAIEffectivePromptTemplate, type AISettings } from '@/types/settings';

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
};

const DEFAULT_TUTOR_RESULT: AITutorResult = {
  blindSpots: [],
  patterns: [],
  nextLines: [],
  cardIdeas: [],
  batchSummary: null,
  rawContent: '',
};

const DEFAULT_EXPLAIN_RESULT: AIExplainResult = {
  workingDefinition: '',
  whatItTests: '',
  whyItsTricky: '',
  connections: [],
  triggers: [],
  cardIdeas: [],
  rawContent: '',
};

const DEFAULT_MAKE_CARDS_RESULT: AIMakeCardsResult = {
  mode: 'qa',
  candidates: [],
  draftSession: null,
  rawContent: '',
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

function resolveContextChangeReason(
  previous: AIWorkbenchContextSnapshot | null,
  next: AIWorkbenchContextSnapshot | null,
): string {
  const previousCardId = normalizeString(previous?.currentCard?.cardId);
  const nextCardId = normalizeString(next?.currentCard?.cardId);
  if (previousCardId && nextCardId && previousCardId !== nextCardId) {
    return '当前已切换到新卡片，请基于最新卡片重新运行。';
  }

  const previousBatch = JSON.stringify(serializeNeuralBatch(previous?.neuralBatch ?? null));
  const nextBatch = JSON.stringify(serializeNeuralBatch(next?.neuralBatch ?? null));
  if (previousBatch !== nextBatch) {
    return '当前已切换到新批次，请基于最新批次重新运行。';
  }

  if (previous?.currentCard?.revealed !== next?.currentCard?.revealed) {
    return '当前答案可见状态已变化，请基于当前状态重新运行。';
  }

  return '当前上下文已更新，请基于最新上下文重新运行。';
}

function extractJsonPayload(raw: string): unknown {
  const direct = raw.trim();
  if (!direct) {
    throw new Error('AI returned empty content');
  }

  try {
    return JSON.parse(direct);
  } catch {
    // fall through
  }

  const objectStart = direct.indexOf('{');
  const objectEnd = direct.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) {
    return JSON.parse(direct.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = direct.indexOf('[');
  const arrayEnd = direct.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return JSON.parse(direct.slice(arrayStart, arrayEnd + 1));
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
    isLoading: false,
    error: null,
    tutorResult: null,
    explainResult: null,
    makeCardsResult: null,
    makeCardMode: 'qa',
    requestBatchSummary: false,
    history: [],
  });

  constructor(private readonly deps: AIWorkbenchServiceDeps) {}

  async open(options: AIWorkbenchOpenOptions = {}): Promise<void> {
    if (options.view) {
      this.state.activeView = options.view;
    }
    if (options.makeCardMode) {
      this.state.makeCardMode = options.makeCardMode;
    }
    this.state.surface = normalizeSurface(options.surface ?? this.state.surface);
    this.state.sessionId = normalizeString(options.sessionId) || this.state.sessionId || (
      this.state.surface === 'standalone-dialog' ? 'standalone' : null
    );
    this.state.sourceReviewSessionId = normalizeString(options.sourceReviewSessionId)
      || this.state.sourceReviewSessionId
      || null;
    this.state.error = null;
    const previousContext = this.state.context;
    try {
      const nextContext = await this.buildContextSnapshot(options);
      this.applyContextSnapshot(previousContext, nextContext);
    } catch (error) {
      this.state.context = null;
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

  setActiveView(view: AITaskType): void {
    this.state.activeView = view;
  }

  setMakeCardMode(mode: AIMakeCardMode): void {
    this.state.makeCardMode = mode;
  }

  setRequestBatchSummary(enabled: boolean): void {
    this.state.requestBatchSummary = enabled;
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

      const response = await this.requestModel('tutor', {
        language: this.deps.getAISettings().defaultOutputLanguage,
        requestBatchSummary: this.state.requestBatchSummary,
        context: {
          source: context.source,
          queueType: context.queueType,
          queueProgress: context.queueProgress,
          currentCard: context.currentCard,
          neuralBatch: batch,
          selectedBlocks: context.blocks,
        },
      });
      const payload = extractJsonPayload(response.content);
      this.state.tutorResult = this.normalizeTutorResult(payload, response.content);
      this.pushHistory('tutor', 'AI 导师');
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

      const response = await this.requestModel('explain', {
        language: this.deps.getAISettings().defaultOutputLanguage,
        context: {
          source: context.source,
          queueType: context.queueType,
          queueProgress: context.queueProgress,
          currentCard: context.currentCard,
          neuralBatch: context.neuralBatch,
          selectedBlocks: context.blocks,
        },
      });
      const payload = extractJsonPayload(response.content);
      this.state.explainResult = this.normalizeExplainResult(payload, response.content);
      this.pushHistory('explain', 'AI 解释');
    });
  }

  async runMakeCards(): Promise<void> {
    await this.runTask('make-cards', async () => {
      const context = this.requireContext();
      const mode = this.state.makeCardMode;
      const response = await this.requestModel('card-candidate', {
        language: this.deps.getAISettings().defaultOutputLanguage,
        mode,
        allowedTemplateIds: ALLOWED_TEMPLATE_IDS_BY_MODE[mode],
        learnerProfile: {
          existingLevel: '略懂',
          goal: '理解概念',
          outputDepth: '标准',
        },
        context: {
          source: context.source,
          queueType: context.queueType,
          queueProgress: context.queueProgress,
          currentCard: context.currentCard,
          neuralBatch: context.neuralBatch,
          selectedBlocks: context.blocks,
        },
      });
      const payload = extractJsonPayload(response.content);
      this.state.makeCardsResult = this.normalizeMakeCardsResult(mode, payload, response.content, context);
      this.pushHistory('make-cards', 'AI 辅助制卡');
    });
  }

  async submitFollowUp(question: string): Promise<void> {
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
    const userEntry: AIFollowUpEntry = {
      id: createEntryId('follow-up'),
      view,
      role: 'user',
      content: normalizedQuestion,
      createdAt: Date.now(),
    };
    thread.push(userEntry);

    this.state.isLoading = true;
    this.state.error = null;
    try {
      const response = await this.requestFollowUp(view);
      thread.push({
        id: createEntryId('follow-up'),
        view,
        role: 'assistant',
        content: normalizeString(response.content) || '这次没有返回可用内容。',
        createdAt: Date.now(),
      });
      this.pushHistory(view, 'AI 追问');
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
      return createdCount;
    } finally {
      this.state.isLoading = false;
    }
  }

  private applyContextSnapshot(
    previousContext: AIWorkbenchContextSnapshot | null,
    nextContext: AIWorkbenchContextSnapshot,
  ): void {
    const nextSignature = buildContextSignature(nextContext);
    this.state.context = nextContext;
    this.state.contextSignature = nextSignature;

    if (!previousContext || !nextSignature) {
      return;
    }

    const previousSignature = buildContextSignature(previousContext);
    if (!previousSignature || previousSignature === nextSignature) {
      return;
    }

    const staleReason = resolveContextChangeReason(previousContext, nextContext);
    for (const view of ['tutor', 'explain', 'make-cards'] as const) {
      const viewState = this.getViewState(view);
      if (!viewState.resultContextSignature) {
        continue;
      }

      if (viewState.resultContextSignature !== nextSignature) {
        viewState.stale = true;
        viewState.staleReason = staleReason;
      } else {
        viewState.stale = false;
        viewState.staleReason = null;
      }
    }
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

  private async requestModel(promptTask: AIPromptTask, payload: Record<string, unknown>): Promise<LLMResponse> {
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
        messages: [
          {
            role: 'system',
            content: composePrompt(promptTask, this.getPromptTemplate(promptTask, settings)),
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

  private async requestFollowUp(view: AITaskType): Promise<LLMResponse> {
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
            content: composePrompt(
              this.getPromptTaskForView(view),
              this.getPromptTemplateForView(view, settings),
              { followUp: true },
            ),
          },
          {
            role: 'user',
            content: JSON.stringify({
              language: settings.defaultOutputLanguage,
              view,
              structuredResult,
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

  private getPromptTemplateForView(view: AITaskType, settings: AISettings): string {
    return this.getPromptTemplate(this.getPromptTaskForView(view), settings);
  }

  private getPromptTemplate(task: AIPromptTask, settings: AISettings): string {
    switch (task) {
      case 'tutor':
        return resolveAIEffectivePromptTemplate('tutor', settings);
      case 'explain':
        return resolveAIEffectivePromptTemplate('explain', settings);
      case 'card-candidate':
        return resolveAIEffectivePromptTemplate('cardCandidate', settings);
      default:
        return resolveAIEffectivePromptTemplate('explain', settings);
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
      blindSpots: normalizeStringArray(value.blindSpots),
      patterns: normalizeStringArray(value.patterns),
      nextLines: normalizeStringArray(value.nextLines),
      cardIdeas: normalizeStringArray(value.cardIdeas),
      batchSummary: normalizeString(value.batchSummary) || null,
      rawContent,
    };
  }

  private normalizeExplainResult(payload: unknown, rawContent: string): AIExplainResult {
    const value = isRecord(payload) ? payload : {};
    return {
      workingDefinition: normalizeString(value.workingDefinition),
      whatItTests: normalizeString(value.whatItTests),
      whyItsTricky: normalizeString(value.whyItsTricky),
      connections: normalizeStringArray(value.connections),
      triggers: normalizeStringArray(value.triggers ?? value.recognizeNextTime),
      cardIdeas: normalizeStringArray(value.cardIdeas),
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
    const viewState = this.getViewState(taskType);
    viewState.followUps = [];
    viewState.stale = false;
    viewState.staleReason = null;
    if (taskType === 'tutor') {
      this.state.tutorResult = { ...DEFAULT_TUTOR_RESULT };
    }
    if (taskType === 'explain') {
      this.state.explainResult = { ...DEFAULT_EXPLAIN_RESULT };
    }
    if (taskType === 'make-cards') {
      this.state.makeCardsResult = {
        ...DEFAULT_MAKE_CARDS_RESULT,
        mode: this.state.makeCardMode,
      };
    }

    try {
      await runner();
      viewState.resultContextSignature = this.state.contextSignature;
      viewState.stale = false;
      viewState.staleReason = null;
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.state.isLoading = false;
    }
  }

  private pushHistory(taskType: AITaskType, title: string): void {
    const context = this.state.context;
    const entry: AIWorkbenchHistoryEntry = {
      id: createEntryId('history'),
      taskType,
      source: context?.source || 'standalone',
      createdAt: Date.now(),
      title,
    };
    this.state.history.unshift(entry);
    if (this.state.history.length > 20) {
      this.state.history.splice(20);
    }
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
