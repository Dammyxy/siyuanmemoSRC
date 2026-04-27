import { reactive } from 'vue';
import { BlockContextResolver } from '@/application/entries/BlockContextResolver';
import { resolveProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import type { CreateXiuyuanFromBlocksCommand } from '@/application/commands/xiuyuan/CreateXiuyuanFromBlocksCommand';
import type { CardContentQueryService } from '@/application/queries/CardContentQueryService';
import type {
  AISiyuanBlockRow,
  AISiyuanMutationResult,
  AISiyuanPort,
} from '@/application/ports/AISiyuanPort';
import type { LLMMessage, LLMPort, LLMResponse, LLMToolCall } from '@/application/ports/LLMPort';
import { LLMError } from '@/application/ports/LLMPort';
import type { XiuyuanApplicationService } from '@/application/services/XiuyuanApplicationService';
import { AIFlashcardToolService } from '@/application/services/AIFlashcardToolService';
import {
  buildAiWorkbenchSectionMarkdown,
  formatConceptCoachAssistantResultMarkdown,
  getConceptCoachTabTitle,
} from '@/application/services/AIWorkbenchResultFormatter';
import {
  isPluginSelfTestCreationMode,
  normalizeSelfTestCandidateCard,
  normalizeSelfTestCardKind,
  normalizeSelfTestCreationMode,
  resolveSelfTestCandidateDraftMarkdown,
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
  formatStructuredPromptContract,
  getPromptContractForResolvedSkillRun,
  getPromptContractForSkillRun,
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
import type { AIWorkbenchSessionStoreService } from '@/application/services/AIWorkbenchSessionStoreService';
import type { FSRSCard } from '@/types/card';
import type {
  AIAttachedContextItem,
  AICdfAnchor,
  AICdfAnchorResolution,
  AICdfDefinitionCandidate,
  AICdfDescriptorGroup,
  AICdfDescriptorItem,
  AICdfStructure,
  AIChatApprovalRequest,
  AIChatNormalizationDiagnostic,
  AIChatRuntimeDiagnostic,
  AIChatToolCall,
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
  AIExplainResult,
  AIFollowUpEntry,
  AIReviewCardContext,
  AIReviewNeuralContext,
  AISkillId,
  AISkillTabId,
  AIUserSkillStructuredCard,
  AIUserSkillStructuredKeyValue,
  AIUserSkillStructuredResult,
  AIUserSkillStructuredSectionResult,
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
  AIWorkbenchOpenView,
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
  AIWorkbenchSource,
  AIWorkbenchState,
  AIWorkbenchSurface,
  AIWorkbenchTreeNode,
  AIWorkbenchThreads,
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
import type { NeuralRoamBatchSnapshot } from '@/types/unified-data-source';
import type {
  AIArenaEventType,
  AIArenaScenarioId,
  AIArenaSelection,
  ArenaOutcomeLabel,
  ArenaTargetKind,
} from '@/types/arena';
import { normalizeAISettings, normalizeAIPromptTemplates, type AIConceptCoachPromptTemplates, type AIProviderConfig, type AISettings } from '@/types/settings';

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
const EMPTY_CONTEXT_KEY = '__empty_context__';
const ALL_TAB_IDS: AISkillTabId[] = [
  CHAT_TAB,
  ...AI_CONCEPT_COACH_TAB_IDS,
];
const LEGACY_NOTICE = '旧解释结果仅供查看，重跑后会生成完整的 AI 理解与制卡 Tabs。';
const CDF_UNRESOLVED_WARNING = '未解析到现有概念文档，当前概念只保留为草稿，无法直接建卡。';
const PERSPECTIVE_SECTION_META = {
  traits: {
    title: '特性和倾向',
    aliases: ['traits', 'trait', 'features', 'feature', 'characteristics', 'tendencies'],
  },
  contrasts: {
    title: '辨析异同',
    aliases: ['contrasts', 'contrast', 'compare', 'comparison', 'differences', 'difference', 'distinctions'],
  },
  partsAndWhole: {
    title: '部分和整体',
    aliases: ['partsAndWhole', 'partWhole', 'partsWhole', 'structure', 'composition'],
  },
  causality: {
    title: '因果关系',
    aliases: ['causality', 'causeEffect', 'causes', 'effects', 'mechanism'],
  },
  significance: {
    title: '意义和影响',
    aliases: ['significance', 'meaning', 'impact', 'importance', 'implication'],
  },
} as const satisfies Record<keyof AIConceptCoachPerspectives, { title: string; aliases: string[] }>;
const INTEGRATED_FIELD_LABELS = {
  essence: '本质压缩',
  notWhat: '它不是什么',
  capabilities: '学会后能做到',
} as const;

type ConceptCoachNormalizationState = {
  result: AIConceptCoachResult;
  diagnostics: Partial<Record<AISkillTabId, AIConceptCoachNormalizationDiagnostic | null>>;
};

type SelfTestCardWriteTarget = {
  memory: AIWorkbenchSelfTestCardTargetMemory;
  targetBlockId: string;
  writeMode: 'append' | 'after';
};

type SelfTestCardFieldBlocks = {
  insertedRootBlockId: string;
  questionBlockId: string;
  answerBlockId: string;
};

type SelfTestCardMutationBlockRow = AISiyuanBlockRow & {
  sort?: string | number;
  depth?: number;
};

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

function normalizeListText(value: string): string {
  return normalizeString(value).replace(/\s*\r?\n\s*/g, ' ');
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

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter(Boolean);
  }
  const text = normalizeString(value);
  return text ? [text] : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((entry) => normalizeString(entry)).filter(Boolean)));
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

function normalizeAliasKey(value: string): string {
  return String(value || '').replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '').toLowerCase();
}

function readAliasedValue(raw: Record<string, unknown>, aliases: string[]): unknown {
  const normalizedAliases = new Set(aliases.map((alias) => normalizeAliasKey(alias)));
  for (const [key, value] of Object.entries(raw)) {
    if (normalizedAliases.has(normalizeAliasKey(key))) {
      return value;
    }
  }
  return undefined;
}

function collectStringLeaves(
  value: unknown,
  options?: { depth?: number; excludeKeys?: string[] },
): string[] {
  const depth = options?.depth ?? 0;
  if (depth > 3 || value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    const text = String(value).trim();
    return text ? [text] : [];
  }
  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap((entry) => collectStringLeaves(entry, { ...options, depth: depth + 1 })));
  }
  if (isRecord(value)) {
    const excluded = new Set((options?.excludeKeys || []).map((key) => normalizeAliasKey(key)));
    return uniqueStrings(Object.entries(value)
      .filter(([key]) => !excluded.has(normalizeAliasKey(key)))
      .flatMap(([, entry]) => collectStringLeaves(entry, { ...options, depth: depth + 1 })));
  }
  return [];
}

function normalizeFlexibleStringArray(value: unknown, excludeKeys: string[] = []): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.flatMap((entry) => collectStringLeaves(entry, { excludeKeys })));
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return normalizeStringArray(value);
  }
  if (isRecord(value)) {
    return collectStringLeaves(value, { excludeKeys });
  }
  return [];
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

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createTreeViewKey(skillId: AISkillId, tabId: AISkillTabId): string {
  return `${skillId}::${tabId}`;
}

function createEmptyConversationTree(): AIWorkbenchConversationTree {
  return {
    rootNodeId: null,
    activeLeafNodeId: null,
    activeLeafNodeIds: {},
    nodes: {},
  };
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

function resolveUserMessagePurpose(purpose: unknown): AIWorkbenchUserMessagePurpose {
  return purpose === 'follow-up' ? 'follow-up' : purpose === 'initial-explain' ? 'initial-explain' : 'initial-run';
}

function createEmptyViewSessionState(): AIViewSessionState {
  return { resultContextSignature: null, stale: false, staleReason: null, followUps: [] };
}

function createInitialViewState(): AIWorkbenchState['viewState'] {
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

function createEmptyThreadRecord(skillId: AISkillId, tabId: AISkillTabId): AIWorkbenchThreads[string][string] {
  return {
    skillId,
    tabId,
    messages: [],
    resultContextSignature: null,
    stale: false,
    staleReason: null,
  };
}

function createInitialThreads(): AIWorkbenchThreads {
  const makeSkillThreads = (skillId: AISkillId): AIWorkbenchThreads[AISkillId] => ({
    chat: createEmptyThreadRecord(skillId, 'chat'),
    'working-definition': createEmptyThreadRecord(skillId, 'working-definition'),
    perspectives: createEmptyThreadRecord(skillId, 'perspectives'),
    'integrated-understanding': createEmptyThreadRecord(skillId, 'integrated-understanding'),
    'self-test-cards': createEmptyThreadRecord(skillId, 'self-test-cards'),
    'cdf-structure': createEmptyThreadRecord(skillId, 'cdf-structure'),
    'real-world-triggers': createEmptyThreadRecord(skillId, 'real-world-triggers'),
  });
  return {
    [GENERAL_SKILL]: makeSkillThreads(GENERAL_SKILL),
    [CONCEPT_SKILL]: makeSkillThreads(CONCEPT_SKILL),
  };
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
      neuralContext: context.currentCard.neuralContext,
    } : null,
    neuralBatch: serializeNeuralBatch(context.neuralBatch),
  });
}

function buildReviewChatKey(queueType: unknown, queueLabel: unknown): string | null {
  const normalizedQueueType = normalizeString(queueType);
  const normalizedQueueLabel = normalizeString(queueLabel);
  if (!normalizedQueueType || !normalizedQueueLabel) {
    return null;
  }
  return `${normalizedQueueType}::${normalizedQueueLabel}`;
}

