import { describe, expect, it } from 'vitest';
import {
  reconcileCdfLiveRelations,
  type CdfLiveRelationCandidate,
  type CdfRelationCardSnapshot,
  type CdfRelationKind,
} from '../index';

function relation(overrides: Partial<CdfLiveRelationCandidate> = {}): CdfLiveRelationCandidate {
  const sourceBlockId = overrides.sourceBlockId || 'source-1';
  const conceptBlockId = overrides.conceptBlockId || 'concept-1';
  const relationKind: CdfRelationKind = overrides.relationKind || 'definition-forward';
  return {
    sourceBlockId,
    conceptBlockId,
    relationKind,
    relationKey: `${sourceBlockId}:${conceptBlockId}:${relationKind}`,
    relationStatus: 'active-live',
    contentStatus: 'content-complete',
    issues: [],
    sourceSnapshot: {
      sourceBlockId,
      markdown: '((concept)) :> definition',
      breadcrumb: [],
    },
    conceptSnapshot: {
      conceptBlockId,
      displayText: conceptBlockId,
      order: 0,
    },
    contentShape: 'definition',
    content: { definition: 'definition' },
    fieldMappingSnapshot: { concept: conceptBlockId, definition: sourceBlockId },
    ...overrides,
  };
}

function card(overrides: Partial<CdfRelationCardSnapshot> = {}): CdfRelationCardSnapshot {
  return {
    id: 'card-1',
    meta: {},
    reps: 0,
    reviewHistoryCount: 0,
    createdAt: 1,
    ...overrides,
  };
}

describe('CDF live relation reconciler', () => {
  it('creates missing live cards only when write/repair flow allows creation', () => {
    const live = relation();

    expect(reconcileCdfLiveRelations({
      liveRelations: [live],
      existingCards: [],
      allowCreateMissing: false,
    }).actions).toEqual([]);

    expect(reconcileCdfLiveRelations({
      liveRelations: [live],
      existingCards: [],
      allowCreateMissing: true,
    }).actions).toEqual([
      {
        kind: 'create-card',
        relation: live,
        reason: 'missing-live-relation',
      },
    ]);
  });

  it('marks disappeared relation cards orphaned while preserving card identity', () => {
    const existing = card({
      meta: { liveRelationKey: 'source-1:concept-1:definition-forward' },
      reps: 7,
    });

    const result = reconcileCdfLiveRelations({
      liveRelations: [],
      existingCards: [existing],
    });

    expect(result.actions).toEqual([
      expect.objectContaining({
        kind: 'update-card-meta',
        cardId: 'card-1',
        status: 'orphaned-by-live-relation',
        reason: 'orphaned',
      }),
    ]);
  });

  it('reactivates an orphaned relation when the same live key returns and refreshes derived fieldMapping', () => {
    const live = relation();
    const existing = card({
      meta: {
        liveRelationKey: live.relationKey,
        liveRelationStatus: 'orphaned-by-live-relation',
        fieldMapping: { concept: 'stale', definition: 'stale' },
      },
      reps: 5,
    });

    const result = reconcileCdfLiveRelations({
      liveRelations: [live],
      existingCards: [existing],
    });

    expect(result.actions).toEqual([
      expect.objectContaining({
        kind: 'update-card-meta',
        cardId: 'card-1',
        status: 'active-live',
        reason: 'reactivated',
        meta: expect.objectContaining({
          liveRelationKey: live.relationKey,
          liveRelationStatus: 'active-live',
          fieldMapping: { concept: 'concept-1', definition: 'source-1' },
        }),
      }),
    ]);
  });

  it('chooses duplicate canonical by review count, then earliest created, then stable id', () => {
    const live = relation();
    const cards = [
      card({ id: 'card-low', meta: { liveRelationKey: live.relationKey }, reviewHistoryCount: 2, createdAt: 1 }),
      card({ id: 'card-best', meta: { liveRelationKey: live.relationKey }, reviewHistoryCount: 8, createdAt: 9 }),
      card({ id: 'card-also-best', meta: { liveRelationKey: live.relationKey }, reviewHistoryCount: 8, createdAt: 10 }),
    ];

    const result = reconcileCdfLiveRelations({
      liveRelations: [live],
      existingCards: cards,
      currentCardId: 'card-also-best',
    });

    expect(result.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardId: 'card-best', status: 'active-live', reason: 'active-live' }),
      expect.objectContaining({ cardId: 'card-low', status: 'duplicate-live-relation', reason: 'duplicate' }),
      expect.objectContaining({ cardId: 'card-also-best', status: 'duplicate-live-relation', reason: 'duplicate' }),
    ]));
    expect(result.currentReviewDuplicateOutcome).toEqual({
      cardId: 'card-also-best',
      relationKey: live.relationKey,
      kind: 'current-noncanonical-exits',
      canonicalCardId: 'card-best',
      duplicateCardIds: ['card-also-best', 'card-low'],
    });
  });

  it('keeps current Review card when it wins duplicate canonical', () => {
    const live = relation();
    const result = reconcileCdfLiveRelations({
      liveRelations: [live],
      existingCards: [
        card({ id: 'card-current', meta: { liveRelationKey: live.relationKey }, reviewHistoryCount: 5, createdAt: 2 }),
        card({ id: 'card-duplicate', meta: { liveRelationKey: live.relationKey }, reviewHistoryCount: 1, createdAt: 1 }),
      ],
      currentCardId: 'card-current',
    });

    expect(result.currentReviewDuplicateOutcome).toEqual({
      cardId: 'card-current',
      relationKey: live.relationKey,
      kind: 'current-canonical-continues',
      canonicalCardId: 'card-current',
      duplicateCardIds: ['card-duplicate'],
    });
  });

  it('lazily migrates legacy cards only from explicit live derive results', () => {
    const live = relation({ sourceBlockId: 'legacy-source' });
    const legacyCard = card({ id: 'legacy-card', meta: { fieldMapping: { concept: 'old' } }, reps: 4 });

    const result = reconcileCdfLiveRelations({
      liveRelations: [live],
      existingCards: [legacyCard],
      legacyDeriveResults: [{ cardId: 'legacy-card', relation: live }],
    });

    expect(result.actions).toEqual([
      expect.objectContaining({
        kind: 'update-card-meta',
        cardId: 'legacy-card',
        status: 'active-live',
        reason: 'legacy-migrated',
        meta: expect.objectContaining({
          liveRelationKey: live.relationKey,
          fieldMapping: live.fieldMappingSnapshot,
        }),
      }),
    ]);
  });

  it('marks legacy cards unavailable when live derive is missing or unavailable without fieldMapping fallback', () => {
    const legacyCard = card({ id: 'legacy-card', meta: { fieldMapping: { concept: 'old', definition: 'old' } } });

    const noDerive = reconcileCdfLiveRelations({
      liveRelations: [],
      existingCards: [legacyCard],
    });
    const failedDerive = reconcileCdfLiveRelations({
      liveRelations: [],
      existingCards: [legacyCard],
      legacyDeriveResults: [{ cardId: 'legacy-card', relation: null }],
    });

    expect(noDerive.actions[0]).toEqual(expect.objectContaining({
      cardId: 'legacy-card',
      status: 'legacy-relation-unavailable',
      reason: 'legacy-unavailable',
    }));
    expect(failedDerive.actions[0]).toEqual(expect.objectContaining({
      cardId: 'legacy-card',
      status: 'legacy-relation-unavailable',
      reason: 'legacy-unavailable',
    }));
  });
});
