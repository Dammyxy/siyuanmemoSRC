import type {
  AIChatToolExecutionPolicy,
  AIChatToolGroupKey,
  AIChatToolResultApprovalPolicy,
  AISkillId,
  AISkillTabId,
  AIWorkbenchSurface,
} from '@/types/ai';

export const AI_ARENA_SCENARIO_IDS = [
  'topic-auto-card',
  'candidate-card-generation',
  'card-prompt-rewrite',
  'descriptor-augmentation',
  'concept-expression-coach',
  'note-refinement',
] as const;

export const ARENA_TARGET_KINDS = [
  'topic',
  'item',
  'concept',
  'descriptor',
  'note',
] as const;

export const SRS_ARENA_CONTESTANT_IDS = [
  'fsrs-v6',
  'sm15',
  'sm2',
] as const;

export type AIArenaScenarioId = typeof AI_ARENA_SCENARIO_IDS[number];
export type ArenaTargetKind = typeof ARENA_TARGET_KINDS[number];
export type SrsArenaContestantId = typeof SRS_ARENA_CONTESTANT_IDS[number];
export type ArenaDomain = 'ai' | 'srs';
export type ArenaChallengeReason = 'low-confidence' | 'high-disagreement' | 'repeated-dissatisfaction';
export type AIStrategyPackSource = 'builtin' | 'user' | 'ai-generated';
export type AIStrategyPackState = 'active' | 'pinned' | 'retired' | 'disabled';
export type ArenaManagerDomain = 'ai' | 'srs';
export type ArenaOutcomeLabel = 'off-target' | 'needs-refactor' | 'usable' | 'strong';
export type AIArenaEventType =
  | 'exposure'
  | 'accept'
  | 'edit'
  | 'rerun'
  | 'abandon'
  | 'create'
  | 'manual-bad'
  | 'judge';

const BUILTIN_ARENA_PACK_CREATED_AT = 1;

export interface AIArenaScenarioDefinition {
  id: AIArenaScenarioId;
  title: string;
  description: string;
  enabled: boolean;
  preferredSkillId?: AISkillId;
  preferredTabId?: AISkillTabId | null;
  cardCentric: boolean;
}

export type AIArenaScenarioRegistry = Record<AIArenaScenarioId, AIArenaScenarioDefinition>;
export const ARENA_DEFAULT_OFF_MIGRATION_VERSION = 1;

export interface AIStrategyPackPromptOverrides {
  prependSystemPrompt?: string;
  appendSystemPrompt?: string;
  composerPreset?: string;
  tabRunPrompts?: Partial<Record<string, string>>;
  tabFollowUpPrompts?: Partial<Record<string, string>>;
}

export interface AIStrategyPackToolPolicyOverrides {
  enabledToolGroups?: AIChatToolGroupKey[];
  executionPolicies?: Partial<Record<string, AIChatToolExecutionPolicy>>;
  resultApprovalPolicies?: Partial<Record<string, AIChatToolResultApprovalPolicy>>;
}

export interface AIStrategyPackDefinition {
  id: string;
  title: string;
  source: AIStrategyPackSource;
  state: AIStrategyPackState;
  eligibleScenarios: AIArenaScenarioId[];
  skillId?: AISkillId | null;
  tabId?: AISkillTabId | null;
  promptOverrides?: AIStrategyPackPromptOverrides;
  toolPolicyOverrides?: AIStrategyPackToolPolicyOverrides;
  createdAt?: number;
  updatedAt?: number;
  sampleHint?: string;
}

export interface ArenaPoolDescriptor {
  key: string;
  surface: AIWorkbenchSurface;
  scenarioId: AIArenaScenarioId;
  targetKind: ArenaTargetKind;
  skillId: AISkillId | null;
  tabId: AISkillTabId | null;
}

export interface ArenaChallengeTrigger {
  triggered: boolean;
  reasons: ArenaChallengeReason[];
  challengerPackIds: string[];
  summary: string | null;
  detectedAt: number;
}

export interface AIArenaSelection {
  exposureId: string;
  pool: ArenaPoolDescriptor;
  pack: AIStrategyPackDefinition;
  challengers: AIStrategyPackDefinition[];
  trigger: ArenaChallengeTrigger | null;
  weights: Record<string, number>;
  selectedAt: number;
}

