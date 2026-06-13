import type { FSRSCard } from '@/types/card';
import type { QueueCounterSnapshot, QueueReviewProjectionAction, QueueReviewResult } from '@/types/unified-data-source/queue-core';

export type ProjectionPatchOutcome = 'patched' | 'refresh-required' | 'deferred' | 'not-applicable';

export type QueueReviewResultWithProjection = QueueReviewResult & {
  projectionAction?: QueueReviewProjectionAction | null;
  projectionImpactEntry?: unknown | null;
};

type ProjectionImpactEntryLike = {
  queueType: string;
  hotPatchable?: boolean;
  refreshRequired?: boolean;
  removedRowIds?: unknown[];
  insertedRows?: unknown[];
  updatedRows?: unknown[];
  counters?: unknown;
};

type ProjectionImpactRowLike = {
  rowId: string;
  cardId: string;
  blockId: string | null;
  queueIndexHint: number | null;
};

export interface ReviewSessionProjectionState {
  cacheValid: boolean;
  cachedCards: FSRSCard[];
  currentIndex: number;
  forwardBuffer: FSRSCard[];
  lastCounterSnapshot: QueueCounterSnapshot | null;
}

export interface ReviewSessionProjectionApplyInput {
  reviewedCard: FSRSCard;
  result: QueueReviewResultWithProjection;
  forceRemove?: boolean;
  state: ReviewSessionProjectionState;
}

export interface ReviewSessionProjectionApplyResult {
  outcome: ProjectionPatchOutcome;
  state: ReviewSessionProjectionState;
}

export interface ReviewSessionProjectionApplierDependencies {
  shouldReadLocally: () => boolean;
  hydrateCardsBySnapshotIds: (rowIds: string[]) => Promise<FSRSCard[]>;
}

export class ReviewSessionProjectionApplier {
  constructor(private readonly deps: ReviewSessionProjectionApplierDependencies) {}

  async apply(input: ReviewSessionProjectionApplyInput): Promise<ReviewSessionProjectionApplyResult> {
    const state = cloneState(input.state);
    if (this.deps.shouldReadLocally()) {
      return { outcome: 'not-applicable', state };
    }

    if (!state.cacheValid) {
      return { outcome: 'not-applicable', state };
    }

    const projectionAction = input.result.projectionAction ?? null;
    if (!projectionAction || projectionAction.status === 'not-applicable') {
      return { outcome: 'not-applicable', state };
    }
    if (projectionAction.status === 'deferred') {
      return { outcome: 'deferred', state };
    }
    if (
      projectionAction.status === 'refresh-required'
      || projectionAction.status === 'generation-mismatch'
      || projectionAction.status === 'unavailable'
    ) {
      return { outcome: 'refresh-required', state };
    }
    if (projectionAction.status !== 'patch-applied') {
      return { outcome: 'not-applicable', state };
    }

    const entry = isRecord(input.result.projectionImpactEntry)
      ? input.result.projectionImpactEntry as ProjectionImpactEntryLike
      : null;
    if (!entry) {
      return { outcome: 'refresh-required', state };
    }

    const patchRows = [
      ...normalizeProjectionImpactRows(entry.updatedRows),
      ...normalizeProjectionImpactRows(entry.insertedRows),
    ];
    const hydrateIds = Array.from(new Set(
      patchRows
        .map((row) => row.rowId || row.cardId)
        .filter(Boolean),
    ));
    const hydratedCards = hydrateIds.length > 0
      ? await this.deps.hydrateCardsBySnapshotIds(hydrateIds)
      : [];
    if (hydrateIds.length > 0 && hydratedCards.length === 0) {
      return { outcome: 'refresh-required', state };
    }

    const orderHintByIdentity = buildProjectionOrderHintMap(patchRows);
    const removeIds = new Set(
      (entry.removedRowIds || [])
        .map((id) => normalizeCardId(String(id || '')))
        .filter(Boolean),
    );
    if (input.forceRemove) {
      removeIds.add(input.reviewedCard.id);
      if (input.reviewedCard.riffCardId) {
        removeIds.add(input.reviewedCard.riffCardId);
      }
    }

    const previousOrder = new Map<string, number>();
    state.cachedCards.forEach((card, index) => {
      previousOrder.set(normalizeCardId(card.id), index);
      if (card.riffCardId) {
        previousOrder.set(normalizeCardId(card.riffCardId), index);
      }
      if (card.blockId) {
        previousOrder.set(normalizeCardId(card.blockId), index);
      }
    });

    const cachedCards = state.cachedCards.filter((card) => !matchesProjectionRemovedIdentity(card, removeIds));
    for (const card of hydratedCards) {
      const existingIndex = findCachedCardIndexByIdentity(cachedCards, card.id, card.blockId);
      if (existingIndex >= 0) {
        cachedCards.splice(existingIndex, 1);
      }
      cachedCards.push(cloneCard(card));
    }

    cachedCards.sort((a, b) => {
      const hintA = resolveProjectionOrderHint(a, orderHintByIdentity);
      const hintB = resolveProjectionOrderHint(b, orderHintByIdentity);
      if (hintA !== null && hintB !== null && hintA !== hintB) {
        return hintA - hintB;
      }
      if (hintA !== null && hintB === null) {
        return -1;
      }
      if (hintA === null && hintB !== null) {
        return 1;
      }
      return resolvePreviousOrder(a, previousOrder) - resolvePreviousOrder(b, previousOrder);
    });

    return {
      outcome: 'patched',
      state: {
        cacheValid: state.cacheValid,
        cachedCards,
        currentIndex: 0,
        forwardBuffer: [],
        lastCounterSnapshot: normalizeProjectionImpactCounterSnapshot(entry, input.result.counterSnapshot),
      },
    };
  }
}

