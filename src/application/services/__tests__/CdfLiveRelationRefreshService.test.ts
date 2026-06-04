import { describe, expect, it, vi } from 'vitest';
import { CdfLiveRelationRefreshService } from '../CdfLiveRelationRefreshService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { CdfLiveBlockNode } from '@/core/card/cdf-live-relation';

const CONCEPT_ID = '20260101000000-aaaaaaa';
const SOURCE_ID = '20260101000001-bbbbbbb';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xiuyuan-1',
    blockId: overrides.blockId ?? SOURCE_ID,
    due: overrides.due ?? now,
    stability: overrides.stability ?? 1,
    difficulty: overrides.difficulty ?? 5,
    reps: overrides.reps ?? 0,
    lapses: overrides.lapses ?? 0,
    state: overrides.state ?? CardState.New,
    lastReview: overrides.lastReview ?? 0,
    elapsedDays: overrides.elapsedDays ?? 0,
    scheduledDays: overrides.scheduledDays ?? 0,
    priority: overrides.priority ?? 50,
    type: overrides.type ?? CardType.Descriptor,
    tags: overrides.tags ?? [],
    leechCount: overrides.leechCount ?? 0,
    isLeech: overrides.isLeech ?? false,
    skipped: overrides.skipped ?? false,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    meta: overrides.meta ?? {
      xiuyuanID: 'xiuyuan-1',
      templateID: 'builtin-concept-definition-forward',
      typeMarker: 'concept-definition-forward',
      frontBlockIDs: [CONCEPT_ID],
      backBlockIDs: [SOURCE_ID],
      fieldMapping: {
        concept: CONCEPT_ID,
        definition: SOURCE_ID,
      },
    },
  };
}

function sourceNode(markdown: string): CdfLiveBlockNode {
  return {
    id: SOURCE_ID,
    type: 'p',
    markdown,
  };
}

function createManager(cardsById = new Map<string, FSRSCard>()) {
  return {
    getCard: vi.fn(async (cardId: string) => {
      const card = cardsById.get(cardId);
      if (!card) {
        throw new Error(`missing ${cardId}`);
      }
      return card;
    }),
    updateCard: vi.fn(async () => undefined),
  };
}

describe('CdfLiveRelationRefreshService', () => {
  it('derives current CDF card on Review open and persists metadata without creating missing cards', async () => {
    const card = buildCard();
    const manager = createManager();
    const service = new CdfLiveRelationRefreshService({
      manager,
      now: () => 1_700_000_000_123,
    });

    const result = await service.refreshCurrentCardOnOpen(card, {
      surface: 'review-open',
      sourceTree: sourceNode(`((${CONCEPT_ID} "Concept")) :> definition body`),
    });

    expect(result.reason).toBe('refreshed');
    expect(result.derivedRelationCount).toBe(1);
    expect(result.actions).toEqual([
      expect.objectContaining({
        kind: 'update-card-meta',
        cardId: 'card-1',
        status: 'active-live',
        reason: 'legacy-migrated',
      }),
    ]);
    expect(result.actions.some((action) => action.kind === 'create-card')).toBe(false);
    expect(manager.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'card-1',
        updatedAt: 1_700_000_000_123,
        meta: expect.objectContaining({
          liveRelationKey: `${SOURCE_ID}:${CONCEPT_ID}:definition-forward`,
          relationAuthority: 'live-backlink',
          sourceBlockId: SOURCE_ID,
          conceptBlockId: CONCEPT_ID,
          relationKind: 'definition-forward',
          liveRelationStatus: 'active-live',
          liveContentStatus: 'content-complete',
          fieldMapping: {
            concept: CONCEPT_ID,
            definition: SOURCE_ID,
          },
        }),
      }),
      { suppressDueIndexSort: true },
    );
  });

  it('marks missing current live relation unavailable and never backfills from fieldMapping', async () => {
    const card = buildCard({
      meta: {
        xiuyuanID: 'xiuyuan-1',
        templateID: 'builtin-concept-definition-forward',
        typeMarker: 'concept-definition-forward',
        frontBlockIDs: [CONCEPT_ID],
        backBlockIDs: [SOURCE_ID],
        fieldMapping: {
          concept: CONCEPT_ID,
          definition: SOURCE_ID,
        },
      },
    });
    const manager = createManager();
    const service = new CdfLiveRelationRefreshService({ manager });

    const result = await service.refreshCurrentCardOnOpen(card, {
      surface: 'browser-open',
      sourceTree: sourceNode(`((${CONCEPT_ID} "Concept")) :< definition body`),
    });

    expect(result.reason).toBe('refreshed');
    expect(result.actions).toEqual([
      expect.objectContaining({
        kind: 'update-card-meta',
        cardId: 'card-1',
        status: 'legacy-relation-unavailable',
        relation: null,
        reason: 'legacy-unavailable',
      }),
    ]);
    expect(result.actions.some((action) => action.kind === 'create-card')).toBe(false);
    expect(manager.updateCard).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          liveRelationStatus: 'legacy-relation-unavailable',
          fieldMapping: {
            concept: CONCEPT_ID,
            definition: SOURCE_ID,
          },
        }),
      }),
      { suppressDueIndexSort: true },
    );
  });

  it('keeps non-CDF cards untouched', async () => {
    const card = buildCard({
      type: CardType.Item,
      meta: { content: 'ordinary card' },
    });
    const manager = createManager();
    const service = new CdfLiveRelationRefreshService({ manager });

    const result = await service.refreshCurrentCardOnOpen(card, {
      sourceTree: sourceNode(`((${CONCEPT_ID} "Concept")) :> definition body`),
    });

    expect(result.reason).toBe('non-cdf-card');
    expect(result.attempted).toBe(false);
    expect(manager.updateCard).not.toHaveBeenCalled();
  });
});
