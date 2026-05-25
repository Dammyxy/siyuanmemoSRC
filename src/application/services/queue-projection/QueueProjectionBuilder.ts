import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import { buildQueueSnapshotRow } from '@/core/queue/domain/queueCardProjection';
import { SrsV2QueuePolicy } from '@/core/queue/domain/SrsV2QueuePolicy';
import {
  planProcessingPriorityInvalidation,
  type PrioritySourceChange,
  type ProcessingPriorityInvalidationPlan,
  type ProcessingWorkItem,
} from '@/core/processing/processingScheduler';
import { canonicalizeSchedulingState } from '@/core/scheduler/schedulingStateCleanliness';
import {
  CardState,
  CardType,
  type FSRSCard,
} from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import type {
  QueueProjectionCounterBuckets,
  QueueProjectionCounters,
  QueueProjectionDueBucket,
  QueueProjectionRow,
  type QueueProjectionSourceCardFingerprint,
} from '@/application/ports/QueueProjectionPort';

export type ProjectionBuildQueueType =
  | QueueType.RetrievalPractice
  | QueueType.IncrementalLearning;

export type DeferredProjectionBuildQueueType =
  | QueueType.FilterGroup
  | QueueType.FinalDrill
  | QueueType.Leech
  | QueueType.NeuralRoam;

export type QueueProjectionMembershipReason =
  | 'learning-due'
  | 'review-due'
  | 'new'
  | 'rotation'
  | 'manual-outstanding'
  | 'frontier-candidate'
  | 'due'
  | 'future';

export interface QueueProjectionBuildInput {
  queueType: ProjectionBuildQueueType;
  baseCards: FSRSCard[];
  manualCards?: FSRSCard[];
  now: number;
  dayEnd: number;
  newCardsPerDay: number;
  reviewsPerDay: number;
  priorityRandomness?: number;
  stableSalt: string;
  policyHash: string;
  sourceGeneration: number;
  updatedAt?: number;
  temporaryBlacklistIds?: string[];
  customOrder?: string[];
  frontierCandidateCount?: number;
  learnAheadWindowEnd?: number | null;
  learnAheadMaxCards?: number;
  isDismissed?: (card: FSRSCard) => boolean;
}

export interface QueueProjectionBuildResult {
  rows: QueueProjectionRow[];
  frontierRows: QueueProjectionRow[];
  counters: QueueProjectionCounters;
}

export interface OrderedQueueProjectionRowsInput {
  queueType: QueueType;
  cards: FSRSCard[];
  now: number;
  policyHash: string;
  sourceGeneration: number;
  updatedAt?: number;
  membershipReason?: string;
  payload?: (card: FSRSCard, zeroBasedIndex: number) => Record<string, unknown>;
  rowId?: (card: FSRSCard, zeroBasedIndex: number) => string | undefined;
}

export type QueueProjectionAffectedReason =
  | 'reviewed-card'
  | 'same-block'
  | 'sibling'
  | 'logical-equivalent'
  | 'manual-outstanding'
  | 'final-drill'
  | 'leech'
  | 'frontier-candidate'
  | 'neural-synthetic'
  | 'neural-neighbor'
  | 'neural-history-cursor';

export type QueueProjectionAffectedCardRef =
  | string
  | Pick<FSRSCard, 'id' | 'blockId'>;

export interface QueueProjectionAffectedSetInput {
  reviewedCard?: QueueProjectionAffectedCardRef | null;
  sameBlockCards?: QueueProjectionAffectedCardRef[];
  siblingCards?: QueueProjectionAffectedCardRef[];
  logicalEquivalentCards?: QueueProjectionAffectedCardRef[];
  manualOutstandingCards?: QueueProjectionAffectedCardRef[];
  finalDrillCards?: QueueProjectionAffectedCardRef[];
  leechCards?: QueueProjectionAffectedCardRef[];
  frontierCards?: QueueProjectionAffectedCardRef[];
}

export interface QueueProjectionAffectedEntry {
  cardId: string;
  blockId: string | null;
  reasons: QueueProjectionAffectedReason[];
}

export interface QueueProjectionAffectedSet {
  entries: QueueProjectionAffectedEntry[];
  affectedCardIds: string[];
  affectedBlockIds: string[];
}

export interface DeferredQueueProjectionAffectedSet extends QueueProjectionAffectedSet {
  queueType: DeferredProjectionBuildQueueType;
  refreshRequired: boolean;
  refreshReason: QueueProjectionInvalidationReason | null;
}

export type QueueProjectionInvalidationReason =
  | 'review-feedback'
  | 'manual-membership-changed'
  | 'queue-limit-frontier'
  | 'day-rollover'
  | 'settings-policy-changed'
  | 'scheduler-policy-hash-changed'
  | 'algorithm-installed'
  | 'algorithm-disabled'
  | 'batch-reschedule'
  | 'filter-definition-changed'
  | 'drill-cleanup'
  | 'leech-action-policy-changed'
  | 'neural-session-reset'
  | 'source-existence-repair'
  | 'projection-corruption'
  | 'explicit-repair'
  | string;

