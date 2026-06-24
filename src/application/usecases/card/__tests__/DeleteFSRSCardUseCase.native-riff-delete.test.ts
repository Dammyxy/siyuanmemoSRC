import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@/types/result';
import type { FSRSCard } from '@/types/card';
import { DeleteFSRSCardUseCase } from '../DeleteFSRSCardUseCase';
import type { DeleteFSRSCardStoragePort } from '@/core/storage/ports';
import type { CardDeletionSiyuanPort } from '@/application/ports/CardDeletionSiyuanPort';

function createStorage(card: FSRSCard): DeleteFSRSCardStoragePort {
  return {
    getCard: vi.fn(() => card),
    getAllCards: vi.fn(() => [card]),
    queryCards: vi.fn(() => [card]),
    setCard: vi.fn(),
    saveCards: vi.fn(async () => undefined),
    deleteCard: vi.fn(async () => ok(undefined)),
  };
}

function createBatchStorage(cards: FSRSCard[]): DeleteFSRSCardStoragePort {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return {
    getCard: vi.fn((cardId: string) => cardsById.get(cardId)),
    getAllCards: vi.fn(() => Array.from(cardsById.values())),
    queryCards: vi.fn(() => Array.from(cardsById.values())),
    setCard: vi.fn(),
    saveCards: vi.fn(async () => undefined),
    deleteCard: vi.fn(async (cardId: string) => {
      if (!cardsById.has(cardId)) {
        return err(new Error(`Card not found: ${cardId}`));
      }
      cardsById.delete(cardId);
      return ok(undefined);
    }),
    runWriteTransaction: vi.fn(async (_label: string, operation: (transaction: unknown) => Promise<unknown>) => (
      operation({ token: Symbol('test'), label: 'test' })
    )),
  };
}

function createSiyuanPort(): CardDeletionSiyuanPort {
  return {
    BUILTIN_DECK_ID: 'builtin-deck',
    getBlockAttrs: vi.fn(async () => ({})),
    setBlockAttrs: vi.fn(async () => undefined),
    removeRiffCards: vi.fn(async () => ({ name: 'deck', size: 1 })),
  };
}

const card = {
  id: 'card-1',
  xiuyuanID: 'xy-1',
  blockId: 'block-1',
} as unknown as FSRSCard;

describe('DeleteFSRSCardUseCase native Riff delete gate', () => {
  it('rejects legacy deleteFromRiff without native-hard-delete confirmation', async () => {
    const storage = createStorage(card);
    const siyuanApi = createSiyuanPort();
    const useCase = new DeleteFSRSCardUseCase(storage, { siyuanApi });

    const result = await useCase.execute({
      cardId: 'card-1',
      deleteFromRiff: true,
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.deletedFromRiff : undefined).toBe(false);
    expect(siyuanApi.removeRiffCards).not.toHaveBeenCalled();
  });

  it('hard-deletes native Riff only with explicit intent and dangerous confirmation', async () => {
    const storage = createStorage(card);
    const siyuanApi = createSiyuanPort();
    const useCase = new DeleteFSRSCardUseCase(storage, { siyuanApi });

    const result = await useCase.execute({
      cardId: 'card-1',
      deleteFromRiff: true,
      deleteIntent: 'native-hard-delete',
      confirmDangerousNativeDelete: true,
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value.deletedFromRiff : undefined).toBe(true);
    expect(siyuanApi.removeRiffCards).toHaveBeenCalledWith('builtin-deck', ['block-1']);
  });

  it('batch-deletes local FSRS cards without Xiuyuan index using one save and one attrs cleanup per block', async () => {
    const cards = [
      { ...card, id: 'card-a', xiuyuanID: '', blockId: 'block-shared' },
      { ...card, id: 'card-b', xiuyuanID: undefined, blockId: 'block-shared' },
    ] as unknown as FSRSCard[];
    const storage = createBatchStorage(cards);
    const siyuanApi = createSiyuanPort();
    vi.mocked(siyuanApi.getBlockAttrs).mockResolvedValue({
      'custom-riff-card-id': 'legacy-riff-id',
      'custom-fsrs-image-occlusion-card-ids': JSON.stringify(['card-a', 'card-b', 'card-c']),
    });
    const useCase = new DeleteFSRSCardUseCase(storage, { siyuanApi });

    const result = await useCase.executeBatch({
      cardIds: ['card-a', 'card-b'],
      deleteFromRiff: false,
    });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.value : undefined).toEqual({
      attemptedCount: 2,
      deletedCount: 2,
      deletedCardIds: ['card-a', 'card-b'],
      failedCardIds: [],
    });
    expect(storage.runWriteTransaction).toHaveBeenCalledTimes(1);
    expect(storage.deleteCard).toHaveBeenCalledTimes(2);
    expect(storage.deleteCard).toHaveBeenNthCalledWith(
      1,
      'card-a',
      expect.objectContaining({ suppressAutosave: true }),
    );
    expect(storage.deleteCard).toHaveBeenNthCalledWith(
      2,
      'card-b',
      expect.objectContaining({ suppressAutosave: true }),
    );
    expect(storage.saveCards).toHaveBeenCalledTimes(1);
    expect(siyuanApi.getBlockAttrs).toHaveBeenCalledTimes(1);
    expect(siyuanApi.setBlockAttrs).toHaveBeenCalledTimes(1);
    expect(siyuanApi.removeRiffCards).not.toHaveBeenCalled();
  });
});