export interface ArenaScoreEntry {
  contestantId: string;
  title: string;
  weight: number;
  score: number;
  sampleCount: number;
  winCount: number;
  lossCount: number;
  lastEventAt: number | null;
}

export interface ArenaScoreSnapshot {
  id: string;
  domain: ArenaDomain;
  poolKey: string;
  createdAt: number;
  entries: ArenaScoreEntry[];
}

export interface ArenaMatchRecord {
  id: string;
  domain: ArenaDomain;
  poolKey: string;
  createdAt: number;
  surface?: AIWorkbenchSurface | null;
  scenarioId?: AIArenaScenarioId | null;
  targetKind?: ArenaTargetKind | null;
  ai?: {
    exposureId: string;
    sessionId: string | null;
    packId: string;
    challengerPackIds: string[];
    skillId: AISkillId | null;
    tabId: AISkillTabId | null;
    eventType: AIArenaEventType;
    scoreDelta: number;
    qualityLabel?: ArenaOutcomeLabel | null;
    cardIds?: string[];
    metadata?: Record<string, unknown>;
  };
  srs?: {
    cardId: string;
    rating: number;
    pass: boolean;
    weightedIntervalDays: number;
    currentSchedulerIntervalDays: number;
    discrepancyRatio: number;
    leadingContestantId: SrsArenaContestantId | null;
    contestantErrors: Partial<Record<SrsArenaContestantId, number>>;
  };
}

export interface ArenaCardAttributionRecord {
  cardId: string;
  poolKey: string;
  surface: AIWorkbenchSurface;
  scenarioId: AIArenaScenarioId;
  targetKind: ArenaTargetKind;
  sourcePackId: string;
  sourcePackTitle: string;
  exposureId: string;
  createdAt: number;
  updatedAt: number;
  reviewCount: number;
  lastReviewAt: number | null;
  lastOutcome: 'positive' | 'negative' | 'neutral' | null;
}

export interface SrsArenaContestantPrediction {
  contestantId: SrsArenaContestantId;
  label: string;
  score: number;
  weight: number;
  retrievability: number;
  predictedPassProbability: number;
  intervalDays: number;
  due: number;
}

export interface SrsArenaRecommendation {
  poolKey: string;
  targetKind: Extract<ArenaTargetKind, 'item' | 'descriptor'>;
  leadingContestantId: SrsArenaContestantId | null;
  weightedIntervalDays: number;
  weightedDue: number;
  currentSchedulerIntervalDays: number;
  discrepancyRatio: number;
  shouldHighlight: boolean;
  summary: string;
  contestants: SrsArenaContestantPrediction[];
}

export interface ArenaManagerState {
  activeDomain: ArenaManagerDomain;
  selectedPoolKey: string | null;
  selectedScenarioId: AIArenaScenarioId | 'all';
  showOnlyActive: boolean;
}

export interface ArenaSettings {
  defaultOffMigrationVersion: number;
  enabled: boolean;
  ai: {
    enabled: boolean;
    surfaces: AIWorkbenchSurface[];
    scenarios: AIArenaScenarioRegistry;
    strategyPacks: AIStrategyPackDefinition[];
    explorationRate: number;
    challenge: {
      minSamples: number;
      scoreGapForConfidence: number;
      consecutiveNegativeThreshold: number;
      cloneVariantLimit: number;
      explicitTriggerEnabled: boolean;
    };
  };
  srs: {
    enabled: boolean;
    contestantIds: SrsArenaContestantId[];
    targetKinds: Array<Extract<ArenaTargetKind, 'item' | 'descriptor'>>;
    advisoryOnly: boolean;
    divergenceThresholdRatio: number;
    minimumReviewsForConfidence: number;
  };
  manager: ArenaManagerState;
}

export interface ArenaManagerPoolSummary {
  pool: ArenaPoolDescriptor | { key: string; targetKind: Extract<ArenaTargetKind, 'item' | 'descriptor'> };
  topEntries: ArenaScoreEntry[];
  totalEntries: number;
  latestMatchAt: number | null;
  challenge: ArenaChallengeTrigger | null;
  recommendation?: SrsArenaRecommendation | null;
}