function deriveReviewChatKey(
  context: AIWorkbenchContextSnapshot | null,
  explicitReviewChatKey?: string | null,
): string | null {
  return normalizeString(explicitReviewChatKey)
    || buildReviewChatKey(context?.queueType, context?.queueProgress?.queueLabel);
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

function readReviewNeuralContext(card: FSRSCard | null | undefined): AIReviewNeuralContext | null {
  const meta = readXiuyuanMeta(card);
  const raw = meta?.neuralContext;
  if (!isRecord(raw)) {
    return null;
  }

  const neuralContext: AIReviewNeuralContext = {};
  const associationType = normalizeString(raw.associationType);
  const reason = normalizeString(raw.reason);
  const blockType = normalizeString(raw.blockType);
  const nodeRole = normalizeString(raw.nodeRole);
  const sourceVirtualNodeId = normalizeString(raw.sourceVirtualNodeId);

  if (associationType) neuralContext.associationType = associationType;
  if (reason) neuralContext.reason = reason;
  if (blockType) neuralContext.blockType = blockType;
  if (typeof raw.isFlashcard === 'boolean') neuralContext.isFlashcard = raw.isFlashcard;
  if (nodeRole) neuralContext.nodeRole = nodeRole;
  if (sourceVirtualNodeId) neuralContext.sourceVirtualNodeId = sourceVirtualNodeId;

  return Object.keys(neuralContext).length > 0 ? neuralContext : null;
}

function isNeuralVirtualReviewCard(card: FSRSCard | null | undefined): boolean {
  return readReviewNeuralContext(card)?.isFlashcard === false;
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

function emptyPerspectiveSection(title: string): AIConceptCoachPerspectiveSection {
  return { title, keyPoints: [] };
}

function emptyPerspectives(): AIConceptCoachPerspectives {
  return {
    traits: emptyPerspectiveSection('特性和倾向'),
    contrasts: emptyPerspectiveSection('辨析异同'),
    partsAndWhole: emptyPerspectiveSection('部分和整体'),
    causality: emptyPerspectiveSection('因果关系'),
    significance: emptyPerspectiveSection('意义和影响'),
  };
}

function normalizeContextKey(value: string | null | undefined): string {
  return normalizeString(value) || EMPTY_CONTEXT_KEY;
}

function emptyCdfStructure(): AICdfStructure {
  return {
    anchors: [],
  };
}

function normalizeCdfDefinitionCandidate(value: unknown, index: number): AICdfDefinitionCandidate | null {
  if (!isRecord(value)) {
    const text = normalizeString(value);
    return text
      ? {
        id: createEntryId(`ai-cdf-def-${index}`),
        text,
        selected: true,
      }
      : null;
  }
  const text = normalizeString(readAliasedValue(value, ['text', 'definition', 'content', 'value']));
  if (!text) {
    return null;
  }
  return {
    id: normalizeString(value.id) || createEntryId(`ai-cdf-def-${index}`),
    text,
    selected: value.selected !== false,
  };
}

function normalizeCdfDescriptorItem(value: unknown, index: number): AICdfDescriptorItem | null {
  if (!isRecord(value)) {
    const text = normalizeString(value);
    return text
      ? {
        id: createEntryId(`ai-cdf-item-${index}`),
        text,
        selected: true,
      }
      : null;
  }
  const text = normalizeString(readAliasedValue(value, ['text', 'item', 'content', 'value']));
  if (!text) {
    return null;
  }
  return {
    id: normalizeString(value.id) || createEntryId(`ai-cdf-item-${index}`),
    text,
    selected: value.selected !== false,
  };
}

function normalizeCdfDescriptorGroup(value: unknown, index: number): AICdfDescriptorGroup | null {
  if (!isRecord(value)) {
    const title = normalizeString(value);
    return title
      ? {
        id: createEntryId(`ai-cdf-group-${index}`),
        title,
        selected: true,
        items: [],
      }
      : null;
  }
  const title = normalizeString(readAliasedValue(value, ['title', 'name', 'descriptor', 'dimension']));
  const itemsRaw = readAliasedValue(value, ['items', 'descriptors', 'entries', 'points']);
  const itemsSource = Array.isArray(itemsRaw) ? itemsRaw : normalizeFlexibleStringArray(itemsRaw);
  const items = itemsSource
    .map((item, itemIndex) => normalizeCdfDescriptorItem(item, itemIndex))
    .filter((item): item is AICdfDescriptorItem => Boolean(item));
  if (!title && items.length === 0) {
    return null;
  }
  return {
    id: normalizeString(value.id) || createEntryId(`ai-cdf-group-${index}`),
    title: title || `描述维度 ${index + 1}`,
    selected: value.selected !== false,
    items,
  };
}

function normalizeCdfAnchorResolution(value: unknown): AICdfAnchorResolution | null {
  if (!isRecord(value)) {
    return null;
  }
  const status = value.status === 'resolved-context'
    || value.status === 'resolved-notebook'
    || value.status === 'resolved-manual'
    || value.status === 'unresolved'
    ? value.status
    : null;
  if (!status) {
    return null;
  }
  return {
    status,
    conceptBlockId: normalizeString(value.conceptBlockId) || null,
    conceptTitle: normalizeString(value.conceptTitle),
    reason: normalizeString(value.reason) || null,
    notebookId: normalizeString(value.notebookId) || null,
  };
}

function normalizeCdfAnchor(value: unknown, index: number): AICdfAnchor | null {
  if (!isRecord(value)) {
    const conceptName = normalizeString(value);
    return conceptName
      ? {
        id: createEntryId(`ai-cdf-anchor-${index}`),
        conceptName,
        selected: true,
        definitionCandidates: [],
        descriptorGroups: [],
        resolution: null,
        warnings: [],
      }
      : null;
  }
  const conceptName = normalizeString(readAliasedValue(value, ['conceptName', 'concept', 'title', 'name']));
  const definitionsRaw = readAliasedValue(value, ['definitionCandidates', 'definitions', 'definition', 'workingDefinitions']);
  const definitionSource = Array.isArray(definitionsRaw) ? definitionsRaw : normalizeFlexibleStringArray(definitionsRaw);
  const descriptorGroupsRaw = readAliasedValue(value, ['descriptorGroups', 'descriptorGroup', 'groups', 'descriptors']);
  const groupSource = Array.isArray(descriptorGroupsRaw) ? descriptorGroupsRaw : [];
  const definitionCandidates = definitionSource
    .map((item, itemIndex) => normalizeCdfDefinitionCandidate(item, itemIndex))
    .filter((item): item is AICdfDefinitionCandidate => Boolean(item));
  const descriptorGroups = groupSource
    .map((group, groupIndex) => normalizeCdfDescriptorGroup(group, groupIndex))
    .filter((group): group is AICdfDescriptorGroup => Boolean(group));
  if (!conceptName && definitionCandidates.length === 0 && descriptorGroups.length === 0) {
    return null;
  }
  return {
    id: normalizeString(value.id) || createEntryId(`ai-cdf-anchor-${index}`),
    conceptName: conceptName || `概念 ${index + 1}`,
    selected: value.selected !== false,
    definitionCandidates,
    descriptorGroups,
    resolution: normalizeCdfAnchorResolution(value.resolution),
    warnings: normalizeStringArray(value.warnings),
  };
}

function normalizeCdfStructure(value: unknown): AICdfStructure {
  const raw = isRecord(value) ? value : {};
  const anchorsSource = Array.isArray(readAliasedValue(raw, ['anchors', 'concepts', 'items']))
    ? readAliasedValue(raw, ['anchors', 'concepts', 'items']) as unknown[]
    : Array.isArray(value)
      ? value
      : [];
  return {
    anchors: anchorsSource
      .map((anchor, index) => normalizeCdfAnchor(anchor, index))
      .filter((anchor): anchor is AICdfAnchor => Boolean(anchor)),
  };
}

function hasCdfStructureContent(value: AICdfStructure | null): boolean {
  return Boolean(value && value.anchors.some((anchor) => (
    normalizeString(anchor.conceptName)
    || anchor.definitionCandidates.length > 0
    || anchor.descriptorGroups.some((group) => normalizeString(group.title) || group.items.length > 0)
  )));
}

function emptyConceptCoachResult(rawContent = ''): AIConceptCoachResult {
  return {
    workingDefinition: '',
    perspectives: emptyPerspectives(),
    integratedUnderstanding: { essence: '', notWhat: [], capabilities: [] },
    selfTestCards: { creationMode: 'list-item', cards: [] },
    cdfStructure: emptyCdfStructure(),
    realWorldTriggers: { triggers: [] },
    rawContent,
  };
}

function normalizePerspectiveComparisons(value: unknown): AIConceptCoachPerspectiveSection['comparisons'] {
  const entries = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  return entries.map((entry) => isRecord(entry) ? {
    concept: normalizeString(readAliasedValue(entry, ['concept', 'name', 'item'])),
    similarity: normalizeString(readAliasedValue(entry, ['similarity', 'same', 'shared'])),
    difference: normalizeString(readAliasedValue(entry, ['difference', 'different', 'contrast'])),
    clue: normalizeString(readAliasedValue(entry, ['clue', 'hint', 'signal'])),
  } : null).filter((entry): entry is { concept: string; similarity: string; difference: string; clue: string } => (
    Boolean(entry?.concept || entry?.similarity || entry?.difference || entry?.clue)
  ));
}

function hasPerspectiveSectionContent(section: AIConceptCoachPerspectiveSection): boolean {
  return (
    section.keyPoints.length > 0
    || (section.easyMisjudgments?.length || 0) > 0
    || (section.examples?.length || 0) > 0
    || (section.comparisons?.length || 0) > 0
    || (section.subConcepts?.length || 0) > 0
    || (section.parentConcepts?.length || 0) > 0
    || Boolean(section.metaphor)
    || (section.reasons?.length || 0) > 0
    || (section.applicableScenarios?.length || 0) > 0
    || (section.nonApplicableScenarios?.length || 0) > 0
    || Boolean(section.commonMisuse)
    || Boolean(section.importance)
    || Boolean(section.behaviorChange)
    || Boolean(section.triggerScenario)
  );
}

function normalizePerspectiveSection(value: unknown, title: string): AIConceptCoachPerspectiveSection {
  if (!isRecord(value)) {
    return {
      title,
      keyPoints: normalizeFlexibleStringArray(value),
    };
  }

  const raw = value;
  const knownFieldAliases = [
    'title',
    'label',
    'name',
    'keyPoints',
    'points',
    'features',
    'feature',
    'traits',
    'roles',
    'items',
    'bullets',
    'highlights',
    'summary',
    'easyMisjudgments',
    'misjudgments',
    'misunderstandings',
    'examples',
    'example',
    'comparisons',
    'comparison',
    'compare',
    'differences',
    'subConcepts',
    'parts',
    'components',
    'parentConcepts',
    'whole',
    'context',
    'metaphor',
    'reasons',
    'causes',
    'applicableScenarios',
    'applicable',
    'useCases',
    'applications',
    'nonApplicableScenarios',
    'nonApplicable',
    'limits',
    'commonMisuse',
    'misuse',
    'importance',
    'impact',
    'behaviorChange',
    'action',
    'triggerScenario',
    'trigger',
  ];

  const section: AIConceptCoachPerspectiveSection = {
    title: normalizeString(readAliasedValue(raw, ['title', 'label', 'name'])) || title,
    keyPoints: normalizeFlexibleStringArray(readAliasedValue(raw, ['keyPoints', 'points', 'features', 'feature', 'traits', 'roles', 'items', 'bullets', 'highlights', 'summary'])),
    easyMisjudgments: normalizeFlexibleStringArray(readAliasedValue(raw, ['easyMisjudgments', 'misjudgments', 'misunderstandings', 'commonErrors'])),
    examples: normalizeFlexibleStringArray(readAliasedValue(raw, ['examples', 'example', 'instances'])),
    comparisons: normalizePerspectiveComparisons(readAliasedValue(raw, ['comparisons', 'comparison', 'compare'])),
    subConcepts: normalizeFlexibleStringArray(readAliasedValue(raw, ['subConcepts', 'parts', 'components', 'elements'])),
    parentConcepts: normalizeFlexibleStringArray(readAliasedValue(raw, ['parentConcepts', 'whole', 'context', 'supersets'])),
    metaphor: normalizeString(readAliasedValue(raw, ['metaphor', 'analogy'])),
    reasons: normalizeFlexibleStringArray(readAliasedValue(raw, ['reasons', 'causes', 'why'])),
    applicableScenarios: normalizeFlexibleStringArray(readAliasedValue(raw, ['applicableScenarios', 'applicable', 'useCases', 'applications', 'scenarios'])),
    nonApplicableScenarios: normalizeFlexibleStringArray(readAliasedValue(raw, ['nonApplicableScenarios', 'nonApplicable', 'limits', 'nonExamples'])),
    commonMisuse: normalizeString(readAliasedValue(raw, ['commonMisuse', 'misuse', 'pitfall'])),
    importance: normalizeString(readAliasedValue(raw, ['importance', 'impact', 'meaning'])),
    behaviorChange: normalizeString(readAliasedValue(raw, ['behaviorChange', 'action', 'whatChanges', 'changes'])),
    triggerScenario: normalizeString(readAliasedValue(raw, ['triggerScenario', 'trigger', 'cue'])),
  };

  if (!hasPerspectiveSectionContent(section)) {
    section.keyPoints = collectStringLeaves(raw, { excludeKeys: knownFieldAliases });
  }

  return section;
}

function buildNormalizationDiagnostic(
  status: AIConceptCoachNormalizationDiagnostic['status'],
  missingSections: string[],
  rawShape: string,
): AIConceptCoachNormalizationDiagnostic | null {
  return status === 'full'
    ? null
    : {
      status,
      missingSections,
      rawShape,
    };
}

function normalizePerspectivesWithDiagnostic(value: unknown): {
  value: AIConceptCoachPerspectives;
  diagnostic: AIConceptCoachNormalizationDiagnostic | null;
} {
  const rawShape = describeRawShape(value);
  const container = isRecord(value)
    ? (isRecord(readAliasedValue(value, ['perspectives', 'perspective', 'multiPerspective', 'multiPerspectives']))
      ? readAliasedValue(value, ['perspectives', 'perspective', 'multiPerspective', 'multiPerspectives']) as Record<string, unknown>
      : value)
    : null;

  const hasRecognizedSection = container
    ? (Object.keys(PERSPECTIVE_SECTION_META) as Array<keyof AIConceptCoachPerspectives>)
      .some((sectionKey) => readAliasedValue(container, [sectionKey, ...PERSPECTIVE_SECTION_META[sectionKey].aliases]) !== undefined)
    : false;

  const perspectives = {
    traits: normalizePerspectiveSection(
      container
        ? readAliasedValue(container, ['traits', ...PERSPECTIVE_SECTION_META.traits.aliases]) ?? (!hasRecognizedSection ? container : undefined)
        : value,
      PERSPECTIVE_SECTION_META.traits.title,
    ),
    contrasts: normalizePerspectiveSection(
      container ? readAliasedValue(container, ['contrasts', ...PERSPECTIVE_SECTION_META.contrasts.aliases]) : undefined,
      PERSPECTIVE_SECTION_META.contrasts.title,
    ),
    partsAndWhole: normalizePerspectiveSection(
      container ? readAliasedValue(container, ['partsAndWhole', ...PERSPECTIVE_SECTION_META.partsAndWhole.aliases]) : undefined,
      PERSPECTIVE_SECTION_META.partsAndWhole.title,
    ),
    causality: normalizePerspectiveSection(
      container ? readAliasedValue(container, ['causality', ...PERSPECTIVE_SECTION_META.causality.aliases]) : undefined,
      PERSPECTIVE_SECTION_META.causality.title,
    ),
    significance: normalizePerspectiveSection(
      container ? readAliasedValue(container, ['significance', ...PERSPECTIVE_SECTION_META.significance.aliases]) : undefined,
      PERSPECTIVE_SECTION_META.significance.title,
    ),
  } satisfies AIConceptCoachPerspectives;

  const missingSections = (Object.keys(perspectives) as Array<keyof AIConceptCoachPerspectives>)
    .filter((sectionKey) => !hasPerspectiveSectionContent(perspectives[sectionKey]))
    .map((sectionKey) => sectionKey as string);
  const status = missingSections.length === 0
    ? 'full'
    : missingSections.length === 5
      ? 'empty'
      : 'partial';

  return {
    value: perspectives,
    diagnostic: buildNormalizationDiagnostic(status, missingSections, rawShape),
  };
}

function normalizeSelfTestCards(
  value: unknown,
  fallbackMode: AIConceptCoachSelfTestCreationMode = 'list-item',
): AIConceptCoachSelfTestCards {
  const raw = isRecord(value) ? value : {};
  const cards = Array.isArray(readAliasedValue(raw, ['cards', 'candidateCards', 'items']))
    ? readAliasedValue(raw, ['cards', 'candidateCards', 'items']) as unknown[]
    : Array.isArray(value)
      ? value
      : [];
  const declaredMode = normalizeSelfTestCreationMode(readAliasedValue(raw, ['creationMode', 'mode']), fallbackMode);
  const normalizedCards = cards
    .map((entry, index) => normalizeSelfTestCandidateCard(entry, index, declaredMode))
    .filter((card): card is AIConceptCoachCandidateCard => Boolean(card));
  return {
    creationMode: declaredMode,
    cards: normalizedCards,
  };
}

function normalizeIntegratedUnderstanding(value: unknown): AIConceptCoachIntegratedUnderstanding {
  return normalizeIntegratedUnderstandingWithDiagnostic(value).value;
}

function normalizeRealWorldTriggers(value: unknown): AIConceptCoachRealWorldTriggers {
  const raw = isRecord(value) ? value : {};
  return {
    triggers: normalizeFlexibleStringArray(readAliasedValue(raw, ['triggers', 'triggerScenarios', 'scenarios']) ?? value),
  };
}

function normalizeIntegratedUnderstandingWithDiagnostic(value: unknown): {
  value: AIConceptCoachIntegratedUnderstanding;
  diagnostic: AIConceptCoachNormalizationDiagnostic | null;
} {
  const rawShape = describeRawShape(value);
  if (!isRecord(value)) {
    const essence = normalizeString(value);
    const missingSections = essence ? ['notWhat', 'capabilities'] : ['essence', 'notWhat', 'capabilities'];
    return {
      value: {
        essence,
        notWhat: [],
        capabilities: [],
      },
      diagnostic: buildNormalizationDiagnostic(
        essence ? 'partial' : 'empty',
        missingSections,
        rawShape,
      ),
    };
  }

  const raw = isRecord(readAliasedValue(value, ['integratedUnderstanding', 'integrated', 'integratedSummary']))
    ? readAliasedValue(value, ['integratedUnderstanding', 'integrated', 'integratedSummary']) as Record<string, unknown>
    : value;
  const fallbackLeaves = collectStringLeaves(raw, {
    excludeKeys: ['essence', 'whatItIs', 'summary', 'gist', 'notWhat', 'not', 'notThis', 'capabilities', 'canDo', 'applications'],
  });
  const essence = normalizeString(readAliasedValue(raw, ['essence', 'whatItIs', 'summary', 'gist']))
    || fallbackLeaves[0]
    || '';
  const capabilities = normalizeFlexibleStringArray(readAliasedValue(raw, ['capabilities', 'canDo', 'applications', 'apply', 'skills']));
  const notWhat = normalizeFlexibleStringArray(readAliasedValue(raw, ['notWhat', 'not', 'notThis', 'isNot']));
  const missingSections = (Object.keys(INTEGRATED_FIELD_LABELS) as Array<keyof AIConceptCoachIntegratedUnderstanding>)
    .filter((key) => key === 'essence' ? !essence : (key === 'notWhat' ? notWhat.length === 0 : capabilities.length === 0))
    .map((key) => key as string);
  const status = missingSections.length === 0
    ? 'full'
    : missingSections.length === 3
      ? 'empty'
      : 'partial';

  return {
    value: {
      essence,
      notWhat,
      capabilities,
    },
    diagnostic: buildNormalizationDiagnostic(status, missingSections, rawShape),
  };
}

function normalizeWorkingDefinition(value: unknown): string {
  if (isRecord(value)) {
    return normalizeString(readAliasedValue(value, ['workingDefinition', 'workDefinition', 'definition', 'summary']));
  }
  return normalizeString(value);
}

function resolveTabPayload(raw: Record<string, unknown>, tabId: AISkillTabId, fallback: unknown): unknown {
  switch (tabId) {
    case 'working-definition':
      return readAliasedValue(raw, ['workingDefinition', 'workDefinition', 'definition']) ?? fallback;
    case 'perspectives':
      return readAliasedValue(raw, ['perspectives', 'perspective', 'multiPerspective', 'multiPerspectives']) ?? fallback;
    case 'integrated-understanding':
      return readAliasedValue(raw, ['integratedUnderstanding', 'integrated', 'integratedSummary']) ?? fallback;
    case 'self-test-cards':
      return readAliasedValue(raw, ['selfTestCards', 'candidateCards', 'cards']) ?? fallback;
    case 'cdf-structure':
      return readAliasedValue(raw, ['cdfStructure', 'cdf', 'conceptDescriptorFramework']) ?? fallback;
    case 'real-world-triggers':
      return readAliasedValue(raw, ['realWorldTriggers', 'triggers', 'triggerScenarios']) ?? fallback;
    default:
      return fallback;
  }
}

function normalizeConceptCoachState(
  payload: unknown,
  rawContent: string,
  selfTestCreationMode: AIConceptCoachSelfTestCreationMode = 'list-item',
): ConceptCoachNormalizationState {
  const raw = isRecord(payload) ? payload : {};
  const perspectives = normalizePerspectivesWithDiagnostic(resolveTabPayload(raw, 'perspectives', raw.perspectives));
  const integratedUnderstanding = normalizeIntegratedUnderstandingWithDiagnostic(
    resolveTabPayload(raw, 'integrated-understanding', raw.integratedUnderstanding),
  );

  return {
    result: {
      workingDefinition: normalizeWorkingDefinition(resolveTabPayload(raw, 'working-definition', raw)),
      perspectives: perspectives.value,
      integratedUnderstanding: integratedUnderstanding.value,
      selfTestCards: normalizeSelfTestCards(
        resolveTabPayload(raw, 'self-test-cards', raw.selfTestCards),
        selfTestCreationMode,
      ),
      cdfStructure: normalizeCdfStructure(resolveTabPayload(raw, 'cdf-structure', raw.cdfStructure)),
      realWorldTriggers: normalizeRealWorldTriggers(resolveTabPayload(raw, 'real-world-triggers', raw.realWorldTriggers)),
      rawContent,
    },
    diagnostics: {
      perspectives: perspectives.diagnostic,
      'integrated-understanding': integratedUnderstanding.diagnostic,
    },
  };
}

function normalizeConceptCoachResult(
  payload: unknown,
  rawContent: string,
  selfTestCreationMode: AIConceptCoachSelfTestCreationMode = 'list-item',
): AIConceptCoachResult {
  return normalizeConceptCoachState(payload, rawContent, selfTestCreationMode).result;
}

function stringifyGenericValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return collectStringLeaves(value).join('\n');
  }
  if (isRecord(value)) {
    const summary = collectStringLeaves(value).join('\n');
    return summary || JSON.stringify(value, null, 2);
  }
  return '';
}

