import { reactive } from 'vue';
import { BlockContextResolver } from '@/application/entries/BlockContextResolver';
import { resolveProgressiveExcerptSelectionSnapshot } from '@/application/entries/ProgressiveSelectionResolver';
import type { CardContentQueryService } from '@/application/queries/CardContentQueryService';
import type { AISiyuanBlockRow, AISiyuanPort } from '@/application/ports/AISiyuanPort';
import type { LLMMessage, LLMPort, LLMResponse, LLMToolCall } from '@/application/ports/LLMPort';
import { LLMError } from '@/application/ports/LLMPort';
import { getAIChatSkill } from '@/application/services/AIChatSkillRegistry';
import { AIChatToolExecutorService } from '@/application/services/AIChatToolExecutorService';
import { AIChatToolRegistry } from '@/application/services/AIChatToolRegistry';
import { AIChatVarStoreService } from '@/application/services/AIChatVarStoreService';
import { getAIContextProviders } from '@/application/services/AIWorkbenchContextProviderRegistry';
import { formatStructuredPromptContract, getPromptContractForSkillRun } from '@/application/services/AIPromptContractRegistry';
import {
  getAIWorkbenchSkill,
  getAIWorkbenchSkillTabs,
  normalizeAIWorkbenchSkillId,
  normalizeAIWorkbenchTabId,
  type AIWorkbenchSkillTabDescriptor,
} from '@/application/services/AIWorkbenchSkillRegistry';
import type { AIWorkbenchSessionStoreService } from '@/application/services/AIWorkbenchSessionStoreService';
import type { FSRSCard } from '@/types/card';
import type {
  AIAttachedContextItem,
  AIChatApprovalRequest,
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
  AIConceptCoachSelfTestCards,
  AIConceptCoachTabResult,
  AIContextProviderKey,
  AIExplainResult,
  AIFollowUpEntry,
  AIReviewCardContext,
  AISkillId,
  AISkillTabId,
  AIViewSessionState,
  AIWorkbenchAssistantResultMessage,
  AIWorkbenchAssistantTextMessage,
  AIWorkbenchApprovalMessage,
  AIWorkbenchContextSnapshot,
  AIWorkbenchFailureDiagnostic,
  AIWorkbenchMessage,
  AIWorkbenchMessageKind,
  AIWorkbenchOpenOptions,
  AIWorkbenchOpenView,
  AIWorkbenchRunMode,
  AIWorkbenchRunStatus,
  AIWorkbenchSessionRecord,
  AIWorkbenchSource,
  AIWorkbenchState,
  AIWorkbenchSurface,
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
import { normalizeAISettings, normalizeAIPromptTemplates, type AIConceptCoachPromptTemplates, type AIProviderConfig, type AISettings } from '@/types/settings';

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
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeString(entry)).filter(Boolean);
  }
  const text = normalizeString(value);
  return text ? [text] : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((entry) => normalizeString(entry)).filter(Boolean)));
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
    'real-world-triggers': createEmptyViewSessionState(),
  });
  return {
    [GENERAL_SKILL]: makeSkillState(),
    [CONCEPT_SKILL]: makeSkillState(),
  };
}

function createEmptyThreadRecord(skillId: AISkillId, tabId: AISkillTabId): AIWorkbenchThreads[AISkillId][AISkillTabId] {
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

function emptyConceptCoachResult(rawContent = ''): AIConceptCoachResult {
  return {
    workingDefinition: '',
    perspectives: emptyPerspectives(),
    integratedUnderstanding: { essence: '', notWhat: [], capabilities: [] },
    selfTestCards: { cards: [] },
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

function normalizeCardKind(value: unknown): AIConceptCoachCardKind {
  const normalized = normalizeString(value);
  return ['辨析', '因果', '应用', '反例', '触发', '定义', '边界', '其他'].includes(normalized)
    ? normalized as AIConceptCoachCardKind
    : '其他';
}

function normalizeSelfTestCards(value: unknown): AIConceptCoachSelfTestCards {
  const raw = isRecord(value) ? value : {};
  const cards = Array.isArray(readAliasedValue(raw, ['cards', 'candidateCards', 'items']))
    ? readAliasedValue(raw, ['cards', 'candidateCards', 'items']) as unknown[]
    : Array.isArray(value)
      ? value
      : [];
  return {
    cards: cards.map((entry, index): AIConceptCoachCandidateCard | null => {
      if (!isRecord(entry)) {
        return null;
      }
      const question = normalizeString(entry.question ?? entry.q);
      const answer = normalizeString(entry.answer ?? entry.a);
      if (!question && !answer) {
        return null;
      }
      return {
        id: normalizeString(entry.id) || createEntryId(`ai-card-${index}`),
        question,
        answer,
        kind: normalizeCardKind(entry.kind),
        selected: entry.selected !== false,
      };
    }).filter((card): card is AIConceptCoachCandidateCard => Boolean(card)),
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
    case 'real-world-triggers':
      return readAliasedValue(raw, ['realWorldTriggers', 'triggers', 'triggerScenarios']) ?? fallback;
    default:
      return fallback;
  }
}

function normalizeConceptCoachState(payload: unknown, rawContent: string): ConceptCoachNormalizationState {
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
      selfTestCards: normalizeSelfTestCards(resolveTabPayload(raw, 'self-test-cards', raw.selfTestCards)),
      realWorldTriggers: normalizeRealWorldTriggers(resolveTabPayload(raw, 'real-world-triggers', raw.realWorldTriggers)),
      rawContent,
    },
    diagnostics: {
      perspectives: perspectives.diagnostic,
      'integrated-understanding': integratedUnderstanding.diagnostic,
    },
  };
}

function normalizeConceptCoachResult(payload: unknown, rawContent: string): AIConceptCoachResult {
  return normalizeConceptCoachState(payload, rawContent).result;
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
      return normalizeSelfTestCards(value);
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
      next.selfTestCards = normalizeSelfTestCards(resolvedPayload);
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
    cardIdeas: result.selfTestCards.cards.map((card) => `${card.question} -> ${card.answer}`),
    rawContent: result.rawContent,
  };
}