export interface ArenaManagerViewModel {
  generatedAt: number;
  manager: ArenaManagerState;
  ai: {
    pools: ArenaManagerPoolSummary[];
    recentMatches: ArenaMatchRecord[];
    strategyPacks: AIStrategyPackDefinition[];
  };
  srs: {
    pools: ArenaManagerPoolSummary[];
    recentMatches: ArenaMatchRecord[];
    scores: ArenaScoreSnapshot[];
  };
}

export interface ArenaStoreData {
  schemaVersion: number;
  matches: ArenaMatchRecord[];
  scores: ArenaScoreSnapshot[];
  attributions: ArenaCardAttributionRecord[];
}

const DEFAULT_ARENA_SCENARIOS: AIArenaScenarioRegistry = {
  'topic-auto-card': {
    id: 'topic-auto-card',
    title: 'Topic Auto Card',
    description: '围绕 Topic 材料自动生成更稳的候选卡片与行动建议。',
    enabled: true,
    preferredSkillId: 'concept-coach',
    preferredTabId: 'self-test-cards',
    cardCentric: true,
  },
  'candidate-card-generation': {
    id: 'candidate-card-generation',
    title: 'Candidate Card Generation',
    description: '比较不同候选制卡提示，让 AI 产出更耐久的候选卡。',
    enabled: true,
    preferredSkillId: 'concept-coach',
    preferredTabId: 'self-test-cards',
    cardCentric: true,
  },
  'card-prompt-rewrite': {
    id: 'card-prompt-rewrite',
    title: 'Card Prompt Rewrite',
    description: '针对已有 Item 卡的提示做重写与渐进改卡竞技。',
    enabled: true,
    preferredSkillId: 'concept-coach',
    preferredTabId: 'self-test-cards',
    cardCentric: true,
  },
  'descriptor-augmentation': {
    id: 'descriptor-augmentation',
    title: 'Descriptor Augmentation',
    description: '为 Descriptor 卡补实例、解释、边界与应用场景。',
    enabled: true,
    preferredSkillId: 'concept-coach',
    preferredTabId: 'perspectives',
    cardCentric: false,
  },
  'concept-expression-coach': {
    id: 'concept-expression-coach',
    title: 'Concept Expression Coach',
    description: '引导用户表达概念、辨析概念，并生成能点亮同一灯泡的提示。',
    enabled: true,
    preferredSkillId: 'concept-coach',
    preferredTabId: 'integrated-understanding',
    cardCentric: false,
  },
  'note-refinement': {
    id: 'note-refinement',
    title: 'Note Refinement',
    description: '围绕笔记完善、提问引导与结构补全比较不同 AI 策略。',
    enabled: true,
    preferredSkillId: 'general-chat',
    preferredTabId: 'chat',
    cardCentric: false,
  },
};