function normalizeGenericCards(value: unknown): AIUserSkillStructuredCard[] {
  const entries = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(readAliasedValue(value, ['cards', 'items', 'questions']))
      ? readAliasedValue(value, ['cards', 'items', 'questions']) as unknown[]
      : [];
  return entries.map((entry, index): AIUserSkillStructuredCard | null => {
    if (!isRecord(entry)) {
      const text = normalizeString(entry);
      return text ? {
        id: createEntryId(`ai-user-card-${index}`),
        question: text,
        answer: '',
        selected: true,
      } : null;
    }
    const question = normalizeString(readAliasedValue(entry, ['question', 'q', 'front', 'title']));
    const answer = normalizeString(readAliasedValue(entry, ['answer', 'a', 'back', 'body', 'content']));
    if (!question && !answer) {
      return null;
    }
    return {
      id: normalizeString(entry.id) || createEntryId(`ai-user-card-${index}`),
      question,
      answer,
      kind: normalizeString(entry.kind ?? entry.type) || undefined,
      selected: entry.selected !== false,
    };
  }).filter((card): card is AIUserSkillStructuredCard => Boolean(card));
}

function normalizeGenericKeyValues(value: unknown): AIUserSkillStructuredKeyValue[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index): AIUserSkillStructuredKeyValue[] => {
      if (isRecord(entry)) {
        const explicitKey = normalizeString(readAliasedValue(entry, ['key', 'name', 'title']));
        const explicitValue = stringifyGenericValue(readAliasedValue(entry, ['value', 'content', 'text']));
        if (explicitKey || explicitValue) {
          return [{ key: explicitKey || `Item ${index + 1}`, value: explicitValue }];
        }
        return Object.entries(entry)
          .map(([key, nestedValue]) => ({ key, value: stringifyGenericValue(nestedValue) }))
          .filter((item) => item.value);
      }
      const text = stringifyGenericValue(entry);
      return text ? [{ key: `Item ${index + 1}`, value: text }] : [];
    });
  }
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, entry]) => ({ key, value: stringifyGenericValue(entry) }))
      .filter((item) => item.key && item.value);
  }
  const text = stringifyGenericValue(value);
  return text ? [{ key: '内容', value: text }] : [];
}

function normalizeGenericSectionResult(
  section: AIResolvedSkillSectionDescriptor,
  value: unknown,
): AIUserSkillStructuredSectionResult {
  const text = section.renderer === 'markdown'
    ? stringifyGenericValue(value)
    : '';
  const items = section.renderer === 'list'
    ? normalizeFlexibleStringArray(value)
    : [];
  const cards = section.renderer === 'cards'
    ? normalizeGenericCards(value)
    : [];
  const keyValues = section.renderer === 'keyValue'
    ? normalizeGenericKeyValues(value)
    : [];
  return {
    id: section.id,
    responseKey: section.responseKey,
    title: section.title,
    renderer: section.renderer,
    value,
    text,
    items,
    cards,
    keyValues,
  };
}

function hasGenericSectionContent(section: AIUserSkillStructuredSectionResult): boolean {
  return Boolean(
    normalizeString(section.text)
    || section.items.length > 0
    || section.cards.length > 0
    || section.keyValues.length > 0,
  );
}

function normalizeGenericStructuredResult(
  skill: AIChatRegisteredSkillDescriptor,
  payload: unknown,
  rawContent: string,
  onlyTabId?: AISkillTabId,
): {
  result: AIUserSkillStructuredResult;
  diagnostic: AIChatNormalizationDiagnostic | null;
} {
  const raw = isRecord(payload) ? payload : {};
  const sections = (skill.sections || [])
    .filter((section) => !onlyTabId || section.id === onlyTabId)
    .map((section) => normalizeGenericSectionResult(
      section,
      readAliasedValue(raw, [section.responseKey, section.sourceId, section.id, section.title]) ?? (onlyTabId ? payload : undefined),
    ));
  const requiredSections = (skill.sections || [])
    .filter((section) => section.required && (!onlyTabId || section.id === onlyTabId));
  const missingSections = requiredSections
    .filter((section) => !sections.some((result) => result.id === section.id && hasGenericSectionContent(result)))
    .map((section) => section.title || section.responseKey);
  const hasAnyContent = sections.some(hasGenericSectionContent);
  const status: AIChatNormalizationDiagnostic['status'] = !hasAnyContent
    ? 'empty'
    : missingSections.length > 0
      ? 'partial'
      : 'full';
  return {
    result: {
      skillId: skill.id,
      sections,
      rawContent,
    },
    diagnostic: status === 'full'
      ? null
      : {
        status,
        missingSections,
        rawShape: describeRawShape(payload),
        renderer: sections[0]?.renderer || 'markdown',
      },
  };
}

function cloneConceptCoachResult(result: AIConceptCoachResult): AIConceptCoachResult {
  return JSON.parse(JSON.stringify(result)) as AIConceptCoachResult;
}

function hasTabResultContent(tabId: AISkillTabId, value: AIConceptCoachTabResult | null): boolean {
  if (value === null) {
    return false;
  }
  switch (tabId) {
    case 'working-definition':
      return typeof value === 'string' && value.trim().length > 0;
    case 'perspectives':
      return (Object.values(value as AIConceptCoachPerspectives) as AIConceptCoachPerspectiveSection[])
        .some((section) => hasPerspectiveSectionContent(section));
    case 'integrated-understanding': {
      const result = value as AIConceptCoachIntegratedUnderstanding;
      return Boolean(result.essence || result.notWhat.length > 0 || result.capabilities.length > 0);
    }
    case 'self-test-cards':
      return ((value as AIConceptCoachSelfTestCards).cards || []).length > 0;
    case 'cdf-structure':
      return hasCdfStructureContent(value as AICdfStructure);
    case 'real-world-triggers':
      return ((value as AIConceptCoachRealWorldTriggers).triggers || []).length > 0;
    default:
      return false;
  }
}