function cloneState(state: ReviewSessionProjectionState): ReviewSessionProjectionState {
  return {
    cacheValid: state.cacheValid,
    cachedCards: state.cachedCards.map(cloneCard),
    currentIndex: state.currentIndex,
    forwardBuffer: state.forwardBuffer.map(cloneCard),
    lastCounterSnapshot: state.lastCounterSnapshot ? cloneCounterSnapshot(state.lastCounterSnapshot) : null,
  };
}

function normalizeProjectionImpactRows(rows: unknown[] | undefined): ProjectionImpactRowLike[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => {
      if (!isRecord(row)) {
        return null;
      }
      const rowId = String(row.rowId || '').trim();
      const cardId = String(row.cardId || '').trim();
      if (!rowId || !cardId) {
        return null;
      }
      const queueIndexHint = Number(row.queueIndexHint);
      return {
        rowId,
        cardId,
        blockId: String(row.blockId || '').trim() || null,
        queueIndexHint: Number.isFinite(queueIndexHint) ? queueIndexHint : null,
      };
    })
    .filter((row): row is ProjectionImpactRowLike => Boolean(row));
}

function buildProjectionOrderHintMap(rows: ProjectionImpactRowLike[]): Map<string, number> {
  const hints = new Map<string, number>();
  for (const row of rows) {
    if (row.queueIndexHint === null) {
      continue;
    }
    hints.set(row.rowId, row.queueIndexHint);
    hints.set(row.cardId, row.queueIndexHint);
    if (row.blockId) {
      hints.set(row.blockId, row.queueIndexHint);
    }
  }
  return hints;
}

function matchesProjectionRemovedIdentity(card: FSRSCard, removeIds: Set<string>): boolean {
  if (removeIds.size === 0) {
    return false;
  }
  return removeIds.has(normalizeCardId(card.id))
    || removeIds.has(normalizeCardId(card.blockId))
    || (card.riffCardId ? removeIds.has(normalizeCardId(card.riffCardId)) : false);
}

function resolveProjectionOrderHint(card: FSRSCard, hints: Map<string, number>): number | null {
  const ids = [
    normalizeCardId(card.id),
    normalizeCardId(card.blockId),
    normalizeCardId(card.riffCardId),
  ].filter(Boolean);
  for (const id of ids) {
    const hint = hints.get(id);
    if (Number.isFinite(hint)) {
      return Number(hint);
    }
  }
  return null;
}

function resolvePreviousOrder(card: FSRSCard, previousOrder: Map<string, number>): number {
  const ids = [
    normalizeCardId(card.id),
    normalizeCardId(card.blockId),
    normalizeCardId(card.riffCardId),
  ].filter(Boolean);
  for (const id of ids) {
    const order = previousOrder.get(id);
    if (Number.isFinite(order)) {
      return Number(order);
    }
  }
  return Number.MAX_SAFE_INTEGER;
}

function normalizeProjectionImpactCounterSnapshot(
  entry: ProjectionImpactEntryLike,
  fallback: QueueCounterSnapshot | null,
): QueueCounterSnapshot | null {
  if (!isRecord(entry.counters)) {
    return fallback ? cloneCounterSnapshot(fallback) : null;
  }
  const counters = entry.counters;
  const buckets = isRecord(counters.buckets) ? counters.buckets : {};
  return {
    version: Math.max(0, Math.floor(Number(counters.version || counters.generation || 0))),
    remaining: Math.max(0, Math.floor(Number(counters.remaining || 0))),
    due: Math.max(0, Math.floor(Number(counters.due || 0))),
    total: Math.max(0, Math.floor(Number(counters.total || 0))),
    currentLearningDue: Math.max(0, Math.floor(Number(counters.currentLearningDue || 0))),
    todayReviewDue: Math.max(0, Math.floor(Number(counters.todayReviewDue || 0))),
    allowedNew: Math.max(0, Math.floor(Number(counters.allowedNew || 0))),
    learnAheadAvailable: Math.max(0, Math.floor(Number(counters.learnAheadAvailable || 0))),
    scheduledTotal: Math.max(0, Math.floor(Number(counters.scheduledTotal || counters.total || 0))),
    buckets: {
      all: Math.max(0, Math.floor(Number(buckets.all || 0))),
      item: Math.max(0, Math.floor(Number(buckets.item || 0))),
      descriptor: Math.max(0, Math.floor(Number(buckets.descriptor || 0))),
      topic: Math.max(0, Math.floor(Number(buckets.topic || 0))),
      concept: Math.max(0, Math.floor(Number(buckets.concept || 0))),
    },
    source: 'hot',
  };
}

function findCachedCardIndexByIdentity(cards: FSRSCard[], cardId: string, blockId?: string): number {
  const normalizedCardId = String(cardId || '').trim();
  if (normalizedCardId) {
    const exactIndex = cards.findIndex((card) => card.id === normalizedCardId);
    if (exactIndex >= 0) {
      return exactIndex;
    }
  }

  const normalizedBlockId = String(blockId || '').trim();
  if (normalizedBlockId) {
    return cards.findIndex((card) => card.blockId === normalizedBlockId);
  }

  return -1;
}

function normalizeCardId(cardId: string | null | undefined): string {
  return String(cardId || '').trim();
}

function cloneCard(card: FSRSCard): FSRSCard {
  return JSON.parse(JSON.stringify(card)) as FSRSCard;
}

function cloneCounterSnapshot(snapshot: QueueCounterSnapshot): QueueCounterSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as QueueCounterSnapshot;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
