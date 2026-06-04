import { writeCdfLiveRelationMetadata, type CdfLiveRelationMetadata } from './metadata';
import type {
  CdfLiveRelationCandidate,
  CdfLiveRelationKey,
  CdfRelationStatus,
} from './types';

export interface CdfRelationCardSnapshot {
  id: string;
  meta?: Record<string, unknown> | null;
  reps?: number | null;
  reviewHistoryCount?: number | null;
  createdAt?: number | null;
}

export interface CdfLegacyRelationDeriveResult {
  cardId: string;
  relation: CdfLiveRelationCandidate | null;
}

export type CdfReconciliationAction =
  | {
    kind: 'create-card';
    relation: CdfLiveRelationCandidate;
    reason: 'missing-live-relation';
  }
  | {
    kind: 'update-card-meta';
    cardId: string;
    status: CdfRelationStatus;
    relation: CdfLiveRelationCandidate | null;
    meta: Record<string, unknown>;
    reason:
      | 'active-live'
      | 'orphaned'
      | 'reactivated'
      | 'duplicate'
      | 'legacy-migrated'
      | 'legacy-unavailable';
  };

export interface CdfCurrentReviewDuplicateOutcome {
  cardId: string;
  relationKey: CdfLiveRelationKey;
  kind: 'current-canonical-continues' | 'current-noncanonical-exits';
  canonicalCardId: string;
  duplicateCardIds: string[];
}

export interface CdfLiveReconciliationInput {
  liveRelations: CdfLiveRelationCandidate[];
  existingCards: CdfRelationCardSnapshot[];
  allowCreateMissing?: boolean;
  currentCardId?: string;
  legacyDeriveResults?: CdfLegacyRelationDeriveResult[];
}

export interface CdfLiveReconciliationResult {
  actions: CdfReconciliationAction[];
  currentReviewDuplicateOutcome: CdfCurrentReviewDuplicateOutcome | null;
}

interface IndexedCard {
  card: CdfRelationCardSnapshot;
  relationKey: CdfLiveRelationKey;
}

function readMeta(card: CdfRelationCardSnapshot): Record<string, unknown> {
  return card.meta && typeof card.meta === 'object' && !Array.isArray(card.meta) ? card.meta : {};
}

function readMetaString(meta: Record<string, unknown>, key: string): string {
  const value = meta[key];
  return typeof value === 'string' ? value.trim() : '';
}

function toMetadataPatch(
  relation: CdfLiveRelationCandidate | null,
  status: CdfRelationStatus,
): CdfLiveRelationMetadata & { fieldMapping?: Record<string, string> } {
  if (!relation) {
    return {
      liveRelationStatus: status,
    };
  }

  return {
    liveRelationKey: relation.relationKey,
    sourceBlockId: relation.sourceBlockId,
    conceptBlockId: relation.conceptBlockId,
    relationKind: relation.relationKind,
    liveRelationStatus: status,
    liveContentStatus: relation.contentStatus,
    liveRelationIssues: relation.issues,
    sourceSnapshot: {
      sourceBlockId: relation.sourceSnapshot.sourceBlockId,
      markdown: relation.sourceSnapshot.markdown,
      breadcrumb: relation.sourceSnapshot.breadcrumb,
    },
    conceptSnapshot: {
      conceptBlockId: relation.conceptSnapshot.conceptBlockId,
      displayText: relation.conceptSnapshot.displayText,
      order: relation.conceptSnapshot.order,
    },
    fieldMapping: relation.fieldMappingSnapshot,
  };
}

function buildUpdateAction(input: {
  card: CdfRelationCardSnapshot;
  status: CdfRelationStatus;
  relation: CdfLiveRelationCandidate | null;
  reason: Extract<CdfReconciliationAction, { kind: 'update-card-meta' }>['reason'];
}): CdfReconciliationAction {
  return {
    kind: 'update-card-meta',
    cardId: input.card.id,
    status: input.status,
    relation: input.relation,
    meta: writeCdfLiveRelationMetadata(readMeta(input.card), toMetadataPatch(input.relation, input.status)),
    reason: input.reason,
  };
}

function readIndexedCard(card: CdfRelationCardSnapshot): IndexedCard | null {
  const meta = readMeta(card);
  const relationKey = readMetaString(meta, 'liveRelationKey');
  return relationKey ? { card, relationKey } : null;
}

function reviewCount(card: CdfRelationCardSnapshot): number {
  const history = Number(card.reviewHistoryCount);
  if (Number.isFinite(history)) {
    return Math.max(0, Math.floor(history));
  }
  const reps = Number(card.reps);
  return Number.isFinite(reps) ? Math.max(0, Math.floor(reps)) : 0;
}