function normalizeNormalizationDiagnostic(value: unknown): AIConceptCoachNormalizationDiagnostic | null {
  if (!isRecord(value)) {
    return null;
  }
  const status = value.status === 'full' || value.status === 'partial' || value.status === 'empty'
    ? value.status
    : null;
  if (!status) {
    return null;
  }
  return {
    status,
    missingSections: Array.isArray(value.missingSections)
      ? value.missingSections.map((entry) => normalizeString(entry)).filter(Boolean)
      : [],
    rawShape: normalizeString(value.rawShape) || 'persisted-result',
  };
}

function deriveTabNormalizationDiagnostic(
  tabId: AISkillTabId,
  value: AIConceptCoachTabResult | null,
  rawShape = 'persisted-result',
): AIConceptCoachNormalizationDiagnostic | null {
  switch (tabId) {
    case 'perspectives': {
      const perspectives = value as AIConceptCoachPerspectives | null;
      if (!perspectives) {
        return buildNormalizationDiagnostic('empty', Object.keys(PERSPECTIVE_SECTION_META), rawShape);
      }
      const missingSections = (Object.keys(perspectives) as Array<keyof AIConceptCoachPerspectives>)
        .filter((sectionKey) => !hasPerspectiveSectionContent(perspectives[sectionKey]))
        .map((sectionKey) => sectionKey as string);
      const status = missingSections.length === 0
        ? 'full'
        : missingSections.length === 5
          ? 'empty'
          : 'partial';
      return buildNormalizationDiagnostic(status, missingSections, rawShape);
    }
    case 'integrated-understanding': {
      const understanding = value as AIConceptCoachIntegratedUnderstanding | null;
      const missingSections = [
        !understanding?.essence ? 'essence' : '',
        !understanding || understanding.notWhat.length === 0 ? 'notWhat' : '',
        !understanding || understanding.capabilities.length === 0 ? 'capabilities' : '',
      ].filter(Boolean);
      const status = missingSections.length === 0
        ? 'full'
        : missingSections.length === 3
          ? 'empty'
          : 'partial';
      return buildNormalizationDiagnostic(status, missingSections, rawShape);
    }
    case 'cdf-structure': {
      const cdf = value as AICdfStructure | null;
      return buildNormalizationDiagnostic(
        hasCdfStructureContent(cdf) ? 'full' : 'empty',
        hasCdfStructureContent(cdf) ? [] : ['anchors'],
        rawShape,
      );
    }
    default:
      return null;
  }
}

function tabResultFromConceptCoach(result: AIConceptCoachResult | null, tabId: AISkillTabId): AIConceptCoachTabResult | null {
  if (!result) {
    return null;
  }
  switch (tabId) {
    case 'working-definition':
      return result.workingDefinition;
    case 'perspectives':
      return result.perspectives;
    case 'integrated-understanding':
      return result.integratedUnderstanding;
    case 'self-test-cards':
      return result.selfTestCards;
    case 'cdf-structure':
      return result.cdfStructure;
    case 'real-world-triggers':
      return result.realWorldTriggers;
    default:
      return null;
  }
}

function normalizeTabResultValue(
  tabId: AISkillTabId,
  value: unknown,
  conceptCoachResult: AIConceptCoachResult | null,
): AIConceptCoachTabResult | null {
  if (value === null || value === undefined) {
    return tabResultFromConceptCoach(conceptCoachResult, tabId);
  }
  switch (tabId) {
    case 'working-definition':
      return normalizeWorkingDefinition(value);
    case 'perspectives':
      return normalizePerspectivesWithDiagnostic(value).value;
    case 'integrated-understanding':
      return normalizeIntegratedUnderstandingWithDiagnostic(value).value;
    case 'self-test-cards':
      return normalizeSelfTestCards(value, conceptCoachResult?.selfTestCards.creationMode || 'list-item');
    case 'cdf-structure':
      return normalizeCdfStructure(value);
    case 'real-world-triggers':
      return normalizeRealWorldTriggers(value);
    default:
      return tabResultFromConceptCoach(conceptCoachResult, tabId);
  }
}

function mergeTabResult(
  current: AIConceptCoachResult | null,
  tabId: AISkillTabId,
  payload: unknown,
  rawContent: string,
  selfTestCreationMode: AIConceptCoachSelfTestCreationMode = 'list-item',
): ConceptCoachNormalizationState {
  const next = current ? cloneConceptCoachResult(current) : emptyConceptCoachResult(rawContent);
  const raw = isRecord(payload) ? payload : {};
  const resolvedPayload = resolveTabPayload(raw, tabId, payload);
  const diagnostics: ConceptCoachNormalizationState['diagnostics'] = {};
  next.rawContent = rawContent;
  switch (tabId) {
    case 'working-definition':
      next.workingDefinition = normalizeWorkingDefinition(resolvedPayload);
      break;
    case 'perspectives': {
      const normalized = normalizePerspectivesWithDiagnostic(resolvedPayload);
      next.perspectives = normalized.value;
      diagnostics.perspectives = normalized.diagnostic;
      break;
    }
    case 'integrated-understanding': {
      const normalized = normalizeIntegratedUnderstandingWithDiagnostic(resolvedPayload);
      next.integratedUnderstanding = normalized.value;
      diagnostics['integrated-understanding'] = normalized.diagnostic;
      break;
    }
    case 'self-test-cards':
      next.selfTestCards = normalizeSelfTestCards(resolvedPayload, selfTestCreationMode);
      break;
    case 'cdf-structure':
      next.cdfStructure = normalizeCdfStructure(resolvedPayload);
      break;
    case 'real-world-triggers':
      next.realWorldTriggers = normalizeRealWorldTriggers(resolvedPayload);
      break;
  }
  return {
    result: next,
    diagnostics,
  };
}

function explainResultFromConceptCoach(result: AIConceptCoachResult | null): AIExplainResult | null {
  if (!result) {
    return null;
  }
  return {
    workingDefinition: result.workingDefinition,
    whatItTests: result.integratedUnderstanding.essence,
    whyItsTricky: result.perspectives.contrasts.keyPoints.join('\n'),
    connections: [
      ...result.perspectives.partsAndWhole.keyPoints,
      ...result.integratedUnderstanding.capabilities,
    ].filter(Boolean),
    triggers: result.realWorldTriggers.triggers,
    cardIdeas: result.selfTestCards.cards.map((card) => (
      `${card.summary || card.prompt || card.question || '草稿'} -> ${card.answer || ''}`
    )),
    rawContent: result.rawContent,
  };
}

function normalizeOpenSkillId(options: AIWorkbenchOpenOptions): AISkillId {
  return normalizeAIWorkbenchSkillId(options.skillId || options.view, GENERAL_SKILL);
}

