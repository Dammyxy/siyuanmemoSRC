import { reactive } from 'vue';
import { BlockContextResolver } from '@/application/entries/BlockContextResolver';
import { resolveProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import type { CreateXiuyuanFromBlocksCommand } from '@/application/commands/xiuyuan/CreateXiuyuanFromBlocksCommand';
import type { CardContentQueryService } from '@/application/queries/CardContentQueryService';
import type {
  AISiyuanBlockRow,
  AISiyuanPort,
} from '@/application/ports/AISiyuanPort';
import type { LLMPort } from '@/application/ports/LLMPort';
import type { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import { AIFlashcardToolService } from '@/application/services/AIFlashcardToolService';
import {
  isPluginSelfTestCreationMode,
  normalizeSelfTestCandidateCard,
  normalizeSelfTestCardKind,
  normalizeSelfTestCreationMode,
  summarizeSelfTestCandidateCard,
} from '@/application/services/AISelfTestDraftSupport';
import { AISelfTestCardCreationService } from '@/application/services/AISelfTestCardCreationService';
import {
  getAIChatSkill,
  type AIChatRegisteredSkillDescriptor,
  type AIResolvedSkillSectionDescriptor,
} from '@/application/services/AIChatSkillRegistry';
import { AIChatToolExecutorService } from '@/application/services/AIChatToolExecutorService';
import { AIChatToolRegistry } from '@/application/services/AIChatToolRegistry';
import { AIChatVarStoreService } from '@/application/services/AIChatVarStoreService';
import type {
  ArenaKernelService,
  ArenaSkillRuntimeOverrides,
} from '@/application/services/ArenaKernelService';
import type { SelectionExcerptService } from '@/application/services/SelectionExcerptService';
import type { SelectionTopicContinuationService } from '@/application/services/SelectionTopicContinuationService';
import { getAIContextProviders } from '@/application/services/AIWorkbenchContextProviderRegistry';
import {
  getSelfTestModeDescriptor,
} from '@/application/services/AIPromptContractRegistry';
import {
  getAIWorkbenchSkill,
  getAIWorkbenchSkills,
  getAIWorkbenchSkillTabs,
  normalizeAIWorkbenchSkillId,
  normalizeAIWorkbenchTabId,
  type AIWorkbenchSkillTabDescriptor,
} from '@/application/services/AIWorkbenchSkillRegistry';
import {
  cloneConceptCoachResult,
  deriveTabNormalizationDiagnostic,
  explainResultFromConceptCoach,
  hasGenericSectionContent,
  hasTabResultContent,
  mergeTabResult,
  normalizeConceptCoachResult,
  normalizeConceptCoachState,
  normalizeContextKey,
  normalizeGenericStructuredResult,
  normalizeSelfTestCards,
  tabResultFromConceptCoach,
  type ConceptCoachNormalizationState,
} from '@/application/services/AIWorkbenchResultNormalization';
import { AIWorkbenchCdfRuntime } from '@/application/services/AIWorkbenchCdfRuntime';
import { AIWorkbenchConversationTreeRuntime } from '@/application/services/AIWorkbenchConversationTreeRuntime';
import { AIWorkbenchGeneralChatRuntime } from '@/application/services/AIWorkbenchGeneralChatRuntime';
import { AIWorkbenchPromptRuntime } from '@/application/services/AIWorkbenchPromptRuntime';
import {
  buildContextSignature,
  buildReviewCardSemantics,
  deriveReviewChatKey,
  isDocumentBlockType,
  isNeuralVirtualReviewCard,
  readReviewNeuralContext,
  readStringArrayFromMeta,
  readXiuyuanMeta,
} from '@/application/services/AIWorkbenchContextProjection';
import {
  createAIWorkbenchRunStatus,
  generateAIWorkbenchSessionTitle,
} from '@/application/services/AIWorkbenchRunProjection';
import {
  buildModeDraftGenerationMessages,
  extractModeDraftsFromPayload,
  isAppendableSelfTestTarget,
  listSelfTestCardsPendingDrafts,
  normalizeSelfTestCardTargetMemory,
  selectSelfTestCardCandidates,
  type SelfTestCardWriteTarget,
} from '@/application/services/AIWorkbenchSelfTestRuntime';
import {
  AIWorkbenchSessionPersistScheduler,
  buildCurrentAIWorkbenchSessionRecord,
  createAIWorkbenchSessionRecord,
  createEmptyConversationTree,
  createEmptyThreadRecord,
  createInitialThreads,
  normalizeSurface,
  projectAIWorkbenchSessionRecordApplication,
} from '@/application/services/AIWorkbenchSessionRuntime';
import {
  cloneAttachedContexts,
  createEmptyViewSessionState,
  createInitialViewState,
  normalizeThreads,
  resolveUserMessagePurpose,
} from '@/application/services/AIWorkbenchThreadNormalization';
import type { AIWorkbenchSessionStoreService } from '@/application/services/AIWorkbenchSessionStoreService';
import type { FSRSCard } from '@/types/card';
import type {
  AIAttachedContextItem,
  AICdfStructure,
  AIChatApprovalRequest,
  AIChatRuntimeDiagnostic,
  AIChatToolExecutionResult,
  AIBlockContext,
  AIComposerContextState,
  AIConceptCoachCandidateCard,
  AIConceptCoachCardKind,
  AIConceptCoachIntegratedUnderstanding,
  AIConceptCoachNormalizationDiagnostic,
  AIConceptCoachPerspectiveSection,
  AIConceptCoachPerspectives,
  AIConceptCoachRealWorldTriggers,
  AIConceptCoachResult,
  AIConceptCoachSelfTestCreationMode,
  AIConceptCoachSelfTestCards,
  AIConceptCoachTabResult,
  AIContextProviderKey,
  AIFollowUpEntry,
  AIReviewCardContext,
  AISkillId,
  AISkillTabId,
  AIUserSkillStructuredResult,
  AIViewSessionState,
  AIWorkbenchAssistantResultMessage,
  AIWorkbenchAssistantTextMessage,
  AIWorkbenchConceptDocumentSearchResult,
  AIWorkbenchApprovalMessage,
  AIWorkbenchContextSnapshot,
  AIWorkbenchCdfCreationResult,
  AIWorkbenchConversationTree,
  AIWorkbenchFailureDiagnostic,
  AIWorkbenchMessage,
  AIWorkbenchMessageKind,
  AIWorkbenchNodeScope,
  AIWorkbenchOpenOptions,
  AIWorkbenchNotebookOption,
  AIWorkbenchRunMode,
  AIWorkbenchRunStatus,
  AIWorkbenchRenderEntry,
  AIWorkbenchSendToSiyuanResult,
  AIWorkbenchSeparatorMessage,
  AIWorkbenchSelfTestCardCreationResult,
  AIWorkbenchSelfTestCardTargetInput,
  AIWorkbenchSelfTestCardTargetMemory,
  AIWorkbenchSessionRecord,
  AIWorkbenchState,
  AIWorkbenchTreeNode,
  AIWorkbenchToolLogMessage,
  AIWorkbenchUserMessage,
  AIWorkbenchUserMessagePurpose,
} from '@/types/ai';
import {
  AI_CONCEPT_COACH_SKILL_ID,
  AI_CONCEPT_COACH_TAB_IDS,
  AI_GENERAL_CHAT_SKILL_ID,
  AI_GENERAL_CHAT_TAB_ID,
} from '@/types/ai';
import type {
  AIArenaEventType,
  AIArenaScenarioId,
  AIArenaSelection,
  ArenaOutcomeLabel,
  ArenaTargetKind,
} from '@/types/arena';
import { normalizeAISettings, type AISettings } from '@/types/settings';

export type AIWorkbenchServiceDeps = {
  getAISettings: () => AISettings;
  updateAISettings?: (updater: (current: AISettings) => AISettings) => Promise<void>;
  cardContentQueryService: CardContentQueryService;
  siyuanPort: AISiyuanPort;
  llmPort: LLMPort;
  getXiuyuanApplicationService?: () => Promise<Pick<XiuyuanApplicationService, 'createFromBlocks' | 'createListTemplateCards'>>;
  getSelectionExcerptService?: () => SelectionExcerptService;
  getSelectionTopicContinuationService?: () => SelectionTopicContinuationService;
  arenaKernel?: Pick<
    ArenaKernelService,
    | 'isEnabled'
    | 'selectAIPack'
    | 'resolveSkillRuntimeOverrides'
    | 'recordAIEvent'
  >;
  sessionStore?: Pick<
    AIWorkbenchSessionStoreService,
    | 'listSummaries'
    | 'loadSession'
    | 'saveSession'
    | 'renameSession'
    | 'deleteSession'
    | 'findLatestByReviewChatKey'
    | 'loadSelfTestCardTargetMemory'
    | 'saveSelfTestCardTargetMemory'
  >;
};

const CONCEPT_SKILL: AISkillId = AI_CONCEPT_COACH_SKILL_ID;
const GENERAL_SKILL: AISkillId = AI_GENERAL_CHAT_SKILL_ID;
const ACTIVE_SKILL: AISkillId = AI_CONCEPT_COACH_SKILL_ID;
const CHAT_TAB: AISkillTabId = AI_GENERAL_CHAT_TAB_ID;
const DEFAULT_TAB: AISkillTabId = 'working-definition';
const ALL_TAB_IDS: AISkillTabId[] = [
  CHAT_TAB,
  ...AI_CONCEPT_COACH_TAB_IDS,
];
const LEGACY_NOTICE = '旧解释结果仅供查看，重跑后会生成完整的 AI 理解与制卡 Tabs。';
const NOOP_SESSION_STORE: Required<NonNullable<AIWorkbenchServiceDeps['sessionStore']>> = {
  async listSummaries() { return []; },
  async loadSession() { return null; },
  async saveSession(record) { return record; },
  async renameSession() { return null; },
  async deleteSession() { return undefined; },
  async findLatestByReviewChatKey() { return null; },
  async loadSelfTestCardTargetMemory() { return null; },
  async saveSelfTestCardTargetMemory(memory) { return memory; },
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

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return fallback;
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

function truncateText(value: string, limit = 140): string {
  const normalized = normalizeString(value).replace(/\s+/g, ' ');
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit)}...`;
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

function createTreeViewKey(skillId: AISkillId, tabId: AISkillTabId): string {
  return `${skillId}::${tabId}`;
}

function cloneMessagePayload<T extends AIWorkbenchMessage>(message: T): T {
  return JSON.parse(JSON.stringify(message)) as T;
}

function getMessageNodeKind(message: AIWorkbenchMessage): AIWorkbenchTreeNode['kind'] {
  return message.kind === 'separator' ? 'separator' : 'message';
}

function traceTreePath(tree: AIWorkbenchConversationTree | undefined, leafId: string | null | undefined): string[] {
  if (!tree || !leafId || !tree.nodes[leafId]) {
    return [];
  }
  const path: string[] = [];
  let currentId: string | null = leafId;
  while (currentId && tree.nodes[currentId]) {
    path.unshift(currentId);
    currentId = tree.nodes[currentId].parentId;
  }
  return path;
}

function getSkillTabIds(skillId: AISkillId, fallbackTabId: AISkillTabId): AISkillTabId[] {
  if (skillId === GENERAL_SKILL) {
    return [CHAT_TAB];
  }
  if (skillId === CONCEPT_SKILL) {
    return [...AI_CONCEPT_COACH_TAB_IDS];
  }
  return [fallbackTabId];
}

function normalizeOpenSkillId(options: AIWorkbenchOpenOptions): AISkillId {
  return normalizeAIWorkbenchSkillId(options.skillId || options.view, GENERAL_SKILL);
}

function normalizeOpenTabId(options: AIWorkbenchOpenOptions): AISkillTabId {
  const skillId = normalizeOpenSkillId(options);
  return normalizeAIWorkbenchTabId(options.tabId, skillId);
}

export class AIWorkbenchService {
  readonly state = reactive<AIWorkbenchState>({
    sessionId: null,
    surface: 'standalone-dialog',
    sourceReviewSessionId: null,
    reviewChatKey: null,
    contextSignature: null,
    messages: [],
    viewState: createInitialViewState(),
    activeSkillId: GENERAL_SKILL,
    activeTabId: CHAT_TAB,
    activeView: GENERAL_SKILL,
    context: null,
    liveContext: null,
    contextIsHistorical: false,
    isLoading: false,
    runStatus: null,
    error: null,
    failureDiagnostic: null,
    skillResults: { [GENERAL_SKILL]: null, [CONCEPT_SKILL]: null },
    conceptCoachResultsByContext: {},
    genericSkillResults: {},
    explainResult: null,
    sessionTitle: '',
    sessionHistory: [],
    threads: createInitialThreads(),
    tree: createEmptyConversationTree(),
    pendingApprovals: [],
    toolTimeline: [],
    vars: [],
    diagnostics: [],
    historyPanelOpen: false,
    contextPanelOpen: false,
    composerContexts: createEmptyComposerContextState(),
    composerEditorOpen: false,
    editingMessageId: null,
    editingMessageKind: null,
    legacyNotice: null,
  });

  private readonly persistScheduler = new AIWorkbenchSessionPersistScheduler();
  private currentArenaSelection: AIArenaSelection | null = null;
  private currentArenaRuntimeOverrides: ArenaSkillRuntimeOverrides = {
    selectedPackId: null,
    selectedPackTitle: null,
    challengeTrigger: null,
    challengers: [],
  };
  private currentArenaScenarioId: AIArenaScenarioId | null = null;
  private currentArenaTargetKind: ArenaTargetKind | null = null;
  private readonly varStore = new AIChatVarStoreService();
  private readonly toolRegistry = new AIChatToolRegistry();
  private readonly flashcardTools: AIFlashcardToolService;
  private readonly selfTestCardCreationService: AISelfTestCardCreationService;
  private readonly toolExecutor: AIChatToolExecutorService;
  private readonly cdfRuntime: AIWorkbenchCdfRuntime;
  private readonly promptRuntime: AIWorkbenchPromptRuntime;
  private readonly generalChatRuntime: AIWorkbenchGeneralChatRuntime;
  private readonly approvalResolvers = new Map<string, {
    request: AIChatApprovalRequest;
    resolve: (value: { approved: boolean; rejectReason?: string }) => void;
  }>();
  private readonly conversationTree = new AIWorkbenchConversationTreeRuntime({
    state: this.state,
    normalizeSkillForCurrentSettings: (skillId, fallback) => this.normalizeSkillForCurrentSettings(skillId, fallback),
    normalizeTabForCurrentSettings: (tabId, skillId) => this.normalizeTabForCurrentSettings(tabId, skillId),
    isContextScopedConceptTab: (skillId, tabId) => this.isContextScopedConceptTab(skillId, tabId),
  });

  constructor(private readonly deps: AIWorkbenchServiceDeps) {
    this.flashcardTools = new AIFlashcardToolService({
      siyuanPort: this.deps.siyuanPort,
      getXiuyuanApplicationService: async () => this.requireXiuyuanApplicationService(),
      loadDefaultTarget: async () => this.getSessionStore().loadSelfTestCardTargetMemory(),
      saveDefaultTarget: async (target) => this.getSessionStore().saveSelfTestCardTargetMemory(target),
      getSelectionExcerptService: this.deps.getSelectionExcerptService,
      getSelectionTopicContinuationService: this.deps.getSelectionTopicContinuationService,
    });
    this.selfTestCardCreationService = new AISelfTestCardCreationService({
      flashcardTools: this.flashcardTools,
      getRuntimeContext: () => ({
        context: this.state.context,
        attachedContexts: [],
      }),
    });
    this.cdfRuntime = new AIWorkbenchCdfRuntime({
      getContext: () => this.state.context,
      getContextSignature: () => this.state.contextSignature,
      flashcardTools: this.flashcardTools,
      siyuanPort: this.deps.siyuanPort,
      getSessionStore: () => this.getSessionStore(),
      getSelfTestCreationMode: () => this.getSelfTestCreationMode(),
      getConceptCoachResultMessage: (messageId, tabId) => (
        this.getConceptCoachResultMessage(messageId, tabId as AISkillTabId | undefined)
      ),
      findLatestConceptCoachResultForContext: (signature) => this.findLatestConceptCoachResultForContext(signature),
      setScopedConceptCoachResult: (result, signature) => this.setScopedConceptCoachResult(result, signature),
      addNodeVersion: (messageId, updater) => this.addNodeVersion(messageId, (message) => {
        if (message.kind !== 'assistant-result') {
          return message;
        }
        return updater(message);
      }) as AIWorkbenchAssistantResultMessage | null,
      syncDerivedStateFromThreads: () => this.syncDerivedStateFromThreads(),
      persistCurrentSession: () => this.persistCurrentSession(),
      resolveSelfTestCardWriteTarget: (target) => this.resolveSelfTestCardWriteTarget(target),
      recordArenaCreate: (input) => this.recordArenaEvent('create', input),
    });
    this.toolExecutor = new AIChatToolExecutorService({
      registry: this.toolRegistry,
      varStore: this.varStore,
      siyuanPort: this.deps.siyuanPort,
      flashcardTools: this.flashcardTools,
      getAISettings: this.deps.getAISettings,
    });
    this.promptRuntime = new AIWorkbenchPromptRuntime({
      state: this.state,
      getAISettings: this.deps.getAISettings,
      llmPort: this.deps.llmPort,
      getSelfTestCreationMode: () => this.getSelfTestCreationMode(),
      getResolvedSkill: (skillId) => this.getResolvedSkill(skillId),
      normalizeTabForCurrentSettings: (value, skillId) => this.normalizeTabForCurrentSettings(value, skillId),
      getArenaRuntimeOverrides: (skillId) => this.getArenaRuntimeOverrides(skillId),
      getRenderEntriesForTab: (tabId) => this.getRenderEntries(undefined, tabId),
      getFollowUpsForTab: (tabId) => this.getFollowUps(undefined, tabId),
      findLatestConceptCoachResultForContext: (signature) => this.findLatestConceptCoachResultForContext(signature),
    });
    this.generalChatRuntime = new AIWorkbenchGeneralChatRuntime({
      state: this.state,
      toolRegistry: this.toolRegistry,
      toolExecutor: this.toolExecutor,
      assertModelSettings: () => this.promptRuntime.assertModelSettings(),
      resolveDefaultProvider: (settings) => this.promptRuntime.resolveDefaultProvider(settings),
      buildGeneralChatMessages: (settings, skill, tabId, attachedContexts, toolRules) => this.promptRuntime.buildGeneralChatMessages(
        settings,
        skill,
        tabId,
        attachedContexts,
        toolRules,
      ),
      requestChatModel: (messages, input) => this.promptRuntime.requestChatModel(messages, input),
      appendNodeMessage: (tabId, message, options) => this.appendNodeMessage(tabId, message, options),
      patchActiveNodeMessage: (messageId, updater, options) => this.patchActiveNodeMessage(messageId, updater, options),
      toRuntimeToolCall: (toolCall) => this.promptRuntime.toRuntimeToolCall(toolCall),
      requestInlineToolApproval: (request) => this.requestInlineToolApproval(request),
      appendToolLogMessage: (result, skillId, tabId, runGroupId) => this.appendToolLogMessage(result, skillId, tabId, runGroupId),
      ensureRunNotAborted: () => this.promptRuntime.ensureRunNotAborted(),
    });
  }

  private getSessionStore() {
    return this.deps.sessionStore || NOOP_SESSION_STORE;
  }

  private async requireXiuyuanApplicationService(): Promise<Pick<XiuyuanApplicationService, 'createFromBlocks' | 'createListTemplateCards'>> {
    if (!this.deps.getXiuyuanApplicationService) {
      throw new Error('XiuyuanApplicationService 未初始化，暂时无法创建闪卡。');
    }
    return this.deps.getXiuyuanApplicationService();
  }

  private isContextScopedConceptTab(skillId: AISkillId, tabId: AISkillTabId): boolean {
    return skillId === CONCEPT_SKILL && tabId !== CHAT_TAB;
  }

  private getCurrentConceptCoachContextKey(signature: string | null = this.state.contextSignature): string {
    return normalizeContextKey(signature);
  }

  private getScopedConceptCoachResult(signature: string | null = this.state.contextSignature): AIConceptCoachResult | null {
    const key = this.getCurrentConceptCoachContextKey(signature);
    const stored = this.state.conceptCoachResultsByContext[key];
    return stored ? cloneConceptCoachResult(stored) : null;
  }

  private setScopedConceptCoachResult(
    result: AIConceptCoachResult | null,
    signature: string | null = this.state.contextSignature,
  ): void {
    const key = this.getCurrentConceptCoachContextKey(signature);
    if (result) {
      this.state.conceptCoachResultsByContext[key] = cloneConceptCoachResult(result);
    } else {
      delete this.state.conceptCoachResultsByContext[key];
    }
  }

  private syncCurrentScopedConceptCoachResult(): void {
    const current = this.findLatestConceptCoachResultForContext(this.state.contextSignature);
    this.state.skillResults[CONCEPT_SKILL] = current;
    this.state.explainResult = explainResultFromConceptCoach(current);
  }

  private getConceptCoachResultMessage(
    messageId: string,
    tabId?: AISkillTabId,
  ): AIWorkbenchAssistantResultMessage | null {
    const node = this.getTreeNode(messageId);
    if (!node || node.skillId !== CONCEPT_SKILL || (tabId && node.tabId !== tabId)) {
      return null;
    }
    const message = this.getNodeMessage(node);
    return message?.kind === 'assistant-result' ? message : null;
  }

  private getSelfTestResultMessage(messageId: string): AIWorkbenchAssistantResultMessage | null {
    return this.getConceptCoachResultMessage(messageId, 'self-test-cards');
  }

  private getSelfTestCardsForMessage(messageId: string): AIConceptCoachCandidateCard[] {
    const message = this.getSelfTestResultMessage(messageId);
    if (!message) {
      return [];
    }
    const selfTestCards = (message.tabResult || message.conceptCoachResult?.selfTestCards) as AIConceptCoachSelfTestCards | null;
    return Array.isArray(selfTestCards?.cards)
      ? selfTestCards.cards.map((card) => ({ ...card }))
      : [];
  }

  private getSelectedSelfTestCardCandidates(messageId: string): AIConceptCoachCandidateCard[] {
    return selectSelfTestCardCandidates(
      this.getSelfTestCardsForMessage(messageId),
      this.getSelfTestCreationMode(),
    );
  }

  async generateModeDrafts(
    messageId: string,
    mode: AIConceptCoachSelfTestCreationMode,
    cardIds?: string[],
  ): Promise<AIConceptCoachCandidateCard[]> {
    const normalizedMode = normalizeSelfTestCreationMode(mode);
    if (!isPluginSelfTestCreationMode(normalizedMode)) {
      return this.getSelfTestCardsForMessage(messageId);
    }
    const cards = this.getSelfTestCardsForMessage(messageId);
    const pendingCards = listSelfTestCardsPendingDrafts(cards, normalizedMode, cardIds);
    if (pendingCards.length === 0) {
      return cards;
    }

    this.state.error = null;
    this.state.failureDiagnostic = null;
    const settings = this.promptRuntime.assertModelSettings();
    const provider = this.promptRuntime.resolveDefaultProvider(settings);
    const descriptor = getSelfTestModeDescriptor(normalizedMode);
    const response = await this.promptRuntime.requestChatModel(
      buildModeDraftGenerationMessages(settings, normalizedMode, pendingCards, this.state.context),
      {
        settings,
        provider,
        stream: false,
      },
    );
    const payload = this.promptRuntime.extractStructuredPayload(`${descriptor.label} 草稿生成`, response.content);
    const drafts = extractModeDraftsFromPayload(payload, pendingCards);
    if (Object.keys(drafts).length === 0) {
      throw this.fail(`AI 没有返回任何可用的 ${descriptor.label} 草稿，请重试。`);
    }

    const updated = this.updateSelfTestResultMessage(messageId, (currentCards) => currentCards.map((card) => {
      const nextDraft = normalizeString(drafts[card.id]);
      if (!nextDraft) {
        return card;
      }
      return {
        ...card,
        modeDrafts: {
          ...(card.modeDrafts || {}),
          [normalizedMode]: nextDraft,
        },
      } satisfies AIConceptCoachCandidateCard;
    }));
    if (!updated) {
      throw this.fail('未找到对应的自测卡结果，无法写入插件草稿。');
    }
    this.syncDerivedStateFromThreads();
    await this.persistCurrentSession();

    const missingCards = pendingCards.filter((card) => !normalizeString(drafts[card.id]));
    if (missingCards.length > 0) {
      throw this.fail(
        `已生成部分 ${descriptor.label} 草稿，但仍有 ${missingCards.length} 张未返回：${missingCards.map((card) => truncateText(card.summary || card.prompt || card.id, 24)).join('，')}`,
      );
    }
    return this.getSelfTestCardsForMessage(messageId);
  }

  private resolveCurrentDeckId(): string | undefined {
    const card = this.state.liveContext?.currentCardRaw || this.state.context?.currentCardRaw || null;
    if (!card || typeof card !== 'object') {
      return undefined;
    }
    return normalizeString((card as { deckId?: unknown; deckID?: unknown }).deckId)
      || normalizeString((card as { deckId?: unknown; deckID?: unknown }).deckID)
      || undefined;
  }

  private async resolveSelfTestCardWriteTarget(target: AIWorkbenchSelfTestCardTargetInput): Promise<SelfTestCardWriteTarget> {
    if (target.mode === 'daily-note') {
      const memory = normalizeSelfTestCardTargetMemory(target, Date.now());
      if (!memory) {
        throw new Error('请选择要写入今日日记的目标笔记本。');
      }
      const dailyNoteId = await this.deps.siyuanPort.ensureTodayDailyNote(memory.notebookId);
      return {
        memory: {
          ...memory,
          targetBlockId: null,
          targetLabel: memory.targetLabel || `${memory.notebookName} · 今日日记`,
        },
        targetBlockId: dailyNoteId,
        writeMode: 'append',
      };
    }

    const memory = normalizeSelfTestCardTargetMemory(target, Date.now());
    if (!memory || !memory.targetBlockId) {
      throw new Error('请填写要写入的文档或块 ID。');
    }
    const targetBlock = await this.loadSelfTestTargetBlock(memory.targetBlockId);
    const targetNotebookId = normalizeString(targetBlock.box);
    if (targetNotebookId && memory.notebookId && targetNotebookId !== memory.notebookId) {
      throw new Error('目标块和已选择的笔记本不一致，请重新检查制卡位置。');
    }
    const targetLabel = normalizeString(target.targetLabel)
      || normalizeString(targetBlock.hpath)
      || normalizeString(targetBlock.content)
      || memory.targetBlockId;
    return {
      memory: {
        ...memory,
        notebookId: targetNotebookId || memory.notebookId,
        targetLabel,
      },
      targetBlockId: memory.targetBlockId,
      writeMode: isAppendableSelfTestTarget(targetBlock) ? 'append' : 'after',
    };
  }

  private async loadSelfTestTargetBlock(blockId: string): Promise<AISiyuanBlockRow> {
    const rows = await this.deps.siyuanPort.sql<AISiyuanBlockRow>(`
      SELECT id, parent_id, root_id, box, path, hpath, type, subtype, content, markdown
      FROM blocks
      WHERE id = '${escapeSql(blockId)}'
      LIMIT 1
    `);
    const row = rows[0];
    if (!row || !normalizeString(row.id)) {
      throw new Error('未找到目标文档或块，请检查块 ID 是否有效。');
    }
    return row;
  }

  private updateSelfTestResultMessage(
    messageId: string,
    updater: (cards: AIConceptCoachCandidateCard[]) => AIConceptCoachCandidateCard[],
  ): AIWorkbenchAssistantResultMessage | null {
    const currentMessage = this.getSelfTestResultMessage(messageId);
    if (!currentMessage) {
      return null;
    }
    const currentSelfTestCards = (currentMessage.tabResult || currentMessage.conceptCoachResult?.selfTestCards) as AIConceptCoachSelfTestCards | null;
    const nextCards = normalizeSelfTestCards({
      creationMode: currentSelfTestCards?.creationMode || this.getSelfTestCreationMode(),
      cards: updater(this.getSelfTestCardsForMessage(messageId)).map((card) => ({ ...card })),
    });
    const nextMessage = this.addNodeVersion(messageId, (current) => {
      if (current.kind !== 'assistant-result') {
        return current;
      }
      const assistantMessage = current as AIWorkbenchAssistantResultMessage;
      const nextConceptCoachResult = assistantMessage.conceptCoachResult
        ? cloneConceptCoachResult(assistantMessage.conceptCoachResult)
        : null;
      if (nextConceptCoachResult) {
        nextConceptCoachResult.selfTestCards = nextCards;
      }
      return {
        ...assistantMessage,
        conceptCoachResult: nextConceptCoachResult,
        tabResult: nextCards,
        explainResult: nextConceptCoachResult
          ? explainResultFromConceptCoach(nextConceptCoachResult)
          : assistantMessage.explainResult ?? null,
        rawContent: JSON.stringify({ selfTestCards: nextCards }, null, 2),
      } satisfies AIWorkbenchAssistantResultMessage;
    });
    return nextMessage?.kind === 'assistant-result' ? nextMessage : null;
  }

  private getNormalizedAISettings(): AISettings {
    return normalizeAISettings(this.deps.getAISettings());
  }

  getSelfTestCreationMode(): AIConceptCoachSelfTestCreationMode {
    return this.getNormalizedAISettings().conceptCoach.selfTest.defaultCreationMode;
  }

  async setSelfTestCreationMode(mode: AIConceptCoachSelfTestCreationMode): Promise<AIConceptCoachSelfTestCreationMode> {
    const normalizedMode = normalizeSelfTestCreationMode(mode);
    if (!this.deps.updateAISettings) {
      return normalizedMode;
    }
    await this.deps.updateAISettings((current) => ({
      ...current,
      conceptCoach: {
        ...(current.conceptCoach || { selfTest: { defaultCreationMode: 'list-item' as const } }),
        selfTest: {
          ...((current.conceptCoach || {}).selfTest || {}),
          defaultCreationMode: normalizedMode,
        },
      },
    }));
    return normalizedMode;
  }

  private clearArenaSelection(): void {
    this.currentArenaSelection = null;
    this.currentArenaRuntimeOverrides = {
      selectedPackId: null,
      selectedPackTitle: null,
      challengeTrigger: null,
      challengers: [],
    };
  }

  private getArenaKernel() {
    return this.deps.arenaKernel || null;
  }

  private resolveArenaHint(
    input?: {
      scenarioId?: AIArenaScenarioId | null;
      targetKind?: ArenaTargetKind | null;
      skillId?: AISkillId | null;
    },
  ): {
    scenarioId: AIArenaScenarioId | null;
    targetKind: ArenaTargetKind | null;
  } {
    if (input?.scenarioId || input?.targetKind) {
      return {
        scenarioId: input?.scenarioId || null,
        targetKind: input?.targetKind || null,
      };
    }
    const cardType = normalizeString(this.state.context?.currentCard?.cardType);
    if (cardType === 'topic') {
      return { scenarioId: 'topic-auto-card', targetKind: 'topic' };
    }
    if (cardType === 'descriptor') {
      return { scenarioId: 'descriptor-augmentation', targetKind: 'descriptor' };
    }
    if (cardType === 'concept') {
      return { scenarioId: 'concept-expression-coach', targetKind: 'concept' };
    }
    if (cardType === 'item') {
      return { scenarioId: 'card-prompt-rewrite', targetKind: 'item' };
    }
    if (input?.skillId === GENERAL_SKILL || this.state.activeSkillId === GENERAL_SKILL) {
      return { scenarioId: 'note-refinement', targetKind: 'note' };
    }
    return { scenarioId: 'candidate-card-generation', targetKind: 'note' };
  }

  private async prepareArenaSelection(
    input?: {
      scenarioId?: AIArenaScenarioId | null;
      targetKind?: ArenaTargetKind | null;
    },
  ): Promise<void> {
    const arenaKernel = this.getArenaKernel();
    if (!arenaKernel || !arenaKernel.isEnabled()) {
      this.clearArenaSelection();
      return;
    }
    const hint = this.resolveArenaHint({
      scenarioId: input?.scenarioId ?? this.currentArenaScenarioId,
      targetKind: input?.targetKind ?? this.currentArenaTargetKind,
      skillId: this.state.activeSkillId,
    });
    this.currentArenaScenarioId = hint.scenarioId;
    this.currentArenaTargetKind = hint.targetKind;
    if (!hint.scenarioId || !hint.targetKind) {
      this.clearArenaSelection();
      return;
    }
    this.currentArenaSelection = await arenaKernel.selectAIPack({
      surface: this.state.surface,
      scenarioId: hint.scenarioId,
      targetKind: hint.targetKind,
      skillId: this.state.activeSkillId,
      tabId: this.state.activeTabId,
      sessionId: this.state.sessionId,
    });
    const baseSkill = getAIChatSkill(this.state.activeSkillId, this.getNormalizedAISettings());
    this.currentArenaRuntimeOverrides = arenaKernel.resolveSkillRuntimeOverrides(
      this.currentArenaSelection,
      baseSkill,
    );
  }

  private getArenaRuntimeOverrides(skillId: AISkillId = this.state.activeSkillId): ArenaSkillRuntimeOverrides {
    if (skillId !== this.state.activeSkillId) {
      return {
        selectedPackId: null,
        selectedPackTitle: null,
        challengeTrigger: null,
        challengers: [],
      };
    }
    return this.currentArenaRuntimeOverrides;
  }

  getArenaBannerModel(): {
    packTitle: string | null;
    challengeSummary: string | null;
    challengers: Array<{ id: string; title: string }>;
  } {
    if (!this.getArenaKernel()?.isEnabled()) {
      return {
        packTitle: null,
        challengeSummary: null,
        challengers: [],
      };
    }
    return {
      packTitle: this.currentArenaRuntimeOverrides.selectedPackTitle || null,
      challengeSummary: this.currentArenaRuntimeOverrides.challengeTrigger?.summary || null,
      challengers: this.currentArenaRuntimeOverrides.challengers || [],
    };
  }

  private async recordArenaEvent(
    eventType: AIArenaEventType,
    input?: {
      qualityLabel?: ArenaOutcomeLabel | null;
      cardIds?: string[];
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    const arenaKernel = this.getArenaKernel();
    if (!arenaKernel || !arenaKernel.isEnabled() || !this.currentArenaSelection) {
      return;
    }
    await arenaKernel.recordAIEvent({
      selection: this.currentArenaSelection,
      eventType,
      sessionId: this.state.sessionId,
      qualityLabel: input?.qualityLabel,
      cardIds: input?.cardIds,
      metadata: input?.metadata,
    });
  }

  private getResolvedSkill(skillId: AISkillId = this.state.activeSkillId): AIChatRegisteredSkillDescriptor {
    const skill = getAIChatSkill(skillId, this.getNormalizedAISettings());
    const overrides = this.getArenaRuntimeOverrides(skillId);
    if (
      !overrides.systemPromptTemplate
      && !overrides.composerPreset
      && !overrides.defaultToolGroups
      && !overrides.tabRunPrompts
      && !overrides.tabFollowUpPrompts
    ) {
      return skill;
    }
    return {
      ...skill,
      systemPromptTemplate: overrides.systemPromptTemplate || skill.systemPromptTemplate,
      composerPreset: overrides.composerPreset || skill.composerPreset,
      defaultToolGroups: (overrides.defaultToolGroups || skill.defaultToolGroups) as typeof skill.defaultToolGroups,
      sections: skill.sections?.map((section) => ({
        ...section,
        runPrompt: overrides.tabRunPrompts?.[section.id] || section.runPrompt,
        followUpPrompt: overrides.tabFollowUpPrompts?.[section.id] || section.followUpPrompt,
      })),
    };
  }

  private normalizeSkillForCurrentSettings(value: unknown, fallback: AISkillId = this.state.activeSkillId): AISkillId {
    return normalizeAIWorkbenchSkillId(value, fallback, this.getNormalizedAISettings());
  }

  private normalizeTabForCurrentSettings(value: unknown, skillId: AISkillId = this.state.activeSkillId): AISkillTabId {
    return normalizeAIWorkbenchTabId(value, skillId, this.getNormalizedAISettings());
  }

  private getPrimaryTabId(skillId: AISkillId = this.state.activeSkillId): AISkillTabId {
    return this.getSkillTabs(skillId)[0]?.id || CHAT_TAB;
  }

  private ensureSkillRuntimeState(skillId: AISkillId = this.state.activeSkillId): void {
    const skill = this.getResolvedSkill(skillId);
    this.state.threads[skill.id] = this.state.threads[skill.id] || {};
    this.state.viewState[skill.id] = this.state.viewState[skill.id] || {};
    for (const tab of skill.tabs) {
      this.state.threads[skill.id][tab.id] = this.state.threads[skill.id][tab.id] || createEmptyThreadRecord(skill.id, tab.id);
      this.state.viewState[skill.id][tab.id] = this.state.viewState[skill.id][tab.id] || createEmptyViewSessionState();
    }
    this.state.skillResults[skill.id] = this.state.skillResults[skill.id] ?? null;
    this.state.genericSkillResults[skill.id] = this.state.genericSkillResults[skill.id] ?? null;
  }

  async open(options: AIWorkbenchOpenOptions = {}): Promise<void> {
    await this.refreshSessionHistory();
    const settings = this.getNormalizedAISettings();
    const previousReviewChatKey = this.state.reviewChatKey;
    const fallbackSkill = options.source === 'review' || options.surface === 'review-dialog-sidecar' || options.surface === 'review-tab-companion'
      ? settings.chatDefaults.reviewDefaultSkillId
      : GENERAL_SKILL;
    this.state.activeSkillId = normalizeAIWorkbenchSkillId(options.skillId || options.view, fallbackSkill, settings);
    this.ensureSkillRuntimeState(this.state.activeSkillId);
    this.state.activeTabId = normalizeAIWorkbenchTabId(options.tabId, this.state.activeSkillId, settings);
    this.state.activeView = this.state.activeSkillId;
    this.state.surface = normalizeSurface(options.surface ?? this.state.surface);
    this.currentArenaScenarioId = options.arenaScenarioId || null;
    this.currentArenaTargetKind = options.arenaTargetKind || null;
    this.clearArenaSelection();
    this.state.sourceReviewSessionId = normalizeString(options.sourceReviewSessionId)
      || (normalizeString(options.source) === 'review' ? normalizeString(options.sessionId) : '')
      || this.state.sourceReviewSessionId
      || null;
    this.state.error = null;
    this.state.failureDiagnostic = null;
    try {
      const nextContext = await this.buildContextSnapshot(options);
      const nextReviewChatKey = nextContext.source === 'review'
        ? deriveReviewChatKey(nextContext, options.reviewChatKey)
        : null;
      this.state.liveContext = nextContext;
      this.state.reviewChatKey = nextReviewChatKey;
      const hydratedSharedReviewSession = await this.tryHydrateReviewChatSession(nextContext);
      if (!hydratedSharedReviewSession) {
        await this.activateLiveContext(nextContext, {
          previousReviewChatKey,
        });
      }
    } catch (error) {
      this.state.context = null;
      this.state.liveContext = null;
      this.state.reviewChatKey = null;
      this.state.contextSignature = null;
      this.state.runStatus = null;
      this.state.error = error instanceof Error ? error.message : String(error);
      return;
    }
    if (options.autoRun && this.state.context) {
      await this.runActiveSkill();
    }
  }

  async updateLiveReviewContext(options: AIWorkbenchOpenOptions = {}): Promise<void> {
    const settings = this.getNormalizedAISettings();
    const fallbackSkill = options.source === 'review' || options.surface === 'review-dialog-sidecar' || options.surface === 'review-tab-companion'
      ? settings.chatDefaults.reviewDefaultSkillId
      : GENERAL_SKILL;
    this.state.activeSkillId = normalizeAIWorkbenchSkillId(options.skillId || options.view || this.state.activeSkillId, fallbackSkill, settings);
    this.ensureSkillRuntimeState(this.state.activeSkillId);
    this.state.activeTabId = options.tabId
      ? normalizeAIWorkbenchTabId(options.tabId, this.state.activeSkillId, settings)
      : this.normalizeTabForCurrentSettings(this.state.activeTabId, this.state.activeSkillId);
    this.state.activeView = this.state.activeSkillId;
    this.state.surface = normalizeSurface(options.surface ?? this.state.surface);
    this.currentArenaScenarioId = options.arenaScenarioId || null;
    this.currentArenaTargetKind = options.arenaTargetKind || null;
    this.clearArenaSelection();
    this.state.sourceReviewSessionId = normalizeString(options.sourceReviewSessionId)
      || (normalizeString(options.source) === 'review' ? normalizeString(options.sessionId) : '')
      || this.state.sourceReviewSessionId
      || null;
    this.state.error = null;
    this.state.failureDiagnostic = null;
    try {
      const nextContext = await this.buildContextSnapshot(options);
      const nextReviewChatKey = nextContext.source === 'review'
        ? deriveReviewChatKey(nextContext, options.reviewChatKey)
        : null;
      this.state.reviewChatKey = nextReviewChatKey;
      this.applyRuntimeSessionContext(nextContext, buildContextSignature(nextContext));
    } catch (error) {
      this.state.context = null;
      this.state.liveContext = null;
      this.state.reviewChatKey = null;
      this.state.contextSignature = null;
      this.state.runStatus = null;
      this.state.error = error instanceof Error ? error.message : String(error);
    }
  }

  getSkillTabs(skillId: AISkillId = this.state.activeSkillId): AIWorkbenchSkillTabDescriptor[] {
    return getAIWorkbenchSkillTabs(skillId, this.getNormalizedAISettings());
  }

  getSkills() {
    return getAIWorkbenchSkills(this.getNormalizedAISettings());
  }

  getSkillTitle(skillId: AISkillId = this.state.activeSkillId): string {
    return getAIWorkbenchSkill(skillId, this.getNormalizedAISettings()).title;
  }

  getSkillBrief(skillId: AISkillId = this.state.activeSkillId): string {
    return getAIWorkbenchSkill(skillId, this.getNormalizedAISettings()).brief;
  }

  getPrimaryActionLabel(skillId: AISkillId = this.state.activeSkillId): string {
    return getAIWorkbenchSkill(skillId, this.getNormalizedAISettings()).primaryActionLabel;
  }

  getDefaultUserPrompt(skillId: AISkillId = this.state.activeSkillId): string {
    return getAIWorkbenchSkill(skillId, this.getNormalizedAISettings()).defaultUserPrompt;
  }

  getActiveTabDescriptor(): AIWorkbenchSkillTabDescriptor {
    return this.getSkillTabs().find((tab) => tab.id === this.state.activeTabId) || this.getSkillTabs()[0];
  }

  private ensureTreeState(): AIWorkbenchConversationTree {
    return this.conversationTree.ensureTreeState();
  }

  private getTreeNode(nodeId: string): AIWorkbenchTreeNode | null {
    return this.conversationTree.getTreeNode(nodeId);
  }

  private getNodeMessage(node: AIWorkbenchTreeNode): AIWorkbenchMessage | null {
    return this.conversationTree.getNodeMessage(node);
  }

  private resolveViewLeafId(skillId: AISkillId, tabId: AISkillTabId): string | null {
    return this.conversationTree.resolveViewLeafId(skillId, tabId);
  }

  private syncTreeLeafWithActiveView(): void {
    this.conversationTree.syncTreeLeafWithActiveView();
  }

  private shouldIncludeNodeInView(node: AIWorkbenchTreeNode, skillId: AISkillId, tabId: AISkillTabId): boolean {
    return this.conversationTree.shouldIncludeNodeInView(node, skillId, tabId);
  }

  private getProjectedMessagesForView(
    skillId: AISkillId,
    tabId: AISkillTabId,
  ): AIWorkbenchMessage[] {
    return this.conversationTree.getProjectedMessagesForView(skillId, tabId);
  }

  private getModelContextMessagesForView(
    skillId: AISkillId,
    tabId: AISkillTabId,
  ): AIWorkbenchMessage[] {
    return this.conversationTree.getModelContextMessagesForView(skillId, tabId);
  }

  private rebuildProjectedThreads(): void {
    this.conversationTree.rebuildProjectedThreads();
  }

  private appendNodeMessage(
    tabId: AISkillTabId,
    message: AIWorkbenchMessage,
    options?: {
      scope?: AIWorkbenchNodeScope;
      parentNodeId?: string | null;
      activateView?: boolean;
      updateTabIds?: AISkillTabId[];
    },
  ): AIWorkbenchTreeNode {
    return this.conversationTree.appendNodeMessage(tabId, message, options);
  }

  private addNodeVersion(
    messageId: string,
    updater: (message: AIWorkbenchMessage) => AIWorkbenchMessage,
    options?: { status?: AIWorkbenchTreeNode['status'] },
  ): AIWorkbenchMessage | null {
    return this.conversationTree.addNodeVersion(messageId, updater, options);
  }

  private patchActiveNodeMessage(
    messageId: string,
    updater: (message: AIWorkbenchMessage) => AIWorkbenchMessage,
    options?: { status?: AIWorkbenchTreeNode['status'] },
  ): AIWorkbenchMessage | null {
    return this.conversationTree.patchActiveNodeMessage(messageId, updater, options);
  }

  private isRenderablePrimaryMessage(message: AIWorkbenchMessage): boolean {
    return AIWorkbenchConversationTreeRuntime.isRenderablePrimaryMessage(message);
  }

  private isSupplementalMessage(messages: AIWorkbenchMessage[], index: number): boolean {
    return AIWorkbenchConversationTreeRuntime.isSupplementalMessage(messages, index);
  }

  private createRenderEntry(
    primaryMessage: AIWorkbenchMessage,
    supplementalMessages: AIWorkbenchMessage[],
  ): AIWorkbenchRenderEntry {
    return AIWorkbenchConversationTreeRuntime.createRenderEntry(primaryMessage, supplementalMessages);
  }
  getMessageMeta(messageId: string): {
    scope: AIWorkbenchNodeScope;
    hidden: boolean;
    pinned: boolean;
    versionCount: number;
    branchCount: number;
    status: AIWorkbenchTreeNode['status'];
  } | null {
    const node = this.getTreeNode(messageId);
    if (!node) {
      return null;
    }
    return {
      scope: node.scope,
      hidden: node.hidden,
      pinned: node.pinned,
      versionCount: node.versions.length,
      branchCount: node.childIds.length,
      status: node.status,
    };
  }

  getActiveTreeWorldline(): Array<{
    id: string;
    skillId: AISkillId;
    tabId: AISkillTabId;
    scope: AIWorkbenchNodeScope;
    hidden: boolean;
    pinned: boolean;
    versionCount: number;
    branchCount: number;
    kind: AIWorkbenchTreeNode['kind'];
    message: AIWorkbenchMessage | null;
  }> {
    const tree = this.ensureTreeState();
    return traceTreePath(tree, this.resolveViewLeafId(this.state.activeSkillId, this.state.activeTabId))
      .map((nodeId) => tree.nodes[nodeId])
      .filter((node): node is AIWorkbenchTreeNode => Boolean(node))
      .map((node) => ({
        id: node.id,
        skillId: node.skillId,
        tabId: node.tabId,
        scope: node.scope,
        hidden: node.hidden,
        pinned: node.pinned,
        versionCount: node.versions.length,
        branchCount: node.childIds.length,
        kind: node.kind,
        message: this.getNodeMessage(node),
      }));
  }

  async focusTreeNode(nodeId: string): Promise<void> {
    const node = this.getTreeNode(nodeId);
    if (!node) {
      return;
    }
    this.state.activeSkillId = node.skillId;
    this.ensureSkillRuntimeState(node.skillId);
    this.state.activeTabId = this.normalizeTabForCurrentSettings(node.tabId, node.skillId);
    this.ensureTreeState().activeLeafNodeIds![createTreeViewKey(node.skillId, node.tabId)] = node.id;
    this.syncTreeLeafWithActiveView();
    this.rebuildProjectedThreads();
    this.syncDerivedStateFromThreads();
    await this.persistCurrentSession();
  }

  async branchFromMessage(messageId: string): Promise<void> {
    const node = this.getTreeNode(messageId);
    if (!node) {
      return;
    }
    this.ensureTreeState().activeLeafNodeIds![createTreeViewKey(node.skillId, node.tabId)] = node.id;
    if (this.state.activeSkillId === node.skillId && this.state.activeTabId === node.tabId) {
      this.ensureTreeState().activeLeafNodeId = node.id;
    }
    this.rebuildProjectedThreads();
    await this.persistCurrentSession();
  }

  async insertSeparatorAfterMessage(messageId: string): Promise<void> {
    const node = this.getTreeNode(messageId);
    if (!node) {
      return;
    }
    this.appendNodeMessage(node.tabId, {
      id: createEntryId('ai-separator'),
      skillId: node.skillId,
      tabId: node.tabId,
      view: node.skillId,
      kind: 'separator',
      createdAt: Date.now(),
      label: '新的上下文分隔',
    } satisfies AIWorkbenchSeparatorMessage, {
      scope: node.scope,
      parentNodeId: node.id,
      updateTabIds: node.scope === 'skill' ? getSkillTabIds(node.skillId, node.tabId) : [node.tabId],
    });
    this.syncDerivedStateFromThreads();
    await this.persistCurrentSession();
  }

  async toggleMessageHidden(messageId: string): Promise<void> {
    const node = this.getTreeNode(messageId);
    if (!node) {
      return;
    }
    node.hidden = !node.hidden;
    this.rebuildProjectedThreads();
    await this.persistCurrentSession();
  }

  async toggleMessagePinned(messageId: string): Promise<void> {
    const node = this.getTreeNode(messageId);
    if (!node) {
      return;
    }
    node.pinned = !node.pinned;
    this.rebuildProjectedThreads();
    await this.persistCurrentSession();
  }

  async cycleMessageVersion(messageId: string): Promise<void> {
    const node = this.getTreeNode(messageId);
    if (!node || node.versions.length <= 1) {
      return;
    }
    const currentIndex = Math.max(0, node.versions.findIndex((version) => version.id === node.activeVersionId));
    const nextIndex = (currentIndex + 1) % node.versions.length;
    node.activeVersionId = node.versions[nextIndex]!.id;
    this.rebuildProjectedThreads();
    await this.persistCurrentSession();
  }

  getRelatedUserMessage(messageId: string): AIWorkbenchUserMessage | null {
    const node = this.resolveRelatedUserNode(messageId);
    const message = node ? this.getNodeMessage(node) : null;
    return message?.kind === 'user' ? message : null;
  }

  async retryFailedMessage(messageId: string): Promise<void> {
    const sourceNode = this.resolveRelatedUserNode(messageId);
    const sourceMessage = sourceNode ? this.getNodeMessage(sourceNode) : null;
    if (!sourceNode || sourceMessage?.kind !== 'user') {
      return;
    }
    this.syncActiveViewToNode(sourceNode);
    if (sourceNode.skillId === GENERAL_SKILL) {
      await this.executeGeneralChatRequest(
        this.getResolvedSkill(sourceNode.skillId),
        sourceNode.tabId,
        sourceNode.id,
        sourceMessage.attachedContexts,
        createEntryId('ai-run'),
      );
      return;
    }
    const skill = this.getResolvedSkill(sourceNode.skillId);
    if (resolveUserMessagePurpose(sourceMessage.purpose) === 'initial-run') {
      await this.executeStructuredInitialPrompt(skill, sourceMessage.content, {
        sourceNode,
        attachedContexts: sourceMessage.attachedContexts,
        reuseSourceMessage: true,
      });
      return;
    }
    await this.executeStructuredFollowUp(skill, sourceNode.tabId, sourceMessage.content, {
      sourceNode,
      attachedContexts: sourceMessage.attachedContexts,
      reuseSourceMessage: true,
    });
  }

  async rerunFromMessage(messageId: string): Promise<void> {
    const node = this.getTreeNode(messageId);
    if (!node) {
      return;
    }
    if (node.skillId === GENERAL_SKILL) {
      await this.retryFailedMessage(messageId);
      return;
    }
    const tree = this.ensureTreeState();
    const pathNodes = traceTreePath(tree, node.id)
      .map((nodeId) => tree.nodes[nodeId])
      .filter((entry): entry is AIWorkbenchTreeNode => Boolean(entry))
      .filter((entry) => this.shouldIncludeNodeInView(entry, node.skillId, node.tabId));
    const anchor = [...pathNodes]
      .reverse()
      .find((entry) => {
        const message = this.getNodeMessage(entry);
        return message?.kind === 'user';
      }) || node;
    this.state.activeSkillId = node.skillId;
    this.ensureSkillRuntimeState(node.skillId);
    this.state.activeTabId = node.tabId;
    tree.activeLeafNodeIds![createTreeViewKey(node.skillId, node.tabId)] = anchor.id;
    tree.activeLeafNodeId = anchor.id;
    this.rebuildProjectedThreads();
    this.syncDerivedStateFromThreads();
    if (node.skillId === GENERAL_SKILL) {
      await this.runActiveSkill();
      return;
    }
    await this.runActiveTab();
  }

  private resolveRelatedUserNode(messageId: string): AIWorkbenchTreeNode | null {
    const node = this.getTreeNode(messageId);
    if (!node) {
      return null;
    }
    const message = this.getNodeMessage(node);
    if (message?.kind === 'user') {
      return node;
    }
    if (message?.kind === 'assistant-text' && message.requestSourceMessageId) {
      return this.getTreeNode(message.requestSourceMessageId);
    }
    const tree = this.ensureTreeState();
    return traceTreePath(tree, node.id)
      .map((nodeId) => tree.nodes[nodeId])
      .filter((entry): entry is AIWorkbenchTreeNode => Boolean(entry))
      .reverse()
      .find((entry) => this.getNodeMessage(entry)?.kind === 'user') || null;
  }

  private syncActiveViewToNode(node: AIWorkbenchTreeNode): void {
    this.state.activeSkillId = node.skillId;
    this.ensureSkillRuntimeState(node.skillId);
    this.state.activeTabId = this.normalizeTabForCurrentSettings(node.tabId, node.skillId);
    this.ensureTreeState().activeLeafNodeIds![createTreeViewKey(node.skillId, node.tabId)] = node.id;
    this.ensureTreeState().activeLeafNodeId = node.id;
    this.rebuildProjectedThreads();
    this.syncDerivedStateFromThreads();
  }

  private clearMessageRequestErrorState(): void {
    this.state.error = null;
    this.state.failureDiagnostic = null;
  }

  private consumeFailureDiagnostic(): AIWorkbenchFailureDiagnostic | null {
    const current = this.state.failureDiagnostic
      ? { ...this.state.failureDiagnostic }
      : null;
    this.state.failureDiagnostic = null;
    return current;
  }

  private resolveRequestAttachedContexts(attachedContexts?: AIAttachedContextItem[] | null): AIAttachedContextItem[] {
    if (attachedContexts) {
      return cloneAttachedContexts(attachedContexts);
    }
    return this.consumeComposerContexts();
  }

  private isAbortErrorMessage(message: string): boolean {
    return message.includes('已停止') || message.includes('aborted');
  }

  private materializeRequestFailure(input: {
    assistantMessageId?: string | null;
    sourceUserMessageId: string;
    skillId: AISkillId;
    tabId: AISkillTabId;
    attachedContexts: AIAttachedContextItem[];
    error: unknown;
    runMode: AIWorkbenchRunMode;
    runGroupId?: string | null;
  }): void {
    const content = input.error instanceof Error ? input.error.message : String(input.error);
    const status = this.isAbortErrorMessage(content) ? 'interrupted' : 'error';
    const sourceNode = this.getTreeNode(input.sourceUserMessageId);
    const scope = sourceNode?.scope || (input.skillId === GENERAL_SKILL ? 'skill' : 'tab');
    const updateTabIds = scope === 'skill'
      ? getSkillTabIds(input.skillId, sourceNode?.tabId || input.tabId)
      : [input.tabId];
    const failureDiagnostic = status === 'error' ? this.consumeFailureDiagnostic() : null;
    const patchMessage = (message: AIWorkbenchAssistantTextMessage): AIWorkbenchAssistantTextMessage => ({
      ...message,
      content,
      sourceContent: message.sourceContent || message.content || null,
      appliedContexts: cloneAttachedContexts(input.attachedContexts),
      interrupted: status === 'interrupted',
      requestSourceMessageId: input.sourceUserMessageId,
      failureDiagnostic,
      failureRunMode: input.runMode,
      runGroupId: normalizeString(input.runGroupId) || message.runGroupId || null,
      presentation: 'primary',
    });
    if (input.assistantMessageId && this.getTreeNode(input.assistantMessageId)) {
      this.patchActiveNodeMessage(input.assistantMessageId, (message) => (
        patchMessage(message as AIWorkbenchAssistantTextMessage)
      ), { status });
      return;
    }
    const failureNode = this.appendNodeMessage(input.tabId, patchMessage({
      id: createEntryId('ai-msg'),
      skillId: input.skillId,
      tabId: input.tabId,
      view: input.skillId,
      kind: 'assistant-text',
      content,
      createdAt: Date.now(),
      sourceContent: null,
      appliedContexts: cloneAttachedContexts(input.attachedContexts),
      reasoningContent: null,
      diagnostics: [],
      interrupted: status === 'interrupted',
      requestSourceMessageId: input.sourceUserMessageId,
      failureDiagnostic,
      failureRunMode: input.runMode,
      runGroupId: normalizeString(input.runGroupId) || null,
      presentation: 'primary',
    } satisfies AIWorkbenchAssistantTextMessage), {
      scope,
      parentNodeId: sourceNode?.id || null,
      updateTabIds,
    });
    failureNode.status = status;
  }

  cancelCurrentRun(): void {
    this.promptRuntime.cancelCurrentRun();
    for (const approvalId of this.state.pendingApprovals.map((request) => request.id)) {
      void this.resolveToolApproval(approvalId, false, '用户已停止当前运行。');
    }
  }

  setActiveTab(tabId: AISkillTabId): void {
    this.ensureSkillRuntimeState(this.state.activeSkillId);
    this.state.activeTabId = this.normalizeTabForCurrentSettings(tabId, this.state.activeSkillId);
    this.clearArenaSelection();
    this.syncTreeLeafWithActiveView();
    this.rebuildProjectedThreads();
    this.schedulePersistCurrentSession();
  }

  setActiveSkill(skillId: AISkillId): void {
    const normalizedSkillId = this.normalizeSkillForCurrentSettings(skillId, this.state.activeSkillId);
    this.state.activeSkillId = normalizedSkillId;
    this.state.activeView = normalizedSkillId;
    this.ensureSkillRuntimeState(normalizedSkillId);
    this.state.activeTabId = this.normalizeTabForCurrentSettings(this.state.activeTabId, normalizedSkillId);
    this.clearArenaSelection();
    this.syncTreeLeafWithActiveView();
    this.rebuildProjectedThreads();
    this.schedulePersistCurrentSession();
  }

  getViewState(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId): AIViewSessionState {
    this.ensureSkillRuntimeState(this.state.activeSkillId);
    return this.state.viewState[this.state.activeSkillId][this.normalizeTabForCurrentSettings(tabId, this.state.activeSkillId)];
  }

  getThread(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId) {
    this.ensureSkillRuntimeState(this.state.activeSkillId);
    return this.state.threads[this.state.activeSkillId][this.normalizeTabForCurrentSettings(tabId, this.state.activeSkillId)];
  }

  getThreadMessages(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId): AIWorkbenchMessage[] {
    return this.getThread(undefined, tabId).messages;
  }

  getRenderEntries(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId): AIWorkbenchRenderEntry[] {
    const messages = this.getThreadMessages(undefined, tabId);
    const entries: AIWorkbenchRenderEntry[] = [];
    let pendingSupplemental: AIWorkbenchMessage[] = [];

    const flushPendingIntoLastEntry = () => {
      if (pendingSupplemental.length === 0) {
        return;
      }
      if (entries.length > 0) {
        const lastEntry = entries[entries.length - 1]!;
        lastEntry.supplementalMessages.push(...pendingSupplemental);
        lastEntry.stepCount = lastEntry.supplementalMessages.length;
        lastEntry.pendingApproval = lastEntry.supplementalMessages.find((message): message is AIWorkbenchApprovalMessage => (
          message.kind === 'approval' && message.request.status === 'pending'
        )) || lastEntry.pendingApproval;
        pendingSupplemental = [];
        return;
      }
      const fallbackPrimary = [...pendingSupplemental]
        .reverse()
        .find((message) => message.kind === 'assistant-text')
        || pendingSupplemental[0];
      if (fallbackPrimary) {
        entries.push(this.createRenderEntry(
          fallbackPrimary,
          pendingSupplemental.filter((message) => message.id !== fallbackPrimary.id),
        ));
      }
      pendingSupplemental = [];
    };

    for (let index = 0; index < messages.length; index += 1) {
      const message = messages[index]!;
      if (this.isSupplementalMessage(messages, index)) {
        pendingSupplemental.push(message);
        continue;
      }
      if (!this.isRenderablePrimaryMessage(message)) {
        pendingSupplemental.push(message);
        continue;
      }
      entries.push(this.createRenderEntry(message, pendingSupplemental));
      pendingSupplemental = [];
    }

    flushPendingIntoLastEntry();
    return entries;
  }

  isViewStale(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId): boolean {
    return this.getViewState(undefined, tabId).stale;
  }

  getFollowUps(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId): AIFollowUpEntry[] {
    return this.getViewState(undefined, tabId).followUps;
  }

  hasStructuredResult(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId): boolean {
    const skill = this.getResolvedSkill(this.state.activeSkillId);
    if (skill.mode === 'chat') {
      return this.getThreadMessages(undefined, this.getPrimaryTabId(skill.id)).some((message) => message.kind === 'assistant-text' || message.kind === 'tool-log');
    }
    if (skill.id !== CONCEPT_SKILL) {
      const sectionResult = this.state.genericSkillResults[skill.id]?.sections.find((section) => section.id === tabId);
      return Boolean(sectionResult && hasGenericSectionContent(sectionResult));
    }
    return hasTabResultContent(tabId, tabResultFromConceptCoach(this.state.skillResults[CONCEPT_SKILL], tabId));
  }

  getFollowUpDisabledReason(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId): string | null {
    if (this.state.isLoading) {
      return 'AI 正在处理中，请稍后继续追问。';
    }
    if (this.getResolvedSkill(this.state.activeSkillId).mode === 'chat') {
      return null;
    }
    if (!this.hasStructuredResult(undefined, tabId)) {
      return '请先运行一次当前阶段，再继续追问。';
    }
    if (this.isViewStale(undefined, tabId)) {
      return this.getViewState(undefined, tabId).staleReason || '当前上下文已变化，请先重新运行。';
    }
    return null;
  }

  getCurrentModelLabel(): string {
    return this.promptRuntime.getCurrentModelLabel();
  }

  setActiveView(_view: unknown): void {
    const skillId = this.normalizeSkillForCurrentSettings(_view, this.state.activeSkillId);
    this.state.activeSkillId = skillId;
    this.state.activeView = skillId;
    this.ensureSkillRuntimeState(skillId);
    this.state.activeTabId = this.normalizeTabForCurrentSettings(this.state.activeTabId, skillId);
    this.syncTreeLeafWithActiveView();
    this.rebuildProjectedThreads();
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
    this.addNodeVersion(messageId, (message) => ({
      ...(message as AIWorkbenchAssistantTextMessage),
      sourceContent: (message as AIWorkbenchAssistantTextMessage).sourceContent || (message as AIWorkbenchAssistantTextMessage).content,
      content: normalizeString(content),
    } satisfies AIWorkbenchAssistantTextMessage));
    this.syncDerivedStateFromThreads();
    await this.persistCurrentSession();
    await this.recordArenaEvent('edit', {
      metadata: {
        messageId,
        kind: 'assistant-text',
      },
    });
  }

  async updateCandidateCard(
    messageId: string,
    cardId: string,
    patch: Partial<Pick<
      AIConceptCoachCandidateCard,
      'prompt' | 'question' | 'answer' | 'summary' | 'details' | 'clozeTargets' | 'draftMarkdown' | 'selected' | 'kind'
    >>,
  ): Promise<void> {
    const currentMode = this.getSelfTestCreationMode();
    const invalidatePluginDrafts = (
      Object.prototype.hasOwnProperty.call(patch, 'prompt')
      || Object.prototype.hasOwnProperty.call(patch, 'question')
      || Object.prototype.hasOwnProperty.call(patch, 'answer')
      || Object.prototype.hasOwnProperty.call(patch, 'details')
      || Object.prototype.hasOwnProperty.call(patch, 'clozeTargets')
      || Object.prototype.hasOwnProperty.call(patch, 'draftMarkdown')
    );
    const updated = this.updateSelfTestResultMessage(messageId, (cards) => cards.map((card) => {
      if (card.id !== cardId) {
        return card;
      }
      const normalizedDraftMarkdown = Object.prototype.hasOwnProperty.call(patch, 'draftMarkdown')
        ? normalizeString(patch.draftMarkdown)
        : '';
      const draftPatch = Object.prototype.hasOwnProperty.call(patch, 'draftMarkdown')
        ? normalizeSelfTestCandidateCard({
          id: card.id,
          kind: patch.kind || card.kind,
          selected: Object.prototype.hasOwnProperty.call(patch, 'selected') ? patch.selected !== false : card.selected,
          summary: patch.summary || card.summary,
          draftMarkdown: normalizedDraftMarkdown,
          mode: currentMode,
        }, 0, currentMode)
        : null;
      const nextPrompt = Object.prototype.hasOwnProperty.call(patch, 'prompt')
        ? normalizeString(patch.prompt)
        : Object.prototype.hasOwnProperty.call(patch, 'question')
          ? normalizeString(patch.question)
          : draftPatch?.prompt || card.prompt || card.question || card.legacyQuestion || '';
      const nextAnswer = Object.prototype.hasOwnProperty.call(patch, 'answer')
        ? normalizeString(patch.answer)
        : draftPatch?.answer || card.answer || card.legacyAnswer || '';
      const nextDetails = Object.prototype.hasOwnProperty.call(patch, 'details')
        ? (Array.isArray(patch.details) ? patch.details : []).map((item) => normalizeString(item)).filter(Boolean)
        : draftPatch?.details || card.details || [];
      const nextClozeTargets = Object.prototype.hasOwnProperty.call(patch, 'clozeTargets')
        ? (Array.isArray(patch.clozeTargets) ? patch.clozeTargets : []).map((item) => normalizeString(item)).filter(Boolean)
        : draftPatch?.clozeTargets || card.clozeTargets || [];
      const summary = Object.prototype.hasOwnProperty.call(patch, 'summary')
        ? normalizeString(patch.summary)
        : summarizeSelfTestCandidateCard({
          summary: '',
          prompt: nextPrompt,
          answer: nextAnswer,
          clozeTargets: nextClozeTargets,
        });
      const nextModeDrafts = { ...(card.modeDrafts || {}) };
      if (invalidatePluginDrafts) {
        delete nextModeDrafts['multi-mark'];
        delete nextModeDrafts['cdf-multiline'];
      }
      if (normalizedDraftMarkdown && isPluginSelfTestCreationMode(currentMode)) {
        nextModeDrafts[currentMode] = normalizedDraftMarkdown;
      }
      return {
        ...card,
        summary,
        prompt: nextPrompt,
        answer: nextAnswer,
        details: nextDetails,
        clozeTargets: nextClozeTargets,
        modeDrafts: Object.keys(nextModeDrafts).length > 0 ? nextModeDrafts : undefined,
        draftMarkdown: Object.prototype.hasOwnProperty.call(patch, 'draftMarkdown')
          ? normalizedDraftMarkdown || undefined
          : card.draftMarkdown,
        legacyQuestion: nextPrompt || undefined,
        legacyAnswer: nextAnswer || undefined,
        question: nextPrompt || undefined,
        mode: Object.prototype.hasOwnProperty.call(patch, 'draftMarkdown')
          ? currentMode
          : card.mode,
        kind: Object.prototype.hasOwnProperty.call(patch, 'kind') ? normalizeSelfTestCardKind(patch.kind) : card.kind,
        selected: Object.prototype.hasOwnProperty.call(patch, 'selected') ? patch.selected !== false : card.selected,
      } satisfies AIConceptCoachCandidateCard;
    }));
    if (!updated) {
      return;
    }
    this.syncDerivedStateFromThreads();
    await this.persistCurrentSession();
    await this.recordArenaEvent('edit', {
      metadata: {
        messageId,
        cardId,
        kind: 'candidate-card',
      },
    });
  }

  async setCandidateCardsSelected(messageId: string, selected: boolean): Promise<void> {
    const updated = this.updateSelfTestResultMessage(messageId, (cards) => cards.map((card) => ({
      ...card,
      selected,
    })));
    if (!updated) {
      return;
    }
    this.syncDerivedStateFromThreads();
    await this.persistCurrentSession();
  }

  async listSelfTestCardTargetNotebooks(): Promise<AIWorkbenchNotebookOption[]> {
    const notebooks = await this.deps.siyuanPort.listNotebooks();
    return notebooks
      .map((notebook) => ({
        id: normalizeString(notebook.id),
        name: normalizeString(notebook.name) || normalizeString(notebook.id),
        icon: normalizeString(notebook.icon) || undefined,
        closed: notebook.closed === true,
      }))
      .filter((notebook) => notebook.id && !notebook.closed)
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  async getSelfTestCardTargetMemory(): Promise<AIWorkbenchSelfTestCardTargetMemory | null> {
    return this.getSessionStore().loadSelfTestCardTargetMemory();
  }

  async saveSelfTestCardTargetMemory(
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
  ): Promise<AIWorkbenchSelfTestCardTargetMemory | null> {
    const memory = normalizeSelfTestCardTargetMemory(target, Date.now());
    if (!memory) {
      return null;
    }
    return this.getSessionStore().saveSelfTestCardTargetMemory(memory);
  }

  async createSelfTestCardsFromSelectedCandidates(
    target: AIWorkbenchSelfTestCardTargetInput,
    messageId: string,
  ): Promise<AIWorkbenchSelfTestCardCreationResult> {
    const creationMode = this.getSelfTestCreationMode();
    if (isPluginSelfTestCreationMode(creationMode)) {
      const selectedCardIds = this.getSelfTestCardsForMessage(messageId)
        .filter((card) => card.selected !== false)
        .map((card) => card.id);
      await this.generateModeDrafts(messageId, creationMode, selectedCardIds);
    }
    const candidates = this.getSelectedSelfTestCardCandidates(messageId);
    if (candidates.length === 0) {
      throw new Error('请先勾选至少一张包含有效制卡草稿的自测卡片。');
    }
    const result = await this.selfTestCardCreationService.createFromCandidates(
      target,
      candidates,
      creationMode,
    );
    if (result.createdCount > 0) {
      await this.getSessionStore().saveSelfTestCardTargetMemory(result.target);
    }
    await this.recordArenaEvent('create', {
      qualityLabel: result.createdCount > 0 ? 'strong' : 'usable',
      cardIds: result.createdCardIds,
      metadata: {
        messageId,
        createdCount: result.createdCount,
        failedCount: result.failedCount,
        targetLabel: result.targetLabel,
      },
    });
    return result;
  }

  async setCdfAnchorSelected(messageId: string, anchorId: string, selected: boolean): Promise<void> {
    const updated = this.updateCdfResultMessage(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? { ...anchor, selected }
          : anchor
      )),
    }));
    if (!updated) {
      return;
    }
    await this.persistCurrentSession();
  }

  async setCdfDefinitionSelected(
    messageId: string,
    anchorId: string,
    definitionId: string,
    selected: boolean,
  ): Promise<void> {
    const updated = this.updateCdfResultMessage(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? {
            ...anchor,
            definitionCandidates: anchor.definitionCandidates.map((definition) => (
              selected
                ? { ...definition, selected: definition.id === definitionId }
                : definition.id === definitionId
                  ? { ...definition, selected: false }
                  : definition
            )),
          }
          : anchor
      )),
    }));
    if (!updated) {
      return;
    }
    await this.persistCurrentSession();
  }

  async clearCdfDefinitionSelection(messageId: string, anchorId: string): Promise<void> {
    const updated = this.updateCdfResultMessage(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? {
            ...anchor,
            definitionCandidates: anchor.definitionCandidates.map((definition) => ({
              ...definition,
              selected: false,
            })),
          }
          : anchor
      )),
    }));
    if (!updated) {
      return;
    }
    await this.persistCurrentSession();
  }

  async setCdfDescriptorGroupSelected(
    messageId: string,
    anchorId: string,
    groupId: string,
    selected: boolean,
  ): Promise<void> {
    const updated = this.updateCdfResultMessage(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? {
            ...anchor,
            descriptorGroups: anchor.descriptorGroups.map((group) => (
              group.id === groupId ? { ...group, selected } : group
            )),
          }
          : anchor
      )),
    }));
    if (!updated) {
      return;
    }
    await this.persistCurrentSession();
  }

  async setCdfDescriptorItemSelected(
    messageId: string,
    anchorId: string,
    groupId: string,
    itemId: string,
    selected: boolean,
  ): Promise<void> {
    const updated = this.updateCdfResultMessage(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? {
            ...anchor,
            descriptorGroups: anchor.descriptorGroups.map((group) => (
              group.id === groupId
                ? {
                  ...group,
                  items: group.items.map((item) => (
                    item.id === itemId ? { ...item, selected } : item
                  )),
                }
                : group
            )),
          }
          : anchor
      )),
    }));
    if (!updated) {
      return;
    }
    await this.persistCurrentSession();
  }

  async previewCdfStructure(
    messageId: string,
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    options?: {
      forceResolve?: boolean;
    },
  ): Promise<AICdfStructure> {
    return this.flashcardTools.previewSemanticCdfStructure(
      this.getCdfStructureForMessage(messageId),
      target,
      {
        context: this.state.context,
        attachedContexts: [],
      },
      options,
    );
  }

  async createCdfCardsFromSelectedAnchors(
    target: AIWorkbenchSelfTestCardTargetInput,
    messageId: string,
  ): Promise<AIWorkbenchCdfCreationResult> {
    const result = await this.flashcardTools.createSemanticCdfCards(
      this.getCdfStructureForMessage(messageId),
      target,
      {
        context: this.state.context,
        attachedContexts: [],
      },
    );
    if (result.createdCount > 0) {
      await this.getSessionStore().saveSelfTestCardTargetMemory(result.target);
    }
    await this.recordArenaEvent('create', {
      qualityLabel: result.createdCount > 0 ? 'strong' : 'usable',
      metadata: {
        messageId,
        createdCount: result.createdCount,
        createdDefinitionCount: result.createdDefinitionCount,
        createdDescriptorCount: result.createdDescriptorCount,
        targetLabel: result.targetLabel,
      },
    });
    return result;
  }

  formatAssistantResultMarkdown(messageId: string): string {
    const message = this.getConceptCoachResultMessage(messageId);
    if (!message) {
      return '';
    }
    return formatConceptCoachAssistantResultMarkdown(message, {
      selfTestCreationMode: this.getSelfTestCreationMode(),
    });
  }

  async sendAssistantResultToSiyuan(
    target: AIWorkbenchSelfTestCardTargetInput,
    messageId: string,
  ): Promise<AIWorkbenchSendToSiyuanResult> {
    const message = this.getConceptCoachResultMessage(messageId);
    if (!message) {
      throw new Error('当前消息不支持发送到思源。');
    }
    const resolvedTarget = await this.resolveSelfTestCardWriteTarget(target);
    const sectionTitle = getConceptCoachTabTitle(message.tabId);
    const bodyMarkdown = this.formatAssistantResultMarkdown(messageId);
    if (!bodyMarkdown) {
      throw new Error('当前阶段没有可发送到思源的内容。');
    }
    const markdown = buildAiWorkbenchSectionMarkdown(sectionTitle, bodyMarkdown, Date.now());
    const mutation = resolvedTarget.writeMode === 'append'
      ? await this.deps.siyuanPort.appendBlockUnderParentDetailed(markdown, resolvedTarget.targetBlockId)
      : await this.deps.siyuanPort.insertBlockAfterDetailed(markdown, resolvedTarget.targetBlockId);
    const insertedRootBlockId = normalizeString(mutation.doOperations[0]?.id) || null;
    await this.getSessionStore().saveSelfTestCardTargetMemory(resolvedTarget.memory);
    await this.recordArenaEvent('create', {
      qualityLabel: insertedRootBlockId ? 'strong' : 'usable',
      metadata: {
        messageId,
        insertedRootBlockId,
        targetLabel: resolvedTarget.memory.targetLabel,
        sectionTitle,
      },
    });
    return {
      target: resolvedTarget.memory,
      targetBlockId: resolvedTarget.targetBlockId,
      targetLabel: resolvedTarget.memory.targetLabel,
      sectionTitle,
      markdown,
      insertedRootBlockId,
    };
  }

  async searchCdfConceptDocuments(
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    query: string,
    limit?: number,
  ): Promise<AIWorkbenchConceptDocumentSearchResult[]> {
    return this.flashcardTools.searchConceptDocumentsInNotebook(target, query, limit);
  }

  async setCdfAnchorManualResolution(
    messageId: string,
    anchorId: string,
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    document: AIWorkbenchConceptDocumentSearchResult,
  ): Promise<void> {
    const memory = normalizeSelfTestCardTargetMemory(target, Date.now());
    if (!memory?.notebookId) {
      throw new Error('设置概念文档前请先选择目标笔记本。');
    }
    const updated = this.applyCdfAnchorManualResolution(messageId, anchorId, memory, document, '手动选择概念文档。');
    if (!updated) {
      throw new Error('未找到要更新的 CDF 概念锚点。');
    }
    await this.persistCurrentSession();
  }

  async createAndBindCdfConceptDocument(
    messageId: string,
    anchorId: string,
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
  ): Promise<void> {
    const memory = normalizeSelfTestCardTargetMemory(target, Date.now());
    if (!memory?.notebookId) {
      throw new Error('新建概念文档前请先选择目标笔记本。');
    }
    const message = this.getConceptCoachResultMessage(messageId);
    if (!message) {
      throw new Error('未找到要更新的 CDF 结果消息。');
    }
    const structure = this.getCdfStructureForMessage(messageId);
    const anchor = structure?.anchors.find((item) => item.id === anchorId);
    if (!anchor) {
      throw new Error('未找到要新建概念文档的 CDF 概念锚点。');
    }
    const created = await this.flashcardTools.createOrReuseConceptDocumentInNotebook(memory, anchor.conceptName);
    const updated = this.applyCdfAnchorManualResolution(
      messageId,
      anchorId,
      memory,
      created.document,
      created.reused ? '已复用现有概念文档。' : '已新建概念文档并手动绑定。',
    );
    if (!updated) {
      throw new Error('未找到要更新的 CDF 概念锚点。');
    }
    await this.persistCurrentSession();
  }

  async restoreCdfAnchorAutoResolution(messageId: string, anchorId: string): Promise<void> {
    const updated = this.updateCdfResultMessage(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? {
            ...anchor,
            resolution: null,
            warnings: (anchor.warnings || []).filter((warning) => warning !== CDF_UNRESOLVED_WARNING),
          }
          : anchor
      )),
    }));
    if (!updated) {
      throw new Error('未找到要恢复自动解析的 CDF 概念锚点。');
    }
    await this.persistCurrentSession();
  }

  private applyCdfAnchorManualResolution(
    messageId: string,
    anchorId: string,
    memory: AIWorkbenchSelfTestCardTargetMemory,
    document: AIWorkbenchConceptDocumentSearchResult,
    reason: string,
  ): boolean {
    return this.updateCdfResultMessage(messageId, (structure) => ({
      anchors: structure.anchors.map((anchor) => (
        anchor.id === anchorId
          ? {
            ...anchor,
            resolution: {
              status: 'resolved-manual',
              conceptBlockId: normalizeString(document.id) || null,
              conceptTitle: normalizeString(document.title) || anchor.conceptName,
              reason,
              notebookId: memory.notebookId,
            },
            warnings: (anchor.warnings || []).filter((warning) => warning !== CDF_UNRESOLVED_WARNING),
          }
          : anchor
      )),
    }));
  }

  async resolveToolApproval(approvalId: string, approved: boolean, rejectReason = ''): Promise<void> {
    const normalizedId = normalizeString(approvalId);
    if (!normalizedId) {
      return;
    }
    const nextPending: AIChatApprovalRequest[] = [];
    for (const request of this.state.pendingApprovals) {
      if (request.id !== normalizedId) {
        nextPending.push(request);
        continue;
      }
      const resolved: AIChatApprovalRequest = {
        ...request,
        status: approved ? 'approved' : 'rejected',
        resolvedAt: Date.now(),
        rejectReason: approved ? undefined : normalizeString(rejectReason) || '用户拒绝执行。',
      };
      this.updateApprovalMessage(resolved);
      this.addRuntimeDiagnostic({
        type: 'approval',
        message: approved
          ? `用户已批准工具 ${request.toolName}。`
          : `用户已拒绝工具 ${request.toolName}。`,
        detail: approved ? undefined : resolved.rejectReason,
        createdAt: Date.now(),
      });
      const resolver = this.approvalResolvers.get(request.id);
      if (resolver) {
        resolver.resolve({
          approved,
          rejectReason: approved ? undefined : resolved.rejectReason,
        });
        this.approvalResolvers.delete(request.id);
      }
    }
    this.state.pendingApprovals = nextPending;
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
    await this.runActiveSkill();
  }

  async runExplain(): Promise<void> {
    await this.runActiveSkill();
  }

  async runActiveSkill(): Promise<void> {
    await this.prepareArenaSelection();
    const skill = this.getResolvedSkill(this.state.activeSkillId);
    this.ensureSkillRuntimeState(skill.id);
    if (skill.mode === 'chat') {
      await this.submitGeneralChatPrompt(this.getDefaultUserPrompt(skill.id));
      return;
    }
    const tabIds = this.getSkillTabs(skill.id).map((tab) => tab.id);
    await this.runTask(tabIds, async () => {
      const attachedContexts = this.consumeComposerContexts();
      if (skill.id === CONCEPT_SKILL) {
        const response = await this.promptRuntime.requestConceptCoachResult(attachedContexts);
        this.appendConceptCoachFullResult(response.content, attachedContexts);
        return;
      }
      const response = await this.promptRuntime.requestGenericStructuredResult(skill, attachedContexts);
      this.appendGenericStructuredFullResult(skill, response.content, attachedContexts);
    }, 'full-run');
  }

  async runActiveTab(): Promise<void> {
    await this.prepareArenaSelection();
    const skill = this.getResolvedSkill(this.state.activeSkillId);
    if (skill.mode === 'chat') {
      await this.runActiveSkill();
      return;
    }
    const tabId = this.state.activeTabId;
    await this.runTask([tabId], async () => {
      const attachedContexts = this.consumeComposerContexts();
      if (skill.id === CONCEPT_SKILL) {
        const response = await this.promptRuntime.requestConceptCoachTabResult(tabId, attachedContexts);
        this.appendConceptCoachTabResult(tabId, response.content, attachedContexts);
        return;
      }
      const response = await this.promptRuntime.requestGenericStructuredTabResult(skill, tabId, attachedContexts);
      this.appendGenericStructuredTabResult(skill, tabId, response.content, attachedContexts);
    }, 'tab-rerun');
  }

  async submitSkillPrompt(
    question: string,
    options?: { editedFromMessageId?: string | null; attachedContexts?: AIAttachedContextItem[] | null },
  ): Promise<void> {
    const normalizedQuestion = normalizeString(question);
    if (!normalizedQuestion) {
      return;
    }
    await this.prepareArenaSelection();
    const skill = this.getResolvedSkill(this.state.activeSkillId);
    if (skill.mode === 'chat') {
      await this.submitGeneralChatPrompt(normalizedQuestion, options);
      return;
    }
    await this.executeStructuredInitialPrompt(skill, normalizedQuestion, options);
  }

  async submitExplainPrompt(question: string): Promise<void> {
    await this.submitSkillPrompt(question);
  }

  async submitFollowUp(
    question: string,
    options?: { editedFromMessageId?: string | null; attachedContexts?: AIAttachedContextItem[] | null },
  ): Promise<void> {
    const normalizedQuestion = normalizeString(question);
    if (!normalizedQuestion) {
      return;
    }
    await this.prepareArenaSelection();
    const skill = this.getResolvedSkill(this.state.activeSkillId);
    if (skill.mode === 'chat') {
      await this.submitGeneralChatPrompt(normalizedQuestion, options);
      return;
    }
    const tabId = this.state.activeTabId;
    const disabledReason = this.getFollowUpDisabledReason(undefined, tabId);
    if (disabledReason) {
      throw this.fail(disabledReason);
    }
    await this.executeStructuredFollowUp(skill, tabId, normalizedQuestion, options);
  }

  private async executeStructuredInitialPrompt(
    skill: AIChatRegisteredSkillDescriptor,
    question: string,
    options?: {
      editedFromMessageId?: string | null;
      attachedContexts?: AIAttachedContextItem[] | null;
      sourceNode?: AIWorkbenchTreeNode | null;
      reuseSourceMessage?: boolean;
    },
  ): Promise<void> {
    const tabIds = this.getSkillTabs(skill.id).map((tab) => tab.id);
    const attachedContexts = this.resolveRequestAttachedContexts(options?.attachedContexts);
    const sourceNode = options?.reuseSourceMessage && options.sourceNode
      ? options.sourceNode
      : this.appendNodeMessage(this.getPrimaryTabId(skill.id), {
        id: createEntryId('ai-msg'),
        skillId: skill.id,
        tabId: this.getPrimaryTabId(skill.id),
        view: skill.id,
        kind: 'user',
        purpose: 'initial-run',
        content: question,
        createdAt: Date.now(),
        editedFromMessageId: normalizeString(options?.editedFromMessageId) || null,
        attachedContexts,
      } satisfies AIWorkbenchUserMessage, {
        scope: skill.id === CONCEPT_SKILL ? 'skill' : 'tab',
        parentNodeId: normalizeString(options?.editedFromMessageId)
          ? this.getTreeNode(options?.editedFromMessageId || '')?.parentId
          : undefined,
      });
    this.state.isLoading = true;
    this.clearMessageRequestErrorState();
    this.state.runStatus = this.createRunStatus('full-run', tabIds);
    for (const tabId of tabIds) {
      const thread = this.state.threads[skill.id][tabId];
      thread.stale = false;
      thread.staleReason = null;
    }
    try {
      if (skill.id === CONCEPT_SKILL) {
        const response = await this.promptRuntime.requestConceptCoachResult(attachedContexts, question);
        this.appendConceptCoachFullResult(response.content, attachedContexts, sourceNode.id);
      } else {
        const response = await this.promptRuntime.requestGenericStructuredResult(skill, attachedContexts, question);
        this.appendGenericStructuredFullResult(skill, response.content, attachedContexts, sourceNode.id);
      }
      for (const tabId of tabIds) {
        const thread = this.state.threads[skill.id][tabId];
        thread.resultContextSignature = this.state.contextSignature;
        thread.stale = false;
        thread.staleReason = null;
      }
      this.state.legacyNotice = null;
      this.syncDerivedStateFromThreads();
      await this.persistCurrentSession();
    } catch (error) {
      if (this.isAbortErrorMessage(error instanceof Error ? error.message : String(error))) {
        this.consumeFailureDiagnostic();
        this.syncDerivedStateFromThreads();
        await this.persistCurrentSession();
      } else {
        this.materializeRequestFailure({
          sourceUserMessageId: sourceNode.id,
          skillId: skill.id,
          tabId: sourceNode.tabId,
          attachedContexts,
          error,
          runMode: 'full-run',
        });
        this.syncDerivedStateFromThreads();
        await this.persistCurrentSession();
      }
    } finally {
      this.state.isLoading = false;
      this.state.runStatus = null;
    }
  }

  private async executeStructuredFollowUp(
    skill: AIChatRegisteredSkillDescriptor,
    tabId: AISkillTabId,
    question: string,
    options?: {
      editedFromMessageId?: string | null;
      attachedContexts?: AIAttachedContextItem[] | null;
      sourceNode?: AIWorkbenchTreeNode | null;
      reuseSourceMessage?: boolean;
    },
  ): Promise<void> {
    const attachedContexts = this.resolveRequestAttachedContexts(options?.attachedContexts);
    const sourceNode = options?.reuseSourceMessage && options.sourceNode
      ? options.sourceNode
      : this.appendNodeMessage(tabId, {
        id: createEntryId('ai-msg'),
        skillId: skill.id,
        tabId,
        view: skill.id,
        kind: 'user',
        purpose: 'follow-up',
        content: question,
        createdAt: Date.now(),
        editedFromMessageId: normalizeString(options?.editedFromMessageId) || null,
        attachedContexts,
      } satisfies AIWorkbenchUserMessage, {
        parentNodeId: normalizeString(options?.editedFromMessageId)
          ? this.getTreeNode(options?.editedFromMessageId || '')?.parentId
          : undefined,
      });
    this.state.isLoading = true;
    this.clearMessageRequestErrorState();
    this.state.runStatus = this.createRunStatus('follow-up', [tabId]);
    try {
      const response = skill.id === CONCEPT_SKILL
        ? await this.promptRuntime.requestFollowUp(tabId, attachedContexts)
        : await this.promptRuntime.requestGenericFollowUp(skill, tabId, attachedContexts);
      const content = normalizeString(response.content) || '这次没有返回可用内容。';
      this.appendNodeMessage(tabId, {
        id: createEntryId('ai-msg'),
        skillId: skill.id,
        tabId,
        view: skill.id,
        kind: 'assistant-text',
        content,
        createdAt: Date.now(),
        sourceContent: content,
        appliedContexts: attachedContexts,
        requestSourceMessageId: sourceNode.id,
      } satisfies AIWorkbenchAssistantTextMessage, {
        scope: sourceNode.scope,
        parentNodeId: sourceNode.id,
        updateTabIds: sourceNode.scope === 'skill' ? getSkillTabIds(skill.id, sourceNode.tabId) : [tabId],
      });
      this.syncDerivedStateFromThreads();
      await this.persistCurrentSession();
    } catch (error) {
      if (this.isAbortErrorMessage(error instanceof Error ? error.message : String(error))) {
        this.consumeFailureDiagnostic();
        this.syncDerivedStateFromThreads();
        await this.persistCurrentSession();
      } else {
        this.materializeRequestFailure({
          sourceUserMessageId: sourceNode.id,
          skillId: skill.id,
          tabId,
          attachedContexts,
          error,
          runMode: 'follow-up',
        });
        this.syncDerivedStateFromThreads();
        await this.persistCurrentSession();
      }
    } finally {
      this.state.isLoading = false;
      this.state.runStatus = null;
    }
  }

  private async submitGeneralChatPrompt(
    question: string,
    options?: { editedFromMessageId?: string | null; attachedContexts?: AIAttachedContextItem[] | null },
  ): Promise<void> {
    const normalizedQuestion = normalizeString(question);
    if (!normalizedQuestion) {
      return;
    }
    if (!this.currentArenaSelection) {
      await this.prepareArenaSelection();
    }
    const skill = this.getResolvedSkill(this.state.activeSkillId);
    const tabId = this.getPrimaryTabId(skill.id);
    this.ensureSkillRuntimeState(skill.id);
    const attachedContexts = this.resolveRequestAttachedContexts(options?.attachedContexts);
    const runGroupId = createEntryId('ai-run');
    const editedNode = normalizeString(options?.editedFromMessageId) ? this.getTreeNode(options?.editedFromMessageId || '') : null;
    const userNode = this.appendNodeMessage(tabId, {
      id: createEntryId('ai-msg'),
      skillId: skill.id,
      tabId,
      view: skill.id,
      kind: 'user',
      purpose: 'follow-up',
      content: normalizedQuestion,
      createdAt: Date.now(),
      editedFromMessageId: normalizeString(options?.editedFromMessageId) || null,
      attachedContexts,
    } satisfies AIWorkbenchUserMessage, {
      scope: 'skill',
      parentNodeId: editedNode?.parentId,
    });
    await this.executeGeneralChatRequest(skill, tabId, userNode.id, attachedContexts, runGroupId);
  }

  private async executeGeneralChatRequest(
    skill: AIChatRegisteredSkillDescriptor,
    tabId: AISkillTabId,
    sourceUserMessageId: string,
    attachedContexts: AIAttachedContextItem[],
    runGroupId: string,
  ): Promise<void> {
    this.state.isLoading = true;
    this.clearMessageRequestErrorState();
    this.state.runStatus = this.createRunStatus('chat', [CHAT_TAB]);
    let primaryAssistantMessageId: string | null = null;
    try {
      await this.generalChatRuntime.runToolLoop({
        skill,
        tabId,
        attachedContexts,
        runGroupId,
        requestSourceMessageId: sourceUserMessageId,
        onPrimaryAssistantMessage: (messageId) => {
          primaryAssistantMessageId = messageId;
        },
      });
      this.syncDerivedStateFromThreads();
      await this.persistCurrentSession();
    } catch (error) {
      if (this.isAbortErrorMessage(error instanceof Error ? error.message : String(error))) {
        this.consumeFailureDiagnostic();
        this.syncDerivedStateFromThreads();
        await this.persistCurrentSession();
        await this.recordArenaEvent('abandon', {
          metadata: {
            mode: 'chat',
            reason: 'aborted',
          },
        });
      } else {
        this.materializeRequestFailure({
          assistantMessageId: primaryAssistantMessageId,
          sourceUserMessageId,
          skillId: skill.id,
          tabId,
          attachedContexts,
          error,
          runMode: 'chat',
          runGroupId,
        });
        this.syncDerivedStateFromThreads();
        await this.persistCurrentSession();
        await this.recordArenaEvent('abandon', {
          metadata: {
            mode: 'chat',
            error: error instanceof Error ? error.message : String(error),
          },
        });
      }
    } finally {
      this.state.isLoading = false;
      this.state.runStatus = null;
    }
  }

  private async requestInlineToolApproval(request: AIChatApprovalRequest): Promise<{ approved: boolean; rejectReason?: string }> {
    this.state.pendingApprovals.push(request);
    this.appendApprovalMessage(request, request.skillId || this.state.activeSkillId, request.tabId || this.state.activeTabId, request.runGroupId);
    this.addRuntimeDiagnostic({
      type: 'approval',
      message: request.type === 'result'
        ? `工具 ${request.toolName} 的结果等待用户审批。`
        : `工具 ${request.toolName} 等待用户审批后执行。`,
      detail: request.argsText || JSON.stringify(request.args, null, 2),
      createdAt: Date.now(),
    });
    this.appendMessage(request.tabId || this.state.activeTabId, {
      id: createEntryId('ai-msg'),
      skillId: request.skillId || this.state.activeSkillId,
      tabId: request.tabId || this.state.activeTabId,
      view: request.skillId || this.state.activeSkillId,
      kind: 'assistant-text',
      content: request.type === 'result'
        ? `工具「${request.title}」已经得到结果，等你确认后我就继续。`
        : `我准备执行工具「${request.title}」，请先确认。`,
      createdAt: Date.now(),
      sourceContent: null,
      appliedContexts: [],
      runGroupId: request.runGroupId || null,
      presentation: 'supplemental',
    } satisfies AIWorkbenchAssistantTextMessage);
    return new Promise((resolve) => {
      this.approvalResolvers.set(request.id, { request, resolve });
    });
  }

  private async activateLiveContext(
    nextContext: AIWorkbenchContextSnapshot,
    options?: { forceNewSession?: boolean; previousReviewChatKey?: string | null },
  ): Promise<void> {
    const nextSignature = buildContextSignature(nextContext);
    const currentSignature = this.state.contextSignature;
    const currentSource = this.state.context?.source || null;
    const normalizedPreviousReviewChatKey = normalizeString(options?.previousReviewChatKey) || null;
    const normalizedCurrentReviewChatKey = normalizeString(this.state.reviewChatKey) || null;
    const reuseCurrentReviewChatSession = nextContext.source === 'review'
      && currentSource === 'review'
      && Boolean(normalizedCurrentReviewChatKey)
      && (!normalizedPreviousReviewChatKey || normalizedCurrentReviewChatKey === normalizedPreviousReviewChatKey)
      && Boolean(this.state.sessionId);
    const shouldCreateNewSession = options?.forceNewSession === true
      || (this.state.contextIsHistorical && !reuseCurrentReviewChatSession)
      || !this.state.sessionId
      || (!reuseCurrentReviewChatSession && currentSignature !== nextSignature)
      || currentSource !== nextContext.source;

    if (shouldCreateNewSession) {
      const record = this.createSessionRecord(nextContext, nextSignature);
      await this.applyAndPersistSession(record, nextContext);
      return;
    }

    await this.refreshCurrentSessionContext(nextContext, nextSignature);
  }

  private async tryHydrateReviewChatSession(nextContext: AIWorkbenchContextSnapshot): Promise<boolean> {
    const reviewChatKey = normalizeString(this.state.reviewChatKey) || null;
    if (
      nextContext.source !== 'review'
      || !reviewChatKey
      || this.state.sessionId
      || !this.getSessionStore().findLatestByReviewChatKey
    ) {
      return false;
    }

    const summary = await this.getSessionStore().findLatestByReviewChatKey({
      reviewChatKey,
      source: 'review',
    });
    if (!summary) {
      return false;
    }
    const record = await this.getSessionStore().loadSession(summary.id);
    if (!record) {
      return false;
    }

    const currentSourceReviewSessionId = this.state.sourceReviewSessionId;
    this.applySessionRecord(record, nextContext);
    this.state.reviewChatKey = reviewChatKey;
    this.state.sourceReviewSessionId = currentSourceReviewSessionId;
    await this.refreshCurrentSessionContext(nextContext);
    await this.refreshSessionHistory();
    return true;
  }

  private async refreshCurrentSessionContext(
    nextContext: AIWorkbenchContextSnapshot,
    nextSignature = buildContextSignature(nextContext),
  ): Promise<void> {
    this.applyRuntimeSessionContext(nextContext, nextSignature);
    await this.persistCurrentSession();
  }

  private applyRuntimeSessionContext(
    nextContext: AIWorkbenchContextSnapshot,
    nextSignature = buildContextSignature(nextContext),
  ): void {
    this.state.context = nextContext;
    this.state.liveContext = nextContext;
    this.state.contextSignature = nextSignature;
    this.state.contextIsHistorical = false;
    this.markStaleThreads(nextSignature);
    this.syncCurrentScopedConceptCoachResult();
  }

  private createSessionRecord(
    context: AIWorkbenchContextSnapshot,
    contextSignature: string | null,
  ): AIWorkbenchSessionRecord {
    const now = Date.now();
    const skill = this.getResolvedSkill(this.state.activeSkillId);
    return createAIWorkbenchSessionRecord({
      id: createEntryId('ai-session'),
      title: generateAIWorkbenchSessionTitle(context),
      context,
      contextSignature,
      sourceReviewSessionId: this.state.sourceReviewSessionId,
      reviewChatKey: this.state.reviewChatKey,
      surface: this.state.surface,
      activeSkillId: this.state.activeSkillId,
      activeTabId: this.state.activeTabId,
      skillTabIds: skill.tabs.map((tab) => tab.id),
      now,
    });
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
    const projection = projectAIWorkbenchSessionRecordApplication({
      record,
      liveContext,
      liveContextSignature: buildContextSignature(liveContext),
      fallbackReviewChatKey: deriveReviewChatKey(record.context || null),
    });
    this.approvalResolvers.clear();
    this.state.sessionId = projection.sessionId;
    this.state.sessionTitle = projection.sessionTitle;
    this.state.surface = projection.surface;
    this.state.sourceReviewSessionId = projection.sourceReviewSessionId;
    this.state.reviewChatKey = projection.reviewChatKey;
    this.state.context = projection.context;
    this.state.contextSignature = projection.contextSignature;
    this.state.liveContext = projection.liveContext;
    this.state.contextIsHistorical = projection.contextIsHistorical;
    this.state.activeSkillId = this.normalizeSkillForCurrentSettings(record.activeSkillId, this.state.activeSkillId);
    this.ensureSkillRuntimeState(this.state.activeSkillId);
    this.state.activeTabId = this.normalizeTabForCurrentSettings(record.activeTabId, this.state.activeSkillId);
    this.state.activeView = this.state.activeSkillId;
    this.state.threads = normalizeThreads(record.threads);
    this.state.tree = record.tree || createEmptyConversationTree();
    this.ensureSkillRuntimeState(this.state.activeSkillId);
    this.state.conceptCoachResultsByContext = {};
    const scopedResults = isRecord(record.conceptCoachResultsByContext)
      ? record.conceptCoachResultsByContext as Record<string, AIConceptCoachResult | null>
      : {};
    for (const [contextKey, result] of Object.entries(scopedResults)) {
      if (result) {
        this.state.conceptCoachResultsByContext[normalizeContextKey(contextKey)] = normalizeConceptCoachResult(
          result,
          result.rawContent || '',
          this.getSelfTestCreationMode(),
        );
      }
    }
    if (Object.keys(this.state.conceptCoachResultsByContext).length === 0 && record.skillResults?.[CONCEPT_SKILL]) {
      this.state.conceptCoachResultsByContext[this.getCurrentConceptCoachContextKey(record.contextSignature)] = normalizeConceptCoachResult(
        record.skillResults[CONCEPT_SKILL],
        record.skillResults[CONCEPT_SKILL]?.rawContent || '',
        this.getSelfTestCreationMode(),
      );
    }
    this.state.skillResults = {
      [GENERAL_SKILL]: null,
      [CONCEPT_SKILL]: this.getScopedConceptCoachResult(buildContextSignature(liveContext) || record.contextSignature),
    };
    this.state.genericSkillResults = {
      ...(record.genericSkillResults || {}),
    };
    this.state.messages = this.flattenTimelineMessages();
    this.varStore.replace(record.vars || []);
    this.state.vars = this.varStore.list();
    this.state.diagnostics = record.diagnostics || [];
    this.state.pendingApprovals = this.state.messages
      .filter((message): message is AIWorkbenchApprovalMessage => message.kind === 'approval' && message.request.status === 'pending')
      .map((message) => message.request);
    this.state.toolTimeline = this.state.messages
      .filter((message): message is AIWorkbenchToolLogMessage => message.kind === 'tool-log')
      .map((message) => ({
        status: message.status,
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        group: message.group,
        args: {},
        argsText: message.argsText || undefined,
        finalText: message.content,
        resultText: message.resultText || message.content,
        error: message.error || undefined,
        argsVarRef: message.argsVarRef || undefined,
        varRef: message.varRef || undefined,
        durationMs: message.durationMs || undefined,
        roundIndex: message.roundIndex || undefined,
        llmUsage: message.llmUsage || undefined,
        createdAt: message.createdAt,
      }));
    this.state.explainResult = explainResultFromConceptCoach(this.state.skillResults[CONCEPT_SKILL]);
    this.state.legacyNotice = (record.legacyExplainMessages?.length || 0) > 0 ? LEGACY_NOTICE : null;
    this.state.composerContexts = createEmptyComposerContextState();
    this.state.composerEditorOpen = false;
    this.state.editingMessageId = null;
    this.state.editingMessageKind = null;
    this.state.runStatus = null;
    this.state.failureDiagnostic = null;
    this.syncTreeLeafWithActiveView();
    this.rebuildProjectedThreads();
    this.syncDerivedStateFromThreads();
  }

  private markStaleThreads(nextSignature: string | null): void {
    for (const skillThreads of Object.values(this.state.threads)) {
      for (const thread of Object.values(skillThreads)) {
        if (
          thread.resultContextSignature
          && nextSignature
          && thread.resultContextSignature !== nextSignature
          && thread.messages.length > 0
        ) {
          thread.stale = true;
          thread.staleReason = '当前上下文已变化，请重新运行这个阶段以获得最新结果。';
        }
      }
    }
    this.syncDerivedStateFromThreads();
  }

  private syncDerivedStateFromThreads(): void {
    this.rebuildProjectedThreads();
    for (const tabId of AI_CONCEPT_COACH_TAB_IDS) {
      const thread = this.state.threads[CONCEPT_SKILL][tabId];
      const viewState = this.state.viewState[CONCEPT_SKILL][tabId];
      viewState.resultContextSignature = thread.resultContextSignature;
      viewState.stale = thread.stale;
      viewState.staleReason = thread.staleReason;
      viewState.followUps = thread.messages
        .filter((message) => !this.getTreeNode(message.id)?.hidden)
        .filter((message) => (
          message.kind === 'assistant-text'
          || (message.kind === 'user' && resolveUserMessagePurpose(message.purpose) === 'follow-up')
        ))
        .map((message) => ({
          id: message.id,
          skillId: CONCEPT_SKILL,
          tabId,
          role: message.kind === 'user' ? 'user' : 'assistant',
          content: message.content,
          createdAt: message.createdAt,
        }));
    }

    for (const [skillId, skillThreads] of Object.entries(this.state.threads)) {
      if (skillId === CONCEPT_SKILL) {
        continue;
      }
      this.state.viewState[skillId] = this.state.viewState[skillId] || {};
      for (const [tabId, thread] of Object.entries(skillThreads)) {
        this.state.viewState[skillId][tabId] = this.state.viewState[skillId][tabId] || createEmptyViewSessionState();
        const viewState = this.state.viewState[skillId][tabId];
        viewState.resultContextSignature = thread.resultContextSignature;
        viewState.stale = thread.stale;
        viewState.staleReason = thread.staleReason;
        viewState.followUps = thread.messages
          .filter((message) => !this.getTreeNode(message.id)?.hidden)
          .filter((message) => (
            message.kind === 'assistant-text'
            || (message.kind === 'user' && resolveUserMessagePurpose(message.purpose) === 'follow-up')
          ))
          .map((message) => ({
            id: message.id,
            skillId: skillId as AISkillId,
            tabId: tabId as AISkillTabId,
            role: message.kind === 'user' ? 'user' : 'assistant',
            content: message.content,
            createdAt: message.createdAt,
          }));
      }
    }

    this.syncCurrentScopedConceptCoachResult();
    for (const skillId of Object.keys(this.state.threads).filter((id) => id.startsWith('user:'))) {
      this.state.genericSkillResults[skillId] = this.findLatestGenericStructuredResult(skillId as AISkillId);
    }
    this.state.messages = this.flattenTimelineMessages();
    this.state.vars = this.varStore.list();
  }

  private findLatestConceptCoachResultForContext(signature: string | null = this.state.contextSignature): AIConceptCoachResult | null {
    const normalizedSignature = normalizeString(signature);
    if (!normalizedSignature) {
      return null;
    }
    const stored = this.getScopedConceptCoachResult(normalizedSignature);
    if (stored) {
      return stored;
    }
    const messages = Object.values(this.ensureTreeState().nodes)
      .map((node) => this.getNodeMessage(node))
      .filter((message): message is AIWorkbenchAssistantResultMessage => (
        Boolean(message)
        && message.kind === 'assistant-result'
        && message.skillId === CONCEPT_SKILL
        && message.conceptCoachResult !== null
        && normalizeString(message.contextSignature) === normalizedSignature
      ))
      .sort((left, right) => right.createdAt - left.createdAt);
    const latest = messages[0]?.conceptCoachResult ? cloneConceptCoachResult(messages[0].conceptCoachResult) : null;
    if (latest) {
      this.setScopedConceptCoachResult(latest, normalizedSignature);
    }
    return latest;
  }

  private findLatestGenericStructuredResult(skillId: AISkillId): AIUserSkillStructuredResult | null {
    const messages = Object.values(this.state.threads[skillId] || {})
      .flatMap((thread) => thread.messages)
      .filter((message): message is AIWorkbenchAssistantResultMessage => (
        message.kind === 'assistant-result'
        && Boolean(message.genericStructuredResult)
      ))
      .sort((left, right) => right.createdAt - left.createdAt);
    return messages[0]?.genericStructuredResult
      ? JSON.parse(JSON.stringify(messages[0].genericStructuredResult)) as AIUserSkillStructuredResult
      : null;
  }

  private flattenTimelineMessages(): AIWorkbenchMessage[] {
    return Object.values(this.ensureTreeState().nodes)
      .map((node) => this.getNodeMessage(node))
      .filter((message): message is AIWorkbenchMessage => Boolean(message))
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  private appendMessage(tabId: AISkillTabId, message: AIWorkbenchMessage): void {
    this.appendNodeMessage(tabId, message);
    this.syncDerivedStateFromThreads();
    this.schedulePersistCurrentSession();
  }

  private consumeComposerContexts(): AIAttachedContextItem[] {
    const snapshot = cloneAttachedContexts(this.state.composerContexts.items);
    this.state.composerContexts.items = [];
    return snapshot;
  }

  private findMessage(messageId: string): { tabId: AISkillTabId; index: number; message: AIWorkbenchMessage } | null {
    const node = this.getTreeNode(messageId);
    if (!node) {
      return null;
    }
    const messages = this.getProjectedMessagesForView(node.skillId, node.tabId);
    const index = messages.findIndex((message) => message.id === node.id);
    const message = index >= 0 ? messages[index] : this.getNodeMessage(node);
    return message ? { tabId: node.tabId, index: Math.max(index, 0), message } : null;
  }

  private replaceLatestTabResultMessage(tabId: AISkillTabId, result: AIConceptCoachResult): void {
    const latest = [...this.state.threads[CONCEPT_SKILL][tabId].messages]
      .reverse()
      .find((message): message is AIWorkbenchAssistantResultMessage => message.kind === 'assistant-result');
    if (!latest || !this.getTreeNode(latest.id)) {
      return;
    }
    this.setScopedConceptCoachResult(result, this.state.contextSignature);
    this.addNodeVersion(latest.id, (message) => ({
      ...(message as AIWorkbenchAssistantResultMessage),
      contextSignature: this.state.contextSignature,
      conceptCoachResult: cloneConceptCoachResult(result),
      tabResult: tabResultFromConceptCoach(result, tabId),
      normalizationDiagnostic: deriveTabNormalizationDiagnostic(tabId, tabResultFromConceptCoach(result, tabId), 'edited-result'),
      explainResult: explainResultFromConceptCoach(result),
      rawContent: JSON.stringify(tabId === 'self-test-cards'
        ? { selfTestCards: result.selfTestCards }
        : tabId === 'cdf-structure'
          ? { cdfStructure: result.cdfStructure }
        : result, null, 2),
    } satisfies AIWorkbenchAssistantResultMessage));
    this.syncDerivedStateFromThreads();
  }

  private async refreshSessionHistory(): Promise<void> {
    this.state.sessionHistory = await this.getSessionStore().listSummaries();
  }

  private async buildContextSnapshot(options: AIWorkbenchOpenOptions): Promise<AIWorkbenchContextSnapshot> {
    const currentCard = options.currentCard ?? null;
    const sourceBlockIdsFromCard = this.resolveSourceBlockIdsFromCard(currentCard);
    const neuralVirtualBlockIds = this.resolveNeuralVirtualBlockIds(currentCard);
    const selectedBlockIds = uniqueIds([
      ...(options.selectedBlockIds || []),
      options.currentBlockId || null,
      ...sourceBlockIdsFromCard,
      ...neuralVirtualBlockIds,
    ]);
    const blocks = await this.enrichNeuralVirtualBlockContexts(
      await this.loadBlockContexts(selectedBlockIds),
      neuralVirtualBlockIds,
    );
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
    const neuralContext = readReviewNeuralContext(card);
    const frontBlockIds = readStringArrayFromMeta(meta, 'frontBlockIDs');
    const backBlockIds = readStringArrayFromMeta(meta, 'backBlockIDs');
    const neuralVirtualBlockIds = this.resolveNeuralVirtualBlockIds(card);
    const sourceBlockIds = uniqueIds([
      ...frontBlockIds,
      ...backBlockIds,
      card.blockId,
      typeof card.extractedFrom === 'string' ? card.extractedFrom : '',
      ...neuralVirtualBlockIds,
    ]);
    const contentMap = await this.resolveAIBlockContents(sourceBlockIds);
    await this.enrichAIBlockContentsWithStandardMarkdown(contentMap, neuralVirtualBlockIds);
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
      neuralContext,
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

  private resolveNeuralVirtualBlockIds(card: FSRSCard | null): string[] {
    if (!isNeuralVirtualReviewCard(card)) {
      return [];
    }
    const neuralContext = readReviewNeuralContext(card);
    return uniqueIds([
      card?.blockId,
      neuralContext?.sourceVirtualNodeId,
    ]);
  }

  private async readStandardMarkdownByBlockIds(blockIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const blockId of uniqueIds(blockIds)) {
      try {
        const markdown = normalizeString(await this.deps.siyuanPort.copyStdMarkdown(blockId));
        if (markdown) {
          result.set(blockId, markdown);
        }
      } catch {
        // Keep the SQL-derived block text already loaded for the context snapshot.
      }
    }
    return result;
  }

  private async enrichNeuralVirtualBlockContexts(
    blocks: AIBlockContext[],
    blockIds: string[],
  ): Promise<AIBlockContext[]> {
    if (blockIds.length === 0 || blocks.length === 0) {
      return blocks;
    }
    const markdownById = await this.readStandardMarkdownByBlockIds(blockIds);
    if (markdownById.size === 0) {
      return blocks;
    }
    return blocks.map((block) => {
      const markdown = markdownById.get(block.blockId);
      return markdown
        ? {
            ...block,
            text: markdown,
            markdown,
          }
        : block;
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

  private async enrichAIBlockContentsWithStandardMarkdown(
    contentMap: Map<string, { content: string; type: string; isDocument: boolean }>,
    blockIds: string[],
  ): Promise<void> {
    if (blockIds.length === 0) {
      return;
    }
    const markdownById = await this.readStandardMarkdownByBlockIds(blockIds);
    for (const [blockId, markdown] of markdownById.entries()) {
      const existing = contentMap.get(blockId);
      contentMap.set(blockId, {
        content: markdown,
        type: existing?.type || '',
        isDocument: existing?.isDocument === true,
      });
    }
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

  private appendToolLogMessage(
    result: AIChatToolExecutionResult,
    skillId: AISkillId = this.state.activeSkillId,
    tabId: AISkillTabId = this.state.activeTabId,
    runGroupId?: string | null,
  ): void {
    this.appendMessage(tabId, {
      id: createEntryId('ai-tool'),
      skillId,
      tabId,
      view: skillId,
      kind: 'tool-log',
      createdAt: result.createdAt,
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      group: result.group,
      status: result.status,
      content: result.finalText,
      argsText: result.argsText || null,
      resultText: result.resultText || null,
      error: result.error || null,
      argsVarRef: result.argsVarRef || null,
      varRef: result.varRef || null,
      durationMs: result.durationMs || null,
      roundIndex: result.roundIndex || null,
      llmUsage: result.llmUsage || null,
      runGroupId: normalizeString(runGroupId) || null,
      presentation: 'supplemental',
    } satisfies AIWorkbenchToolLogMessage);
  }

  private appendApprovalMessage(
    request: AIChatApprovalRequest,
    skillId: AISkillId = this.state.activeSkillId,
    tabId: AISkillTabId = this.state.activeTabId,
    runGroupId?: string | null,
  ): void {
    this.appendMessage(tabId, {
      id: createEntryId('ai-approval'),
      skillId,
      tabId,
      view: skillId,
      kind: 'approval',
      createdAt: request.createdAt,
      request,
      runGroupId: normalizeString(runGroupId) || null,
      presentation: 'supplemental',
    } satisfies AIWorkbenchApprovalMessage);
  }

  private updateApprovalMessage(request: AIChatApprovalRequest): void {
    const node = Object.values(this.ensureTreeState().nodes)
      .find((entry) => {
        const message = this.getNodeMessage(entry);
        return message?.kind === 'approval' && message.request.id === request.id;
      }) || null;
    if (node) {
      this.patchActiveNodeMessage(node.id, (message) => ({
        ...(message as AIWorkbenchApprovalMessage),
        request,
      } satisfies AIWorkbenchApprovalMessage));
    }
    this.syncDerivedStateFromThreads();
  }

  private addRuntimeDiagnostic(diagnostic: AIChatRuntimeDiagnostic): void {
    this.state.diagnostics = [
      ...this.state.diagnostics,
      diagnostic,
    ].slice(-40);
  }

  private appendConceptCoachFullResult(
    rawContent: string,
    appliedContexts: AIAttachedContextItem[],
    parentNodeId?: string | null,
  ): void {
    const payload = this.promptRuntime.extractStructuredPayload('AI 理解与制卡', rawContent);
    let normalized: ConceptCoachNormalizationState;
    try {
      normalized = normalizeConceptCoachState(payload, rawContent, this.getSelfTestCreationMode());
    } catch (error) {
      throw this.fail(`AI 理解与制卡的自测卡片结构不合法：${toErrorMessage(error, '未知错误')}`);
    }
    const result = normalized.result;
    this.setScopedConceptCoachResult(result, this.state.contextSignature);
    this.syncCurrentScopedConceptCoachResult();
    const now = Date.now();
    for (const tabId of AI_CONCEPT_COACH_TAB_IDS) {
      this.appendNodeMessage(tabId, {
        id: createEntryId('ai-msg'),
        skillId: ACTIVE_SKILL,
        tabId,
        view: ACTIVE_SKILL,
        contextSignature: this.state.contextSignature,
        kind: 'assistant-result',
        createdAt: now,
        rawContent,
        conceptCoachResult: cloneConceptCoachResult(result),
        tabResult: tabResultFromConceptCoach(result, tabId),
        normalizationDiagnostic: normalized.diagnostics[tabId] ?? deriveTabNormalizationDiagnostic(tabId, tabResultFromConceptCoach(result, tabId), describeRawShape(payload)),
        explainResult: explainResultFromConceptCoach(result),
        appliedContexts,
      } satisfies AIWorkbenchAssistantResultMessage, {
        scope: 'tab',
        parentNodeId,
      });
    }
  }

  private appendConceptCoachTabResult(
    tabId: AISkillTabId,
    rawContent: string,
    appliedContexts: AIAttachedContextItem[],
  ): void {
    const payload = this.promptRuntime.extractStructuredPayload(this.getActiveTabDescriptor().title, rawContent);
    let normalized: ReturnType<typeof mergeTabResult>;
    try {
      normalized = mergeTabResult(
        this.state.skillResults[ACTIVE_SKILL],
        tabId,
        payload,
        rawContent,
        this.getSelfTestCreationMode(),
      );
    } catch (error) {
      throw this.fail(`${this.getActiveTabDescriptor().title}的自测卡片结构不合法：${toErrorMessage(error, '未知错误')}`);
    }
    const result = normalized.result;
    this.setScopedConceptCoachResult(result, this.state.contextSignature);
    this.syncCurrentScopedConceptCoachResult();
    this.appendMessage(tabId, {
      id: createEntryId('ai-msg'),
      skillId: ACTIVE_SKILL,
      tabId,
      view: ACTIVE_SKILL,
      contextSignature: this.state.contextSignature,
      kind: 'assistant-result',
      createdAt: Date.now(),
      rawContent,
      conceptCoachResult: cloneConceptCoachResult(result),
      tabResult: tabResultFromConceptCoach(result, tabId),
      normalizationDiagnostic: normalized.diagnostics[tabId] ?? deriveTabNormalizationDiagnostic(tabId, tabResultFromConceptCoach(result, tabId), describeRawShape(payload)),
      explainResult: explainResultFromConceptCoach(result),
      appliedContexts,
    } satisfies AIWorkbenchAssistantResultMessage);
  }

  private appendGenericStructuredFullResult(
    skill: AIChatRegisteredSkillDescriptor,
    rawContent: string,
    appliedContexts: AIAttachedContextItem[],
    parentNodeId?: string | null,
  ): void {
    const payload = this.promptRuntime.extractStructuredPayload(skill.title, rawContent);
    const normalized = normalizeGenericStructuredResult(skill, payload, rawContent);
    this.state.genericSkillResults[skill.id] = normalized.result;
    const now = Date.now();
    for (const section of normalized.result.sections) {
      this.appendNodeMessage(section.id, {
        id: createEntryId('ai-msg'),
        skillId: skill.id,
        tabId: section.id,
        view: skill.id,
        kind: 'assistant-result',
        createdAt: now,
        rawContent,
        conceptCoachResult: null,
        tabResult: null,
        genericStructuredResult: normalized.result,
        genericSectionResult: section,
        normalizationDiagnostic: normalized.diagnostic,
        explainResult: null,
        appliedContexts,
      } satisfies AIWorkbenchAssistantResultMessage, {
        scope: 'tab',
        parentNodeId,
      });
    }
  }

  private appendGenericStructuredTabResult(
    skill: AIChatRegisteredSkillDescriptor,
    tabId: AISkillTabId,
    rawContent: string,
    appliedContexts: AIAttachedContextItem[],
  ): void {
    const payload = this.promptRuntime.extractStructuredPayload(this.getActiveTabDescriptor().title, rawContent);
    const normalized = normalizeGenericStructuredResult(skill, payload, rawContent, tabId);
    const current = this.state.genericSkillResults[skill.id];
    const nextSections = [
      ...(current?.sections || []).filter((section) => section.id !== tabId),
      ...normalized.result.sections,
    ];
    const result: AIUserSkillStructuredResult = {
      skillId: skill.id,
      sections: nextSections,
      rawContent,
    };
    this.state.genericSkillResults[skill.id] = result;
    const section = result.sections.find((entry) => entry.id === tabId) || normalized.result.sections[0];
    if (!section) {
      return;
    }
    this.appendMessage(tabId, {
      id: createEntryId('ai-msg'),
      skillId: skill.id,
      tabId,
      view: skill.id,
      kind: 'assistant-result',
      createdAt: Date.now(),
      rawContent,
      conceptCoachResult: null,
      tabResult: null,
      genericStructuredResult: result,
      genericSectionResult: section,
      normalizationDiagnostic: normalized.diagnostic,
      explainResult: null,
      appliedContexts,
    } satisfies AIWorkbenchAssistantResultMessage);
  }

  private requireContext(): AIWorkbenchContextSnapshot {
    if (!this.state.context) {
      throw this.fail('AI 工作台上下文还没有准备好。');
    }
    return this.state.context;
  }

  private createRunStatus(mode: AIWorkbenchRunMode, tabIds: AISkillTabId[]): AIWorkbenchRunStatus {
    const skillId = this.state.activeSkillId;
    return createAIWorkbenchRunStatus({
      mode,
      skillId,
      tabIds: tabIds.map((tabId) => this.normalizeTabForCurrentSettings(tabId, skillId)),
      activeTabId: this.state.activeTabId,
      tabs: this.getSkillTabs(),
      activeTabTitle: this.getActiveTabDescriptor().title,
    });
  }

  private async runTask(tabIds: AISkillTabId[], runner: () => Promise<void>, mode: AIWorkbenchRunMode): Promise<void> {
    this.state.isLoading = true;
    this.state.error = null;
    this.state.failureDiagnostic = null;
    const skillId = this.state.activeSkillId;
    this.ensureSkillRuntimeState(skillId);
    const normalizedTabIds = tabIds.map((tabId) => this.normalizeTabForCurrentSettings(tabId, skillId));
    this.state.runStatus = this.createRunStatus(mode, normalizedTabIds);
    for (const tabId of normalizedTabIds) {
      const thread = this.state.threads[skillId][tabId];
      thread.stale = false;
      thread.staleReason = null;
    }
    try {
      await runner();
      for (const tabId of normalizedTabIds) {
        const thread = this.state.threads[skillId][tabId];
        thread.resultContextSignature = this.state.contextSignature;
        thread.stale = false;
        thread.staleReason = null;
      }
      this.state.legacyNotice = null;
      this.syncDerivedStateFromThreads();
      await this.persistCurrentSession();
      if (mode === 'tab-rerun') {
        await this.recordArenaEvent('rerun', {
          metadata: {
            tabIds: normalizedTabIds,
            skillId,
          },
        });
      }
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
      await this.recordArenaEvent('abandon', {
        metadata: {
          mode,
          tabIds: normalizedTabIds,
          skillId,
          error: this.state.error,
        },
      });
    } finally {
      this.state.isLoading = false;
      this.state.runStatus = null;
    }
  }

  private buildCurrentSessionRecord(): AIWorkbenchSessionRecord | null {
    const sessionId = normalizeString(this.state.sessionId);
    if (!sessionId) {
      return null;
    }
    const tree = this.ensureTreeState();
    return buildCurrentAIWorkbenchSessionRecord({
      sessionId,
      title: this.state.sessionTitle,
      fallbackTitle: '未命名会话',
      sourceReviewSessionId: this.state.sourceReviewSessionId,
      reviewChatKey: this.state.reviewChatKey,
      surface: this.state.surface,
      contextSignature: this.state.contextSignature,
      createdAt: this.resolveExistingSummary(sessionId)?.createdAt || Date.now(),
      updatedAt: Date.now(),
      activeSkillId: this.state.activeSkillId,
      activeTabId: this.state.activeTabId,
      context: this.state.context,
      liveContext: this.state.liveContext,
      messages: this.flattenTimelineMessages(),
      threads: normalizeThreads(this.state.threads),
      tree,
      conceptSkillResult: this.state.skillResults[CONCEPT_SKILL]
        ? cloneConceptCoachResult(this.state.skillResults[CONCEPT_SKILL]!)
        : null,
      conceptCoachResultsByContext: Object.fromEntries(
        Object.entries(this.state.conceptCoachResultsByContext).map(([contextKey, result]) => [
          contextKey,
          result ? cloneConceptCoachResult(result) : null,
        ]),
      ),
      genericSkillResults: { ...this.state.genericSkillResults },
      vars: this.varStore.list(),
      diagnostics: [...this.state.diagnostics],
      legacyExplainMessages: this.state.legacyNotice ? this.getThreadMessages(undefined, DEFAULT_TAB) : undefined,
    });
  }

  private resolveExistingSummary(sessionId: string) {
    return this.state.sessionHistory.find((summary) => summary.id === sessionId) || null;
  }

  private schedulePersistCurrentSession(): void {
    this.persistScheduler.schedule(
      () => this.persistCurrentSession(),
      (error) => {
        this.state.error = error instanceof Error ? error.message : String(error);
      },
    );
  }

  private async persistCurrentSession(): Promise<void> {
    this.persistScheduler.clear();
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
}