function createdAt(card: CdfRelationCardSnapshot): number {
  const value = Number(card.createdAt);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function chooseCanonical(cards: CdfRelationCardSnapshot[]): CdfRelationCardSnapshot {
  return [...cards].sort((left, right) => {
    const reviewDelta = reviewCount(right) - reviewCount(left);
    if (reviewDelta !== 0) {
      return reviewDelta;
    }
    const createdDelta = createdAt(left) - createdAt(right);
    if (createdDelta !== 0) {
      return createdDelta;
    }
    return left.id.localeCompare(right.id);
  })[0];
}

function groupByRelationKey(cards: IndexedCard[]): Map<CdfLiveRelationKey, CdfRelationCardSnapshot[]> {
  const groups = new Map<CdfLiveRelationKey, CdfRelationCardSnapshot[]>();
  for (const indexed of cards) {
    const group = groups.get(indexed.relationKey) || [];
    group.push(indexed.card);
    groups.set(indexed.relationKey, group);
  }
  return groups;
}

function buildLegacyMigrationIndex(results: CdfLegacyRelationDeriveResult[] | undefined): Map<string, CdfLiveRelationCandidate | null> {
  return new Map((results || []).map((result) => [result.cardId, result.relation]));
}

function actionKey(action: CdfReconciliationAction): string {
  if (action.kind === 'create-card') {
    return `create:${action.relation.relationKey}`;
  }
  return `update:${action.cardId}:${action.status}`;
}

function pushUnique(actions: CdfReconciliationAction[], action: CdfReconciliationAction): void {
  if (actions.some((candidate) => actionKey(candidate) === actionKey(action))) {
    return;
  }
  actions.push(action);
}

export function reconcileCdfLiveRelations(input: CdfLiveReconciliationInput): CdfLiveReconciliationResult {
  const actions: CdfReconciliationAction[] = [];
  const liveByKey = new Map(input.liveRelations.map((relation) => [relation.relationKey, relation]));
  const legacyDeriveByCardId = buildLegacyMigrationIndex(input.legacyDeriveResults);
  const indexedCards: IndexedCard[] = [];

  for (const card of input.existingCards) {
    const indexed = readIndexedCard(card);
    if (indexed) {
      indexedCards.push(indexed);
      continue;
    }

    if (!legacyDeriveByCardId.has(card.id)) {
      pushUnique(actions, buildUpdateAction({
        card,
        status: 'legacy-relation-unavailable',
        relation: null,
        reason: 'legacy-unavailable',
      }));
      continue;
    }

    const legacyRelation = legacyDeriveByCardId.get(card.id);
    if (!legacyRelation) {
      pushUnique(actions, buildUpdateAction({
        card,
        status: 'legacy-relation-unavailable',
        relation: null,
        reason: 'legacy-unavailable',
      }));
      continue;
    }

    indexedCards.push({ card, relationKey: legacyRelation.relationKey });
    pushUnique(actions, buildUpdateAction({
      card,
      status: 'active-live',
      relation: legacyRelation,
      reason: 'legacy-migrated',
    }));
  }

  const cardsByKey = groupByRelationKey(indexedCards);
  for (const relation of input.liveRelations) {
    const cards = cardsByKey.get(relation.relationKey) || [];
    if (cards.length === 0 && input.allowCreateMissing) {
      pushUnique(actions, {
        kind: 'create-card',
        relation,
        reason: 'missing-live-relation',
      });
    }
  }

  let currentReviewDuplicateOutcome: CdfCurrentReviewDuplicateOutcome | null = null;

  for (const [relationKey, cards] of cardsByKey) {
    const liveRelation = liveByKey.get(relationKey) || null;
    if (!liveRelation) {
      for (const card of cards) {
        pushUnique(actions, buildUpdateAction({
          card,
          status: 'orphaned-by-live-relation',
          relation: null,
          reason: 'orphaned',
        }));
      }
      continue;
    }

    if (cards.length === 1) {
      const card = cards[0];
      const oldStatus = readMetaString(readMeta(card), 'liveRelationStatus');
      pushUnique(actions, buildUpdateAction({
        card,
        status: 'active-live',
        relation: liveRelation,
        reason: oldStatus === 'orphaned-by-live-relation' ? 'reactivated' : 'active-live',
      }));
      continue;
    }

    const canonical = chooseCanonical(cards);
    const duplicates = cards.filter((card) => card.id !== canonical.id);
    pushUnique(actions, buildUpdateAction({
      card: canonical,
      status: 'active-live',
      relation: liveRelation,
      reason: 'active-live',
    }));
    for (const duplicate of duplicates) {
      pushUnique(actions, buildUpdateAction({
        card: duplicate,
        status: 'duplicate-live-relation',
        relation: liveRelation,
        reason: 'duplicate',
      }));
    }

    if (input.currentCardId && cards.some((card) => card.id === input.currentCardId)) {
      currentReviewDuplicateOutcome = {
        cardId: input.currentCardId,
        relationKey,
        kind: input.currentCardId === canonical.id
          ? 'current-canonical-continues'
          : 'current-noncanonical-exits',
        canonicalCardId: canonical.id,
        duplicateCardIds: duplicates.map((card) => card.id).sort(),
      };
    }
  }

  return {
    actions,
    currentReviewDuplicateOutcome,
  };
}
