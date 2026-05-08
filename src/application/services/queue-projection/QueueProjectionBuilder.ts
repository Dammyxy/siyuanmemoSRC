import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import { buildQueueSnapshotRow } from '@/core/queue/domain/queueCardProjection';
import { SrsV2QueuePolicy } from '@/core/queue/domain/SrsV2QueuePolicy';
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
} from '@/application/ports/QueueProjectionPort';

export type ProjectionBuildQueueType =
  | QueueType.RetrievalPractice
  | QueueType.IncrementalLearning;

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
  isDismissed?: (card: FSRSCard) => boolean;
}

export interface QueueProjectionBuildResult {
  rows: QueueProjectionRow[];
  frontierRows: QueueProjectionRow[];
  counters: QueueProjectionCounters;
}

export type QueueProjectionAffectedReason =
  | 'reviewed-card'
  | 'sibling'
  | 'logical-equivalent'
  | 'manual-outstanding'
  | 'final-drill'
  | 'leech'
  | 'frontier-candidate';

export type QueueProjectionAffectedCardRef =
  | string
  | Pick<FSRSCard, 'id' | 'blockId'>;

export interface QueueProjectionAffectedSetInput {
  reviewedCard?: QueueProjectionAffectedCardRef | null;
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

const DEFAULT_FRONTIER_CANDIDATE_COUNT = 16;
const MAX_NEW_CARD_FRONTIER_LIMIT = Number.MAX_SAFE_INTEGER;

export const BROAD_QUEUE_PROJECTION_INVALIDATION_REASONS = [
  'day-rollover',
  'settings-policy-changed',
  'scheduler-policy-hash-changed',
  'algorithm-installed',
  'algorithm-disabled',
  'batch-reschedule',
  'filter-definition-changed',
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

  return {
    rows,
    frontierRows,
    counters: buildCounters(normalized, rows),
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

interface NormalizedQueueProjectionBuildInput extends QueueProjectionBuildInput {
  manualCards: FSRSCard[];
  priorityRandomness: number;
  updatedAt: number;
  customOrder: string[];
  frontierCandidateCount: number;
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