const DEFAULT_ARENA_PACKS: AIStrategyPackDefinition[] = [
  {
    id: 'builtin-balanced-memory',
    title: 'Balanced Memory Coach',
    source: 'builtin',
    state: 'active',
    eligibleScenarios: [
      'candidate-card-generation',
      'card-prompt-rewrite',
      'descriptor-augmentation',
      'concept-expression-coach',
      'note-refinement',
    ],
    skillId: null,
    tabId: null,
    promptOverrides: {
      appendSystemPrompt: '优先保留用户原意，同时把输出压缩成长期复习中最稳、最可执行的提示。',
    },
    createdAt: BUILTIN_ARENA_PACK_CREATED_AT,
    updatedAt: BUILTIN_ARENA_PACK_CREATED_AT,
    sampleHint: '平衡型基线',
  },
  {
    id: 'builtin-memory-strict',
    title: 'Strict Retention Refiner',
    source: 'builtin',
    state: 'active',
    eligibleScenarios: [
      'candidate-card-generation',
      'card-prompt-rewrite',
      'descriptor-augmentation',
    ],
    skillId: 'concept-coach',
    tabId: null,
    promptOverrides: {
      prependSystemPrompt: '你正在参与提示竞技。宁可少给，也不要给出难以长期回忆、边界不清或依赖短期语境的提示。',
      tabRunPrompts: {
        'self-test-cards': '为每张候选卡优先生成可长期保持、可触发回忆、可辨析误区的提示；对不合格候选宁缺毋滥。',
      },
    },
    toolPolicyOverrides: {
      enabledToolGroups: ['context-read', 'review-read', 'vars'],
    },
    createdAt: BUILTIN_ARENA_PACK_CREATED_AT,
    updatedAt: BUILTIN_ARENA_PACK_CREATED_AT,
    sampleHint: '严格长期记忆导向',
  },
  {
    id: 'builtin-socratic-expression',
    title: 'Socratic Expression Coach',
    source: 'builtin',
    state: 'active',
    eligibleScenarios: [
      'concept-expression-coach',
      'note-refinement',
    ],
    skillId: null,
    tabId: null,
    promptOverrides: {
      appendSystemPrompt: '优先通过追问、表达框架和反例，帮助用户自己说出来，而不是直接替用户总结完。',
    },
    createdAt: BUILTIN_ARENA_PACK_CREATED_AT,
    updatedAt: BUILTIN_ARENA_PACK_CREATED_AT,
    sampleHint: '强调表达与追问',
  },
  {
    id: 'builtin-topic-cartographer',
    title: 'Topic Cartographer',
    source: 'builtin',
    state: 'active',
    eligibleScenarios: [
      'topic-auto-card',
      'candidate-card-generation',
    ],
    skillId: 'concept-coach',
    tabId: null,
    promptOverrides: {
      prependSystemPrompt: '先把材料拆成可生成卡片的主题结构，再决定哪些点值得进入长期记忆。',
    },
    createdAt: BUILTIN_ARENA_PACK_CREATED_AT,
    updatedAt: BUILTIN_ARENA_PACK_CREATED_AT,
    sampleHint: '偏材料结构化',
  },
];

export const DEFAULT_ARENA_SETTINGS: ArenaSettings = {
  defaultOffMigrationVersion: ARENA_DEFAULT_OFF_MIGRATION_VERSION,
  enabled: false,
  ai: {
    enabled: true,
    surfaces: ['standalone-dialog', 'review-dialog-sidecar', 'review-tab-companion'],
    scenarios: DEFAULT_ARENA_SCENARIOS,
    strategyPacks: DEFAULT_ARENA_PACKS,
    explorationRate: 0.12,
    challenge: {
      minSamples: 4,
      scoreGapForConfidence: 0.7,
      consecutiveNegativeThreshold: 2,
      cloneVariantLimit: 3,
      explicitTriggerEnabled: true,
    },
  },
  srs: {
    enabled: true,
    contestantIds: ['fsrs-v6', 'sm15', 'sm2'],
    targetKinds: ['item', 'descriptor'],
    advisoryOnly: true,
    divergenceThresholdRatio: 0.35,
    minimumReviewsForConfidence: 10,
  },
  manager: {
    activeDomain: 'ai',
    selectedPoolKey: null,
    selectedScenarioId: 'all',
    showOnlyActive: true,
  },
};

export const DEFAULT_ARENA_STORE_DATA: ArenaStoreData = {
  schemaVersion: 1,
  matches: [],
  scores: [],
  attributions: [],
};

function normalizeString(value: unknown): string {
  return String(value || '').trim();
}

function isAIArenaScenarioId(value: unknown): value is AIArenaScenarioId {
  return AI_ARENA_SCENARIO_IDS.includes(value as AIArenaScenarioId);
}

function isAIWorkbenchSurface(value: unknown): value is AIWorkbenchSurface {
  return value === 'standalone-dialog' || value === 'review-dialog-sidecar' || value === 'review-tab-companion';
}

function isSrsArenaContestantId(value: unknown): value is SrsArenaContestantId {
  return SRS_ARENA_CONTESTANT_IDS.includes(value as SrsArenaContestantId);
}

