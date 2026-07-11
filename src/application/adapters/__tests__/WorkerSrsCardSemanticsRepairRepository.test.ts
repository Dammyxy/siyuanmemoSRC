import { describe, expect, it, vi } from 'vitest';
import { WorkerSrsCardSemanticsRepairRepository } from '../WorkerSrsCardSemanticsRepairRepository';
import { CardState, CardType, type FSRSCard } from '@/types/card';

function createCard(): FSRSCard {
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: 1,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 1,
    updatedAt: 1,
    meta: {
      forceProtyleRender: true,
    },
  };
}

describe('WorkerSrsCardSemanticsRepairRepository', () => {
  it('commits semantic repair through one Worker Card CRUD mutation', async () => {
    const execute = vi.fn().mockResolvedValue({
      upsertedCardIds: ['card-1'],
      upsertedXiuyuanIds: [],
      deletedCardIds: [],
      deletedXiuyuanIds: [],
      durabilityReceipt: {
        mutationId: 'semantic-repair-1',
      },
    });
    const card = createCard();
    const repository = new WorkerSrsCardSemanticsRepairRepository({
      storage: {
        getAllCards: () => [card],
        getCardDTO: () => ({ ...card }),
      } as never,
      execute,
    });

    const result = await repository.applySrsCardSemanticRepairPlans({
      safePlans: [{
        cardId: 'card-1',
        status: 'safe-repair',
        beforeKind: 'item',
        afterKind: 'concept',
        patch: {
          type: CardType.Concept,
          cardTypeMarker: 'concept',
          metaPatch: {
            forceProtyleRender: undefined,
          },
        },
        diagnostics: [],
      }],
      skippedPlans: [],
      preview: {
        status: 'ready',
        counts: {
          total: 1,
          safeRepair: 1,
          ambiguous: 0,
          insufficient: 0,
          noop: 0,
          skipped: 0,
        },
        rows: [],
        audits: [],
      },
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toMatchObject({
      mutationId: expect.stringMatching(/^srs-card-semantic-repair:/),
      upsertCards: [expect.objectContaining({
        id: 'card-1',
        type: CardType.Concept,
        cardTypeMarker: 'concept',
      })],
      deleteCardIds: [],
      deleteXiuyuanIds: [],
    });
    expect(result).toMatchObject({
      receiptId: 'semantic-repair-1',
      repairedCount: 1,
      failedCardIds: [],
    });
  });
});