function normalizeOpenSkillId(options: AIWorkbenchOpenOptions): AISkillId {
  const fallback = options.source === 'review' || options.surface === 'review-dialog-sidecar' || options.surface === 'review-tab-companion'
    ? CONCEPT_SKILL
    : GENERAL_SKILL;
  return normalizeAIWorkbenchSkillId(options.skillId || options.view, fallback);
}

function normalizeOpenTabId(options: AIWorkbenchOpenOptions): AISkillTabId {
  const skillId = normalizeOpenSkillId(options);
  return normalizeAIWorkbenchTabId(options.tabId, skillId);
}

function normalizeMessage(message: unknown, fallbackSkillId: AISkillId, fallbackTabId: AISkillTabId): AIWorkbenchMessage | null {
  if (!isRecord(message) || message.kind === 'candidate-board') {
    return null;
  }
  const kind = normalizeString(message.kind);
  const skillId = normalizeAIWorkbenchSkillId(message.skillId || fallbackSkillId, fallbackSkillId);
  const base = {
    id: normalizeString(message.id) || createEntryId('ai-msg'),
    skillId,
    tabId: normalizeAIWorkbenchTabId(message.tabId || fallbackTabId, skillId),
    view: normalizeString(message.view) as AIWorkbenchOpenView || undefined,
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
    };
  }
  if (kind === 'assistant-text') {
    return {
      ...base,
      kind,
      content: normalizeString(message.content),
      sourceContent: normalizeString(message.sourceContent) || null,
      appliedContexts: cloneAttachedContexts(message.appliedContexts as AIAttachedContextItem[]),
    };
  }
  if (kind === 'assistant-result') {
    const rawContent = normalizeString(message.rawContent);
    const conceptCoachResult = isRecord(message.conceptCoachResult)
      ? normalizeConceptCoachResult(message.conceptCoachResult, rawContent)
      : null;
    const tabResult = normalizeTabResultValue(base.tabId, message.tabResult, conceptCoachResult);
    return {
      ...base,
      kind,
      rawContent,
      conceptCoachResult,
      tabResult,
      normalizationDiagnostic: normalizeNormalizationDiagnostic(message.normalizationDiagnostic)
        ?? deriveTabNormalizationDiagnostic(base.tabId, tabResult, describeRawShapeFromContent(rawContent)),
      explainResult: isRecord(message.explainResult) ? message.explainResult as AIExplainResult : null,
      appliedContexts: cloneAttachedContexts(message.appliedContexts as AIAttachedContextItem[]),
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
      error: normalizeString(message.error) || null,
      varRef: normalizeString(message.varRef) || null,
    };
  }
  if (kind === 'approval' && isRecord(message.request)) {
    return {
      ...base,
      kind,
      request: message.request as AIChatApprovalRequest,
    };
  }
  return null;
}