export interface QueueProjectionInvalidationPlanInput {
  reason: QueueProjectionInvalidationReason;
  queueTypes: ProjectionBuildQueueType[];
  generation: number;
  createdAt?: number;
  affectedCardIds?: string[];
  affectedBlockIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface QueueProjectionInvalidationPlan {
  reason: QueueProjectionInvalidationReason;
  queueTypes: ProjectionBuildQueueType[];
  generation: number;
  createdAt: number;
  affectedCardIds: string[];
  affectedBlockIds: string[];
  metadata: Record<string, unknown>;
  refreshRequired: boolean;
  fullRebuildRequired: boolean;
}

export interface PrioritySourceQueueProjectionInvalidationPlanInput {
  change: PrioritySourceChange;
  processingItems: ProcessingWorkItem[];
  reviewRefs?: Array<{ cardId: string; blockId?: string | null; sourceLineage?: string[] }>;
  queueTypes: ProjectionBuildQueueType[];
  generation: number;
  createdAt?: number;
}

export interface PrioritySourceQueueProjectionInvalidationPlan extends QueueProjectionInvalidationPlan {
  processing: ProcessingPriorityInvalidationPlan;
}

export interface FilterGroupProjectionRowsInput {
  filteredCards: FSRSCard[];
  manualCards?: FSRSCard[];
  temporaryBlacklistIds?: string[];
  customOrder?: string[];
  filterHash: string;
  filterId?: string | null;
  transferSessionId?: string | null;
  commitPolicy?: 'preview-only' | 'write-schedule' | string;
  now: number;
  policyHash: string;
  sourceGeneration: number;
  updatedAt?: number;
}

export interface FinalDrillProjectionEntry {
  cardId: string;
  source?: string | null;
  timestamp?: number | null;
  drillLogId?: string | null;
}

export interface FinalDrillProjectionRowsInput {
  strategyCards: FSRSCard[];
  entries?: FinalDrillProjectionEntry[];
  expiredCardIds?: string[];
  now: number;
  policyHash: string;
  sourceGeneration: number;
  updatedAt?: number;
}

export interface LeechProjectionRowsInput {
  cards: FSRSCard[];
  threshold: number;
  manualCardIds?: string[];
  temporaryBlacklistIds?: string[];
  action?: string | null;
  tagName?: string | null;
  retention?: string | null;
  now: number;
  policyHash: string;
  sourceGeneration: number;
  updatedAt?: number;
}

export interface NeuralRoamProjectionRowsInput {
  strategyCards: FSRSCard[];
  engineMode?: string | null;
  navigationState?: Record<string, unknown> | null;
  sourceNodeIds?: string[];
  seedNodeIds?: string[];
  anchorNodeIds?: string[];
  historyCursor?: Record<string, unknown> | null;
  now: number;
  policyHash: string;
  sourceGeneration: number;
  updatedAt?: number;
}

export interface StableNeuralProjectionRowIdInput {
  nodeKind: 'synthetic' | 'associated-review';
  engineMode?: string | null;
  nodeId?: string | null;
  cardId?: string | null;
}

export interface DeferredQueueProjectionAffectedSetInput extends QueueProjectionAffectedSetInput {
  queueType: DeferredProjectionBuildQueueType;
  manualCards?: QueueProjectionAffectedCardRef[];
  neuralSyntheticNodeIds?: string[];
  neuralNeighborNodeIds?: string[];
  historyCursorNodeId?: string | null;
  broadInvalidationReason?: QueueProjectionInvalidationReason | null;
}

const DEFAULT_FRONTIER_CANDIDATE_COUNT = 16;
const MAX_NEW_CARD_FRONTIER_LIMIT = Number.MAX_SAFE_INTEGER;
const FNV1A_64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV1A_64_PRIME = 0x100000001b3n;

export const BROAD_QUEUE_PROJECTION_INVALIDATION_REASONS = [
  'day-rollover',
  'settings-policy-changed',
  'scheduler-policy-hash-changed',
  'algorithm-installed',
  'algorithm-disabled',
  'batch-reschedule',
  'filter-definition-changed',
  'drill-cleanup',
  'leech-action-policy-changed',
  'neural-session-reset',
  'source-existence-repair',
  'projection-corruption',
  'explicit-repair',
] as const;

const BROAD_QUEUE_PROJECTION_INVALIDATION_REASON_SET = new Set<string>(
  BROAD_QUEUE_PROJECTION_INVALIDATION_REASONS,
);

export function buildQueueProjectionRows(input: QueueProjectionBuildInput): QueueProjectionBuildResult {
  const normalized = normalizeBuildInput(input);
  const visibleCards = applyCustomOrder(
    buildPolicyQueue(normalized, {
      newCardsPerDay: normalized.newCardsPerDay,
      reviewsPerDay: normalized.reviewsPerDay,
    }),
    normalized.customOrder,
  );
  const visibleCardIds = new Set(visibleCards.map((card) => card.id));
  const frontierCards = buildPolicyQueue(normalized, {
    newCardsPerDay: MAX_NEW_CARD_FRONTIER_LIMIT,
    reviewsPerDay: 0,
  })
    .filter((card) => !visibleCardIds.has(card.id))
    .slice(0, normalized.frontierCandidateCount);

  const rows = visibleCards.map((card, index) => buildProjectionRow(normalized, card, index, false));
  const frontierRows = frontierCards.map((card, index) => buildProjectionRow(
    normalized,
    card,
    rows.length + index,
    true,
  ));
  const learnAheadAvailable = SrsV2QueuePolicy.buildLearnAheadQueue({
    baseCards: normalized.baseCards,
    manualCards: [],
    now: normalized.now,
    dayEnd: normalized.dayEnd,
    windowEnd: normalized.learnAheadWindowEnd ?? normalized.now,
    maxCards: normalized.learnAheadMaxCards,
    newCardsPerDay: normalized.newCardsPerDay,
    reviewsPerDay: normalized.reviewsPerDay,
    priorityRandomness: normalized.priorityRandomness,
    stableSalt: normalized.stableSalt,
    isBlacklisted: (card) => normalized.temporaryBlacklistIds.includes(card.id)
      || normalized.temporaryBlacklistIds.includes(card.blockId),
    isDismissed: normalized.isDismissed,
  }).filter((card) => !visibleCardIds.has(card.id)).length;

  return {
    rows,
    frontierRows,
    counters: buildCounters(normalized, rows, learnAheadAvailable),
  };
}

export function buildQueueProjectionSourceCardFingerprint(card: FSRSCard): QueueProjectionSourceCardFingerprint {
  const normalizedCard = canonicalizeSchedulingState(card, {
    source: 'queue-persistence',
    mode: 'repair-external',
  }).card;
  const source = {
    version: 1 as const,
    cardId: String(normalizedCard.id || ''),
    blockId: normalizeNullableString(normalizedCard.blockId),
    state: normalizedCard.state,
    due: finiteNumberOrNull(normalizedCard.due),
    priority: finiteNumberOrNull(normalizedCard.priority),
    reps: nonNegativeInteger(normalizedCard.reps),
    lapses: nonNegativeInteger(normalizedCard.lapses),
    lastReview: finiteNumberOrNull(normalizedCard.lastReview),
    elapsedDays: finiteNumberOrNull(normalizedCard.elapsedDays),
    scheduledDays: finiteNumberOrNull(normalizedCard.scheduledDays),
    stability: finiteNumberOrNull(normalizedCard.stability),
    difficulty: finiteNumberOrNull(normalizedCard.difficulty),
    cardType: normalizedCard.type,
    schedulerType: normalizeNullableString(normalizedCard.schedulerType),
    aFactor: finiteNumberOrNull(normalizedCard.aFactor),
  };

  return {
    ...source,
    fingerprint: fnv1aHash(stableStringify(source)),
  };
}

export function buildOrderedQueueProjectionRows(input: OrderedQueueProjectionRowsInput): QueueProjectionBuildResult {
  const updatedAt = input.updatedAt ?? Date.now();
  const rows = uniqueCards(input.cards).map((card, index) => buildProjectionRowFromOrderedCard({
    queueType: input.queueType,
    card,
    zeroBasedIndex: index,
    now: input.now,
    policyHash: input.policyHash,
    sourceGeneration: input.sourceGeneration,
    updatedAt,
    membershipReason: input.membershipReason ?? 'materialized-strategy',
    rowId: input.rowId?.(card, index),
    payload: {
      queueKind: input.queueType,
      cardType: card.type,
      state: card.state,
      source: 'application-materialized',
      queueIndexHint: index + 1,
      ...(input.payload?.(card, index) ?? {}),
    },
  }));

  return {
    rows,
    frontierRows: [],
    counters: buildCountersForRows({
      queueType: input.queueType,
      policyHash: input.policyHash,
      sourceGeneration: input.sourceGeneration,
      updatedAt,
      now: input.now,
    }, rows),
  };
}

export function buildQueueProjectionAffectedSet(input: QueueProjectionAffectedSetInput): QueueProjectionAffectedSet {
  const entriesByCardId = new Map<string, QueueProjectionAffectedEntry>();

  const add = (ref: QueueProjectionAffectedCardRef | null | undefined, reason: QueueProjectionAffectedReason): void => {
    const normalized = normalizeAffectedRef(ref);
    if (!normalized) {
      return;
    }

    const existing = entriesByCardId.get(normalized.cardId);
    if (existing) {
      if (!existing.reasons.includes(reason)) {
        existing.reasons.push(reason);
      }
      if (!existing.blockId && normalized.blockId) {
        existing.blockId = normalized.blockId;
      }
      return;
    }

    entriesByCardId.set(normalized.cardId, {
      cardId: normalized.cardId,
      blockId: normalized.blockId,
      reasons: [reason],
    });
  };

  add(input.reviewedCard, 'reviewed-card');
  addAll(input.sameBlockCards, 'same-block', add);
  addAll(input.siblingCards, 'sibling', add);
  addAll(input.logicalEquivalentCards, 'logical-equivalent', add);
  addAll(input.manualOutstandingCards, 'manual-outstanding', add);
  addAll(input.finalDrillCards, 'final-drill', add);
  addAll(input.leechCards, 'leech', add);
  addAll(input.frontierCards, 'frontier-candidate', add);

  const entries = Array.from(entriesByCardId.values());
  return {
    entries,
    affectedCardIds: entries.map((entry) => entry.cardId),
    affectedBlockIds: uniqueStrings(entries.map((entry) => entry.blockId)),
  };
}

export function buildFilterGroupProjectionRows(input: FilterGroupProjectionRowsInput): QueueProjectionBuildResult {
  const now = input.now;
  const updatedAt = input.updatedAt ?? Date.now();
  const blacklistedIds = new Set(input.temporaryBlacklistIds ?? []);
  const filteredCards = uniqueCards(input.filteredCards)
    .filter((card) => !blacklistedIds.has(card.id) && !blacklistedIds.has(card.blockId));
  const filteredIds = new Set(filteredCards.flatMap((card) => [card.id, card.blockId].filter(Boolean)));
  const manualCards = uniqueCards(input.manualCards ?? [])
    .filter((card) => !blacklistedIds.has(card.id) && !blacklistedIds.has(card.blockId));
  const cardsById = new Map<string, FSRSCard>();

  for (const card of filteredCards) {
    cardsById.set(card.id, card);
  }
  for (const card of manualCards) {
    cardsById.set(card.id, card);
  }

  const visibleCards = applyCustomOrder([...cardsById.values()], input.customOrder ?? []);
  const rows = visibleCards.map((card, index) => buildProjectionRowFromOrderedCard({
    queueType: QueueType.FilterGroup,
    card,
    zeroBasedIndex: index,
    now,
    policyHash: input.policyHash,
    sourceGeneration: input.sourceGeneration,
    updatedAt,
    membershipReason: filteredIds.has(card.id) || filteredIds.has(card.blockId) ? 'due' : 'manual-outstanding',
    payload: {
      queueKind: 'filter-group',
      cardType: card.type,
      state: card.state,
      filterHash: input.filterHash,
      filterId: input.filterId ?? null,
      transferSessionId: input.transferSessionId ?? null,
      commitPolicy: input.commitPolicy ?? 'preview-only',
      membershipSource: filteredIds.has(card.id) || filteredIds.has(card.blockId) ? 'filter' : 'manual',
      temporaryBlacklisted: false,
      sessionTransferActive: Boolean(input.transferSessionId),
    },
  }));

  return {
    rows,
    frontierRows: [],
    counters: buildCountersForRows({
      queueType: QueueType.FilterGroup,
      policyHash: input.policyHash,
      sourceGeneration: input.sourceGeneration,
      updatedAt,
      now,
    }, rows),
  };
}

export function buildFinalDrillProjectionRows(input: FinalDrillProjectionRowsInput): QueueProjectionBuildResult {
  const updatedAt = input.updatedAt ?? Date.now();
  const entriesByCardId = new Map((input.entries ?? []).map((entry) => [entry.cardId, entry]));
  const expiredCardIds = new Set(input.expiredCardIds ?? []);
  const rows = input.strategyCards.map((card, index) => {
    const entry = entriesByCardId.get(card.id);
    return buildProjectionRowFromOrderedCard({
      queueType: QueueType.FinalDrill,
      card,
      zeroBasedIndex: index,
      now: input.now,
      policyHash: input.policyHash,
      sourceGeneration: input.sourceGeneration,
      updatedAt,
      membershipReason: 'final-drill',
      payload: {
        queueKind: 'final-drill',
        cardType: card.type,
        state: card.state,
        drillEntryId: entry?.cardId ?? card.id,
        sourceType: entry?.source ?? null,
        timestamp: entry?.timestamp ?? null,
        drillLogId: entry?.drillLogId ?? null,
        expired: expiredCardIds.has(card.id) || expiredCardIds.has(card.blockId),
        flipElementOrderKey: index + 1,
      },
    });
  });

  return {
    rows,
    frontierRows: [],
    counters: buildCountersForRows({
      queueType: QueueType.FinalDrill,
      policyHash: input.policyHash,
      sourceGeneration: input.sourceGeneration,
      updatedAt,
      now: input.now,
    }, rows),
  };
}

export function buildLeechProjectionRows(input: LeechProjectionRowsInput): QueueProjectionBuildResult {
  const updatedAt = input.updatedAt ?? Date.now();
  const blacklistedIds = new Set(input.temporaryBlacklistIds ?? []);
  const manualIds = new Set(input.manualCardIds ?? []);
  const rows = uniqueCards(input.cards)
    .filter((card) => !blacklistedIds.has(card.id) && !blacklistedIds.has(card.blockId))
    .filter((card) => Number(card.lapses) >= input.threshold || manualIds.has(card.id) || manualIds.has(card.blockId))
    .sort(compareLeechProjectionCards)
    .map((card, index) => {
      const lapseMember = Number(card.lapses) >= input.threshold;
      const manualMember = manualIds.has(card.id) || manualIds.has(card.blockId);
      return buildProjectionRowFromOrderedCard({
        queueType: QueueType.Leech,
        card,
        zeroBasedIndex: index,
        now: input.now,
        policyHash: input.policyHash,
        sourceGeneration: input.sourceGeneration,
        updatedAt,
        membershipReason: lapseMember ? 'leech' : 'manual-outstanding',
        payload: {
          queueKind: 'leech',
          cardType: card.type,
          state: card.state,
          membershipSource: lapseMember && manualMember
            ? 'lapse-and-manual'
            : (lapseMember ? 'lapse' : 'manual'),
          threshold: input.threshold,
          lapses: Number(card.lapses) || 0,
          actionState: input.action ?? null,
          tagName: input.tagName ?? null,
          retention: input.retention ?? null,
        },
      });
    });

  return {
    rows,
    frontierRows: [],
    counters: buildCountersForRows({
      queueType: QueueType.Leech,
      policyHash: input.policyHash,
      sourceGeneration: input.sourceGeneration,
      updatedAt,
      now: input.now,
    }, rows),
  };
}

export function buildStableNeuralProjectionRowId(input: StableNeuralProjectionRowIdInput): string {
  const mode = normalizeProjectionIdentity(input.engineMode) || 'default';
  if (input.nodeKind === 'associated-review') {
    return `neural-roam:associated-review:${mode}:${normalizeProjectionIdentity(input.cardId)}`;
  }
  return `neural-roam:synthetic:${mode}:${normalizeProjectionIdentity(input.nodeId)}`;
}

export function buildNeuralRoamProjectionRows(input: NeuralRoamProjectionRowsInput): QueueProjectionBuildResult {
  const updatedAt = input.updatedAt ?? Date.now();
  const engineMode = normalizeProjectionIdentity(input.engineMode) || 'default';
  const rows = input.strategyCards.map((card, index) => {
    const neuralContext = readRecord(card.meta?.neuralContext);
    const isAssociatedReview = neuralContext.nodeRole === 'associated-review' || neuralContext.isFlashcard === true;
    const syntheticNodeId = String(card.blockId || card.id || '');
    const rowId = buildStableNeuralProjectionRowId(isAssociatedReview
      ? { nodeKind: 'associated-review', cardId: card.id, engineMode }
      : { nodeKind: 'synthetic', nodeId: syntheticNodeId, engineMode });

    return buildProjectionRowFromOrderedCard({
      queueType: QueueType.NeuralRoam,
      card,
      zeroBasedIndex: index,
      now: input.now,
      policyHash: input.policyHash,
      sourceGeneration: input.sourceGeneration,
      updatedAt,
      membershipReason: isAssociatedReview ? 'manual-outstanding' : 'frontier-candidate',
      rowId,
      payload: {
        queueKind: 'neural-roam',
        cardType: card.type,
        state: card.state,
        nodeKind: isAssociatedReview ? 'associated-review' : 'synthetic',
        syntheticNodeId: isAssociatedReview ? null : syntheticNodeId,
        associatedReviewCardId: isAssociatedReview ? card.id : null,
        sourceVirtualNodeId: normalizeProjectionIdentity(neuralContext.sourceVirtualNodeId) || null,
        associationType: normalizeProjectionIdentity(neuralContext.associationType) || null,
        reason: normalizeProjectionIdentity(neuralContext.reason) || null,
        engineMode,
        navigationState: input.navigationState ?? null,
        sourceNodeIds: uniqueStrings(input.sourceNodeIds ?? []),
        seedNodeIds: uniqueStrings(input.seedNodeIds ?? []),
        anchorNodeIds: uniqueStrings(input.anchorNodeIds ?? []),
        historyCursor: input.historyCursor ?? null,
      },
    });
  });

  return {
    rows,
    frontierRows: [],
    counters: buildCountersForRows({
      queueType: QueueType.NeuralRoam,
      policyHash: input.policyHash,
      sourceGeneration: input.sourceGeneration,
      updatedAt,
      now: input.now,
    }, rows),
  };
}

export function buildDeferredQueueProjectionAffectedSet(
  input: DeferredQueueProjectionAffectedSetInput,
): DeferredQueueProjectionAffectedSet {
  if (input.broadInvalidationReason && isBroadQueueProjectionInvalidationReason(input.broadInvalidationReason)) {
    return {
      queueType: input.queueType,
      entries: [],
      affectedCardIds: [],
      affectedBlockIds: [],
      refreshRequired: true,
      refreshReason: input.broadInvalidationReason,
    };
  }

  const base = buildQueueProjectionAffectedSet({
    ...input,
    manualOutstandingCards: [
      ...(input.manualOutstandingCards ?? []),
      ...(input.manualCards ?? []),
    ],
  });
  const entriesByCardId = new Map(base.entries.map((entry) => [entry.cardId, { ...entry, reasons: [...entry.reasons] }]));

  const addSynthetic = (cardId: string, reason: QueueProjectionAffectedReason): void => {
    const normalized = cardId.trim();
    if (!normalized || entriesByCardId.has(normalized)) {
      return;
    }
    entriesByCardId.set(normalized, {
      cardId: normalized,
      blockId: null,
      reasons: [reason],
    });
  };

  for (const nodeId of input.neuralSyntheticNodeIds ?? []) {
    addSynthetic(`neural:synthetic:${nodeId}`, 'neural-synthetic');
  }
  for (const nodeId of input.neuralNeighborNodeIds ?? []) {
    addSynthetic(`neural:neighbor:${nodeId}`, 'neural-neighbor');
  }
  if (input.historyCursorNodeId) {
    addSynthetic(`neural:history-cursor:${input.historyCursorNodeId}`, 'neural-history-cursor');
  }

  const entries = Array.from(entriesByCardId.values());
  return {
    queueType: input.queueType,
    entries,
    affectedCardIds: entries.map((entry) => entry.cardId),
    affectedBlockIds: uniqueStrings(entries.map((entry) => entry.blockId)),
    refreshRequired: false,
    refreshReason: null,
  };
}

export function isBroadQueueProjectionInvalidationReason(reason: string): boolean {
  return BROAD_QUEUE_PROJECTION_INVALIDATION_REASON_SET.has(reason);
}

export function planQueueProjectionInvalidation(
  input: QueueProjectionInvalidationPlanInput,
): QueueProjectionInvalidationPlan {
  const fullRebuildRequired = isBroadQueueProjectionInvalidationReason(input.reason);
  return {
    reason: input.reason,
    queueTypes: [...input.queueTypes],
    generation: input.generation,
    createdAt: input.createdAt ?? Date.now(),
    affectedCardIds: uniqueStrings(input.affectedCardIds ?? []),
    affectedBlockIds: uniqueStrings(input.affectedBlockIds ?? []),
    metadata: { ...(input.metadata ?? {}) },
    refreshRequired: fullRebuildRequired,
    fullRebuildRequired,
  };
}

export function planPrioritySourceQueueProjectionInvalidation(
  input: PrioritySourceQueueProjectionInvalidationPlanInput,
): PrioritySourceQueueProjectionInvalidationPlan {
  const processing = planProcessingPriorityInvalidation({
    change: input.change,
    items: input.processingItems,
    reviewRefs: input.reviewRefs,
  });
  const reviewQueueTypes = processing.projectionFamilies.includes('review') ? input.queueTypes : [];
  const plan = planQueueProjectionInvalidation({
    reason: processing.reason,
    queueTypes: reviewQueueTypes,
    generation: input.generation,
    createdAt: input.createdAt,
    affectedCardIds: processing.affectedReviewCardIds,
    affectedBlockIds: processing.affectedBlockIds,
    metadata: {
      sourceId: processing.sourceId,
      projectionFamilies: processing.projectionFamilies,
      affectedProcessingItemIds: processing.affectedProcessingItemIds,
    },
  });

  return {
    ...plan,
    refreshRequired: processing.refreshRequired || plan.refreshRequired,
    processing,
  };
}

interface NormalizedQueueProjectionBuildInput extends QueueProjectionBuildInput {
  manualCards: FSRSCard[];
  priorityRandomness: number;
  updatedAt: number;
  customOrder: string[];
  frontierCandidateCount: number;
  learnAheadWindowEnd: number | null;
  learnAheadMaxCards: number;
  temporaryBlacklistIds: string[];
  isDismissed: (card: FSRSCard) => boolean;
}

function normalizeBuildInput(input: QueueProjectionBuildInput): NormalizedQueueProjectionBuildInput {
  return {
    ...input,
    manualCards: input.manualCards ?? [],
    priorityRandomness: Math.max(0, Math.min(1, Number(input.priorityRandomness ?? 0))),
    updatedAt: input.updatedAt ?? Date.now(),
    customOrder: input.customOrder ?? [],
    frontierCandidateCount: Math.max(0, Math.floor(input.frontierCandidateCount ?? DEFAULT_FRONTIER_CANDIDATE_COUNT)),
    learnAheadWindowEnd: Number.isFinite(Number(input.learnAheadWindowEnd))
      ? Number(input.learnAheadWindowEnd)
      : null,
    learnAheadMaxCards: Math.max(0, Math.floor(Number(input.learnAheadMaxCards ?? 0))),
    temporaryBlacklistIds: input.temporaryBlacklistIds ?? [],
    isDismissed: input.isDismissed ?? isCardDismissed,
  };
}

function buildPolicyQueue(
  input: NormalizedQueueProjectionBuildInput,
  limits: Pick<NormalizedQueueProjectionBuildInput, 'newCardsPerDay' | 'reviewsPerDay'>,
): FSRSCard[] {
  const blacklistedIds = new Set(input.temporaryBlacklistIds);
  const buildInput = {
    baseCards: input.baseCards,
    manualCards: input.manualCards,
    now: input.now,
    dayEnd: input.dayEnd,
    newCardsPerDay: limits.newCardsPerDay,
    reviewsPerDay: limits.reviewsPerDay,
    priorityRandomness: input.priorityRandomness,
    stableSalt: input.stableSalt,
    isBlacklisted: (card: FSRSCard) => blacklistedIds.has(card.id) || blacklistedIds.has(card.blockId),
    isDismissed: input.isDismissed,
  };

  return input.queueType === QueueType.RetrievalPractice
    ? SrsV2QueuePolicy.buildRetrievalPracticeQueue(buildInput)
    : SrsV2QueuePolicy.buildIncrementalLearningQueue(buildInput);
}

function applyCustomOrder(cards: FSRSCard[], customOrder: string[]): FSRSCard[] {
  if (customOrder.length === 0) {
    return cards;
  }

  const cardsById = new Map<string, FSRSCard>();
  for (const card of cards) {
    cardsById.set(card.id, card);
  }

  const ordered: FSRSCard[] = [];
  for (const id of customOrder) {
    const card = cardsById.get(id);
    if (card) {
      ordered.push(card);
      cardsById.delete(id);
    }
  }

  return [...ordered, ...cardsById.values()];
}

function buildProjectionRow(
  input: NormalizedQueueProjectionBuildInput,
  card: FSRSCard,
  zeroBasedIndex: number,
  frontierCandidate: boolean,
): QueueProjectionRow {
  const queueIndex = zeroBasedIndex + 1;
  const snapshot = buildQueueSnapshotRow(card, { queueIndex });
  const membershipReason = resolveMembershipReason(input, card, frontierCandidate);
  const dueBucket = resolveDueBucket(input, card, membershipReason);
  const sortKey = buildSortKey(queueIndex, card);
  const formalMemoryCard = isFormalMemoryCard(card);

  return {
    queueType: input.queueType,
    rowId: snapshot.id,
    cardId: snapshot.fsrsCardId,
    blockId: snapshot.blockId || null,
    deckId: snapshot.deckId || null,
    membershipReason,
    dueAt: Number.isFinite(Number(card.due)) ? Number(card.due) : null,
    dueBucket,
    priorityScore: normalizePriority(card.priority),
    sortKey,
    queueIndexHint: queueIndex,
    policyHash: input.policyHash,
    sourceGeneration: input.sourceGeneration,
    payload: {
      cardType: card.type,
      state: card.state,
      due: Number.isFinite(Number(card.due)) ? Number(card.due) : null,
      priority: normalizePriority(card.priority),
      sourceCardFingerprint: buildQueueProjectionSourceCardFingerprint(card),
      rowId: snapshot.id,
      manualOutstanding: membershipReason === 'manual-outstanding',
      frontierCandidate,
      rotationCard: input.queueType === QueueType.IncrementalLearning && !formalMemoryCard,
      formalMemoryCard,
      stableSalt: input.stableSalt,
    },
    updatedAt: input.updatedAt,
  };
}

function buildProjectionRowFromOrderedCard(input: {
  queueType: QueueType;
  card: FSRSCard;
  zeroBasedIndex: number;
  now: number;
  policyHash: string;
  sourceGeneration: number;
  updatedAt: number;
  membershipReason: string;
  payload: Record<string, unknown>;
  rowId?: string;
}): QueueProjectionRow {
  const queueIndex = input.zeroBasedIndex + 1;
  const snapshot = buildQueueSnapshotRow(input.card, { queueIndex });
  return {
    queueType: input.queueType,
    rowId: input.rowId ?? snapshot.id,
    cardId: snapshot.fsrsCardId,
    blockId: snapshot.blockId || null,
    deckId: snapshot.deckId || null,
    membershipReason: input.membershipReason,
    dueAt: Number.isFinite(Number(input.card.due)) ? Number(input.card.due) : null,
    dueBucket: resolveOrderedDueBucket(input.card, input.now, input.membershipReason),
    priorityScore: normalizePriority(input.card.priority),
    sortKey: buildSortKey(queueIndex, input.card),
    queueIndexHint: queueIndex,
    policyHash: input.policyHash,
    sourceGeneration: input.sourceGeneration,
    payload: {
      rowId: input.rowId ?? snapshot.id,
      state: input.card.state,
      due: Number.isFinite(Number(input.card.due)) ? Number(input.card.due) : null,
      priority: normalizePriority(input.card.priority),
      ...input.payload,
      sourceCardFingerprint: buildQueueProjectionSourceCardFingerprint(input.card),
    },
    updatedAt: input.updatedAt,
  };
}

function resolveOrderedDueBucket(
  card: FSRSCard,
  now: number,
  membershipReason: string,
): QueueProjectionDueBucket {
  if (isCardDismissed(card) || card.state === CardState.Suspended) {
    return 'blocked';
  }
  if (membershipReason === 'manual-outstanding') {
    return 'manual';
  }
  if (isNewCard(card)) {
    return 'new';
  }
  const dueAt = Number(card.due);
  if (!Number.isFinite(dueAt)) {
    return 'future';
  }
  return dueAt <= now ? 'overdue' : 'future';
}

function buildCountersForRows(
  input: {
    queueType: QueueType;
    policyHash: string;
    sourceGeneration: number;
    updatedAt: number;
    now: number;
  },
  rows: QueueProjectionRow[],
): QueueProjectionCounters {
  const buckets: QueueProjectionCounterBuckets = {
    all: 0,
    item: 0,
    descriptor: 0,
    topic: 0,
    concept: 0,
  };
  let due = 0;

  for (const row of rows) {
    buckets.all += 1;
    const cardType = String(row.payload.cardType || CardType.Item);
    if (cardType === CardType.Descriptor) {
      buckets.descriptor += 1;
    } else if (cardType === CardType.Topic) {
      buckets.topic += 1;
    } else if (cardType === CardType.Concept) {
      buckets.concept += 1;
    } else {
      buckets.item += 1;
    }
    if (row.dueAt != null && row.dueAt <= input.now) {
      due += 1;
    }
  }

  return {
    queueType: input.queueType,
    policyHash: input.policyHash,
    generation: input.sourceGeneration,
    version: input.sourceGeneration,
    remaining: rows.length,
    due,
    total: rows.length,
    buckets,
    updatedAt: input.updatedAt,
  };
}

function resolveMembershipReason(
  input: NormalizedQueueProjectionBuildInput,
  card: FSRSCard,
  frontierCandidate: boolean,
): QueueProjectionMembershipReason {
  if (frontierCandidate) {
    return 'frontier-candidate';
  }

  if (isManualOutstanding(input, card)) {
    return 'manual-outstanding';
  }

  if (input.queueType === QueueType.IncrementalLearning && !isFormalMemoryCard(card)) {
    return 'rotation';
  }

  if (card.state === CardState.Learning || card.state === CardState.Relearning) {
    return 'learning-due';
  }
  if (isNewCard(card)) {
    return 'new';
  }
  if (card.state === CardState.Review) {
    return 'review-due';
  }

  return Number(card.due) <= input.dayEnd ? 'due' : 'future';
}

function isManualOutstanding(input: NormalizedQueueProjectionBuildInput, card: FSRSCard): boolean {
  const manualIds = new Set(
    input.manualCards.flatMap((manualCard) => [manualCard.id, manualCard.blockId].filter(Boolean)),
  );
  if (!manualIds.has(card.id) && !manualIds.has(card.blockId)) {
    return false;
  }

  const baseIds = new Set(
    input.baseCards.flatMap((baseCard) => [baseCard.id, baseCard.blockId].filter(Boolean)),
  );
  return !baseIds.has(card.id) && !baseIds.has(card.blockId);
}

function resolveDueBucket(
  input: NormalizedQueueProjectionBuildInput,
  card: FSRSCard,
  membershipReason: QueueProjectionMembershipReason,
): QueueProjectionDueBucket {
  if (input.isDismissed(card) || card.state === CardState.Suspended) {
    return 'blocked';
  }
  if (membershipReason === 'manual-outstanding') {
    return 'manual';
  }
  if (isNewCard(card)) {
    return 'new';
  }

  const dueAt = Number(card.due);
  if (!Number.isFinite(dueAt)) {
    return 'future';
  }
  if (dueAt < input.now) {
    return 'overdue';
  }
  if (dueAt <= input.dayEnd) {
    return 'due';
  }
  return 'future';
}

function buildCounters(
  input: NormalizedQueueProjectionBuildInput,
  rows: QueueProjectionRow[],
  learnAheadAvailable = 0,
): QueueProjectionCounters {
  const buckets: QueueProjectionCounterBuckets = {
    all: 0,
    item: 0,
    descriptor: 0,
    topic: 0,
    concept: 0,
  };
  let currentLearningDue = 0;
  let todayReviewDue = 0;
  let allowedNew = 0;

  for (const row of rows) {
    buckets.all += 1;
    const cardType = String(row.payload.cardType || CardType.Item);
    if (cardType === CardType.Descriptor) {
      buckets.descriptor += 1;
    } else if (cardType === CardType.Topic) {
      buckets.topic += 1;
    } else if (cardType === CardType.Concept) {
      buckets.concept += 1;
    } else {
      buckets.item += 1;
    }

    if (row.membershipReason === 'learning-due') {
      currentLearningDue += 1;
    } else if (row.membershipReason === 'review-due') {
      todayReviewDue += 1;
    } else if (row.membershipReason === 'new') {
      allowedNew += 1;
    }
  }

  return {
    queueType: input.queueType,
    policyHash: input.policyHash,
    generation: input.sourceGeneration,
    version: input.sourceGeneration,
    remaining: rows.length,
    due: rows.length,
    total: rows.length,
    currentLearningDue,
    todayReviewDue,
    allowedNew,
    learnAheadAvailable,
    scheduledTotal: rows.length + learnAheadAvailable,
    buckets,
    updatedAt: input.updatedAt,
  };
}

function buildSortKey(queueIndex: number, card: FSRSCard): string {
  const indexPart = String(queueIndex).padStart(9, '0');
  const duePart = String(Math.max(0, Number(card.due) || 0)).padStart(16, '0');
  const priorityPart = String(normalizePriority(card.priority)).padStart(3, '0');
  return `${indexPart}:${duePart}:${priorityPart}:${card.id}`;
}

function normalizePriority(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 50;
  }
  return Math.max(0, Math.min(100, Math.floor(numeric)));
}

function finiteNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function nonNegativeInteger(value: unknown): number {
  const numeric = finiteNumberOrNull(value);
  return numeric !== null && numeric >= 0 ? Math.floor(numeric) : 0;
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function stableStringify(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  const valueType = typeof value;
  if (valueType === 'number') {
    return Number.isFinite(value as number) ? JSON.stringify(value) : 'null';
  }
  if (valueType === 'boolean' || valueType === 'string') {
    return JSON.stringify(value);
  }
  if (valueType === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.entries(record)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`;
  }
  return 'null';
}

function fnv1aHash(input: string): string {
  let hash = FNV1A_64_OFFSET_BASIS;
  for (const character of input) {
    hash ^= BigInt(character.codePointAt(0) || 0);
    hash = BigInt.asUintN(64, hash * FNV1A_64_PRIME);
  }
  return hash.toString(16).padStart(16, '0');
}

function isFormalMemoryCard(card: FSRSCard): boolean {
  return card.type === CardType.Item || card.type === CardType.Descriptor;
}

function isNewCard(card: FSRSCard): boolean {
  return card.state === CardState.New
    || (
      Number(card.reps) === 0
      && card.state !== CardState.Learning
      && card.state !== CardState.Relearning
      && card.state !== CardState.Review
    );
}

function uniqueCards(cards: FSRSCard[]): FSRSCard[] {
  const seen = new Set<string>();
  const result: FSRSCard[] = [];
  for (const card of cards) {
    const id = String(card.id || '').trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(card);
  }
  return result;
}

function compareLeechProjectionCards(left: FSRSCard, right: FSRSCard): number {
  const lapseDelta = (Number(right.lapses) || 0) - (Number(left.lapses) || 0);
  if (lapseDelta !== 0) {
    return lapseDelta;
  }

  const dueDelta = (Number(left.due) || 0) - (Number(right.due) || 0);
  if (dueDelta !== 0) {
    return dueDelta;
  }

  const priorityDelta = normalizePriority(right.priority) - normalizePriority(left.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return String(left.id || '').localeCompare(String(right.id || ''));
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeProjectionIdentity(value: unknown): string {
  return String(value ?? '').trim();
}

function addAll(
  refs: QueueProjectionAffectedCardRef[] | undefined,
  reason: QueueProjectionAffectedReason,
  add: (ref: QueueProjectionAffectedCardRef | null | undefined, reason: QueueProjectionAffectedReason) => void,
): void {
  for (const ref of refs ?? []) {
    add(ref, reason);
  }
}

function normalizeAffectedRef(ref: QueueProjectionAffectedCardRef | null | undefined): {
  cardId: string;
  blockId: string | null;
} | null {
  if (!ref) {
    return null;
  }
  if (typeof ref === 'string') {
    const cardId = ref.trim();
    return cardId ? { cardId, blockId: null } : null;
  }

  const cardId = String(ref.id || '').trim();
  if (!cardId) {
    return null;
  }
  const blockId = String(ref.blockId || '').trim();
  return {
    cardId,
    blockId: blockId || null,
  };
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}
