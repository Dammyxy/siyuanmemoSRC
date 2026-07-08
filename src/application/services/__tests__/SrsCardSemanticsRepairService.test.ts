import { describe, expect, it, vi } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { SrsCardSemanticsRepairService } from '../SrsCardSemanticsRepairService';
import { applyCardSemanticPatch } from '@/core/card/semantics';

function buildCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: overrides.id ?? 'card-1',
    xiuyuanID: overrides.xiuyuanID ?? 'xy-1',
    blockId: overrides.blockId ?? 'block-1',
    due: 1,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: CardState.Review,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 1,
    priority: 50,
    type: overrides.type ?? CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 1,
    updatedAt: 1,
    meta: overrides.meta,
    cardTypeMarker: overrides.cardTypeMarker,
  };
}

describe('SrsCardSemanticsRepairService', () => {
  it('previews safe semantic repairs without mutating storage', async () => {
    const corrupted = buildCard({
      id: 'list-as-topic',
      type: CardType.Topic,
      meta: { templateID: 'builtin-list-item' },
    });
    const repository = {
      querySrsCardSemanticRepairCandidates: vi.fn(() => [corrupted]),
      applySrsCardSemanticRepairPlans: vi.fn(),
    };
    const service = new SrsCardSemanticsRepairService({ repository });

    const preview = await service.preview();

    expect(repository.querySrsCardSemanticRepairCandidates).toHaveBeenCalledTimes(1);
    expect(repository.applySrsCardSemanticRepairPlans).not.toHaveBeenCalled();
    expect(corrupted.type).toBe(CardType.Topic);
    expect(preview).toMatchObject({
      status: 'ready',
      counts: {
        total: 1,
        safeRepair: 1,
        ambiguous: 0,
        insufficient: 0,
        noop: 0,
        skipped: 0,
      },
      rows: [
        {
          cardId: 'list-as-topic',
          status: 'safe-repair',
          beforeKind: CardType.Topic,
          afterKind: CardType.Item,
        },
      ],
    });
  });

  it('commits only deterministic repair plans and mirrors repaired cards', async () => {
    const safe = buildCard({
      id: 'safe-card',
      type: CardType.Topic,
      meta: { templateID: 'builtin-list-item' },
    });
    const ambiguous = buildCard({
      id: 'ambiguous-card',
      type: CardType.Topic,
      meta: {
        templateID: 'builtin-list-item',
        typeMarker: 'concept',
      },
    });
    const repository = {
      querySrsCardSemanticRepairCandidates: vi.fn(() => [safe, ambiguous]),
      applySrsCardSemanticRepairPlans: vi.fn((input) => {
        const updatedCards = input.safePlans.map((plan) => {
          const source = [safe, ambiguous].find((card) => card.id === plan.cardId);
          if (!source || !plan.patch) {
            throw new Error(`missing patch for ${plan.cardId}`);
          }
          return applyCardSemanticPatch(source, plan.patch);
        });
        return {
          receiptId: 'repair-receipt-1',
          updatedCards,
          repairedCount: updatedCards.length,
          failedCardIds: [],
        };
      }),
    };
    const cardMirror = {
      batchUpdateCardsWithoutEvents: vi.fn(async () => ({
        ok: true as const,
        value: {
          updatedCount: 1,
          failedCount: 0,
          updatedCardIds: ['safe-card'],
          failedCardIds: [],
        },
      })),
    };
    const service = new SrsCardSemanticsRepairService({ repository, cardMirror });

    const commit = await service.commit();

    expect(repository.applySrsCardSemanticRepairPlans).toHaveBeenCalledWith(expect.objectContaining({
      safePlans: [expect.objectContaining({ cardId: 'safe-card' })],
      skippedPlans: [expect.objectContaining({ cardId: 'ambiguous-card' })],
    }));
    expect(cardMirror.batchUpdateCardsWithoutEvents).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'safe-card', type: CardType.Item }),
    ], expect.objectContaining({ suppressAutosave: true }));
    expect(commit).toMatchObject({
      status: 'committed',
      receiptId: 'repair-receipt-1',
      appliedCount: 1,
      skippedCount: 1,
      failedCount: 0,
      updatedCardIds: ['safe-card'],
    });
  });

  it('fails closed when SQL repair repository is unavailable', async () => {
    const service = new SrsCardSemanticsRepairService({ repository: null });

    await expect(service.preview()).resolves.toMatchObject({
      status: 'unavailable',
      diagnostics: [expect.objectContaining({ code: 'semantic-repair-unavailable' })],
    });
    await expect(service.commit()).resolves.toMatchObject({
      status: 'unavailable',
      diagnostics: [expect.objectContaining({ code: 'semantic-repair-unavailable' })],
    });
  });
});
