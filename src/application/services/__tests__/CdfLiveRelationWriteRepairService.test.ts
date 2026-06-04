import { describe, expect, it, vi } from 'vitest';
import { CdfLiveRelationWriteRepairService } from '../CdfLiveRelationWriteRepairService';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import type { CdfLiveBlockNode, CdfLiveRelationCandidate } from '@/core/card/cdf-live-relation';

const SOURCE_ID = '20260101000001-bbbbbbb';
const CONCEPT_A_ID = '20260101000000-aaaaaaa';
const CONCEPT_B_ID = '20260101000000-ccccccc';
const NOW = 1_700_000_000_123;

function sourceNode(markdown: string): CdfLiveBlockNode {
  return {
    id: SOURCE_ID,
    type: 'p',
    markdown,
  };
}

function createManager(cards: FSRSCard[] = []) {
  return {
    getCards: vi.fn(async () => cards),
    updateCard: vi.fn(async () => undefined),
  };
}

describe('CdfLiveRelationWriteRepairService', () => {
  it('creates missing live relation cards in explicit write/repair flows with new FSRS state', async () => {
    const manager = createManager();
    const creator = {
      createCards: vi.fn(async () => undefined),
    };
    const service = new CdfLiveRelationWriteRepairService({
      manager,
      cardCreator: creator,
      now: () => NOW,
      idFactory: (relation: CdfLiveRelationCandidate) => `card-${relation.conceptBlockId}-${relation.relationKind}`,
      xiuyuanIdFactory: (relation: CdfLiveRelationCandidate) => `xiuyuan-${relation.conceptBlockId}-${relation.relationKind}`,
    });

    const result = await service.reconcileWriteOrRepair({
      sourceTree: sourceNode(
        `((${CONCEPT_A_ID} "Concept A")) ((${CONCEPT_B_ID} "Concept B")) :> definition body`,
      ),
    });

    expect(result.reason).toBe('reconciled');
    expect(result.createdCards).toHaveLength(2);
    expect(result.updatedCards).toHaveLength(0);
    expect(manager.getCards).toHaveBeenCalledWith({ blockIds: [SOURCE_ID] });
    expect(manager.updateCard).not.toHaveBeenCalled();
    expect(creator.createCards).toHaveBeenCalledTimes(1);

    const createdCards = creator.createCards.mock.calls[0]?.[0] as FSRSCard[];
    const createdXiuyuans = creator.createCards.mock.calls[0]?.[1] as Array<Record<string, unknown>>;
    expect(createdCards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `card-${CONCEPT_A_ID}-definition-forward`,
        xiuyuanID: `xiuyuan-${CONCEPT_A_ID}-definition-forward`,
        blockId: SOURCE_ID,
        due: NOW,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        state: CardState.New,
        lastReview: 0,
        scheduledDays: 0,
        elapsedDays: 0,
        learning_step: 0,
        type: CardType.Concept,
        schedulerType: 'fsrs-v6',
        cardTypeMarker: 'concept',
        faceKey: { ruleId: 'concept-definition-forward', faceIndex: 0 },
        meta: expect.objectContaining({
          liveRelationKey: `${SOURCE_ID}:${CONCEPT_A_ID}:definition-forward`,
          relationAuthority: 'live-backlink',
          sourceBlockId: SOURCE_ID,
          conceptBlockId: CONCEPT_A_ID,
          relationKind: 'definition-forward',
          liveRelationStatus: 'active-live',
          liveContentStatus: 'content-complete',
          fieldMapping: {
            concept: CONCEPT_A_ID,
            definition: SOURCE_ID,
          },
          frontBlockIDs: [CONCEPT_A_ID],
          backBlockIDs: [SOURCE_ID],
          templateID: 'builtin-concept-definition-forward',
          typeMarker: 'concept-definition-forward',
        }),
      }),
      expect.objectContaining({
        id: `card-${CONCEPT_B_ID}-definition-forward`,
        xiuyuanID: `xiuyuan-${CONCEPT_B_ID}-definition-forward`,
        blockId: SOURCE_ID,
        meta: expect.objectContaining({
          liveRelationKey: `${SOURCE_ID}:${CONCEPT_B_ID}:definition-forward`,
          conceptBlockId: CONCEPT_B_ID,
          fieldMapping: {
            concept: CONCEPT_B_ID,
            definition: SOURCE_ID,
          },
        }),
      }),
    ]));
    expect(createdXiuyuans).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: `xiuyuan-${CONCEPT_A_ID}-definition-forward`,
        blockIDs: [CONCEPT_A_ID, SOURCE_ID],
        templateID: 'builtin-concept-definition-forward',
        meta: expect.objectContaining({
          liveRelationKey: `${SOURCE_ID}:${CONCEPT_A_ID}:definition-forward`,
          relationAuthority: 'live-backlink',
        }),
      }),
      expect.objectContaining({
        id: `xiuyuan-${CONCEPT_B_ID}-definition-forward`,
        blockIDs: [CONCEPT_B_ID, SOURCE_ID],
        templateID: 'builtin-concept-definition-forward',
        meta: expect.objectContaining({
          liveRelationKey: `${SOURCE_ID}:${CONCEPT_B_ID}:definition-forward`,
          relationAuthority: 'live-backlink',
        }),
      }),
    ]));
    expect(creator.createCards).toHaveBeenCalledWith(createdCards, createdXiuyuans, { suppressDueIndexSort: true });
  });
});