function normalizePromptOverrides(value: unknown): AIStrategyPackPromptOverrides | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const source = value as AIStrategyPackPromptOverrides;
  const tabRunPrompts = typeof source.tabRunPrompts === 'object' && source.tabRunPrompts !== null
    ? Object.fromEntries(
      Object.entries(source.tabRunPrompts)
        .map(([tabId, prompt]) => [tabId, normalizeString(prompt)])
        .filter(([, prompt]) => Boolean(prompt)),
    )
    : undefined;
  const tabFollowUpPrompts = typeof source.tabFollowUpPrompts === 'object' && source.tabFollowUpPrompts !== null
    ? Object.fromEntries(
      Object.entries(source.tabFollowUpPrompts)
        .map(([tabId, prompt]) => [tabId, normalizeString(prompt)])
        .filter(([, prompt]) => Boolean(prompt)),
    )
    : undefined;
  const normalized: AIStrategyPackPromptOverrides = {
    prependSystemPrompt: normalizeString(source.prependSystemPrompt) || undefined,
    appendSystemPrompt: normalizeString(source.appendSystemPrompt) || undefined,
    composerPreset: normalizeString(source.composerPreset) || undefined,
    tabRunPrompts: tabRunPrompts && Object.keys(tabRunPrompts).length > 0 ? tabRunPrompts : undefined,
    tabFollowUpPrompts: tabFollowUpPrompts && Object.keys(tabFollowUpPrompts).length > 0 ? tabFollowUpPrompts : undefined,
  };
  return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

function normalizeToolPolicyOverrides(value: unknown): AIStrategyPackToolPolicyOverrides | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const source = value as AIStrategyPackToolPolicyOverrides;
  const enabledToolGroups = Array.isArray(source.enabledToolGroups)
    ? Array.from(new Set(
      source.enabledToolGroups.filter((group): group is AIChatToolGroupKey => (
        group === 'context-read'
        || group === 'study-decision'
        || group === 'siyuan-read'
        || group === 'siyuan-write'
        || group === 'review-read'
        || group === 'flashcard-write'
        || group === 'web'
        || group === 'vars'
      )),
    ))
    : undefined;
  const executionPolicies = typeof source.executionPolicies === 'object' && source.executionPolicies !== null
    ? Object.fromEntries(
      Object.entries(source.executionPolicies).map(([toolName, policy]) => [
        toolName,
        policy === 'ask-once' || policy === 'ask-always' ? policy : 'auto',
      ] as const),
    )
    : undefined;
  const resultApprovalPolicies = typeof source.resultApprovalPolicies === 'object' && source.resultApprovalPolicies !== null
    ? Object.fromEntries(
      Object.entries(source.resultApprovalPolicies).map(([toolName, policy]) => [
        toolName,
        policy === 'always' || policy === 'on-error' ? policy : 'never',
      ] as const),
    )
    : undefined;
  const normalized: AIStrategyPackToolPolicyOverrides = {
    enabledToolGroups: enabledToolGroups && enabledToolGroups.length > 0 ? enabledToolGroups : undefined,
    executionPolicies: executionPolicies && Object.keys(executionPolicies).length > 0 ? executionPolicies : undefined,
    resultApprovalPolicies: resultApprovalPolicies && Object.keys(resultApprovalPolicies).length > 0 ? resultApprovalPolicies : undefined,
  };
  return Object.values(normalized).some(Boolean) ? normalized : undefined;
}

function normalizeScenarioRegistry(value: unknown): AIArenaScenarioRegistry {
  const source = typeof value === 'object' && value !== null
    ? value as Partial<Record<AIArenaScenarioId, Partial<AIArenaScenarioDefinition>>>
    : {};
  return AI_ARENA_SCENARIO_IDS.reduce((registry, scenarioId) => {
    const fallback = DEFAULT_ARENA_SCENARIOS[scenarioId];
    const current = source[scenarioId] || {};
    registry[scenarioId] = {
      ...fallback,
      ...current,
      id: scenarioId,
      enabled: current.enabled !== false,
      title: normalizeString(current.title) || fallback.title,
      description: normalizeString(current.description) || fallback.description,
      preferredSkillId: normalizeString(current.preferredSkillId || fallback.preferredSkillId) as AISkillId,
      preferredTabId: normalizeString(current.preferredTabId || fallback.preferredTabId) as AISkillTabId,
      cardCentric: current.cardCentric === false ? false : fallback.cardCentric,
    };
    return registry;
  }, {} as AIArenaScenarioRegistry);
}