function normalizeOpenTabId(options: AIWorkbenchOpenOptions): AISkillTabId {
  const skillId = normalizeOpenSkillId(options);
  return normalizeAIWorkbenchTabId(options.tabId, skillId);
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

function normalizeMessage(message: unknown, fallbackSkillId: AISkillId, fallbackTabId: AISkillTabId): AIWorkbenchMessage | null {
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

function normalizeThreadRecord(thread: unknown, skillId: AISkillId, tabId: AISkillTabId): AIWorkbenchThreads[string][string] {
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

function normalizeThreads(threads: unknown): AIWorkbenchThreads {
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

  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private currentRunAbortController: AbortController | null = null;
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
  private readonly approvalResolvers = new Map<string, {
    request: AIChatApprovalRequest;
    resolve: (value: { approved: boolean; rejectReason?: string }) => void;
  }>();

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
    this.toolExecutor = new AIChatToolExecutorService({
      registry: this.toolRegistry,
      varStore: this.varStore,
      siyuanPort: this.deps.siyuanPort,
      flashcardTools: this.flashcardTools,
      getAISettings: this.deps.getAISettings,
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

  private normalizeSelfTestCardTargetMemory(
    target: AIWorkbenchSelfTestCardTargetInput | AIWorkbenchSelfTestCardTargetMemory,
    updatedAt: number,
  ): AIWorkbenchSelfTestCardTargetMemory | null {
    const mode = target.mode === 'block' ? 'block' : 'daily-note';
    const notebookId = normalizeString(target.notebookId);
    if (!notebookId) {
      return null;
    }
    const targetBlockId = normalizeString(target.targetBlockId) || null;
    if (mode === 'block' && !targetBlockId) {
      return null;
    }
    const notebookName = normalizeString(target.notebookName) || notebookId;
    const targetLabel = normalizeString(target.targetLabel)
      || (mode === 'daily-note'
        ? `${notebookName} · 今日日记`
        : `${notebookName} · ${targetBlockId}`);
    return {
      mode,
      notebookId,
      notebookName,
      targetBlockId: mode === 'block' ? targetBlockId : null,
      targetLabel,
      updatedAt,
    };
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

  private getCdfResultMessage(messageId: string): AIWorkbenchAssistantResultMessage | null {
    return this.getConceptCoachResultMessage(messageId, 'cdf-structure');
  }

  private getCdfStructureForMessage(messageId: string): AICdfStructure {
    const message = this.getCdfResultMessage(messageId);
    if (!message) {
      return emptyCdfStructure();
    }
    const cdfStructure = (message.tabResult || message.conceptCoachResult?.cdfStructure) as AICdfStructure | null;
    return cdfStructure ? JSON.parse(JSON.stringify(cdfStructure)) as AICdfStructure : emptyCdfStructure();
  }

  private updateCdfResultMessage(
    messageId: string,
    updater: (current: AICdfStructure) => AICdfStructure,
  ): AICdfStructure | null {
    const message = this.getCdfResultMessage(messageId);
    if (!message) {
      return null;
    }
    const currentResult = this.findLatestConceptCoachResultForContext(this.state.contextSignature);
    if (!currentResult) {
      return null;
    }
    const nextCdfStructure = normalizeCdfStructure(updater(this.getCdfStructureForMessage(messageId)));
    const nextResult: AIConceptCoachResult = {
      ...cloneConceptCoachResult(currentResult),
      cdfStructure: nextCdfStructure,
    };
    this.setScopedConceptCoachResult(nextResult, this.state.contextSignature);
    this.addNodeVersion(messageId, (current) => ({
      ...(current as AIWorkbenchAssistantResultMessage),
      contextSignature: this.state.contextSignature,
      conceptCoachResult: cloneConceptCoachResult(nextResult),
      tabResult: nextCdfStructure,
      normalizationDiagnostic: deriveTabNormalizationDiagnostic('cdf-structure', nextCdfStructure, 'edited-result'),
      explainResult: explainResultFromConceptCoach(nextResult),
      rawContent: JSON.stringify({ cdfStructure: nextCdfStructure }, null, 2),
    } satisfies AIWorkbenchAssistantResultMessage));
    this.syncDerivedStateFromThreads();
    return nextCdfStructure;
  }

  private getSelectedSelfTestCardCandidates(messageId: string): AIConceptCoachCandidateCard[] {
    const creationMode = this.getSelfTestCreationMode();
    return this.getSelfTestCardsForMessage(messageId)
      .filter((card) => (
        card.selected !== false
        && normalizeString(resolveSelfTestCandidateDraftMarkdown(card, creationMode, {
          allowFallback: !isPluginSelfTestCreationMode(creationMode),
        }))
      ));
  }

  private buildModeDraftGenerationMessages(
    settings: AISettings,
    mode: AIConceptCoachSelfTestCreationMode,
    cards: AIConceptCoachCandidateCard[],
  ): LLMMessage[] {
    const descriptor = getSelfTestModeDescriptor(mode);
    const context = this.state.context;
    const payload = {
      language: settings.defaultOutputLanguage,
      mode: {
        id: descriptor.mode,
        label: descriptor.label,
        summary: descriptor.summary,
      },
      context: {
        source: context?.source || 'standalone',
        queueType: context?.queueType || null,
        queueProgress: context?.queueProgress || null,
        currentCard: context?.currentCard
          ? {
            frontText: context.currentCard.frontText,
            backText: context.currentCard.backText,
            sourceText: context.currentCard.sourceText,
          }
          : null,
        selectedBlocks: (context?.blocks || []).map((block) => ({
          blockId: block.blockId,
          type: block.type,
          hPath: block.hPath,
          text: truncateText(block.text, 320),
        })),
      },
      cards: cards.map((card) => ({
        id: card.id,
        kind: card.kind,
        summary: card.summary,
        prompt: card.prompt,
        answer: card.answer,
        details: card.details,
        clozeTargets: card.clozeTargets,
      })),
    };
    const modeRules = [
      '当前系统只保留原生自测模式，这个插件模式草稿生成功能已停用。',
      '如果调用到这里，说明存在旧路径残留；请直接返回空 cards 数组，不要尝试生成任何 draftMarkdown。',
    ];
    return [
      {
        role: 'system',
        content: [
          '你是 SiyuanMemo 的插件制卡转换器。',
          '只返回合法 JSON，不要附带 Markdown 代码块，也不要输出解释文本。',
          'JSON 顶层字段固定为 cards，格式固定为 {"cards":[{"id":"card-id","draftMarkdown":"..."}]}。',
          '每张卡都必须回填原始 id，draftMarkdown 必须忠实表达 canonical prompt / answer / details / clozeTargets，不要凭空扩写材料里没有的知识。',
          ...modeRules,
        ].join('\n'),
      },
      {
        role: 'user',
        content: JSON.stringify(payload, null, 2),
      },
    ];
  }

  private extractModeDraftsFromPayload(
    payload: unknown,
    cards: AIConceptCoachCandidateCard[],
  ): Record<string, string> {
    const requestedIds = new Set(cards.map((card) => card.id));
    const rawEntries = Array.isArray(payload)
      ? payload
      : isRecord(payload) && Array.isArray(payload.cards)
        ? payload.cards
        : [];
    const drafts: Record<string, string> = {};
    for (const rawEntry of rawEntries) {
      if (!isRecord(rawEntry)) {
        continue;
      }
      const id = normalizeString(rawEntry.id);
      const draftMarkdown = normalizeString(rawEntry.draftMarkdown ?? rawEntry.content ?? rawEntry.markdown);
      if (!id || !draftMarkdown || !requestedIds.has(id)) {
        continue;
      }
      drafts[id] = draftMarkdown;
    }
    return drafts;
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
    const requestedIds = new Set(uniqueIds(cardIds || []));
    const cards = this.getSelfTestCardsForMessage(messageId);
    const pendingCards = cards.filter((card) => (
      (requestedIds.size === 0 || requestedIds.has(card.id))
      && !normalizeString(resolveSelfTestCandidateDraftMarkdown(card, normalizedMode, { allowFallback: false }))
    ));
    if (pendingCards.length === 0) {
      return cards;
    }

    this.state.error = null;
    this.state.failureDiagnostic = null;
    const settings = this.assertModelSettings();
    const provider = this.resolveDefaultProvider(settings);
    const descriptor = getSelfTestModeDescriptor(normalizedMode);
    const response = await this.requestChatModel(
      this.buildModeDraftGenerationMessages(settings, normalizedMode, pendingCards),
      {
        settings,
        provider,
        stream: false,
      },
    );
    const payload = this.extractStructuredPayload(`${descriptor.label} 草稿生成`, response.content);
    const drafts = this.extractModeDraftsFromPayload(payload, pendingCards);
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
      const memory = this.normalizeSelfTestCardTargetMemory(target, Date.now());
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

    const memory = this.normalizeSelfTestCardTargetMemory(target, Date.now());
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
      writeMode: this.isAppendableSelfTestTarget(targetBlock) ? 'append' : 'after',
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

  private isAppendableSelfTestTarget(block: AISiyuanBlockRow): boolean {
    const type = normalizeString(block.type);
    return type === 'd' || type === 'h' || type === 'l' || type === 'i' || type === 's';
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

  private collectSelfTestMutationBlockIds(result: AISiyuanMutationResult): string[] {
    return uniqueIds(result.doOperations.map((operation) => normalizeString(operation.id)));
  }

  private async loadSelfTestMutationRows(blockIds: string[]): Promise<SelfTestCardMutationBlockRow[]> {
    const normalizedIds = uniqueIds(blockIds);
    if (normalizedIds.length === 0) {
      return [];
    }
    const escapedIds = normalizedIds.map((id) => `'${escapeSql(id)}'`).join(', ');
    return this.deps.siyuanPort.sql<SelfTestCardMutationBlockRow>(`
      SELECT id, parent_id, root_id, box, path, hpath, type, subtype, content, markdown, sort
      FROM blocks
      WHERE id IN (${escapedIds})
      ORDER BY sort ASC, id ASC
      LIMIT ${Math.max(normalizedIds.length, 1)}
    `);
  }

  private async loadSelfTestMutationSubtreeRows(rootBlockId: string): Promise<SelfTestCardMutationBlockRow[]> {
    const normalizedRootId = normalizeString(rootBlockId);
    if (!normalizedRootId) {
      return [];
    }
    return this.deps.siyuanPort.sql<SelfTestCardMutationBlockRow>(`
      WITH RECURSIVE descendants(id, parent_id, root_id, box, path, hpath, type, subtype, content, markdown, sort, depth) AS (
        SELECT id, parent_id, root_id, box, path, hpath, type, subtype, content, markdown, sort, 0
        FROM blocks
        WHERE id = '${escapeSql(normalizedRootId)}'
        UNION ALL
        SELECT b.id, b.parent_id, b.root_id, b.box, b.path, b.hpath, b.type, b.subtype, b.content, b.markdown, b.sort, descendants.depth + 1
        FROM blocks b
        INNER JOIN descendants ON b.parent_id = descendants.id
      )
      SELECT id, parent_id, root_id, box, path, hpath, type, subtype, content, markdown, sort, depth
      FROM descendants
      ORDER BY depth ASC, sort ASC, id ASC
    `);
  }

  private resolveSelfTestQuestionRootId(mutationResult: AISiyuanMutationResult): string | null {
    const operations = mutationResult.doOperations
      .map((operation) => ({
        id: normalizeString(operation.id),
        parentId: normalizeString(operation.parentID),
      }))
      .filter((operation) => Boolean(operation.id));
    if (operations.length === 0) {
      return null;
    }
    const operationById = new Map(operations.map((operation) => [operation.id, operation] as const));
    const childrenByParent = new Map<string, string[]>();
    const descendantCount = (id: string): number => {
      const children = childrenByParent.get(id) || [];
      return children.reduce((total, childId) => total + 1 + descendantCount(childId), 0);
    };
    for (const operation of operations) {
      if (!operation.parentId) {
        continue;
      }
      childrenByParent.set(operation.parentId, [...(childrenByParent.get(operation.parentId) || []), operation.id]);
    }
    const roots = operations
      .filter((operation) => !operation.parentId || !operationById.has(operation.parentId))
      .sort((left, right) => descendantCount(right.id) - descendantCount(left.id));
    const root = roots[0] || operations[0];
    const directChildren = childrenByParent.get(root.id) || [];
    if (directChildren.length === 1 && (childrenByParent.get(directChildren[0]!) || []).length > 0) {
      return directChildren[0]!;
    }
    return root.id;
  }

  private resolveSelfTestCardFieldBlocksFromKramdown(
    rootBlockId: string,
    kramdown: string,
  ): SelfTestCardFieldBlocks | null {
    const lines = String(kramdown || '').split(/\r?\n/);
    const listItemLines = lines
      .map((line, lineIndex) => {
        const match = line.match(/^(\s*)[*+-]\s+\{:\s*id="([^"]+)"/);
        if (!match) {
          return null;
        }
        return {
          id: normalizeString(match[2]),
          indent: match[1]?.length || 0,
          lineIndex,
        };
      })
      .filter((entry): entry is { id: string; indent: number; lineIndex: number } => Boolean(entry?.id));
    if (listItemLines.length === 0) {
      return null;
    }
    const attrLines = lines
      .map((line, lineIndex) => {
        const match = line.match(/^(\s*)\{:\s*id="([^"]+)"/);
        if (!match) {
          return null;
        }
        return {
          id: normalizeString(match[2]),
          indent: match[1]?.length || 0,
          lineIndex,
        };
      })
      .filter((entry): entry is { id: string; indent: number; lineIndex: number } => Boolean(entry?.id));
    const questionItem = listItemLines[0]!;
    const answerItem = listItemLines.find((entry) => (
      entry.lineIndex > questionItem.lineIndex
      && entry.indent > questionItem.indent
    )) || listItemLines[1] || null;
    if (!answerItem?.id) {
      return {
        insertedRootBlockId: rootBlockId,
        questionBlockId: rootBlockId,
        answerBlockId: rootBlockId,
      };
    }
    const questionParagraph = attrLines.find((entry) => (
      entry.lineIndex > questionItem.lineIndex
      && entry.lineIndex < answerItem.lineIndex
      && entry.indent > questionItem.indent
    ));
    const answerParagraph = attrLines.find((entry) => (
      entry.lineIndex > answerItem.lineIndex
      && entry.indent > answerItem.indent
    ));
    return {
      insertedRootBlockId: questionItem.id || rootBlockId,
      questionBlockId: questionParagraph?.id || questionItem.id || rootBlockId,
      answerBlockId: answerParagraph?.id || answerItem.id,
    };
  }

  private async waitForSelfTestFieldBlocksVisible(fields: SelfTestCardFieldBlocks): Promise<void> {
    const expectedIds = uniqueIds([
      fields.insertedRootBlockId,
      fields.questionBlockId,
      fields.answerBlockId,
    ]);
    if (expectedIds.length === 0) {
      return;
    }
    let lastVisibleCount = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const rows = await this.loadSelfTestMutationRows(expectedIds);
      const visibleIds = new Set(rows.map((row) => normalizeString(row.id)).filter(Boolean));
      lastVisibleCount = visibleIds.size;
      if (expectedIds.every((id) => visibleIds.has(id))) {
        return;
      }
      if (attempt < 11) {
        await waitFor(attempt < 4 ? 80 : 140);
      }
    }
    throw new Error(`已写入列表，但问答块尚未进入可读索引（已就绪 ${lastVisibleCount}/${expectedIds.length}）。`);
  }

  private resolveSelfTestItemAncestor(
    row: SelfTestCardMutationBlockRow,
    rowMap: Map<string, SelfTestCardMutationBlockRow>,
  ): SelfTestCardMutationBlockRow | null {
    let parentId = normalizeString(row.parent_id);
    while (parentId) {
      const parent = rowMap.get(parentId);
      if (!parent) {
        return null;
      }
      if (normalizeString(parent.type) === 'i') {
        return parent;
      }
      parentId = normalizeString(parent.parent_id);
    }
    return null;
  }

  private isDescendantMutationRow(
    row: SelfTestCardMutationBlockRow,
    ancestorId: string,
    rowMap: Map<string, SelfTestCardMutationBlockRow>,
  ): boolean {
    let parentId = normalizeString(row.parent_id);
    while (parentId) {
      if (parentId === ancestorId) {
        return true;
      }
      const parent = rowMap.get(parentId);
      if (!parent) {
        return false;
      }
      parentId = normalizeString(parent.parent_id);
    }
    return false;
  }

  private resolveSelfTestCardFieldBlocks(rows: SelfTestCardMutationBlockRow[]): SelfTestCardFieldBlocks {
    if (rows.length === 0) {
      throw new Error('已写入列表，但尚未能读取到本次新增块。');
    }
    const rowMap = new Map(rows
      .map((row) => [normalizeString(row.id), row] as const)
      .filter(([id]) => Boolean(id)));
    const itemRows = rows.filter((row) => normalizeString(row.type) === 'i' && normalizeString(row.id));
    const questionItem = itemRows.find((row) => !this.resolveSelfTestItemAncestor(row, rowMap));
    if (!questionItem?.id) {
      throw new Error('已写入列表，但未能从本次新增列表项里定位问题列表项。');
    }
    const answerItem = itemRows.find((row) => (
      row.id !== questionItem.id
      && this.isDescendantMutationRow(row, questionItem.id, rowMap)
    ));
    if (!answerItem?.id) {
      throw new Error('已写入列表，但未能从本次新增列表项里定位答案列表项。');
    }
    const questionBlock = rows.find((row) => (
      normalizeString(row.parent_id) === questionItem.id && normalizeString(row.type) === 'p'
    )) || questionItem;
    const answerBlock = rows.find((row) => (
      normalizeString(row.parent_id) === answerItem.id && normalizeString(row.type) === 'p'
    )) || answerItem;
    if (!questionBlock.id || !answerBlock.id) {
      throw new Error('已写入列表，但未能定位问题或答案块。');
    }
    return {
      insertedRootBlockId: questionItem.id,
      questionBlockId: questionBlock.id,
      answerBlockId: answerBlock.id,
    };
  }

  private async resolveSelfTestCardFieldBlocksFromMutation(
    mutationResult: AISiyuanMutationResult,
    candidate: AIConceptCoachCandidateCard,
  ): Promise<SelfTestCardFieldBlocks> {
    const mutationBlockIds = this.collectSelfTestMutationBlockIds(mutationResult);
    if (mutationBlockIds.length === 0) {
      throw new Error(`思源没有返回本次列表写入的块信息，无法继续制卡：${truncateText(candidate.question, 60)}`);
    }
    let lastError: unknown = null;
    const questionRootId = this.resolveSelfTestQuestionRootId(mutationResult);
    if (questionRootId) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const rows = await this.loadSelfTestMutationSubtreeRows(questionRootId);
        try {
          const fields = this.resolveSelfTestCardFieldBlocks(rows);
          await this.waitForSelfTestFieldBlocksVisible(fields);
          return fields;
        } catch (error) {
          lastError = error;
        }
        if (attempt < 7) {
          await waitFor(attempt < 3 ? 80 : 140);
        }
      }
      try {
        const { kramdown } = await this.deps.siyuanPort.getBlockKramdown(questionRootId);
        const fields = this.resolveSelfTestCardFieldBlocksFromKramdown(questionRootId, kramdown || '');
        if (fields) {
          await this.waitForSelfTestFieldBlocksVisible(fields);
          return fields;
        }
      } catch (error) {
        lastError = error;
      }
    }
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const rows = await this.loadSelfTestMutationRows(mutationBlockIds);
      try {
        const fields = this.resolveSelfTestCardFieldBlocks(rows);
        await this.waitForSelfTestFieldBlocksVisible(fields);
        return fields;
      } catch (error) {
        lastError = error;
      }
      if (attempt < 5) {
        await waitFor(attempt < 2 ? 80 : 140);
      }
    }
    throw new Error(
      `${toErrorMessage(lastError, '已写入列表，但未能从本次新增列表项解析出问答块。')}（候选卡：${truncateText(candidate.question, 60)}）`,
    );
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
    this.state.tree = this.state.tree || createEmptyConversationTree();
    this.state.tree.activeLeafNodeIds = this.state.tree.activeLeafNodeIds || {};
    return this.state.tree;
  }

  private getTreeNode(nodeId: string): AIWorkbenchTreeNode | null {
    const normalizedId = normalizeString(nodeId);
    if (!normalizedId) {
      return null;
    }
    return this.ensureTreeState().nodes[normalizedId] || null;
  }

  private getActiveNodeVersion(node: AIWorkbenchTreeNode) {
    return node.versions.find((version) => version.id === node.activeVersionId)
      || node.versions[node.versions.length - 1]
      || null;
  }

  private getNodeMessage(node: AIWorkbenchTreeNode): AIWorkbenchMessage | null {
    const version = this.getActiveNodeVersion(node);
    if (!version) {
      return null;
    }
    return cloneMessagePayload({
      ...version.message,
      id: node.id,
      skillId: node.skillId,
      tabId: node.tabId,
    });
  }

  private resolveViewLeafId(skillId: AISkillId, tabId: AISkillTabId): string | null {
    const tree = this.ensureTreeState();
    const exactKey = createTreeViewKey(skillId, tabId);
    if (tree.activeLeafNodeIds?.[exactKey]) {
      return tree.activeLeafNodeIds[exactKey] || null;
    }
    const fallbackNode = Object.values(tree.nodes)
      .filter((node) => this.shouldIncludeNodeInView(node, skillId, tabId))
      .sort((left, right) => left.createdAt - right.createdAt)
      .at(-1);
    return fallbackNode?.id || tree.activeLeafNodeId || tree.rootNodeId || null;
  }

  private syncTreeLeafWithActiveView(): void {
    const leafId = this.resolveViewLeafId(this.state.activeSkillId, this.state.activeTabId);
    this.ensureTreeState().activeLeafNodeId = leafId;
  }

  private shouldIncludeNodeInView(node: AIWorkbenchTreeNode, skillId: AISkillId, tabId: AISkillTabId): boolean {
    if (node.skillId !== skillId) {
      return false;
    }
    if (skillId === GENERAL_SKILL) {
      return true;
    }
    return node.scope === 'skill' || node.tabId === tabId;
  }

  private getProjectedMessagesForView(
    skillId: AISkillId,
    tabId: AISkillTabId,
  ): AIWorkbenchMessage[] {
    const tree = this.ensureTreeState();
    const path = traceTreePath(tree, this.resolveViewLeafId(skillId, tabId));
    const messages = path
      .map((nodeId) => tree.nodes[nodeId])
      .filter((node): node is AIWorkbenchTreeNode => Boolean(node))
      .filter((node) => this.shouldIncludeNodeInView(node, skillId, tabId))
      .map((node) => this.getNodeMessage(node))
      .filter((message): message is AIWorkbenchMessage => Boolean(message));
    if (!this.isContextScopedConceptTab(skillId, tabId)) {
      return messages;
    }
    const currentSignature = normalizeString(this.state.contextSignature);
    if (!currentSignature) {
      return messages;
    }
    return messages.filter((message) => normalizeString(message.contextSignature) === currentSignature);
  }

  private getModelContextMessagesForView(
    skillId: AISkillId,
    tabId: AISkillTabId,
  ): AIWorkbenchMessage[] {
    const tree = this.ensureTreeState();
    const pathNodes = traceTreePath(tree, this.resolveViewLeafId(skillId, tabId))
      .map((nodeId) => tree.nodes[nodeId])
      .filter((node): node is AIWorkbenchTreeNode => Boolean(node))
      .filter((node) => this.shouldIncludeNodeInView(node, skillId, tabId));
    const lastSeparatorIndex = [...pathNodes]
      .map((node, index) => ({ node, index }))
      .filter(({ node }) => node.kind === 'separator')
      .at(-1)?.index ?? -1;
    const selectedNodeIds = new Set<string>();
    const nodesForContext = [
      ...pathNodes.slice(0, lastSeparatorIndex + 1).filter((node) => node.pinned),
      ...pathNodes.slice(lastSeparatorIndex + 1),
    ]
      .filter((node) => node.kind === 'message' && !node.hidden)
      .filter((node) => {
        if (selectedNodeIds.has(node.id)) {
          return false;
        }
        selectedNodeIds.add(node.id);
        return true;
      });
    return nodesForContext
      .map((node) => this.getNodeMessage(node))
      .filter((message): message is AIWorkbenchMessage => Boolean(message));
  }

  private rebuildProjectedThreads(): void {
    const previous = this.state.threads;
    const next = createInitialThreads();
    const knownEntries = new Map<string, { skillId: AISkillId; tabId: AISkillTabId }>();

    for (const [skillId, skillThreads] of Object.entries(previous)) {
      for (const tabId of Object.keys(skillThreads || {})) {
        knownEntries.set(createTreeViewKey(skillId as AISkillId, tabId as AISkillTabId), {
          skillId: skillId as AISkillId,
          tabId: tabId as AISkillTabId,
        });
      }
    }
    for (const node of Object.values(this.ensureTreeState().nodes)) {
      knownEntries.set(createTreeViewKey(node.skillId, node.tabId), {
        skillId: node.skillId,
        tabId: node.tabId,
      });
      if (node.scope === 'skill') {
        for (const tabId of getSkillTabIds(node.skillId, node.tabId)) {
          knownEntries.set(createTreeViewKey(node.skillId, tabId), {
            skillId: node.skillId,
            tabId,
          });
        }
      }
    }

    for (const { skillId, tabId } of knownEntries.values()) {
      next[skillId] = next[skillId] || {};
      const previousThread = previous[skillId]?.[tabId] || createEmptyThreadRecord(skillId, tabId);
      const messages = this.getProjectedMessagesForView(skillId, tabId);
      const latestContextSignature = [...messages]
        .reverse()
        .map((message) => normalizeString(message.contextSignature))
        .find(Boolean) || null;
      next[skillId][tabId] = {
        ...previousThread,
        skillId,
        tabId,
        messages,
        resultContextSignature: latestContextSignature,
        stale: Boolean(
          this.isContextScopedConceptTab(skillId, tabId)
          && latestContextSignature
          && this.state.contextSignature
          && latestContextSignature !== this.state.contextSignature,
        ),
        staleReason: this.isContextScopedConceptTab(skillId, tabId)
          && latestContextSignature
          && this.state.contextSignature
          && latestContextSignature !== this.state.contextSignature
          ? '当前上下文已变化，请重新运行这个阶段以获得最新结果。'
          : null,
      };
    }

    this.state.threads = next;
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
    const skillId = this.normalizeSkillForCurrentSettings(message.skillId || this.state.activeSkillId, this.state.activeSkillId);
    const normalizedTabId = this.normalizeTabForCurrentSettings(tabId, skillId);
    const tree = this.ensureTreeState();
    const scope = options?.scope || (skillId === GENERAL_SKILL ? 'skill' : 'tab');
    const payload = cloneMessagePayload({
      ...message,
      id: normalizeString(message.id) || createEntryId('ai-msg'),
      skillId,
      tabId: normalizedTabId,
      view: message.view || skillId,
      contextSignature: this.isContextScopedConceptTab(skillId, normalizedTabId)
        ? normalizeString(message.contextSignature) || this.state.contextSignature
        : normalizeString(message.contextSignature) || null,
    } as AIWorkbenchMessage);
    const parentNodeId = options?.parentNodeId === undefined
      ? this.resolveViewLeafId(skillId, normalizedTabId)
      : options.parentNodeId;
    const versionId = `${payload.id}::v${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const node: AIWorkbenchTreeNode = {
      id: payload.id,
      kind: getMessageNodeKind(payload),
      skillId,
      tabId: normalizedTabId,
      scope,
      parentId: parentNodeId || null,
      childIds: [],
      createdAt: payload.createdAt,
      hidden: false,
      pinned: false,
      status: 'ready',
      activeVersionId: versionId,
      versions: [{
        id: versionId,
        createdAt: Date.now(),
        message: payload,
      }],
    };
    tree.nodes[node.id] = node;
    if (!tree.rootNodeId) {
      tree.rootNodeId = node.id;
    }
    if (node.parentId && tree.nodes[node.parentId] && !tree.nodes[node.parentId].childIds.includes(node.id)) {
      tree.nodes[node.parentId].childIds.push(node.id);
    }
    const updateTabIds = options?.updateTabIds || (scope === 'skill' ? getSkillTabIds(skillId, normalizedTabId) : [normalizedTabId]);
    for (const affectedTabId of updateTabIds) {
      tree.activeLeafNodeIds![createTreeViewKey(skillId, affectedTabId)] = node.id;
    }
    if (options?.activateView !== false) {
      tree.activeLeafNodeId = node.id;
    }
    this.rebuildProjectedThreads();
    return node;
  }

  private addNodeVersion(
    messageId: string,
    updater: (message: AIWorkbenchMessage) => AIWorkbenchMessage,
    options?: { status?: AIWorkbenchTreeNode['status'] },
  ): AIWorkbenchMessage | null {
    const node = this.getTreeNode(messageId);
    if (!node) {
      return null;
    }
    const currentMessage = this.getNodeMessage(node);
    if (!currentMessage) {
      return null;
    }
    const nextMessage = cloneMessagePayload(updater(currentMessage));
    nextMessage.id = node.id;
    nextMessage.skillId = node.skillId;
    nextMessage.tabId = node.tabId;
    const versionId = `${node.id}::v${node.versions.length + 1}`;
    node.versions.push({
      id: versionId,
      createdAt: Date.now(),
      message: nextMessage,
    });
    node.activeVersionId = versionId;
    if (options?.status) {
      node.status = options.status;
    }
    this.rebuildProjectedThreads();
    return nextMessage;
  }

  private patchActiveNodeMessage(
    messageId: string,
    updater: (message: AIWorkbenchMessage) => AIWorkbenchMessage,
    options?: { status?: AIWorkbenchTreeNode['status'] },
  ): AIWorkbenchMessage | null {
    const node = this.getTreeNode(messageId);
    const version = node ? this.getActiveNodeVersion(node) : null;
    if (!node || !version) {
      return null;
    }
    const nextMessage = cloneMessagePayload(updater(version.message));
    nextMessage.id = node.id;
    nextMessage.skillId = node.skillId;
    nextMessage.tabId = node.tabId;
    version.message = nextMessage;
    if (options?.status) {
      node.status = options.status;
    }
    this.rebuildProjectedThreads();
    return nextMessage;
  }

  private isRenderablePrimaryMessage(message: AIWorkbenchMessage): boolean {
    if (message.kind === 'tool-log' || message.kind === 'approval') {
      return false;
    }
    if (message.kind === 'assistant-text' && message.presentation === 'supplemental') {
      return false;
    }
    return true;
  }

  private isSupplementalMessage(messages: AIWorkbenchMessage[], index: number): boolean {
    const message = messages[index];
    if (!message) {
      return false;
    }
    if (message.kind === 'tool-log' || message.kind === 'approval') {
      return true;
    }
    if (message.kind !== 'assistant-text') {
      return false;
    }
    if (message.presentation === 'supplemental') {
      return true;
    }
    const nextMessage = messages[index + 1] || null;
    return Boolean(nextMessage && (nextMessage.kind === 'tool-log' || nextMessage.kind === 'approval'));
  }

  private createRenderEntry(
    primaryMessage: AIWorkbenchMessage,
    supplementalMessages: AIWorkbenchMessage[],
  ): AIWorkbenchRenderEntry {
    const nextSupplementalMessages = supplementalMessages.filter((message) => message.id !== primaryMessage.id);
    return {
      key: `${primaryMessage.id}::render`,
      primaryMessage,
      supplementalMessages: nextSupplementalMessages,
      stepCount: nextSupplementalMessages.length,
      pendingApproval: nextSupplementalMessages.find((message): message is AIWorkbenchApprovalMessage => (
        message.kind === 'approval' && message.request.status === 'pending'
      )) || null,
    };
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
    this.currentRunAbortController?.abort();
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
    const settings = normalizeAISettings(this.deps.getAISettings());
    const provider = this.resolveDefaultProvider(settings);
    return [provider.name, settings.defaultModelId || settings.model].map(normalizeString).filter(Boolean).join(' · ') || '未配置模型';
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
    const memory = this.normalizeSelfTestCardTargetMemory(target, Date.now());
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
    const memory = this.normalizeSelfTestCardTargetMemory(target, Date.now());
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
    const memory = this.normalizeSelfTestCardTargetMemory(target, Date.now());
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
        const response = await this.requestConceptCoachResult(attachedContexts);
        this.appendConceptCoachFullResult(response.content, attachedContexts);
        return;
      }
      const response = await this.requestGenericStructuredResult(skill, attachedContexts);
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
        const response = await this.requestConceptCoachTabResult(tabId, attachedContexts);
        this.appendConceptCoachTabResult(tabId, response.content, attachedContexts);
        return;
      }
      const response = await this.requestGenericStructuredTabResult(skill, tabId, attachedContexts);
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
        const response = await this.requestConceptCoachResult(attachedContexts, question);
        this.appendConceptCoachFullResult(response.content, attachedContexts, sourceNode.id);
      } else {
        const response = await this.requestGenericStructuredResult(skill, attachedContexts, question);
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
        ? await this.requestFollowUp(tabId, attachedContexts)
        : await this.requestGenericFollowUp(skill, tabId, attachedContexts);
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
      await this.runGeneralChatToolLoop(
        skill,
        tabId,
        attachedContexts,
        runGroupId,
        sourceUserMessageId,
        (messageId) => {
          primaryAssistantMessageId = messageId;
        },
      );
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

  private async runGeneralChatToolLoop(
    skill: AIChatRegisteredSkillDescriptor,
    tabId: AISkillTabId,
    attachedContexts: AIAttachedContextItem[],
    runGroupId: string,
    requestSourceMessageId: string,
    onPrimaryAssistantMessage?: (messageId: string) => void,
  ): Promise<void> {
    const settings = this.assertModelSettings();
    const provider = this.resolveDefaultProvider(settings);
    const enabledTools = this.toolExecutor.getEnabledToolDefinitions(skill.defaultToolGroups);
    const llmMessages: LLMMessage[] = this.buildGeneralChatMessages(
      settings,
      skill,
      tabId,
      attachedContexts,
      this.toolExecutor.buildToolRules(skill.defaultToolGroups),
    );
    const maxRounds = Math.max(1, settings.chatDefaults.maxToolRounds || 4);
    const maxToolCalls = Math.max(6, maxRounds * 4);
    const repeatedToolCalls = new Map<string, number>();
    let totalToolCalls = 0;
    let toolBudgetReached = false;

    for (let round = 0; round < maxRounds; round += 1) {
      this.ensureRunNotAborted();
      const assistantMessageId = createEntryId('ai-msg');
      const placeholderNode = this.appendNodeMessage(tabId, {
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
        response = await this.requestChatModel(llmMessages, {
          settings,
          provider,
          tools: enabledTools,
          observer: {
            onTextDelta: (delta) => {
              if (!delta) {
                return;
              }
              this.patchActiveNodeMessage(assistantMessageId, (message) => ({
                ...(message as AIWorkbenchAssistantTextMessage),
                content: `${(message as AIWorkbenchAssistantTextMessage).content || ''}${delta}`,
              } satisfies AIWorkbenchAssistantTextMessage), { status: 'streaming' });
            },
            onReasoningDelta: (delta) => {
              if (!delta) {
                return;
              }
              this.patchActiveNodeMessage(assistantMessageId, (message) => ({
                ...(message as AIWorkbenchAssistantTextMessage),
                reasoningContent: `${(message as AIWorkbenchAssistantTextMessage).reasoningContent || ''}${delta}`,
              } satisfies AIWorkbenchAssistantTextMessage), { status: 'streaming' });
            },
            onDiagnostic: (diagnostic) => {
              if (!diagnostic) {
                return;
              }
              this.patchActiveNodeMessage(assistantMessageId, (message) => ({
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
          this.patchActiveNodeMessage(assistantMessageId, (entry) => ({
            ...(entry as AIWorkbenchAssistantTextMessage),
            interrupted: true,
          } satisfies AIWorkbenchAssistantTextMessage), { status: 'interrupted' });
        }
        throw error;
      }
      const assistantContent = normalizeString(response.content);
      const toolCalls = response.toolCalls || [];
      if (toolCalls.length === 0) {
        this.patchActiveNodeMessage(assistantMessageId, (message) => ({
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

      this.patchActiveNodeMessage(assistantMessageId, (message) => ({
        ...(message as AIWorkbenchAssistantTextMessage),
        content: assistantContent || '我先调用几步工具来补全信息。',
        sourceContent: assistantContent || (message as AIWorkbenchAssistantTextMessage).sourceContent || null,
        reasoningContent: response.reasoningContent || (message as AIWorkbenchAssistantTextMessage).reasoningContent || null,
        diagnostics: response.diagnostics || (message as AIWorkbenchAssistantTextMessage).diagnostics || [],
        interrupted: false,
        presentation: 'supplemental',
      } satisfies AIWorkbenchAssistantTextMessage), { status: 'ready' });

      for (const llmToolCall of toolCalls) {
        this.ensureRunNotAborted();
        const toolCall = this.toRuntimeToolCall(llmToolCall);
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
          result = await this.toolExecutor.executeToolCall(toolCall, {
            context: this.state.context,
            attachedContexts,
          }, {
            roundIndex: round + 1,
            llmUsage: response.usage,
            approvals: {
              requestApproval: (request) => this.requestInlineToolApproval({
                ...request,
                runGroupId,
                skillId: skill.id,
                tabId,
              }),
            },
          });
        }
        this.ensureRunNotAborted();
        this.state.toolTimeline.push(result);
        this.appendToolLogMessage(result, skill.id, tabId, runGroupId);
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

  private ensureRunNotAborted(): void {
    if (this.currentRunAbortController?.signal.aborted) {
      throw new Error('当前 AI 运行已停止。');
    }
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
      group: this.toolRegistry.get(toolCall.name, settings)?.group || 'vars',
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
    const placeholderNode = this.appendNodeMessage(tabId, {
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

    const response = await this.requestChatModel([
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
          this.patchActiveNodeMessage(assistantMessageId, (message) => ({
            ...(message as AIWorkbenchAssistantTextMessage),
            content: `${(message as AIWorkbenchAssistantTextMessage).content || ''}${delta}`,
          } satisfies AIWorkbenchAssistantTextMessage), { status: 'streaming' });
        },
        onReasoningDelta: (delta) => {
          if (!delta) {
            return;
          }
          this.patchActiveNodeMessage(assistantMessageId, (message) => ({
            ...(message as AIWorkbenchAssistantTextMessage),
            reasoningContent: `${(message as AIWorkbenchAssistantTextMessage).reasoningContent || ''}${delta}`,
          } satisfies AIWorkbenchAssistantTextMessage), { status: 'streaming' });
        },
        onDiagnostic: (diagnostic) => {
          if (!diagnostic) {
            return;
          }
          this.patchActiveNodeMessage(assistantMessageId, (message) => ({
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
    this.patchActiveNodeMessage(assistantMessageId, (message) => ({
      ...(message as AIWorkbenchAssistantTextMessage),
      content: assistantContent,
      sourceContent: assistantContent,
      reasoningContent: response.reasoningContent || (message as AIWorkbenchAssistantTextMessage).reasoningContent || null,
      diagnostics: response.diagnostics || (message as AIWorkbenchAssistantTextMessage).diagnostics || [],
      interrupted: false,
      presentation: 'primary',
    } satisfies AIWorkbenchAssistantTextMessage), { status: 'ready' });
  }

  private stripToolChainSummaryFromContent(content: string): string {
    return normalizeString(content)
      .replace(/<tool-chain-summary>[\s\S]*?<\/tool-chain-summary>/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private toGeneralChatHistoryMessage(entry: AIWorkbenchRenderEntry): LLMMessage | null {
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
    const content = this.stripToolChainSummaryFromContent(primary.sourceContent || primary.content);
    return content ? { role: 'assistant', content } : null;
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
    const threads = createInitialThreads();
    const skill = this.getResolvedSkill(this.state.activeSkillId);
    threads[skill.id] = threads[skill.id] || {};
    for (const tab of skill.tabs) {
      threads[skill.id][tab.id] = threads[skill.id][tab.id] || createEmptyThreadRecord(skill.id, tab.id);
    }
    return {
      id: createEntryId('ai-session'),
      title: this.generateSessionTitle(context),
      source: context.source,
      sourceReviewSessionId: this.state.sourceReviewSessionId,
      reviewChatKey: this.state.reviewChatKey,
      surface: this.state.surface,
      contextSignature,
      createdAt: now,
      updatedAt: now,
      activeSkillId: this.state.activeSkillId,
      activeTabId: this.state.activeTabId,
      activeSkills: [],
      messageCount: 0,
      lastActiveView: this.state.activeSkillId,
      activeViews: [],
      context,
      schemaVersion: 5,
      messages: [],
      threads,
      tree: createEmptyConversationTree(),
      skillResults: { [GENERAL_SKILL]: null, [CONCEPT_SKILL]: null },
      conceptCoachResultsByContext: {},
      genericSkillResults: {},
      vars: [],
      diagnostics: [],
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
    this.approvalResolvers.clear();
    this.state.sessionId = record.id;
    this.state.sessionTitle = record.title;
    this.state.surface = normalizeSurface(record.surface);
    this.state.sourceReviewSessionId = record.sourceReviewSessionId;
    this.state.reviewChatKey = normalizeString(record.reviewChatKey)
      || deriveReviewChatKey(record.context || null);
    this.state.context = record.context;
    this.state.contextSignature = record.contextSignature;
    this.state.liveContext = liveContext;
    this.state.contextIsHistorical = Boolean(
      record.contextSignature
      && liveContext
      && record.contextSignature !== buildContextSignature(liveContext)
    );
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

  private buildPromptPayload(input: {
    attachedContexts: AIAttachedContextItem[];
    userPrompt?: string;
    tabId?: AISkillTabId;
  }): Record<string, unknown> {
    const context = this.requireContext();
    const tabId = input.tabId ? normalizeAIWorkbenchTabId(input.tabId) : null;
    const selfTestMode = this.getSelfTestCreationMode();
    const selfTestDescriptor = getSelfTestModeDescriptor(selfTestMode);
    return {
      language: this.deps.getAISettings().defaultOutputLanguage,
      skillId: ACTIVE_SKILL,
      contextSignature: this.state.contextSignature,
      tabIds: tabId ? [tabId] : [...AI_CONCEPT_COACH_TAB_IDS],
      ...(tabId ? {
        tabId,
        currentTabResult: tabResultFromConceptCoach(this.state.skillResults[ACTIVE_SKILL], tabId),
      } : {}),
      attachedContexts: input.attachedContexts,
      ...(normalizeString(input.userPrompt) ? { userPrompt: normalizeString(input.userPrompt) } : {}),
      selfTestConfig: {
        creationMode: selfTestMode,
        label: selfTestDescriptor.label,
        summary: selfTestDescriptor.summary,
      },
      context: {
        source: context.source,
        queueType: context.queueType,
        queueProgress: context.queueProgress,
        currentCard: context.currentCard,
        neuralBatch: context.neuralBatch,
        selectedBlocks: context.blocks,
      },
    };
  }

  private buildGeneralChatMessages(
    settings: AISettings,
    skill: AIChatRegisteredSkillDescriptor,
    tabId: AISkillTabId,
    attachedContexts: AIAttachedContextItem[],
    toolRules = '',
  ): LLMMessage[] {
    const context = this.state.context;
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

    const historyMessages = this.getRenderEntries(undefined, tabId)
      .map((entry) => this.toGeneralChatHistoryMessage(entry))
      .filter((message): message is LLMMessage => Boolean(message))
      .slice(-12);
    return [systemMessage, ...historyMessages];
  }

  private resolveDefaultProvider(settings: AISettings): AIProviderConfig {
    const matched = settings.providers.find((provider) => (
      provider.models.some((model) => model.id === settings.defaultModelId || model.id === settings.model)
    ));
    return matched || settings.providers[0];
  }

  private async requestChatModel(
    messages: LLMMessage[],
    input: {
      settings: AISettings;
      provider: AIProviderConfig;
      tools?: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }>;
      observer?: Parameters<NonNullable<LLMPort['chat']>>[0]['observer'];
      stream?: boolean;
    },
  ): Promise<LLMResponse> {
    const settings = input.settings;
    const provider = input.provider;
    this.currentRunAbortController = new AbortController();
    try {
      return await this.deps.llmPort.chat({
        baseUrl: provider.baseUrl || settings.baseUrl,
        apiKey: provider.apiKey || settings.apiKey,
        model: settings.defaultModelId || settings.model,
        provider,
        protocol: provider.protocol,
        modelRef: {
          providerId: provider.id,
          modelId: settings.defaultModelId || settings.model,
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
        throw this.fail(this.mapLlmError(error));
      }
      throw error;
    } finally {
      this.currentRunAbortController = null;
    }
  }

  private toRuntimeToolCall(toolCall: LLMToolCall): AIChatToolCall {
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

  private async requestConceptCoachResult(
    attachedContexts: AIAttachedContextItem[],
    userPrompt?: string,
  ): Promise<LLMResponse> {
    const context = this.requireContext();
    this.assertConceptCoachAllowed(context);
    return this.requestStructuredModel(
      this.buildPromptPayload({ attachedContexts, userPrompt }),
    );
  }

  private async requestConceptCoachTabResult(
    tabId: AISkillTabId,
    attachedContexts: AIAttachedContextItem[],
  ): Promise<LLMResponse> {
    const context = this.requireContext();
    this.assertConceptCoachAllowed(context);
    return this.requestStructuredModel(
      this.buildPromptPayload({ attachedContexts, tabId }),
      tabId,
    );
  }

  private buildGenericStructuredPromptPayload(input: {
    skill: AIChatRegisteredSkillDescriptor;
    attachedContexts: AIAttachedContextItem[];
    userPrompt?: string;
    tabId?: AISkillTabId;
  }): Record<string, unknown> {
    const context = this.requireContext();
    const tabId = input.tabId ? this.normalizeTabForCurrentSettings(input.tabId, input.skill.id) : null;
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
        currentTabResult: this.state.genericSkillResults[input.skill.id]?.sections.find((section) => section.id === tabId) || null,
      } : {}),
      attachedContexts: input.attachedContexts,
      ...(normalizeString(input.userPrompt) ? { userPrompt: normalizeString(input.userPrompt) } : {}),
      context: {
        source: context.source,
        queueType: context.queueType,
        queueProgress: context.queueProgress,
        currentCard: context.currentCard,
        neuralBatch: context.neuralBatch,
        selectedBlocks: context.blocks,
      },
    };
  }

  private async requestGenericStructuredResult(
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

  private async requestGenericStructuredTabResult(
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

  private async requestStructuredModel(
    payload: Record<string, unknown>,
    tabId?: AISkillTabId,
    skill: AIChatRegisteredSkillDescriptor = this.getResolvedSkill(ACTIVE_SKILL),
  ): Promise<LLMResponse> {
    const settings = this.assertModelSettings();
    const provider = this.resolveDefaultProvider(settings);
    this.currentRunAbortController = new AbortController();
    try {
      return await this.deps.llmPort.chat({
        baseUrl: provider.baseUrl || settings.baseUrl,
        apiKey: provider.apiKey || settings.apiKey,
        model: settings.defaultModelId || settings.model,
        provider,
        protocol: provider.protocol,
        modelRef: {
          providerId: provider.id,
          modelId: settings.defaultModelId || settings.model,
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
        throw this.fail(this.mapLlmError(error));
      }
      throw error;
    } finally {
      this.currentRunAbortController = null;
    }
  }

  private async requestFollowUp(
    tabId: AISkillTabId,
    attachedContexts: AIAttachedContextItem[] = [],
  ): Promise<LLMResponse> {
    const context = this.requireContext();
    const settings = this.assertModelSettings();
    const provider = this.resolveDefaultProvider(settings);
    const tabResult = tabResultFromConceptCoach(this.findLatestConceptCoachResultForContext(this.state.contextSignature), tabId);
    if (!tabResult) {
      throw this.fail('当前阶段没有可追问的结构化结果。');
    }
    const prompts = settings.prompts.skills.conceptCoach;
    this.currentRunAbortController = new AbortController();
    try {
      return await this.deps.llmPort.chat({
        baseUrl: provider.baseUrl || settings.baseUrl,
        apiKey: provider.apiKey || settings.apiKey,
        model: settings.defaultModelId || settings.model,
        provider,
        protocol: provider.protocol,
        modelRef: {
          providerId: provider.id,
          modelId: settings.defaultModelId || settings.model,
        },
        timeoutMs: settings.timeoutMs,
        temperature: settings.temperature,
        messages: [
          {
            role: 'system',
            content: [
              this.getResolvedSkill(this.state.activeSkillId).systemPromptTemplate,
              this.getArenaRuntimeOverrides(this.state.activeSkillId).tabFollowUpPrompts?.[tabId],
              prompts.tabs[tabId].followUp,
            ].map((part) => normalizeString(part)).filter(Boolean).join('\n\n'),
          },
          {
            role: 'user',
            content: JSON.stringify({
              language: settings.defaultOutputLanguage,
              skillId: ACTIVE_SKILL,
              contextSignature: this.state.contextSignature,
              tabId,
              tabResult,
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
          ...this.getFollowUps(undefined, tabId).map((entry) => ({
            role: entry.role,
            content: entry.content,
          })),
        ],
        abortSignal: this.currentRunAbortController.signal,
      });
    } catch (error) {
      if (error instanceof LLMError) {
        this.captureFailureDiagnostic(error);
        throw this.fail(this.mapLlmError(error));
      }
      throw error;
    } finally {
      this.currentRunAbortController = null;
    }
  }

  private async requestGenericFollowUp(
    skill: AIChatRegisteredSkillDescriptor,
    tabId: AISkillTabId,
    attachedContexts: AIAttachedContextItem[] = [],
  ): Promise<LLMResponse> {
    const context = this.requireContext();
    const settings = this.assertModelSettings();
    const provider = this.resolveDefaultProvider(settings);
    const section = (skill.sections || []).find((entry) => entry.id === tabId);
    const tabResult = this.state.genericSkillResults[skill.id]?.sections.find((entry) => entry.id === tabId) || null;
    if (!section || !tabResult) {
      throw this.fail('当前 section 没有可追问的结构化结果。');
    }
    this.currentRunAbortController = new AbortController();
    try {
      return await this.deps.llmPort.chat({
        baseUrl: provider.baseUrl || settings.baseUrl,
        apiKey: provider.apiKey || settings.apiKey,
        model: settings.defaultModelId || settings.model,
        provider,
        protocol: provider.protocol,
        modelRef: {
          providerId: provider.id,
          modelId: settings.defaultModelId || settings.model,
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
          ...this.getFollowUps(undefined, tabId).map((entry) => ({
            role: entry.role,
            content: entry.content,
          })),
        ],
        abortSignal: this.currentRunAbortController.signal,
      });
    } catch (error) {
      if (error instanceof LLMError) {
        this.captureFailureDiagnostic(error);
        throw this.fail(this.mapLlmError(error));
      }
      throw error;
    } finally {
      this.currentRunAbortController = null;
    }
  }

  private assertModelSettings(): AISettings {
    const settings = normalizeAISettings(this.deps.getAISettings());
    if (!settings.enabled) {
      throw this.fail('请先在设置中启用 AI 功能。');
    }
    if (!settings.apiKey.trim()) {
      throw this.fail('请先在设置中填写 AI API Key。');
    }
    if (!settings.baseUrl.trim() || !settings.model.trim()) {
      throw this.fail('AI Base URL 或模型名未配置。');
    }
    return {
      ...settings,
      prompts: normalizeAIPromptTemplates(settings.prompts),
    };
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
    const arenaOverrides = this.getArenaRuntimeOverrides(skill.id);
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

  private extractStructuredPayload(taskLabel: string, rawContent: string): unknown {
    try {
      return extractJsonPayload(rawContent);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.state.failureDiagnostic = {
        content: [
          'Diagnostic type: invalid_json',
          `Task: ${taskLabel}`,
          `Reason: ${reason}`,
          'Response body:',
          rawContent.trim() || '<empty body>',
        ].join('\n'),
      };
      throw this.fail(`${taskLabel}返回的内容不是合法 JSON。请检查设置里的 AI 理解与制卡 Prompt 是否把系统结构化输出要求冲掉了。原始原因：${reason}`);
    }
  }

  private assertConceptCoachAllowed(context: AIWorkbenchContextSnapshot): void {
    if (
      context.source === 'review'
      && context.currentCard
      && context.currentCard.explainRequiresReveal
      && !context.currentCard.revealed
    ) {
      throw this.fail('请先揭示答案，再使用 AI 理解与制卡。');
    }
  }

  private appendConceptCoachFullResult(
    rawContent: string,
    appliedContexts: AIAttachedContextItem[],
    parentNodeId?: string | null,
  ): void {
    const payload = this.extractStructuredPayload('AI 理解与制卡', rawContent);
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
    const payload = this.extractStructuredPayload(this.getActiveTabDescriptor().title, rawContent);
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
    const payload = this.extractStructuredPayload(skill.title, rawContent);
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
    const payload = this.extractStructuredPayload(this.getActiveTabDescriptor().title, rawContent);
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
    const normalizedTabIds = tabIds.map((tabId) => this.normalizeTabForCurrentSettings(tabId, skillId));
    const tabs = this.getSkillTabs();
    const tabTitle = (tabId: AISkillTabId) => tabs.find((tab) => tab.id === tabId)?.title || this.getActiveTabDescriptor().title;
    if (mode === 'chat' || mode === 'tool-chain') {
      return {
        mode,
        skillId,
        tabIds: normalizedTabIds,
        activeTabId: CHAT_TAB,
        title: mode === 'tool-chain' ? 'AI 正在运行工具' : 'AI 正在思考',
        description: mode === 'tool-chain'
          ? '正在根据模型请求执行可用工具，并把结果带回同一会话。'
          : '正在结合当前上下文、会话历史和已启用工具生成回复。',
        startedAt: Date.now(),
      };
    }
    if (mode === 'tab-rerun') {
      const targetTabId = normalizedTabIds[0] || this.state.activeTabId;
      const title = tabTitle(targetTabId);
      return {
        mode,
        skillId,
        tabIds: normalizedTabIds,
        activeTabId: targetTabId,
        title: 'AI 正在重跑当前阶段',
        description: `只会更新「${title}」，其他阶段保持不变。`,
        startedAt: Date.now(),
      };
    }
    if (mode === 'follow-up') {
      const targetTabId = normalizedTabIds[0] || this.state.activeTabId;
      const title = tabTitle(targetTabId);
      return {
        mode,
        skillId,
        tabIds: normalizedTabIds,
        activeTabId: targetTabId,
        title: 'AI 正在回应追问',
        description: `只携带「${title}」结果和本次补充上下文。`,
        startedAt: Date.now(),
      };
    }
    return {
      mode,
      skillId,
      tabIds: normalizedTabIds,
      activeTabId: this.state.activeTabId,
      title: 'AI 正在理解材料',
      description: `正在生成 ${tabs.length} 个阶段：${tabs.map((tab) => tab.title).join('、')}`,
      startedAt: Date.now(),
    };
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

  private generateSessionTitle(context: AIWorkbenchContextSnapshot): string {
    if (context.source === 'review') {
      const queueLabel = normalizeString(context.queueProgress?.queueLabel);
      if (queueLabel) {
        return this.truncateTitle(`${queueLabel} · AI 会话`);
      }
      const queueType = normalizeString(context.queueType);
      if (queueType) {
        return this.truncateTitle(`${queueType} · AI 会话`);
      }
    }
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
    const tree = this.ensureTreeState();
    const messageCount = Object.values(tree.nodes).filter((node) => node.kind === 'message').length;
    const activeSkills: AISkillId[] = Array.from(new Set(
      Object.values(tree.nodes)
        .filter((node) => node.kind === 'message')
        .map((node) => node.skillId),
    ));
    return {
      schemaVersion: 5,
      id: sessionId,
      title: normalizeString(this.state.sessionTitle) || '未命名会话',
      source: this.state.context?.source || this.state.liveContext?.source || 'standalone',
      sourceReviewSessionId: this.state.sourceReviewSessionId,
      reviewChatKey: this.state.reviewChatKey,
      surface: this.state.surface,
      contextSignature: this.state.contextSignature,
      createdAt: this.resolveExistingSummary(sessionId)?.createdAt || Date.now(),
      updatedAt: Date.now(),
      activeSkillId: this.state.activeSkillId,
      activeTabId: this.state.activeTabId,
      activeSkills,
      messageCount,
      lastActiveView: this.state.activeSkillId,
      activeViews: activeSkills,
      context: this.state.context,
      messages: this.flattenTimelineMessages(),
      threads: normalizeThreads(this.state.threads),
      tree,
      skillResults: {
        [GENERAL_SKILL]: null,
        [CONCEPT_SKILL]: this.state.skillResults[CONCEPT_SKILL]
          ? cloneConceptCoachResult(this.state.skillResults[CONCEPT_SKILL]!)
          : null,
      },
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
    this.state.failureDiagnostic = content
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