function normalizeThreadRecord(thread: unknown, skillId: AISkillId, tabId: AISkillTabId): AIWorkbenchThreads[AISkillId][AISkillTabId] {
  if (!isRecord(thread)) {
    return createEmptyThreadRecord(skillId, tabId);
  }
  return {
    skillId,
    tabId,
    messages: Array.isArray(thread.messages)
      ? thread.messages.map((message) => normalizeMessage(message, skillId, tabId)).filter((message): message is AIWorkbenchMessage => Boolean(message))
      : [],
    resultContextSignature: normalizeString(thread.resultContextSignature) || null,
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
  return base;
}

export class AIWorkbenchService {
  readonly state = reactive<AIWorkbenchState>({
    sessionId: null,
    surface: 'standalone-dialog',
    sourceReviewSessionId: null,
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
    explainResult: null,
    sessionTitle: '',
    sessionHistory: [],
    threads: createInitialThreads(),
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
  private readonly varStore = new AIChatVarStoreService();
  private readonly toolRegistry = new AIChatToolRegistry();
  private readonly toolExecutor: AIChatToolExecutorService;

  constructor(private readonly deps: AIWorkbenchServiceDeps) {
    this.toolExecutor = new AIChatToolExecutorService({
      registry: this.toolRegistry,
      varStore: this.varStore,
      siyuanPort: this.deps.siyuanPort,
      getAISettings: this.deps.getAISettings,
    });
  }

  private getSessionStore() {
    return this.deps.sessionStore || NOOP_SESSION_STORE;
  }

  async open(options: AIWorkbenchOpenOptions = {}): Promise<void> {
    await this.refreshSessionHistory();
    this.state.activeSkillId = normalizeOpenSkillId(options);
    this.state.activeTabId = normalizeOpenTabId(options);
    this.state.activeView = this.state.activeSkillId;
    this.state.surface = normalizeSurface(options.surface ?? this.state.surface);
    this.state.sourceReviewSessionId = normalizeString(options.sourceReviewSessionId)
      || (normalizeString(options.source) === 'review' ? normalizeString(options.sessionId) : '')
      || this.state.sourceReviewSessionId
      || null;
    this.state.error = null;
    this.state.failureDiagnostic = null;
    try {
      const nextContext = await this.buildContextSnapshot(options);
      this.state.liveContext = nextContext;
      await this.activateLiveContext(nextContext);
    } catch (error) {
      this.state.context = null;
      this.state.liveContext = null;
      this.state.contextSignature = null;
      this.state.runStatus = null;
      this.state.error = error instanceof Error ? error.message : String(error);
      return;
    }
    if (options.autoRun && this.state.context) {
      await this.runActiveSkill();
    }
  }

  getSkillTabs(skillId: AISkillId = this.state.activeSkillId): AIWorkbenchSkillTabDescriptor[] {
    return getAIWorkbenchSkillTabs(skillId);
  }

  getSkills() {
    return [getAIWorkbenchSkill(GENERAL_SKILL), getAIWorkbenchSkill(CONCEPT_SKILL)];
  }

  getSkillTitle(skillId: AISkillId = this.state.activeSkillId): string {
    return getAIWorkbenchSkill(skillId).title;
  }

  getSkillBrief(skillId: AISkillId = this.state.activeSkillId): string {
    return getAIWorkbenchSkill(skillId).brief;
  }

  getPrimaryActionLabel(skillId: AISkillId = this.state.activeSkillId): string {
    return getAIWorkbenchSkill(skillId).primaryActionLabel;
  }

  getDefaultUserPrompt(skillId: AISkillId = this.state.activeSkillId): string {
    return getAIWorkbenchSkill(skillId).defaultUserPrompt;
  }

  getActiveTabDescriptor(): AIWorkbenchSkillTabDescriptor {
    return this.getSkillTabs().find((tab) => tab.id === this.state.activeTabId) || this.getSkillTabs()[0];
  }

  setActiveTab(tabId: AISkillTabId): void {
    this.state.activeTabId = normalizeAIWorkbenchTabId(tabId, this.state.activeSkillId);
    this.schedulePersistCurrentSession();
  }

  setActiveSkill(skillId: AISkillId): void {
    const normalizedSkillId = normalizeAIWorkbenchSkillId(skillId, this.state.activeSkillId);
    this.state.activeSkillId = normalizedSkillId;
    this.state.activeView = normalizedSkillId;
    this.state.activeTabId = normalizeAIWorkbenchTabId(this.state.activeTabId, normalizedSkillId);
    this.schedulePersistCurrentSession();
  }

  getViewState(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId): AIViewSessionState {
    return this.state.viewState[this.state.activeSkillId][normalizeAIWorkbenchTabId(tabId, this.state.activeSkillId)];
  }

  getThread(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId) {
    return this.state.threads[this.state.activeSkillId][normalizeAIWorkbenchTabId(tabId, this.state.activeSkillId)];
  }

  getThreadMessages(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId): AIWorkbenchMessage[] {
    return this.getThread(undefined, tabId).messages;
  }

  isViewStale(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId): boolean {
    return this.getViewState(undefined, tabId).stale;
  }

  getFollowUps(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId): AIFollowUpEntry[] {
    return this.getViewState(undefined, tabId).followUps;
  }

  hasStructuredResult(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId): boolean {
    if (this.state.activeSkillId === GENERAL_SKILL) {
      return this.getThreadMessages(undefined, CHAT_TAB).some((message) => message.kind === 'assistant-text' || message.kind === 'tool-log');
    }
    return hasTabResultContent(tabId, tabResultFromConceptCoach(this.state.skillResults[CONCEPT_SKILL], tabId));
  }

  getFollowUpDisabledReason(_view?: unknown, tabId: AISkillTabId = this.state.activeTabId): string | null {
    if (this.state.isLoading) {
      return 'AI 正在处理中，请稍后继续追问。';
    }
    if (this.state.activeSkillId === GENERAL_SKILL) {
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
    const skillId = normalizeAIWorkbenchSkillId(_view, this.state.activeSkillId);
    this.state.activeSkillId = skillId;
    this.state.activeView = skillId;
    this.state.activeTabId = normalizeAIWorkbenchTabId(this.state.activeTabId, skillId);
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

  async updateCandidateCard(cardId: string, patch: Partial<Pick<AIConceptCoachCandidateCard, 'question' | 'answer' | 'selected' | 'kind'>>): Promise<void> {
    const result = this.state.skillResults[ACTIVE_SKILL];
    if (!result) {
      return;
    }
    const card = result.selfTestCards.cards.find((entry) => entry.id === cardId);
    if (!card) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'question')) {
      card.question = normalizeString(patch.question);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'answer')) {
      card.answer = normalizeString(patch.answer);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'kind')) {
      card.kind = patch.kind || '其他';
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'selected')) {
      card.selected = patch.selected !== false;
    }
    this.replaceLatestTabResultMessage('self-test-cards', result);
    await this.persistCurrentSession();
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
      if (approved) {
        this.appendMessage(CHAT_TAB, {
          id: createEntryId('ai-msg'),
          skillId: GENERAL_SKILL,
          tabId: CHAT_TAB,
          view: GENERAL_SKILL,
          kind: 'assistant-text',
          content: `已记录你批准「${request.title}」。为避免误写，第一阶段不会自动落库；你可以继续要求我根据这份审批执行下一步。`,
          createdAt: Date.now(),
          sourceContent: null,
          appliedContexts: [],
        } satisfies AIWorkbenchAssistantTextMessage);
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
    if (this.state.activeSkillId === GENERAL_SKILL) {
      await this.submitGeneralChatPrompt(this.getDefaultUserPrompt(GENERAL_SKILL));
      return;
    }
    await this.runTask(AI_CONCEPT_COACH_TAB_IDS, async () => {
      const attachedContexts = this.consumeComposerContexts();
      const response = await this.requestConceptCoachResult(attachedContexts);
      this.appendConceptCoachFullResult(response.content, attachedContexts);
    }, 'full-run');
  }

  async runActiveTab(): Promise<void> {
    if (this.state.activeSkillId === GENERAL_SKILL) {
      await this.runActiveSkill();
      return;
    }
    const tabId = this.state.activeTabId;
    await this.runTask([tabId], async () => {
      const attachedContexts = this.consumeComposerContexts();
      const response = await this.requestConceptCoachTabResult(tabId, attachedContexts);
      this.appendConceptCoachTabResult(tabId, response.content, attachedContexts);
    }, 'tab-rerun');
  }

  async submitSkillPrompt(question: string): Promise<void> {
    const normalizedQuestion = normalizeString(question);
    if (!normalizedQuestion) {
      return;
    }
    if (this.state.activeSkillId === GENERAL_SKILL) {
      await this.submitGeneralChatPrompt(normalizedQuestion);
      return;
    }
    await this.runTask(AI_CONCEPT_COACH_TAB_IDS, async () => {
      const attachedContexts = this.consumeComposerContexts();
      for (const tab of this.getSkillTabs()) {
        this.appendMessage(tab.id, {
          id: createEntryId('ai-msg'),
          skillId: ACTIVE_SKILL,
          tabId: tab.id,
          view: ACTIVE_SKILL,
          kind: 'user',
          purpose: 'initial-run',
          content: normalizedQuestion,
          createdAt: Date.now(),
          editedFromMessageId: null,
          attachedContexts,
        } satisfies AIWorkbenchUserMessage);
      }
      const response = await this.requestConceptCoachResult(attachedContexts, normalizedQuestion);
      this.appendConceptCoachFullResult(response.content, attachedContexts);
    }, 'full-run');
  }

  async submitExplainPrompt(question: string): Promise<void> {
    await this.submitSkillPrompt(question);
  }

  async submitFollowUp(question: string, options?: { editedFromMessageId?: string | null }): Promise<void> {
    const normalizedQuestion = normalizeString(question);
    if (!normalizedQuestion) {
      return;
    }
    if (this.state.activeSkillId === GENERAL_SKILL) {
      await this.submitGeneralChatPrompt(normalizedQuestion, options);
      return;
    }
    const tabId = this.state.activeTabId;
    const disabledReason = this.getFollowUpDisabledReason(undefined, tabId);
    if (disabledReason) {
      throw this.fail(disabledReason);
    }
    const attachedContexts = this.consumeComposerContexts();
    this.appendMessage(tabId, {
      id: createEntryId('ai-msg'),
      skillId: ACTIVE_SKILL,
      tabId,
      view: ACTIVE_SKILL,
      kind: 'user',
      purpose: 'follow-up',
      content: normalizedQuestion,
      createdAt: Date.now(),
      editedFromMessageId: normalizeString(options?.editedFromMessageId) || null,
      attachedContexts,
    } satisfies AIWorkbenchUserMessage);

    this.state.isLoading = true;
    this.state.runStatus = this.createRunStatus('follow-up', [tabId]);
    this.state.error = null;
    this.state.failureDiagnostic = null;
    try {
      const response = await this.requestFollowUp(tabId, attachedContexts);
      const content = normalizeString(response.content) || '这次没有返回可用内容。';
      this.appendMessage(tabId, {
        id: createEntryId('ai-msg'),
        skillId: ACTIVE_SKILL,
        tabId,
        view: ACTIVE_SKILL,
        kind: 'assistant-text',
        content,
        createdAt: Date.now(),
        sourceContent: content,
        appliedContexts: attachedContexts,
      } satisfies AIWorkbenchAssistantTextMessage);
      this.syncDerivedStateFromThreads();
      await this.persistCurrentSession();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.state.isLoading = false;
      this.state.runStatus = null;
    }
  }

  private async submitGeneralChatPrompt(
    question: string,
    options?: { editedFromMessageId?: string | null },
  ): Promise<void> {
    const normalizedQuestion = normalizeString(question);
    if (!normalizedQuestion) {
      return;
    }
    const attachedContexts = this.consumeComposerContexts();
    this.appendMessage(CHAT_TAB, {
      id: createEntryId('ai-msg'),
      skillId: GENERAL_SKILL,
      tabId: CHAT_TAB,
      view: GENERAL_SKILL,
      kind: 'user',
      purpose: 'follow-up',
      content: normalizedQuestion,
      createdAt: Date.now(),
      editedFromMessageId: normalizeString(options?.editedFromMessageId) || null,
      attachedContexts,
    } satisfies AIWorkbenchUserMessage);

    this.state.isLoading = true;
    this.state.runStatus = this.createRunStatus('chat', [CHAT_TAB]);
    this.state.error = null;
    this.state.failureDiagnostic = null;
    try {
      await this.runGeneralChatToolLoop(attachedContexts);
      this.syncDerivedStateFromThreads();
      await this.persistCurrentSession();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.state.isLoading = false;
      this.state.runStatus = null;
    }
  }

  private async runGeneralChatToolLoop(attachedContexts: AIAttachedContextItem[]): Promise<void> {
    const settings = this.assertModelSettings();
    const provider = this.resolveDefaultProvider(settings);
    const skill = getAIChatSkill(GENERAL_SKILL);
    const enabledTools = this.toolExecutor.getEnabledToolDefinitions(skill.defaultToolGroups);
    const llmMessages: LLMMessage[] = this.buildGeneralChatMessages(settings, attachedContexts);
    const maxRounds = Math.max(1, settings.chatDefaults.maxToolRounds || 4);

    for (let round = 0; round < maxRounds; round += 1) {
      const response = await this.requestChatModel(llmMessages, {
        settings,
        provider,
        tools: enabledTools,
      });
      const assistantContent = normalizeString(response.content);
      const toolCalls = response.toolCalls || [];
      if (toolCalls.length === 0) {
        this.appendMessage(CHAT_TAB, {
          id: createEntryId('ai-msg'),
          skillId: GENERAL_SKILL,
          tabId: CHAT_TAB,
          view: GENERAL_SKILL,
          kind: 'assistant-text',
          content: assistantContent || '这次没有返回可用内容。',
          createdAt: Date.now(),
          sourceContent: assistantContent || null,
          appliedContexts: attachedContexts,
        } satisfies AIWorkbenchAssistantTextMessage);
        return;
      }

      llmMessages.push({
        role: 'assistant',
        content: assistantContent,
        toolCalls,
      });

      if (assistantContent) {
        this.appendMessage(CHAT_TAB, {
          id: createEntryId('ai-msg'),
          skillId: GENERAL_SKILL,
          tabId: CHAT_TAB,
          view: GENERAL_SKILL,
          kind: 'assistant-text',
          content: assistantContent,
          createdAt: Date.now(),
          sourceContent: assistantContent,
          appliedContexts: attachedContexts,
        } satisfies AIWorkbenchAssistantTextMessage);
      }

      for (const llmToolCall of toolCalls) {
        const toolCall = this.toRuntimeToolCall(llmToolCall);
        const outcome = await this.toolExecutor.executeToolCall(toolCall, {
          context: this.state.context,
          attachedContexts,
        });
        this.state.toolTimeline.push(outcome.result);
        this.appendToolLogMessage(outcome.result);
        if (outcome.approval) {
          this.state.pendingApprovals.push(outcome.approval);
          this.appendApprovalMessage(outcome.approval);
          this.addRuntimeDiagnostic({
            type: 'approval',
            message: `工具 ${outcome.approval.toolName} 需要用户审批后才能执行。`,
            detail: JSON.stringify(outcome.approval.args, null, 2),
            createdAt: Date.now(),
          });
          this.appendMessage(CHAT_TAB, {
            id: createEntryId('ai-msg'),
            skillId: GENERAL_SKILL,
            tabId: CHAT_TAB,
            view: GENERAL_SKILL,
            kind: 'assistant-text',
            content: `工具「${outcome.approval.title}」需要你审批后才能继续。我已经把审批卡片放在消息流里。`,
            createdAt: Date.now(),
            sourceContent: null,
            appliedContexts: attachedContexts,
          } satisfies AIWorkbenchAssistantTextMessage);
          return;
        }
        llmMessages.push({
          role: 'tool',
          toolCallId: outcome.result.toolCallId,
          name: outcome.result.toolName,
          content: outcome.result.finalText,
        });
      }
    }

    this.appendMessage(CHAT_TAB, {
      id: createEntryId('ai-msg'),
      skillId: GENERAL_SKILL,
      tabId: CHAT_TAB,
      view: GENERAL_SKILL,
      kind: 'assistant-text',
      content: '工具链已达到最大轮数，先暂停在这里。你可以继续追问，我会基于已经得到的工具结果接着处理。',
      createdAt: Date.now(),
      sourceContent: null,
      appliedContexts: attachedContexts,
    } satisfies AIWorkbenchAssistantTextMessage);
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
    this.markStaleThreads(nextSignature);
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
      activeSkillId: this.state.activeSkillId,
      activeTabId: this.state.activeTabId,
      activeSkills: [],
      messageCount: 0,
      lastActiveView: this.state.activeSkillId,
      activeViews: [],
      context,
      schemaVersion: 2,
      messages: [],
      threads: createInitialThreads(),
      skillResults: { [GENERAL_SKILL]: null, [CONCEPT_SKILL]: null },
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
    this.state.activeSkillId = normalizeAIWorkbenchSkillId(record.activeSkillId, this.state.activeSkillId);
    this.state.activeTabId = normalizeAIWorkbenchTabId(record.activeTabId, this.state.activeSkillId);
    this.state.activeView = this.state.activeSkillId;
    this.state.threads = normalizeThreads(record.threads);
    this.state.skillResults = {
      [GENERAL_SKILL]: null,
      [CONCEPT_SKILL]: record.skillResults?.[CONCEPT_SKILL]
        ? normalizeConceptCoachResult(record.skillResults[CONCEPT_SKILL], record.skillResults[CONCEPT_SKILL]?.rawContent || '')
        : this.findLatestConceptCoachResult(),
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
        finalText: message.content,
        error: message.error || undefined,
        varRef: message.varRef || undefined,
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
    this.syncDerivedStateFromThreads();
  }

  private markStaleThreads(nextSignature: string | null): void {
    for (const tabId of AI_CONCEPT_COACH_TAB_IDS) {
      const thread = this.state.threads[CONCEPT_SKILL][tabId];
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
    this.syncDerivedStateFromThreads();
  }

  private syncDerivedStateFromThreads(): void {
    for (const tabId of AI_CONCEPT_COACH_TAB_IDS) {
      const thread = this.state.threads[CONCEPT_SKILL][tabId];
      const viewState = this.state.viewState[CONCEPT_SKILL][tabId];
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
          skillId: CONCEPT_SKILL,
          tabId,
          role: message.kind === 'user' ? 'user' : 'assistant',
          content: message.content,
          createdAt: message.createdAt,
        }));
    }

    this.state.skillResults[CONCEPT_SKILL] = this.findLatestConceptCoachResult();
    this.state.explainResult = explainResultFromConceptCoach(this.state.skillResults[CONCEPT_SKILL]);
    this.state.messages = this.flattenTimelineMessages();
    this.state.vars = this.varStore.list();
  }

  private findLatestConceptCoachResult(): AIConceptCoachResult | null {
    const messages = AI_CONCEPT_COACH_TAB_IDS
      .flatMap((tabId) => this.state.threads[CONCEPT_SKILL][tabId].messages)
      .filter((message): message is AIWorkbenchAssistantResultMessage => (
        message.kind === 'assistant-result'
        && message.conceptCoachResult !== null
      ))
      .sort((left, right) => right.createdAt - left.createdAt);
    return messages[0]?.conceptCoachResult ? cloneConceptCoachResult(messages[0].conceptCoachResult) : null;
  }

  private flattenTimelineMessages(): AIWorkbenchMessage[] {
    return ([GENERAL_SKILL, CONCEPT_SKILL] as AISkillId[])
      .flatMap((skillId) => ALL_TAB_IDS.flatMap((tabId) => this.state.threads[skillId][tabId]?.messages || []))
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  private appendMessage(tabId: AISkillTabId, message: AIWorkbenchMessage): void {
    const skillId = normalizeAIWorkbenchSkillId(message.skillId || this.state.activeSkillId, this.state.activeSkillId);
    const normalizedTabId = normalizeAIWorkbenchTabId(tabId, skillId);
    this.state.threads[skillId][normalizedTabId].messages.push({
      ...message,
      skillId,
      tabId: normalizedTabId,
    } as AIWorkbenchMessage);
    this.syncDerivedStateFromThreads();
    this.schedulePersistCurrentSession();
  }

  private consumeComposerContexts(): AIAttachedContextItem[] {
    const snapshot = cloneAttachedContexts(this.state.composerContexts.items);
    this.state.composerContexts.items = [];
    return snapshot;
  }

  private findMessage(messageId: string): { tabId: AISkillTabId; index: number; message: AIWorkbenchMessage } | null {
    const normalizedId = normalizeString(messageId);
    if (!normalizedId) {
      return null;
    }
    for (const skillId of [GENERAL_SKILL, CONCEPT_SKILL] as AISkillId[]) {
      for (const tabId of ALL_TAB_IDS) {
        const messages = this.state.threads[skillId][tabId].messages;
        const index = messages.findIndex((message) => message.id === normalizedId);
        if (index >= 0) {
          return { tabId, index, message: messages[index] };
        }
      }
    }
    return null;
  }

  private replaceLatestTabResultMessage(tabId: AISkillTabId, result: AIConceptCoachResult): void {
    const messages = this.state.threads[CONCEPT_SKILL][tabId].messages;
    const latest = [...messages].reverse().find((message): message is AIWorkbenchAssistantResultMessage => (
      message.kind === 'assistant-result'
    ));
    if (!latest) {
      return;
    }
    latest.conceptCoachResult = cloneConceptCoachResult(result);
    latest.tabResult = tabResultFromConceptCoach(result, tabId);
    latest.normalizationDiagnostic = deriveTabNormalizationDiagnostic(tabId, latest.tabResult, 'edited-result');
    latest.explainResult = explainResultFromConceptCoach(result);
    latest.rawContent = JSON.stringify(tabId === 'self-test-cards'
      ? { selfTestCards: result.selfTestCards }
      : result, null, 2);
    this.syncDerivedStateFromThreads();
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

  private buildPromptPayload(input: {
    attachedContexts: AIAttachedContextItem[];
    userPrompt?: string;
    tabId?: AISkillTabId;
  }): Record<string, unknown> {
    const context = this.requireContext();
    const tabId = input.tabId ? normalizeAIWorkbenchTabId(input.tabId) : null;
    return {
      language: this.deps.getAISettings().defaultOutputLanguage,
      skillId: ACTIVE_SKILL,
      tabIds: tabId ? [tabId] : [...AI_CONCEPT_COACH_TAB_IDS],
      ...(tabId ? {
        tabId,
        currentTabResult: tabResultFromConceptCoach(this.state.skillResults[ACTIVE_SKILL], tabId),
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

  private buildGeneralChatMessages(settings: AISettings, attachedContexts: AIAttachedContextItem[]): LLMMessage[] {
    const skill = getAIChatSkill(GENERAL_SKILL);
    const context = this.state.context;
    const systemPayload = {
      language: settings.defaultOutputLanguage,
      skillId: GENERAL_SKILL,
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
        '工具规则：读工具可以自动执行；任何写入思源、创建卡片、摘录或 daily note 的工具都必须先请求用户审批。',
        '如果需要长结果，请优先使用 ListVars / ReadVar 管理工具缓存，不要把超长内容完整复述给用户。',
        '当前会话上下文：',
        JSON.stringify(systemPayload, null, 2),
      ].join('\n\n'),
    };

    const historyMessages = this.state.threads[GENERAL_SKILL][CHAT_TAB].messages
      .filter((message) => message.kind !== 'approval')
      .slice(-20)
      .map((message): LLMMessage | null => {
        if (message.kind === 'user') {
          return { role: 'user', content: message.content };
        }
        if (message.kind === 'assistant-text') {
          return { role: 'assistant', content: message.content };
        }
        if (message.kind === 'tool-log') {
          return { role: 'assistant', content: `[Tool ${message.toolName} ${message.status}]\n${message.content}` };
        }
        return null;
      })
      .filter((message): message is LLMMessage => Boolean(message));
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
    },
  ): Promise<LLMResponse> {
    const settings = input.settings;
    const provider = input.provider;
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
        stream: settings.chatDefaults.stream,
      });
    } catch (error) {
      if (error instanceof LLMError) {
        this.captureFailureDiagnostic(error);
        throw this.fail(this.mapLlmError(error));
      }
      throw error;
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

  private appendToolLogMessage(result: AIChatToolExecutionResult): void {
    this.appendMessage(CHAT_TAB, {
      id: createEntryId('ai-tool'),
      skillId: GENERAL_SKILL,
      tabId: CHAT_TAB,
      view: GENERAL_SKILL,
      kind: 'tool-log',
      createdAt: result.createdAt,
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      group: result.group,
      status: result.status,
      content: result.finalText,
      error: result.error || null,
      varRef: result.varRef || null,
    } satisfies AIWorkbenchToolLogMessage);
  }

  private appendApprovalMessage(request: AIChatApprovalRequest): void {
    this.appendMessage(CHAT_TAB, {
      id: createEntryId('ai-approval'),
      skillId: GENERAL_SKILL,
      tabId: CHAT_TAB,
      view: GENERAL_SKILL,
      kind: 'approval',
      createdAt: request.createdAt,
      request,
    } satisfies AIWorkbenchApprovalMessage);
  }

  private updateApprovalMessage(request: AIChatApprovalRequest): void {
    const thread = this.state.threads[GENERAL_SKILL][CHAT_TAB];
    const message = thread.messages.find((entry): entry is AIWorkbenchApprovalMessage => (
      entry.kind === 'approval' && entry.request.id === request.id
    ));
    if (message) {
      message.request = request;
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

  private async requestStructuredModel(
    payload: Record<string, unknown>,
    tabId?: AISkillTabId,
  ): Promise<LLMResponse> {
    const settings = this.assertModelSettings();
    const provider = this.resolveDefaultProvider(settings);
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
            content: this.buildStructuredRunSystemPrompt(settings, tabId),
          },
          {
            role: 'user',
            content: JSON.stringify(payload, null, 2),
          },
        ],
      });
    } catch (error) {
      if (error instanceof LLMError) {
        this.captureFailureDiagnostic(error);
        throw this.fail(this.mapLlmError(error));
      }
      throw error;
    }
  }

  private async requestFollowUp(
    tabId: AISkillTabId,
    attachedContexts: AIAttachedContextItem[] = [],
  ): Promise<LLMResponse> {
    const context = this.requireContext();
    const settings = this.assertModelSettings();
    const provider = this.resolveDefaultProvider(settings);
    const tabResult = tabResultFromConceptCoach(this.state.skillResults[ACTIVE_SKILL], tabId);
    if (!tabResult) {
      throw this.fail('当前阶段没有可追问的结构化结果。');
    }
    const prompts = settings.prompts.skills.conceptCoach;
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
            content: prompts.tabs[tabId].followUp,
          },
          {
            role: 'user',
            content: JSON.stringify({
              language: settings.defaultOutputLanguage,
              skillId: ACTIVE_SKILL,
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
      });
    } catch (error) {
      if (error instanceof LLMError) {
        this.captureFailureDiagnostic(error);
        throw this.fail(this.mapLlmError(error));
      }
      throw error;
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

  private buildStructuredRunSystemPrompt(settings: AISettings, tabId?: AISkillTabId): string {
    const prompts: AIConceptCoachPromptTemplates = settings.prompts.skills.conceptCoach;
    const behaviorPrompts = tabId
      ? [prompts.baseRun, prompts.tabs[tabId].run]
      : [
        prompts.baseRun,
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

  private appendConceptCoachFullResult(rawContent: string, appliedContexts: AIAttachedContextItem[]): void {
    const payload = this.extractStructuredPayload('AI 理解与制卡', rawContent);
    const normalized = normalizeConceptCoachState(payload, rawContent);
    const result = normalized.result;
    this.state.skillResults[ACTIVE_SKILL] = result;
    this.state.explainResult = explainResultFromConceptCoach(result);
    const now = Date.now();
    for (const tabId of AI_CONCEPT_COACH_TAB_IDS) {
      this.appendMessage(tabId, {
        id: createEntryId('ai-msg'),
        skillId: ACTIVE_SKILL,
        tabId,
        view: ACTIVE_SKILL,
        kind: 'assistant-result',
        createdAt: now,
        rawContent,
        conceptCoachResult: cloneConceptCoachResult(result),
        tabResult: tabResultFromConceptCoach(result, tabId),
        normalizationDiagnostic: normalized.diagnostics[tabId] ?? deriveTabNormalizationDiagnostic(tabId, tabResultFromConceptCoach(result, tabId), describeRawShape(payload)),
        explainResult: explainResultFromConceptCoach(result),
        appliedContexts,
      } satisfies AIWorkbenchAssistantResultMessage);
    }
  }

  private appendConceptCoachTabResult(
    tabId: AISkillTabId,
    rawContent: string,
    appliedContexts: AIAttachedContextItem[],
  ): void {
    const payload = this.extractStructuredPayload(this.getActiveTabDescriptor().title, rawContent);
    const normalized = mergeTabResult(this.state.skillResults[ACTIVE_SKILL], tabId, payload, rawContent);
    const result = normalized.result;
    this.state.skillResults[ACTIVE_SKILL] = result;
    this.state.explainResult = explainResultFromConceptCoach(result);
    this.appendMessage(tabId, {
      id: createEntryId('ai-msg'),
      skillId: ACTIVE_SKILL,
      tabId,
      view: ACTIVE_SKILL,
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

  private requireContext(): AIWorkbenchContextSnapshot {
    if (!this.state.context) {
      throw this.fail('AI 工作台上下文还没有准备好。');
    }
    return this.state.context;
  }

  private createRunStatus(mode: AIWorkbenchRunMode, tabIds: AISkillTabId[]): AIWorkbenchRunStatus {
    const skillId = this.state.activeSkillId;
    const normalizedTabIds = tabIds.map((tabId) => normalizeAIWorkbenchTabId(tabId, skillId));
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
    const normalizedTabIds = tabIds.map((tabId) => normalizeAIWorkbenchTabId(tabId));
    this.state.runStatus = this.createRunStatus(mode, normalizedTabIds);
    for (const tabId of normalizedTabIds) {
      const thread = this.state.threads[ACTIVE_SKILL][tabId];
      thread.stale = false;
      thread.staleReason = null;
    }
    try {
      await runner();
      for (const tabId of normalizedTabIds) {
        const thread = this.state.threads[ACTIVE_SKILL][tabId];
        thread.resultContextSignature = this.state.contextSignature;
        thread.stale = false;
        thread.staleReason = null;
      }
      this.state.legacyNotice = null;
      this.syncDerivedStateFromThreads();
      await this.persistCurrentSession();
    } catch (error) {
      this.state.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.state.isLoading = false;
      this.state.runStatus = null;
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
    const messageCount = ([GENERAL_SKILL, CONCEPT_SKILL] as AISkillId[]).reduce((total, skillId) => (
      total + ALL_TAB_IDS.reduce((innerTotal, tabId) => innerTotal + this.state.threads[skillId][tabId].messages.length, 0)
    ), 0);
    const activeSkills: AISkillId[] = ([GENERAL_SKILL, CONCEPT_SKILL] as AISkillId[])
      .filter((skillId) => ALL_TAB_IDS.some((tabId) => this.state.threads[skillId][tabId].messages.length > 0));
    return {
      schemaVersion: 2,
      id: sessionId,
      title: normalizeString(this.state.sessionTitle) || '未命名会话',
      source: this.state.context?.source || this.state.liveContext?.source || 'standalone',
      sourceReviewSessionId: this.state.sourceReviewSessionId,
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
      skillResults: {
        [GENERAL_SKILL]: null,
        [CONCEPT_SKILL]: this.state.skillResults[CONCEPT_SKILL]
          ? cloneConceptCoachResult(this.state.skillResults[CONCEPT_SKILL]!)
          : null,
      },
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
      case 'empty_response':
        return 'AI 请求已发出，但模型返回了空正文。请重试；如果连续出现，请检查 Base URL、模型名，以及该模型是否支持 Chat Completions 的 json_object 输出。';
      default:
        return error.message || 'AI 请求失败。';
    }
  }
}