function normalizeStrategyPack(pack: unknown, fallback: AIStrategyPackDefinition, index: number): AIStrategyPackDefinition {
  const source = typeof pack === 'object' && pack !== null ? pack as Partial<AIStrategyPackDefinition> : {};
  const normalizedId = normalizeString(source.id) || fallback.id || `arena-pack-${index + 1}`;
  const eligibleScenarios = Array.isArray(source.eligibleScenarios)
    ? Array.from(new Set(source.eligibleScenarios.filter(isAIArenaScenarioId)))
    : [...fallback.eligibleScenarios];
  return {
    id: normalizedId,
    title: normalizeString(source.title) || fallback.title || normalizedId,
    source: source.source === 'user' || source.source === 'ai-generated' ? source.source : fallback.source,
    state: source.state === 'pinned' || source.state === 'retired' || source.state === 'disabled'
      ? source.state
      : fallback.state,
    eligibleScenarios: eligibleScenarios.length > 0 ? eligibleScenarios : [...fallback.eligibleScenarios],
    skillId: normalizeString(source.skillId || fallback.skillId) as AISkillId || null,
    tabId: normalizeString(source.tabId || fallback.tabId) as AISkillTabId || null,
    promptOverrides: normalizePromptOverrides(source.promptOverrides) || normalizePromptOverrides(fallback.promptOverrides),
    toolPolicyOverrides: normalizeToolPolicyOverrides(source.toolPolicyOverrides) || normalizeToolPolicyOverrides(fallback.toolPolicyOverrides),
    createdAt: Number(source.createdAt) || fallback.createdAt || Date.now(),
    updatedAt: Number(source.updatedAt) || fallback.updatedAt || Date.now(),
    sampleHint: normalizeString(source.sampleHint) || fallback.sampleHint,
  };
}

function normalizeStrategyPacks(value: unknown): AIStrategyPackDefinition[] {
  const rawPacks = Array.isArray(value) ? value : [];
  const byId = new Map<string, AIStrategyPackDefinition>();
  DEFAULT_ARENA_PACKS.forEach((pack, index) => {
    byId.set(pack.id, normalizeStrategyPack(pack, pack, index));
  });
  rawPacks.forEach((pack, index) => {
    const rawId = normalizeString((pack as AIStrategyPackDefinition | undefined)?.id);
    const fallback = byId.get(rawId) || DEFAULT_ARENA_PACKS[index % DEFAULT_ARENA_PACKS.length] || DEFAULT_ARENA_PACKS[0];
    const normalized = normalizeStrategyPack(pack, fallback, index);
    byId.set(normalized.id, normalized);
  });
  return Array.from(byId.values()).sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0));
}

export function normalizeArenaSettings(value: unknown): ArenaSettings {
  const source = typeof value === 'object' && value !== null ? value as Partial<ArenaSettings> : {};
  const ai = typeof source.ai === 'object' && source.ai !== null ? source.ai : {};
  const srs = typeof source.srs === 'object' && source.srs !== null ? source.srs : {};
  const manager = typeof source.manager === 'object' && source.manager !== null ? source.manager : {};
  const defaultOffMigrationVersion = Math.max(0, Math.floor(Number(source.defaultOffMigrationVersion) || 0));
  const hasDefaultOffMigration = defaultOffMigrationVersion >= ARENA_DEFAULT_OFF_MIGRATION_VERSION;
  const surfaces = Array.isArray(ai.surfaces)
    ? Array.from(new Set(ai.surfaces.filter(isAIWorkbenchSurface)))
    : DEFAULT_ARENA_SETTINGS.ai.surfaces;
  const contestantIds = Array.isArray(srs.contestantIds)
    ? Array.from(new Set(srs.contestantIds.filter(isSrsArenaContestantId)))
    : DEFAULT_ARENA_SETTINGS.srs.contestantIds;
  const targetKinds = Array.isArray(srs.targetKinds)
    ? Array.from(new Set(srs.targetKinds.filter((kind): kind is Extract<ArenaTargetKind, 'item' | 'descriptor'> => kind === 'item' || kind === 'descriptor')))
    : DEFAULT_ARENA_SETTINGS.srs.targetKinds;
  return {
    defaultOffMigrationVersion: ARENA_DEFAULT_OFF_MIGRATION_VERSION,
    enabled: hasDefaultOffMigration && source.enabled === true,
    ai: {
      enabled: ai.enabled !== false,
      surfaces: surfaces.length > 0 ? surfaces : DEFAULT_ARENA_SETTINGS.ai.surfaces,
      scenarios: normalizeScenarioRegistry(ai.scenarios),
      strategyPacks: normalizeStrategyPacks(ai.strategyPacks),
      explorationRate: Math.min(0.5, Math.max(0, Number(ai.explorationRate) || DEFAULT_ARENA_SETTINGS.ai.explorationRate)),
      challenge: {
        minSamples: Math.max(1, Math.floor(Number(ai.challenge?.minSamples) || DEFAULT_ARENA_SETTINGS.ai.challenge.minSamples)),
        scoreGapForConfidence: Math.max(0.1, Number(ai.challenge?.scoreGapForConfidence) || DEFAULT_ARENA_SETTINGS.ai.challenge.scoreGapForConfidence),
        consecutiveNegativeThreshold: Math.max(1, Math.floor(Number(ai.challenge?.consecutiveNegativeThreshold) || DEFAULT_ARENA_SETTINGS.ai.challenge.consecutiveNegativeThreshold)),
        cloneVariantLimit: Math.max(1, Math.floor(Number(ai.challenge?.cloneVariantLimit) || DEFAULT_ARENA_SETTINGS.ai.challenge.cloneVariantLimit)),
        explicitTriggerEnabled: ai.challenge?.explicitTriggerEnabled !== false,
      },
    },
    srs: {
      enabled: srs.enabled !== false,
      contestantIds: contestantIds.length > 0 ? contestantIds : DEFAULT_ARENA_SETTINGS.srs.contestantIds,
      targetKinds: targetKinds.length > 0 ? targetKinds : DEFAULT_ARENA_SETTINGS.srs.targetKinds,
      advisoryOnly: srs.advisoryOnly !== false,
      divergenceThresholdRatio: Math.max(0.05, Number(srs.divergenceThresholdRatio) || DEFAULT_ARENA_SETTINGS.srs.divergenceThresholdRatio),
      minimumReviewsForConfidence: Math.max(1, Math.floor(Number(srs.minimumReviewsForConfidence) || DEFAULT_ARENA_SETTINGS.srs.minimumReviewsForConfidence)),
    },
    manager: {
      activeDomain: manager.activeDomain === 'srs' ? 'srs' : 'ai',
      selectedPoolKey: normalizeString(manager.selectedPoolKey) || null,
      selectedScenarioId: isAIArenaScenarioId(manager.selectedScenarioId) ? manager.selectedScenarioId : 'all',
      showOnlyActive: manager.showOnlyActive !== false,
    },
  };
}

export function buildArenaPoolKey(input: {
  surface: AIWorkbenchSurface;
  scenarioId: AIArenaScenarioId;
  targetKind: ArenaTargetKind;
  skillId?: AISkillId | null;
  tabId?: AISkillTabId | null;
}): string {
  const skillId = normalizeString(input.skillId) || 'none';
  const tabId = normalizeString(input.tabId) || 'none';
  return ['ai', input.surface, input.scenarioId, input.targetKind, skillId, tabId].join('::');
}

export function parseArenaPoolKey(poolKey: string): ArenaPoolDescriptor | null {
  const [domain, surface, scenarioId, targetKind, skillId, tabId] = String(poolKey || '').split('::');
  if (domain !== 'ai' || !isAIWorkbenchSurface(surface) || !isAIArenaScenarioId(scenarioId)) {
    return null;
  }
  if (targetKind !== 'topic' && targetKind !== 'item' && targetKind !== 'concept' && targetKind !== 'descriptor' && targetKind !== 'note') {
    return null;
  }
  return {
    key: buildArenaPoolKey({
      surface,
      scenarioId,
      targetKind,
      skillId: skillId === 'none' ? null : skillId as AISkillId,
      tabId: tabId === 'none' ? null : tabId as AISkillTabId,
    }),
    surface,
    scenarioId,
    targetKind,
    skillId: skillId === 'none' ? null : skillId as AISkillId,
    tabId: tabId === 'none' ? null : tabId as AISkillTabId,
  };
}

export function buildSrsArenaPoolKey(targetKind: Extract<ArenaTargetKind, 'item' | 'descriptor'>): string {
  return `srs::${targetKind}`;
}
